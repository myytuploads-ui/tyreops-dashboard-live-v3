import type {
  Conversation,
  ConversationMessage,
  ConversationMode,
  MessageActor,
} from '@/app/conversations/ConversationsInbox';
import { classifyMessageMedia, extractMediaFields } from '@/lib/conversations/message-media';

export type ConversationRow = Record<string, any>;

type ThreadMessage = ConversationMessage & { jobId: string };

type BuildResult = {
  conversations: Conversation[];
  unlinkedMessageCount: number;
  duplicateMessageCount: number;
  droppedOldestCount: number;
};

const OWNER_ACTION_STATUSES = new Set([
  'manual_review',
  'awaiting_owner_price',
  'awaiting_owner_assignment',
  'awaiting_owner_first_refusal',
]);

function isEnabled(value: unknown) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

export function resolveConversationMode(job?: ConversationRow): ConversationMode {
  if (!job) return 'ai';
  const canonical = job.conversation_mode;
  if (canonical !== null && canonical !== undefined && String(canonical).trim()) {
    return String(canonical).toLowerCase() === 'human' ? 'human' : 'ai';
  }
  return isEnabled(job.ai_paused) || isEnabled(job.manual_reply_mode) ? 'human' : 'ai';
}

export function resolveMessageActor(value: unknown): MessageActor {
  const actor = String(value || '').trim().toLowerCase();
  return actor === 'ai' || actor === 'owner' || actor === 'operator' || actor === 'system'
    ? actor
    : 'unknown';
}

export function firstValue(row: ConversationRow | undefined, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}

export function timeValue(value: unknown) {
  const timestamp = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Build inbox + thread payloads scoped STRICTLY by job_id.
 * Never merge by customer_id / phone / older jobs.
 */
export function buildJobScopedConversations(input: {
  jobs: ConversationRow[];
  messages: ConversationRow[];
  customers: ConversationRow[];
  fitters: ConversationRow[];
}): BuildResult {
  const jobsById = new Map(input.jobs.map((job) => [String(job.id), job]));
  const customers = new Map(input.customers.map((customer) => [String(customer.id), customer]));
  const fitters = new Map(input.fitters.map((fitter) => [String(fitter.id), fitter]));

  const threads = new Map<string, { messages: ThreadMessage[]; seen: Set<string> }>();
  let unlinkedMessageCount = 0;
  let duplicateMessageCount = 0;

  // Messages are expected newest-first from the query (limit keeps newest visible).
  for (const row of input.messages) {
    const jobId = row.job_id ? String(row.job_id) : '';
    if (!jobId) {
      unlinkedMessageCount += 1;
      continue;
    }

    // Authoritative identity: exact job_id only. Ignore customer_id for threading.
    const thread = threads.get(jobId) || { messages: [], seen: new Set<string>() };
    const providerId = firstValue(row, ['provider_message_id']);
    const dedupeKey = providerId ? `provider:${providerId}` : `row:${String(row.id)}`;
    if (thread.seen.has(dedupeKey)) {
      duplicateMessageCount += 1;
      continue;
    }
    thread.seen.add(dedupeKey);
    const rawText = firstValue(row, ['message_text', 'text', 'body']) || 'Empty message';
    const media = extractMediaFields(row as Record<string, unknown>);
    const classified = classifyMessageMedia({
      text: rawText,
      mediaUrl: media.mediaUrl,
      mediaId: media.mediaId,
      messageType: media.messageType,
      mimeType: media.mimeType,
      caption: media.caption,
    });
    thread.messages.push({
      id: String(row.id),
      jobId,
      direction: String(row.direction || '').trim().toLowerCase().startsWith('in') ? 'inbound' : 'outbound',
      text: rawText,
      createdAt: firstValue(row, ['created_at']),
      // Include AI / owner / operator / system / unknown — never filter outbound AI.
      actor: resolveMessageActor(row.sent_by),
      mediaUrl: media.mediaUrl || undefined,
      mediaId: media.mediaId || undefined,
      messageType: media.messageType || undefined,
      mimeType: media.mimeType || undefined,
      caption: classified.displayCaption || undefined,
      mediaKind: classified.kind === 'text' ? undefined : classified.kind,
      previewText: classified.previewText,
    });
    threads.set(jobId, thread);
  }

  const conversations: Conversation[] = [];
  for (const [jobId, thread] of threads) {
    thread.messages.sort(
      (a, b) => timeValue(a.createdAt) - timeValue(b.createdAt) || a.id.localeCompare(b.id)
    );
    const latest = thread.messages[thread.messages.length - 1];
    const job = jobsById.get(jobId);
    const customerId = job?.customer_id
      ? String(job.customer_id)
      : null;
    const customer = customerId ? customers.get(customerId) : undefined;
    const mode = resolveConversationMode(job);
    const jobStatus = firstValue(job, ['status']) || 'unlinked';
    const needsAttention = Boolean(job) && (
      (mode === 'human' && latest.direction === 'inbound') || OWNER_ACTION_STATUSES.has(jobStatus)
    );
    const assignedFitter = job?.assigned_fitter_id ? fitters.get(String(job.assigned_fitter_id)) : undefined;
    const location = firstValue(job, ['postcode', 'postcode_area', 'location']);
    const tyreSize = firstValue(job, ['tyre_size']);

    conversations.push({
      id: `job:${jobId}`,
      jobId,
      customerName:
        firstValue(customer, ['full_name', 'customer_name', 'name']) ||
        firstValue(job, ['customer_name']) ||
        'Unknown customer',
      phone:
        firstValue(customer, ['whatsapp_phone', 'phone', 'customer_phone', 'mobile', 'phone_number']) ||
        firstValue(job, ['customer_phone']) ||
        'Phone unavailable',
      publicJobId: firstValue(job, ['public_job_id']) || 'No linked job',
      jobStatus,
      jobHint: [location, tyreSize].filter(Boolean).join(' · ') || 'No job details',
      mode,
      needsAttention,
      attentionReason:
        mode === 'human' && latest.direction === 'inbound'
          ? 'Customer replied in human mode'
          : OWNER_ACTION_STATUSES.has(jobStatus)
            ? jobStatus.replaceAll('_', ' ')
            : '',
      // Inbox preview is latest message for THIS job_id only.
      latestText: latest.previewText || latest.text,
      latestAt: latest.createdAt,
      messages: thread.messages.map(({ jobId: _jobId, ...message }) => message),
      jobContext: job
        ? {
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
          }
        : null,
    });
  }

  // Inbox: latest activity DESC (needs-attention first preserved as operational priority).
  conversations.sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    return timeValue(b.latestAt) - timeValue(a.latestAt) || a.id.localeCompare(b.id);
  });

  return {
    conversations,
    unlinkedMessageCount,
    duplicateMessageCount,
    droppedOldestCount: 0,
  };
}
