import { createClient } from '@/lib/supabase/server';
import { buildJobScopedConversations } from '@/lib/conversations/build-job-scoped';
import ConversationsInbox from './ConversationsInbox';

type Row = Record<string, any>;

/** Newest-first global window so pagination never silently drops the newest messages. */
const MESSAGE_WINDOW = 3000;
const JOB_WINDOW = 1000;

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const params = await searchParams;
  const initialJobId = typeof params?.job === 'string' ? params.job : null;
  const supabase = await createClient();

  const [jobsResult, messagesResult, customersResult, fittersResult] = await Promise.all([
    supabase.from('jobs').select('*').order('updated_at', { ascending: false }).limit(JOB_WINDOW),
    // Newest first: keep latest N globally, then each thread sorts ASC for display.
    // select('*') soft-includes media_url / media_id / message_type / caption when present in DB.
    supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(MESSAGE_WINDOW),
    supabase.from('customers').select('*').limit(1000),
    supabase.from('fitters').select('id,full_name').limit(1000),
  ]);

  const fatalErrors = [jobsResult.error, messagesResult.error]
    .filter(Boolean)
    .map((error) => error?.message)
    .join(' ');

  if (fatalErrors) {
    return (
      <>
        <div className="topbar">
          <div className="headline">
            <div>
              <h1>Conversations</h1>
              <p>Customer messages and conversation ownership.</p>
            </div>
          </div>
        </div>
        <div className="error">Unable to load conversations. {fatalErrors}</div>
      </>
    );
  }

  const { conversations, unlinkedMessageCount, duplicateMessageCount } = buildJobScopedConversations({
    jobs: (jobsResult.data || []) as Row[],
    messages: (messagesResult.data || []) as Row[],
    customers: (customersResult.data || []) as Row[],
    fitters: (fittersResult.data || []) as Row[],
  });

  const notices = [
    customersResult.error ? 'Customer profiles could not be read; job details are being used as a fallback.' : '',
    fittersResult.error ? 'Assigned fitter names are temporarily unavailable.' : '',
    unlinkedMessageCount
      ? `${unlinkedMessageCount} message${unlinkedMessageCount === 1 ? '' : 's'} could not be linked to a job.`
      : '',
    duplicateMessageCount
      ? `${duplicateMessageCount} duplicate provider message${duplicateMessageCount === 1 ? '' : 's'} hidden.`
      : '',
  ].filter(Boolean);

  return <ConversationsInbox conversations={conversations} notices={notices} initialJobId={initialJobId} />;
}
