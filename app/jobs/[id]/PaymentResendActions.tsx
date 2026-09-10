'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Mode = 'expired' | 'awaiting';

function digitsOnly(phone: string) {
  return String(phone || '').replace(/\D/g, '');
}

function paymentChaseMessage(publicJobId: string | undefined, jobId: string, amountLabel?: string) {
  const jobLabel = (publicJobId && String(publicJobId).trim()) || String(jobId).slice(0, 8);
  const amountBit = amountLabel ? ` (${amountLabel} deposit)` : '';
  return `Hi — job ${jobLabel}. Just following up on the Rescue Tyres payment${amountBit}. Reply here if you need the link again — happy to resend. Thanks.`;
}

export default function PaymentResendActions({
  jobId,
  mode,
  amountLabel,
  customerPhone,
  publicJobId,
  webhookResendAvailable = false,
}: {
  jobId: string;
  mode: Mode;
  amountLabel?: string;
  customerPhone?: string;
  publicJobId?: string;
  webhookResendAvailable?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [webhookHint, setWebhookHint] = useState('');

  const digits = digitsOnly(customerPhone || '');
  const waHref = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(paymentChaseMessage(publicJobId, jobId, amountLabel))}`
    : '';

  async function resendWebhook() {
    if (busy || !webhookResendAvailable) return;
    setBusy(true);
    setError('');
    setNotice('');
    setWebhookHint('');
    try {
      const response = await fetch('/api/resend-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (response.status === 503) {
        setWebhookHint("Automated resend isn't wired yet — use WhatsApp or Inbox above.");
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

  const title = mode === 'expired' ? 'Payment link expired' : 'Payment needs a chase';
  const body = mode === 'expired'
    ? 'Message the customer now. Fresh Stripe resend is optional if configured.'
    : 'Chase the customer on WhatsApp or Inbox. Automated resend stays optional.';

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
        {error ? <div className="error">{error}</div> : null}
        {webhookHint ? <div className="paymentResendHint">{webhookHint}</div> : null}
        {notice ? <div className="success">{notice}</div> : null}
        <div className="paymentResendActions">
          {waHref ? (
            <a className="btn primary" href={waHref} target="_blank" rel="noreferrer">
              Chase on WhatsApp{amountLabel ? ` ${amountLabel}` : ''}
            </a>
          ) : (
            <Link className="btn primary" href={`/conversations?job=${jobId}`}>Message customer</Link>
          )}
          {waHref ? <Link className="atelierButton" href={`/conversations?job=${jobId}`}>Open inbox</Link> : null}
          {webhookResendAvailable ? (
            <button type="button" className="atelierButton" disabled={busy} onClick={() => void resendWebhook()}>
              {busy ? 'Sending…' : 'Resend payment link (webhook)'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
