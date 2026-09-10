'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ACTIVE_JOB_STATUSES, IN_PROGRESS_STATUSES, expectedMargin, isToday, jobProblems, needsYou, validMoney } from '@/lib/dashboard/operations';
import { isTestJob } from '@/lib/dashboard/filters';
import { useAuthoritativePolling } from '@/lib/dashboard/use-authoritative-polling';
import StatusBadge from '@/components/StatusBadge';

type Row = Record<string, any>;
const money = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
const timeOnly = (value: unknown) => value ? new Date(String(value)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
const age = (value: unknown) => {
  const then = Date.parse(String(value || ''));
  if (!Number.isFinite(then)) return 'Waiting';
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  return minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 1440)}d`;
};

function actionCopy(job: Row) {
  const status = String(job.status || '').toLowerCase();
  if (status === 'awaiting_owner_price') return ['Price needed', 'Set customer price'];
  if (status === 'awaiting_owner_first_refusal') return ['Your decision', 'Accept or release job'];
  if (['offers_received', 'awaiting_owner_assignment'].includes(status)) return ['Fitter decision', 'Review fitter offers'];
  if (status === 'deposit_paid') return ['Ready to assign', 'Choose a fitter'];
  if (status === 'payment_link_expired') return ['Payment expired', 'Review customer payment'];
  if (status === 'manual_review') return ['Manual review', 'Open job'];
  return ['Needs attention', 'Open job'];
}

function liveCopy(job: Row) {
  const status = String(job.status || '').toLowerCase();
  if (status === 'fitter_on_route') return job.agreed_eta_minutes ? `On route · ${job.agreed_eta_minutes}m ETA` : 'Fitter on route';
  if (status === 'arrived') return 'Fitter arrived';
  if (status === 'in_progress') return 'Fitting now';
  if (status === 'assigned') return 'Fitter assigned';
  if (status === 'awaiting_payment') return 'Awaiting payment';
  if (status.startsWith('dispatching_') || status === 'offers_received') return 'Finding fitter';
  if (status === 'awaiting_owner_price') return 'Awaiting your price';
  return status.replaceAll('_', ' ');
}

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [showTests, setShowTests] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [jobsResult, paymentsResult, eventsResult] = await Promise.all([
      supabase.from('jobs').select('*').order('updated_at', { ascending: false }).limit(500),
      supabase.from('payments').select('id,job_id,status,amount,currency,paid_at,created_at,provider_reference,idempotency_key').order('created_at', { ascending: false }).limit(1000),
      supabase.from('workflow_events').select('id,job_id,event_type,workflow_name,created_at').order('created_at', { ascending: false }).limit(80),
    ]);
    const failures = [jobsResult.error, paymentsResult.error, eventsResult.error].filter(Boolean);
    setError(failures.length ? 'Live data is partially unavailable. No actions were taken.' : '');
    if (!jobsResult.error) setJobs(jobsResult.data || []);
    if (!paymentsResult.error) setPayments(paymentsResult.data || []);
    if (!eventsResult.error) setEvents(eventsResult.data || []);
    setLoading(false);
  }, [supabase]);

  useAuthoritativePolling(load, 7000);
  useEffect(() => { void load(); }, [load]);

  const visible = jobs.filter((job) => showTests || !isTestJob(job));
  const visibleIds = new Set(visible.map((job) => String(job.id)));
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

  const actionable = visible.filter((job) => needsYou(job, paymentsByJob.get(String(job.id)) || [], eventsByJob.get(String(job.id)) || []));
  const active = visible.filter((job) => ACTIVE_JOB_STATUSES.has(String(job.status || '').toLowerCase()));
  const liveJobs = active.filter((job) => !actionable.includes(job)).slice(0, 7);
  const inProgress = visible.filter((job) => IN_PROGRESS_STATUSES.has(String(job.status || '').toLowerCase()));
  const completedToday = visible.filter((job) => job.status === 'completed' && isToday(job.completed_at));
  const marginTodayValues = completedToday.map(expectedMargin).filter((value): value is number => value !== null);
  const marginToday = marginTodayValues.length ? marginTodayValues.reduce((sum, value) => sum + value, 0) : null;

  const paidKeys = new Set<string>();
  const paidRevenueToday = payments.reduce((sum, payment) => {
    if (!visibleIds.has(String(payment.job_id)) || !isToday(payment.paid_at) || !['paid', 'succeeded'].includes(String(payment.status || '').toLowerCase())) return sum;
    if (payment.currency && String(payment.currency).toUpperCase() !== 'GBP') return sum;
    const key = String(payment.provider_reference || payment.idempotency_key || payment.id);
    if (paidKeys.has(key)) return sum;
    const amount = validMoney(payment.amount);
    if (amount === null) return sum;
    paidKeys.add(key);
    return sum + amount;
  }, 0);

  const jobById = new Map(visible.map((job) => [String(job.id), job]));
  const recentEvents = events.filter((event) => visibleIds.has(String(event.job_id))).slice(0, 6);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return <div className="atelierPage atelierHome">
    <header className="atelierHeading"><div><span className="eyebrow">RESCUE TYRES <span className="atelierLive">● Live</span></span><h1>{greeting}.</h1><p>Your day, under control.</p></div><label className="compactCheck"><input type="checkbox" checked={showTests} onChange={e=>setShowTests(e.target.checked)}/> Test records</label></header>
    {error && <div className="error">{error}</div>}
    {loading ? <div className="atelierEmpty">Bringing your day into view…</div> : <>
    <section className="atelierPriority"><header><div><span className="eyebrow">NEEDS YOU</span><h2>{actionable.length ? `${actionable.length} decisions. Let's keep moving.` : 'A little breathing room.'}</h2><p>{actionable.length?'A few things need your attention.':'You’re all caught up. New decisions will appear here.'}</p></div><Link href="/jobs?view=needs-you" className="atelierButton">View queue ↗</Link></header>
    {actionable.length>0 && <div className="atelierUrgent">{actionable.slice(0,3).map(job=>{const [label,action]=actionCopy(job);return <Link className="atelierUrgentCard" key={job.id} href={`/jobs/${job.id}`}><div className="atelierJobMeta"><span className="badge awaiting_owner_price">{label}</span><small>{age(job.updated_at || job.created_at)}</small></div><h3>{job.postcode || job.postcode_area || 'Location pending'}</h3><p>{job.tyre_size || 'Tyre details pending'}{job.tyre_quantity?` × ${job.tyre_quantity}`:''}</p><span className="atelierButton primary">{action} ↗</span></Link>})}</div>}
    </section>
    <section className="atelierToday"><span className="eyebrow">TODAY AT A GLANCE</span><div className="atelierMoneyRow"><div><span>Confirmed payments</span><strong>{money(paidRevenueToday)}</strong></div><div><span>Active jobs</span><strong>{active.length}</strong></div><div><span>Completed today</span><strong>{completedToday.length}</strong></div>{marginToday!==null && <div><span>Gross margin</span><strong>{money(marginToday)}</strong></div>}</div></section>
    <div className="atelierHomeColumns"><section><div className="atelierSectionHeading"><h2>Active now</h2><Link href="/jobs">All jobs ↗</Link></div>{active.length?active.slice(0,6).map(job=><Link className="atelierActiveRow" href={`/jobs/${job.id}`} key={job.id}><span className="atelierWheel">◎</span><div><strong>{job.postcode || job.postcode_area || 'Location pending'}</strong><p>{job.tyre_size || 'Tyre details pending'}{job.tyre_quantity?` × ${job.tyre_quantity}`:''}</p></div><StatusBadge status={job.status}/><span>↗</span></Link>):<p className="atelierQuiet">No active jobs right now.</p>}</section>
    <section><div className="atelierSectionHeading"><h2>Recent activity</h2></div>{recentEvents.length?recentEvents.map(event=><Link className="atelierActivity" key={event.id} href={`/jobs/${event.job_id}`}><i/><div><strong>{String(event.event_type || 'Update').replaceAll('_',' ')}</strong><p>{jobById.get(String(event.job_id))?.public_job_id || 'Job'} · {timeOnly(event.created_at)}</p></div></Link>):<p className="atelierQuiet">Your latest updates will appear here.</p>}</section></div>
    </>}
  </div>;
}
