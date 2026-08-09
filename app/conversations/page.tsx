import { createClient } from '@/lib/supabase/server';
import ConversationsInbox, {
  type Conversation,
  type ConversationMessage,
  type ConversationMode,
  type MessageActor,
} from './ConversationsInbox';

function isEnabled(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function resolveMode(job: Record<string, any>): ConversationMode {
  const canonical = job.conversation_mode;
  if (canonical !== null && canonical !== undefined && canonical !== '') {
    return String(canonical).toLowerCase() === 'human' ? 'human' : 'ai';
  }
  return isEnabled(job.ai_paused) || isEnabled(job.manual_reply_mode) ? 'human' : 'ai';
}

function resolveActor(value: unknown): MessageActor {
  const actor = String(value || '').toLowerCase();
  return actor === 'ai' || actor === 'owner' || actor === 'operator' || actor === 'system'
    ? actor
    : 'unknown';
}

function firstValue(row: Record<string, any> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return '';
}

export default async function ConversationsPage() {
  const supabase = await createClient();
  const [jobsResult, messagesResult, customersResult] = await Promise.all([
    supabase.from('jobs').select('*').order('updated_at', { ascending: false }).limit(500),
    supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(2000),
    supabase.from('customers').select('*').limit(500),
  ]);

  const errors = [jobsResult.error, messagesResult.error, customersResult.error]
    .filter(Boolean)
    .map(error => error?.message)
    .join(' ');

  if (errors) {
    return <><div className="topbar"><div className="headline"><div><h1>Conversations</h1><p>Customer messages and conversation ownership.</p></div></div></div><div className="error">Unable to load conversations. {errors}</div></>;
  }

  const customers = new Map<string, Record<string, any>>(
    (customersResult.data || []).map((customer: any) => [String(customer.id), customer])
  );
  const messagesByJob = new Map<string, ConversationMessage[]>();

  for (const row of messagesResult.data || []) {
    if (!row.job_id) continue;
    const jobId = String(row.job_id);
    const message: ConversationMessage = {
      id: String(row.id),
      direction: String(row.direction || '').toLowerCase() === 'inbound' ? 'inbound' : 'outbound',
      text: String(row.message_text || ''),
      createdAt: row.created_at ? String(row.created_at) : '',
      actor: resolveActor(row.sent_by),
    };
    const history = messagesByJob.get(jobId) || [];
    history.push(message);
    messagesByJob.set(jobId, history);
  }

  for (const history of messagesByJob.values()) {
    history.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const conversations: Conversation[] = (jobsResult.data || []).flatMap((job: any) => {
    const messages = messagesByJob.get(String(job.id)) || [];
    if (!messages.length) return [];
    const customer = job.customer_id ? customers.get(String(job.customer_id)) : undefined;
    const latest = messages[messages.length - 1];
    const mode = resolveMode(job);

    return [{
      id: String(job.id),
      customerName: firstValue(customer, ['full_name', 'customer_name', 'name']) || firstValue(job, ['customer_name']) || 'Customer',
      phone: firstValue(customer, ['whatsapp_phone', 'phone', 'customer_phone', 'mobile']) || firstValue(job, ['customer_phone']) || '—',
      publicJobId: firstValue(job, ['public_job_id']) || String(job.id),
      jobStatus: firstValue(job, ['status']) || 'unknown',
      mode,
      needsAttention: mode === 'human' && latest.direction === 'inbound',
      latestText: latest.text || 'Empty message',
      latestAt: latest.createdAt,
      messages,
    }];
  }).sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
  });

  return <ConversationsInbox conversations={conversations} />;
}
