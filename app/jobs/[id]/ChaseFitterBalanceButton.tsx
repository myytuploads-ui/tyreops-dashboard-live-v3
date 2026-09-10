'use client';

import { useEffect, useMemo, useState } from 'react';

const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const storageKey = (jobId: string) => `tyreops:chase-fitter:${jobId}`;

function formatChaseTime(ts: number) {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function digitsOnly(phone: string) {
  return String(phone || '').replace(/\D/g, '');
}

function buildChaseMessage(publicJobId: string | undefined, jobId: string, amountGbp: number) {
  const jobLabel = (publicJobId && String(publicJobId).trim()) || String(jobId).slice(0, 8);
  const amount = Number.isFinite(amountGbp)
    ? amountGbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })
    : String(amountGbp);
  return `Hi — job ${jobLabel}. Please send the remaining £${amount} for Rescue Tyres when you can. Thanks.`;
}

export default function ChaseFitterBalanceButton({
  jobId,
  amountLabel,
  amountGbp,
  fitterPhone,
  publicJobId,
}: {
  jobId: string;
  amountLabel: string;
  amountGbp: number;
  fitterPhone: string;
  publicJobId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastChasedAt, setLastChasedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(jobId));
      const ts = raw ? Number(raw) : NaN;
      if (Number.isFinite(ts) && ts > 0) setLastChasedAt(ts);
    } catch {
      // sessionStorage unavailable — still allow chase; cooldown is soft
    }
  }, [jobId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const cooldownActive = useMemo(() => {
    if (lastChasedAt === null) return false;
    return now - lastChasedAt < COOLDOWN_MS;
  }, [lastChasedAt, now]);

  function chase() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const digits = digitsOnly(fitterPhone);
      if (!digits) {
        setError('Assigned fitter has no phone number on file.');
        return;
      }
      const text = buildChaseMessage(publicJobId, jobId, amountGbp);
      const href = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
      window.open(href, '_blank', 'noopener,noreferrer');
      const ts = Date.now();
      setLastChasedAt(ts);
      try { sessionStorage.setItem(storageKey(jobId), String(ts)); } catch { /* ignore */ }
      setNotice(cooldownActive
        ? 'WhatsApp opened again — last chase still within the soft cooldown window.'
        : 'WhatsApp opened with the balance chase message.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open WhatsApp.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chaseFitterBalance">
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="success">{notice}</div> : null}
      <button
        type="button"
        className="btn primary chaseFitterBalanceBtn"
        disabled={busy || !digitsOnly(fitterPhone)}
        onClick={() => chase()}
      >
        {busy ? 'Opening…' : `Chase fitter balance ${amountLabel}`}
      </button>
      {lastChasedAt ? (
        <p className="chaseFitterBalanceMeta">
          {cooldownActive
            ? `Last chased ${formatChaseTime(lastChasedAt)} · you can still open WhatsApp again`
            : `Last chased ${formatChaseTime(lastChasedAt)}`}
        </p>
      ) : null}
    </div>
  );
}
