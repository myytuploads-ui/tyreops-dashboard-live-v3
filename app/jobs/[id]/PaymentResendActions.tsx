'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Mode = 'expired' | 'awaiting';

export default function PaymentResendActions({
  jobId,
  mode,
  amountLabel,
}: {
  jobId: string;
  mode: Mode;
  amountLabel?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [notConfigured, setNotConfigured] = useState(false);

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    setNotConfigured(false);
    try {
      const response = await fetch('/api/resend-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (response.status === 503) {
        setNotConfigured(true);
        setError("Payment resend webhook isn't configured yet — message the customer for now.");
        return;
      }
      if (!response.ok || !result?.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'Could not resend the payment link.');
      }
      setNotice('Fresh payment link requested. Refreshing…');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not resend the payment link.');
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'expired' ? 'Payment link expired' : 'Payment needs a fresh link';
  const body = mode === 'expired'
    ? 'Create a fresh Stripe payment link and send it to the customer.'
    : "The current link isn't usable. Send a fresh one, or message the customer while you sort it.";

  return (
    <section className="panel ownerActionPanel paymentResendPanel" id="payment-resend">
      <div className="panelHead">
        <div>
          <span className="eyebrow">DO THIS NOW</span>
          <h2>{title}</h2>
          <p>
            {body}
            {amountLabel ? ` Deposit ${amountLabel}.` : ''}
          </p>
        </div>
      </div>
      <div className="panelBody">
        {error ? <div className={notConfigured ? 'paymentResendHint' : 'error'}>{error}</div> : null}
        {notice ? <div className="success">{notice}</div> : null}
        <div className="paymentResendActions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void resend()}>
            {busy ? 'Sending…' : 'Resend payment link'}
          </button>
          <Link className="atelierButton" href={`/conversations?job=${jobId}`}>Message customer</Link>
        </div>
      </div>
    </section>
  );
}