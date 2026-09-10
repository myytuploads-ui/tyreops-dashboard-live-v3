'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ConversationControls({ jobId, mode }: { jobId: string; mode: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'takeover' | 'return_to_ai' | null>(null);
  const [error, setError] = useState('');
  const human = String(mode || '').toLowerCase() === 'human';

  async function run(action: 'takeover' | 'return_to_ai') {
    if (busy) return;
    setBusy(action);
    setError('');
    try {
      const response = await fetch('/api/conversation-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, job_id: jobId }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Conversation control failed.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Conversation control failed.');
    } finally {
      setBusy(null);
    }
  }

  return <div className="atelierConversationControls">
    {human
      ? <button type="button" className="atelierButton" disabled={busy !== null} onClick={() => void run('return_to_ai')}>{busy === 'return_to_ai' ? 'Returning…' : 'Return to AI'}</button>
      : <button type="button" className="atelierButton primary" disabled={busy !== null} onClick={() => void run('takeover')}>{busy === 'takeover' ? 'Taking over…' : 'Take over'}</button>}
    {error ? <div className="error">{error}</div> : null}
  </div>;
}
