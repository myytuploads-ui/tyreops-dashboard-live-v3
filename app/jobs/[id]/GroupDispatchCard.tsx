'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type BackendRecord = Record<string, unknown>;
type Offer = { id: string; name: string; cost: number | null; eta: number | null; phone: string; submittedAt: string };
type Status = { state: string; message: string; intakeUrl: string; offers: Offer[]; waitingSince: string };

function object(value: unknown): BackendRecord { return value && typeof value === 'object' ? value as BackendRecord : {}; }
function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function number(value: unknown) { const parsed = Number(value); return value !== null && value !== '' && Number.isFinite(parsed) ? parsed : null; }
function normalize(payload: unknown): Status {
  const root = object(payload); const data = object(root.data); const source = Object.keys(data).length ? data : root;
  const rawOffers = Array.isArray(source.offers) ? source.offers : Array.isArray(source.pending_offers) ? source.pending_offers : [];
  return {
    state: text(source.status || source.job_status) || 'awaiting_group_dispatch',
    message: text(source.group_message || source.message_to_copy || source.prepared_message),
    intakeUrl: text(source.intake_url),
    waitingSince: text(source.waiting_since || source.started_at || source.created_at),
    offers: rawOffers.map((value) => {
      const offer = object(value); const fitter = object(offer.fitter);
      return {
        id: text(offer.id || offer.offer_id),
        name: text(offer.fitter_name || offer.name || fitter.full_name) || 'Fitter',
        cost: number(offer.quoted_cost ?? offer.cost ?? offer.fitter_cost),
        eta: number(offer.eta_minutes ?? offer.eta),
        phone: text(offer.masked_phone || offer.phone_masked),
        submittedAt: text(offer.submitted_at || offer.created_at),
      };
    }).filter((offer) => offer.id),
  };
}
function money(value: number | null) { return value === null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value); }
function ago(value: string) { if (!value) return '—'; const ms = Date.now() - Date.parse(value); if (!Number.isFinite(ms)) return '—'; const mins = Math.max(0, Math.floor(ms / 60000)); return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} hr ${mins % 60} min`; }

export default function GroupDispatchCard({ jobId, tyreSize, quantity, area }: { jobId: string; tyreSize: string; quantity: unknown; area: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const running = useRef(false);

  const request = useCallback(async (body: BackendRecord) => {
    const response = await fetch('/api/group-dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(text(object(result).error) || 'Group dispatch could not be refreshed.');
    return result;
  }, []);

  const refresh = useCallback(async () => {
    if (running.current || action) return;
    running.current = true;
    try { setStatus(normalize(await request({ action: 'get_group_status', job_id: jobId }))); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Group dispatch could not be refreshed.'); }
    finally { running.current = false; setLoading(false); }
  }, [action, jobId, request]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(tick, 7000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);

  async function mutate(nextAction: 'assign_group_fitter' | 'release_to_direct_dispatch', offer?: Offer) {
    if (action) return;
    const confirmed = nextAction === 'assign_group_fitter'
      ? window.confirm(`Assign ${offer?.name} for ${money(offer?.cost ?? null)} with a ${offer?.eta ?? '—'} minute ETA?`)
      : window.confirm('No suitable group fitter? This will release the job into the normal TyreOps fitter dispatch system.');
    if (!confirmed) return;
    setAction(nextAction); setError(''); setNotice(''); running.current = true;
    try {
      await request({ action: nextAction, job_id: jobId, ...(offer ? { offer_id: offer.id } : {}) });
      setNotice(nextAction === 'assign_group_fitter' ? `${offer?.name} assigned successfully.` : 'Released to direct fitters.');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The action could not be completed.'); }
    finally { running.current = false; setAction(''); }
  }

  async function copyMessage() {
    const copy = status?.message || (status?.intakeUrl ? `Got a job in ${area || 'the area'} — ${tyreSize || 'tyres'} x${String(quantity ?? '—')}. Customer's ready. Need price + ETA.\n\n${status.intakeUrl}` : '');
    if (!copy) return;
    try { await navigator.clipboard.writeText(copy); setNotice('Copied'); window.setTimeout(() => setNotice(''), 2200); }
    catch { setError('Copy failed. Select and copy the message manually.'); }
  }

  return <section className="panel groupDispatchCard">
    <div className="panelHead groupDispatchHead"><div><h2>Group Dispatch</h2><p>Copy the prepared request to your fitter group, then review live offers here.</p></div><span className="groupDispatchState">Waiting for group fitter</span></div>
    <div className="panelBody">
      <dl className="groupDispatchFacts"><div><dt>Tyres</dt><dd>{tyreSize || '—'} × {String(quantity ?? '—')}</dd></div><div><dt>Area</dt><dd>{area || '—'}</dd></div><div><dt>Waiting</dt><dd>{ago(status?.waitingSince || '')}</dd></div><div><dt>Pending offers</dt><dd>{status?.offers.length ?? '—'}</dd></div></dl>
      {loading ? <div className="groupDispatchLoading">Loading authoritative group status…</div> : null}
      {error ? <div className="error groupDispatchFeedback">{error}<div className="backendContractFallbacks"><Link className="atelierButton" href={`/conversations?job=${jobId}`}>Open inbox</Link><button type="button" className="atelierButton" onClick={() => void refresh()} disabled={Boolean(action) || loading}>Retry status</button></div></div> : null}
      {notice ? <div className="success groupDispatchFeedback">{notice}</div> : null}
      {status && (status.message || status.intakeUrl) ? <div className="groupMessage"><pre>{status.message || `Got a job in ${area || 'the area'} — ${tyreSize || 'tyres'} x${String(quantity ?? '—')}. Customer's ready. Need price + ETA.\n\n${status.intakeUrl}`}</pre><button type="button" className="btn primary copyGroupMessage" onClick={copyMessage} disabled={Boolean(action)}>Copy Group Message</button></div> : !loading && !error ? <div className="empty">The prepared group message is not available yet.</div> : null}
      <div className="groupOfferHeader"><div><h3>Fitter offers</h3><p>Automatically refreshed every 7 seconds.</p></div><strong>{status?.offers.length || 0}</strong></div>
      <div className="groupOffers">{status && status.offers.length === 0 ? <div className="emptyState"><strong>Waiting for fitter offers…</strong><span>New offers will appear here automatically.</span></div> : status?.offers.map((offer) => <article className="groupOffer" key={offer.id}><div><strong>{offer.name}</strong><span>{offer.phone || (offer.submittedAt ? `Submitted ${new Date(offer.submittedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '')}</span></div><div className="groupOfferTerms"><strong>{money(offer.cost)}</strong><span>{offer.eta === null ? 'ETA —' : `${offer.eta} min`}</span></div><button type="button" className="btn primary" onClick={() => void mutate('assign_group_fitter', offer)} disabled={Boolean(action)}>{action === 'assign_group_fitter' ? 'Assigning…' : `Assign ${offer.name}`}</button></article>)}</div>
      <div className="releaseGroupDispatch"><div><strong>No suitable offer?</strong><span>Return this job to the normal direct fitter dispatch process.</span></div><button type="button" className="btn" onClick={() => void mutate('release_to_direct_dispatch')} disabled={Boolean(action)}>{action === 'release_to_direct_dispatch' ? 'Releasing…' : 'Release to Direct Fitters'}</button></div>
    </div>
  </section>;
}
