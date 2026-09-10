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

export default function ChaseFitterBalanceButton({
  jobId,
  amountLabel,
}: {
  jobId: string;
  amountLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notConfigured, setNotConfigured] = useState(false);
  const [lastChasedAt, setLastChasedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(jobId));
      const ts = raw ? Number(raw) : NaN;
      if (Number.isFinite(ts) && ts > 0) setLastChasedAt(ts);
    } catch {
      // sessionStorage unavailable — still allow chase; cooldown is best-effort
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

  async function chase() {
    if (busy || cooldownActive) return;
    setBusy(true);
    setError('');
    setNotice('');
    setNotConfigured(false);
    try {
      const response = await fetch('/api/chase-fitter-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (response.status === 503) {
        setNotConfigured(true);
        setError("Fitter balance chase isn't configured yet — message the fitter for now.");
        return;
      }
      if (!response.ok || !result?.ok) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'Could not chase the fitter balance.');
      }
      const ts = Date.now();
      setLastChasedAt(ts);
      try { sessionStorage.setItem(storageKey(jobId), String(ts)); } catch { /* ignore */ }
      setNotice('Chase sent to the fitter.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not chase the fitter balance.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chaseFitterBalance">
      {error ? <div className={notConfigured ? 'paymentResendHint' : 'error'}>{error}</div> : null}
      {notice ? <div className="success">{notice}</div> : null}
      <button
        type="button"
        className="btn primary chaseFitterBalanceBtn"
        disabled={busy || cooldownActive}
        onClick={() => void chase()}
      >
        {busy ? 'Sending…' : `Chase fitter balance ${amountLabel}`}
      </button>
      {lastChasedAt ? (
        <p className="chaseFitterBalanceMeta">
          {cooldownActive
            ? `Last chased ${formatChaseTime(lastChasedAt)} · wait before chasing again`
            : `Last chased ${formatChaseTime(lastChasedAt)}`}
        </p>
      ) : null}
    </div>
  );
}