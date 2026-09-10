import { createClient } from '@/lib/supabase/server';
import ConversationsInbox, {
  type Conversation,
  type ConversationMessage,
  type ConversationMode,
  type MessageActor,
} from './ConversationsInbox';

type Row = Record<string, any>;
type ThreadMessage = ConversationMessage & { jobId: string | null; customerId: string | null };
type Thread = { messages: ThreadMessage[]; seen: Set<string>; customerId: string | null };

function isEnabled(value: unknown) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function resolveMode(job?: Row): ConversationMode {
  if (!job) return 'ai';
  const canonical = job.conversation_mode;
  if (canonical !== null && canonical !== undefined && String(canonical).trim()) {
    return String(canonical).toLowerCase() === 'human' ? 'human' : 'ai';
  }
  return isEnabled(job.ai_paused) || isEnabled(job.manual_reply_mode) ? 'human' : 'ai';
}

function resolveActor(value: unknown): MessageActor {
  const actor = String(value || '').trim().toLowerCase();
  return actor === 'ai' || actor === 'owner' || actor === 'operator' || actor === 'system'
    ? actor
    : 'unknown';
}

function firstValue(row: Row | undefined, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}

function timeValue(value: unknown) {
  const timestamp = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default async function ConversationsPage() {
  const supabase = await createClient();
  const [jobsResult, messagesResult, customersResult, fittersResult] = await Promise.all([
    supabase.from('jobs').select('*').order('updated_at', { ascending: false }).limit(1000),
    supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(3000),
    supabase.from('customers').select('*').limit(1000),
    supabase.from('fitters').select('id,full_name').limit(1000),
  ]);

  const fatalErrors = [jobsResult.error, messagesResult.error]
    .filter(Boolean)
    .map(error => error?.message)
    .join(' ');

  if (fatalErrors) {
    return <><div className="topbar"><div className="headline"><div><h1>Conversations</h1><p>Customer messages and conversation ownership.</p></div></div></div><div className="error">Unable to load conversations. {fatalErrors}</div></>;
  }

  const jobs = (jobsResult.data || []) as Row[];
  const jobsById = new Map(jobs.map(job => [String(job.id), job]));
  const jobsByCustomer = new Map<string, Row[]>();
  for (const job of jobs) {
    if (!job.customer_id) continue;
    const customerId = String(job.customer_id);
    const customerJobs = jobsByCustomer.get(customerId) || [];
    customerJobs.push(job);
    jobsByCustomer.set(customerId, customerJobs);
  }
  for (const customerJobs of jobsByCustomer.values()) {
    customerJobs.sort((a, b) => timeValue(b.updated_at || b.created_at) - timeValue(a.updated_at || a.created_at));
  }

  const customers = new Map<string, Row>(
    ((customersResult.data || []) as Row[]).map(customer => [String(customer.id), customer])
  );
  const fitters = new Map<string, Row>(
    ((fittersResult.data || []) as Row[]).map(fitter => [String(fitter.id), fitter])
  );
  const threads = new Map<string, Thread>();
  let unlinkedMessageCount = 0;
  let duplicateMessageCount = 0;

  for (const row of (messagesResult.data || []) as Row[]) {
    const jobId = row.job_id ? String(row.job_id) : null;
    const linkedJob = jobId ? jobsById.get(jobId) : undefined;
    const customerId = row.customer_id
      ? String(row.customer_id)
      : linkedJob?.customer_id
        ? String(linkedJob.customer_id)
        : null;
    const threadId = customerId ? `customer:${customerId}` : jobId ? `job:${jobId}` : null;

    if (!threadId) {
      unlinkedMessageCount += 1;
      continue;
    }

    const thread = threads.get(threadId) || { messages: [], seen: new Set<string>(), customerId };
    const providerId = firstValue(row, ['provider_message_id']);
    const dedupeKey = providerId ? `provider:${providerId}` : `row:${String(row.id)}`;
    if (thread.seen.has(dedupeKey)) {
      duplicateMessageCount += 1;
      continue;
    }
    thread.seen.add(dedupeKey);
    thread.messages.push({
      id: String(row.id),
      jobId,
      customerId,
      direction: String(row.direction || '').trim().toLowerCase().startsWith('in') ? 'inbound' : 'outbound',
      text: firstValue(row, ['message_text', 'text', 'body']) || 'Empty message',
      createdAt: firstValue(row, ['created_at']),
      actor: resolveActor(row.sent_by),
    });
    threads.set(threadId, thread);
  }

  const conversations: Conversation[] = [];
  for (const [threadId, thread] of threads) {
    thread.messages.sort((a, b) => timeValue(a.createdAt) - timeValue(b.createdAt) || a.id.localeCompare(b.id));
    const latest = thread.messages[thread.messages.length - 1];
    const latestLinkedJobId = [...thread.messages].reverse().find(message => message.jobId && jobsById.has(message.jobId))?.jobId;
    const explicitlyLinkedJob = latestLinkedJobId
      ? jobsById.get(latestLinkedJobId)
      : threadId.startsWith('job:')
        ? jobsById.get(threadId.slice(4))
        : undefined;
    const job = explicitlyLinkedJob
      ? explicitlyLinkedJob
      : thread.customerId
        ? jobsByCustomer.get(thread.customerId)?.[0]
        : undefined;
    const controlJobId = job?.id ? String(job.id) : null;
    const customer = thread.customerId ? customers.get(thread.customerId) : undefined;
    const mode = resolveMode(job);
    const jobStatus = firstValue(job, ['status']) || 'unlinked';
    const ownerActionStatuses = new Set(['manual_review', 'awaiting_owner_price', 'awaiting_owner_assignment', 'awaiting_owner_first_refusal']);
    const needsAttention = Boolean(job) && (
      (mode === 'human' && latest.direction === 'inbound') || ownerActionStatuses.has(jobStatus)
    );
    const assignedFitter = job?.assigned_fitter_id ? fitters.get(String(job.assigned_fitter_id)) : undefined;
    const location = firstValue(job, ['postcode', 'postcode_area', 'location']);
    const tyreSize = firstValue(job, ['tyre_size']);

    conversations.push({
      id: threadId,
      jobId: controlJobId,
      customerName: firstValue(customer, ['full_name', 'customer_name', 'name']) || firstValue(job, ['customer_name']) || 'Unknown customer',
      phone: firstValue(customer, ['whatsapp_phone', 'phone', 'customer_phone', 'mobile', 'phone_number']) || firstValue(job, ['customer_phone']) || 'Phone unavailable',
      publicJobId: firstValue(job, ['public_job_id']) || 'No linked job',
      jobStatus,
      jobHint: [location, tyreSize].filter(Boolean).join(' · ') || 'No job details',
      mode,
      needsAttention,
      attentionReason: mode === 'human' && latest.direction === 'inbound'
        ? 'Customer replied in human mode'
        : ownerActionStatuses.has(jobStatus)
          ? jobStatus.replaceAll('_', ' ')
          : '',
      latestText: latest.text,
      latestAt: latest.createdAt,
      messages: thread.messages.map(({ jobId: _jobId, customerId: _customerId, ...message }) => message),
      jobContext: job ? {
        urgency: firstValue(job, ['urgency']),
        tyreSize,
        quantity: firstValue(job, ['tyre_quantity', 'quantity']),
        location,
        vehicleRegistration: firstValue(job, ['vehicle_registration', 'vehicle_reg', 'registration']),
        requestedTime: firstValue(job, ['requested_time', 'preferred_time', 'appointment_time', 'requested_at']),
        customerPrice: firstValue(job, ['customer_price', 'quoted_price']),
        paymentStatus: firstValue(job, ['deposit_status', 'payment_status']),
        fitterName: firstValue(assignedFitter, ['full_name']),
        dispatchStatus: jobStatus,
      } : null,
    });
  }

  conversations.sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    return timeValue(b.latestAt) - timeValue(a.latestAt) || a.id.localeCompare(b.id);
  });

  const notices = [
    customersResult.error ? 'Customer profiles could not be read; job details are being used as a fallback.' : '',
    fittersResult.error ? 'Assigned fitter names are temporarily unavailable.' : '',
    unlinkedMessageCount ? `${unlinkedMessageCount} message${unlinkedMessageCount === 1 ? '' : 's'} could not be linked to a customer or job.` : '',
    duplicateMessageCount ? `${duplicateMessageCount} duplicate provider message${duplicateMessageCount === 1 ? '' : 's'} hidden.` : '',
  ].filter(Boolean);

  return <ConversationsInbox conversations={conversations} notices={notices} />;
}
