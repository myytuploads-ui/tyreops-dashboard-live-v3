'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { dispatchLabel, expectedMargin, jobProblems, needsYou as classifyNeedsYou, paymentLabel, validMoney } from '@/lib/dashboard/operations';
import { isTestJob } from '@/lib/dashboard/filters';
import { useAuthoritativePolling } from '@/lib/dashboard/use-authoritative-polling';
import StatusBadge from '@/components/StatusBadge';

type Row = Record<string, any>;
const money = (value: unknown) => { const amount = validMoney(value); return amount === null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount); };
const when = (value: unknown) => value ? new Date(String(value)).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const STATUSES = ['awaiting_details', 'awaiting_payment', 'payment_link_expired', 'awaiting_owner_price', 'awaiting_owner_first_refusal', 'awaiting_group_dispatch', 'dispatching_preferred', 'dispatching_general', 'offers_received', 'awaiting_owner_assignment', 'assigned', 'fitter_on_route', 'arrived', 'in_progress', 'manual_review', 'completed', 'cancelled'];

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
  const needsYou = (job: Row, jobPayments: Row[], _events?: Row[]) =>
    classifyNeedsYou(job, jobPayments, eventsByJob.get(String(job.id)) || []);
  const visible = jobs.filter((job) => showTests || !isTestJob(job));
  const filtered = visible.filter((job) => {
    const jobPayments = paymentsByJob.get(String(job.id)) || [];
    if (needsOnly && !needsYou(job, jobPayments, eventsByJob.get(String(job.id)) || [])) return false;
    if (status && job.status !== status) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return [job.public_job_id, job.customer_name, job.customer_phone, job.postcode, job.postcode_area, job.vehicle_registration, job.tyre_size, fitterNames.get(String(job.assigned_fitter_id || ''))].some((value) => String(value || '').toLowerCase().includes(needle));
  });
  const needsCount = visible.filter((job) => needsYou(job, paymentsByJob.get(String(job.id)) || [], eventsByJob.get(String(job.id)) || [])).length;

  return <div className="atelierPage">
    <header className="atelierHeading"><div><span className="eyebrow">YOUR OPERATIONS</span><h1>{needsOnly ? 'Needs you.' : 'Every job. One place.'}</h1><p>{needsOnly ? 'The decisions that keep your day moving.' : 'From the first message to the final fitting.'}</p></div><label className="compactCheck"><input type="checkbox" checked={showTests} onChange={e=>setShowTests(e.target.checked)}/> Test records</label></header>
    <div className="atelierSearch"><input aria-label="Search jobs" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search postcode, customer or tyre size…"/><select aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Every status</option>{STATUSES.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></div>
    <div className="atelierTabs"><button className={!needsOnly?'selected':''} onClick={()=>setNeedsOnly(false)}>All jobs <span>{visible.length}</span></button><button className={needsOnly?'selected':''} onClick={()=>setNeedsOnly(true)}>Needs you <span>{needsCount}</span></button></div>
    {loading && <div className="modernEmpty">Loading your jobs…</div>}{error && <div className="error">{error}</div>}
    <div className="atelierJobs">{filtered.map(job=><article className="atelierJob" key={job.id}>
      <div className="atelierJobMeta"><StatusBadge status={job.status}/><span>{when(job.updated_at)}</span></div>
      <h2>{job.postcode || job.postcode_area || 'Location pending'}</h2>
      <p className="atelierTyre">{job.tyre_size || 'Tyre details pending'}{job.tyre_quantity ? ` × ${job.tyre_quantity}` : ''}</p>
      <div className="atelierCustomer"><span className="atelierAvatar">{String(job.customer_name || 'C').slice(0,1)}</span><div><strong>{job.customer_name || 'Customer'}</strong><span>{job.customer_phone || 'Conversation available'}</span></div></div>
      <footer><small>{job.public_job_id || 'Job'}</small><Link className={needsOnly?'atelierButton primary':'atelierButton'} href={`/jobs/${job.id}`}>{job.status==='awaiting_owner_price'?'Set price':job.status==='deposit_paid'?'Choose fitter':'View job'} <span>↗</span></Link></footer>
    </article>)}</div>
    {!loading && !filtered.length && <div className="atelierEmpty"><span>✓</span><h2>{needsOnly?'All caught up.':'Nothing here yet.'}</h2><p>{needsOnly?'Your next decision will appear here.':'New enquiries will appear here as they arrive.'}</p></div>}
  </div>;
}
