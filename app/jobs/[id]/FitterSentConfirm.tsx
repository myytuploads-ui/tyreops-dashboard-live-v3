'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type SentLabel = 'Yes' | 'No' | 'Unknown';

export default function FitterSentConfirm({
  jobId,
  currentLabel,
  detail,
  owedLabel,
}: {
  jobId: string;
  currentLabel: SentLabel;
  detail: string;
  owedLabel?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function setSent(sent: boolean) {
    if (busy) return;
    if (!sent && currentLabel === 'Yes') {
      const ok = window.confirm('Mark remittance as not received? This puts the settlement back to outstanding.');
      if (!ok) return;
    }
    setBusy(sent ? 'yes' : 'no');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/settlement-fitter-sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, sent }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || !result?.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'Could not update remittance status.');
      }
      setNotice(sent ? 'Marked as received from the fitter.' : 'Marked as still outstanding.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update remittance status.');
    } finally {
      setBusy(null);
    }
  }

  const isYes = currentLabel === 'Yes';
  const isNo = currentLabel === 'No';

  return (
    <div className="fitterSentConfirm">
      <span className="eyebrow">FITTER SENT IT?</span>
      <strong className={`sent-${currentLabel.toLowerCase()} fitterSentCurrent`}>
        {currentLabel === 'Unknown' ? 'Not recorded' : currentLabel}
      </strong>
      <p className="fitterSentDetail">
        {detail}
        {owedLabel && !isYes ? ` · Still owed ${owedLabel}` : ''}
      </p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="success">{notice}</div> : null}
      <div className="fitterSentActions" role="group" aria-label="Did the fitter send the remaining balance?">
        <button
          type="button"
          className={`btn fitterSentYes${isYes ? ' isCurrent' : ' primary'}`}
          disabled={busy !== null}
          onClick={() => void setSent(true)}
        >
          {busy === 'yes' ? 'Saving…' : 'Yes — they sent it'}
        </button>
        <button
          type="button"
          className={`btn fitterSentNo${isNo ? ' isCurrent' : ''}`}
          disabled={busy !== null}
          onClick={() => void setSent(false)}
        >
          {busy === 'no' ? 'Saving…' : 'No — still owed'}
        </button>
      </div>
      {isYes ? <p className="fitterSentHint">Already Yes — you can flip to No if that was a mistake.</p> : null}
      {!isYes && owedLabel ? <p className="fitterSentHint">Default while money is owed: No, until you confirm remittance landed.</p> : null}
    </div>
  );
}
