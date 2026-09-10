'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { needsYou as classifyNeedsYou } from '@/lib/dashboard/operations';
import { isTestJob } from '@/lib/dashboard/filters';
import { useAuthoritativePolling } from '@/lib/dashboard/use-authoritative-polling';
import StatusBadge from '@/components/StatusBadge';

type Row = Record<string, any>;
const when = (value: unknown) => value ? new Date(String(value)).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const STATUS_LABELS: Record<string, string> = {
  awaiting_details: 'Details needed',
  awaiting_payment: 'Waiting for deposit',
  payment_link_expired: 'Payment expired',
  awaiting_owner_price: 'Needs price',
  awaiting_owner_first_refusal: 'Your decision',
  awaiting_group_dispatch: 'Group dispatch',
  dispatching_preferred: 'Finding fitter',
  dispatching_general: 'Finding fitter',
  offers_received: 'Offers ready',
  awaiting_owner_assignment: 'Choose fitter',
  deposit_paid: 'Deposit paid',
  assigned: 'Fitter assigned',
  fitter_on_route: 'On the way',
  arrived: 'Arrived',
  in_progress: 'Fitting',
  manual_review: 'Needs attention',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const STATUSES = Object.keys(STATUS_LABELS);

function jobCta(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'awaiting_owner_price') return 'Set price';
  if (s === 'awaiting_payment' || s === 'payment_link_expired') return 'View payment';
  if (['deposit_paid', 'offers_received', 'awaiting_owner_assignment', 'awaiting_group_dispatch'].includes(s)) return 'Choose fitter';
  if (s === 'awaiting_owner_first_refusal') return 'Your decision';
  return 'View job';
}

export default function JobsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [fitters, setFitters] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [needsOnly, setNeedsOnly] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [jobsResult, fittersResult, paymentsResult, eventsResult] = await Promise.all([
      supabase.from('jobs').select('*').order('updated_at', { ascending: false }).limit(500),
      supabase.from('fitters').select('id,full_name').limit(1000),
      supabase.from('payments').select('id,job_id,status,amount,currency,paid_at,created_at').order('created_at', { ascending: false }).limit(1000),
      supabase.from('workflow_events').select('id,job_id,event_type,created_at').order('created_at', { ascending: false }).limit(500),
    ]);
    const failures = [jobsResult.error, fittersResult.error, paymentsResult.error, eventsResult.error].filter(Boolean);
    setError(failures.length ? 'Some job operations data could not be refreshed.' : '');
    if (!jobsResult.error) setJobs(jobsResult.data || []);
    if (!fittersResult.error) setFitters(fittersResult.data || []);
    if (!paymentsResult.error) setPayments(paymentsResult.data || []);
    if (!eventsResult.error) setEvents(eventsResult.data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (new URLSearchParams(window.location.search).get('view') === 'needs-you') setNeedsOnly(true); void load(); }, [load]);
  useAuthoritativePolling(load, 7000);

  const fitterNames = new Map(fitters.map((fitter) => [String(fitter.id), String(fitter.full_name || 'Fitter')]));
  const paymentsByJob = new Map<string, Row[]>();
  for (const payment of payments) {
    const key = String(payment.job_id || '');
    if (key) paymentsByJob.set(key, [...(paymentsByJob.get(key) || []), payment]);
  }
  const eventsByJob = new Map<string, Row[]>();
  for (const event of events) {
    const key = String(event.job_id || '');
    if (key) eventsByJob.set(key, [...(eventsByJob.get(key) || []), event]);
  }
  const needsYou = (job: Row) => classifyNeedsYou(job, paymentsByJob.get(String(job.id)) || [], eventsByJob.get(String(job.id)) || []);
  const visible = jobs.filter((job) => showTests || !isTestJob(job));
  const filtered = visible.filter((job) => {
    if (needsOnly && !needsYou(job)) return false;
    if (status && job.status !== status) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return [job.public_job_id, job.customer_name, job.customer_phone, job.postcode, job.postcode_area, job.vehicle_registration, job.tyre_size, fitterNames.get(String(job.assigned_fitter_id || ''))].some((value) => String(value || '').toLowerCase().includes(needle));
  });
  const needsCount = visible.filter((job) => needsYou(job)).length;

  return <div className="atelierPage">
    <header className="atelierHeading"><div><span className="eyebrow">YOUR OPERATIONS</span><h1>{needsOnly ? 'Needs you.' : 'Every job. One place.'}</h1><p>{needsOnly ? 'The decisions that keep your day moving.' : 'From the first message to the final fitting.'}</p></div><label className="compactCheck"><input type="checkbox" checked={showTests} onChange={e=>setShowTests(e.target.checked)}/> Test records</label></header>
    <div className="atelierSearch"><input aria-label="Search jobs" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search postcode, customer or tyre size…"/><select aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Every status</option>{STATUSES.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></div>
    <div className="atelierTabs"><button type="button" className={!needsOnly?'selected':''} onClick={()=>setNeedsOnly(false)}>All jobs <span>{visible.length}</span></button><button type="button" className={needsOnly?'selected':''} onClick={()=>setNeedsOnly(true)}>Needs you <span>{needsCount}</span></button></div>
    {loading && <div className="modernEmpty">Loading your jobs…</div>}{error && <div className="error">{error}</div>}
    <div className="atelierJobs">{filtered.map(job=><Link className="atelierJob atelierJobLink" href={`/jobs/${job.id}`} key={job.id}>
      <div className="atelierJobMeta"><StatusBadge status={job.status}/><span>{when(job.updated_at)}</span></div>
      <h2>{job.postcode || job.postcode_area || 'Location pending'}</h2>
      <p className="atelierTyre">{job.tyre_size || 'Tyre details pending'}{job.tyre_quantity ? ` × ${job.tyre_quantity}` : ''}</p>
      <div className="atelierCustomer"><span className="atelierAvatar">{String(job.customer_name || 'C').slice(0,1)}</span><div><strong>{job.customer_name || 'Customer'}</strong><span>{job.customer_phone || 'Conversation available'}</span></div></div>
      <footer><small>{job.public_job_id || 'Job'}</small><span className={needsOnly || ['awaiting_owner_price','deposit_paid','offers_received','awaiting_owner_assignment'].includes(String(job.status||'').toLowerCase())?'atelierButton primary':'atelierButton'}>{jobCta(job.status)} <span>↗</span></span></footer>
    </Link>)}</div>
    {!loading && !filtered.length && <div className="atelierEmpty"><span>✓</span><h2>{needsOnly?'All caught up.':'Nothing here yet.'}</h2><p>{needsOnly?'Your next decision will appear here.':'New enquiries will appear here as they arrive.'}</p></div>}
  </div>;
}
