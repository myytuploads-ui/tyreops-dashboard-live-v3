'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ACTIVE_JOB_STATUSES, expectedMargin, isToday, isThisMonth, isThisWeek, needsYou, validMoney } from '@/lib/dashboard/operations';
import { isTestJob } from '@/lib/dashboard/filters';
import { useAuthoritativePolling } from '@/lib/dashboard/use-authoritative-polling';
import StatusBadge from '@/components/StatusBadge';
import { groupJobsByPipelineStage, stageEnteredAt, formatStageAge, stagePrimaryCta } from '@/lib/dashboard/pipeline-stage';

type Row = Record<string, any>;
const money = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
const timeOnly = (value: unknown) => value ? new Date(String(value)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';


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

  const sumOwnerEarnings = (predicate: (job: Row) => boolean) => {
    const values = visible.filter((job) => job.status === 'completed' && predicate(job)).map(expectedMargin).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : 0;
  };
  const earningsToday = sumOwnerEarnings((job) => isToday(job.completed_at));
  const earningsWeek = sumOwnerEarnings((job) => isThisWeek(job.completed_at));
  const earningsMonth = sumOwnerEarnings((job) => isThisMonth(job.completed_at));

  const jobById = new Map(visible.map((job) => [String(job.id), job]));
  const recentEvents = events.filter((event) => visibleIds.has(String(event.job_id))).slice(0, 6);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return <div className="atelierPage atelierHome">
    <header className="atelierHeading"><div><span className="eyebrow">RESCUE TYRES <span className="atelierLive">● Live</span></span><h1>{greeting}.</h1><p>Your day, under control.</p></div><label className="compactCheck"><input type="checkbox" checked={showTests} onChange={e=>setShowTests(e.target.checked)}/> Test records</label></header>
    {error && <div className="error">{error}</div>}
    {loading ? <div className="atelierEmpty">Bringing your day into view…</div> : <>
    <section className="atelierEarningsStrip" aria-label="Owner earnings">
      <span className="eyebrow">YOUR EARNINGS</span>
      <div className="atelierEarningsFigures">
        <div><span>Today</span><strong>{money(earningsToday)}</strong></div>
        <div><span>This week</span><strong>{money(earningsWeek)}</strong></div>
        <div><span>This month</span><strong>{money(earningsMonth)}</strong></div>
      </div>
      <Link href="/money" className="atelierEarningsLink">Money ↗</Link>
    </section>
    <section className={`atelierPriority${actionable.length?' hasAttention':' isClear'}`}><header><div><span className="eyebrow">NEEDS YOU</span><h2>{actionable.length ? (actionable.length===1 ? '1 decision waiting.' : `${actionable.length} decisions waiting.`) : 'Nothing needs you.'}</h2>{actionable.length? <p>Stage bottlenecks first. One clear next step each.</p> : <p className="atelierClearCopy">You're clear. New owner decisions land here first.</p>}</div>{actionable.length? <Link href="/jobs?view=needs-you" className="atelierButton atelierQueueLink">Full queue ↗</Link> : null}</header>
    {actionable.length>0 && <div className="atelierUrgent atelierStageQueue">{groupJobsByPipelineStage(actionable).flatMap(({stage, jobs}) => {
      const shown = jobs.slice(0, stage.key === 'deposit' || stage.key === 'quote' || stage.key === 'fitter' ? 3 : 2);
      return [
        <div className="atelierStageGroupHead" key={`h-${stage.key}`}><h3>{stage.label}</h3><span>{jobs.length}</span></div>,
        ...shown.map((job, index) => {
          const entered = stageEnteredAt(job, eventsByJob.get(String(job.id)) || []);
          const cta = stagePrimaryCta(job);
          const href = `/jobs/${job.id}${cta.hrefSuffix || ''}`;
          return <Link className="atelierStageCard" key={job.id} href={href}><div className="meta"><span>{stage.label}</span><small>{formatStageAge(entered.at, entered.known)}</small></div><h3>{job.postcode || job.postcode_area || 'Location pending'}</h3><p>{job.tyre_size || 'Tyre details pending'}{job.tyre_quantity?` × ${job.tyre_quantity}`:''}</p><span className={index===0 && stage.index<=2?'atelierButton primary':'atelierButton'}>{cta.label} ↗</span></Link>;
        })
      ];
    })}</div>}
    </section>
    <section className="atelierToday"><span className="eyebrow">TODAY AT A GLANCE</span><div className="atelierMoneyRow"><div><span>Confirmed payments</span><strong>{money(paidRevenueToday)}</strong></div><div><span>Active jobs</span><strong>{active.length}</strong></div><div><span>Completed today</span><strong>{completedToday.length}</strong></div>{marginToday!==null && <div><span>Gross margin</span><strong>{money(marginToday)}</strong></div>}</div></section>
    <div className="atelierHomeColumns"><section><div className="atelierSectionHeading"><h2>Active now</h2><Link href="/jobs">All jobs ↗</Link></div>{active.length?active.slice(0,6).map(job=><Link className="atelierActiveRow" href={`/jobs/${job.id}`} key={job.id}><span className="atelierWheel">◎</span><div><strong>{job.postcode || job.postcode_area || 'Location pending'}</strong><p>{job.tyre_size || 'Tyre details pending'}{job.tyre_quantity?` × ${job.tyre_quantity}`:''}</p></div><StatusBadge status={job.status}/><span>↗</span></Link>):<p className="atelierQuiet">No active jobs right now.</p>}</section>
    <section><div className="atelierSectionHeading"><h2>Recent activity</h2></div>{recentEvents.length?recentEvents.map(event=><Link className="atelierActivity" key={event.id} href={`/jobs/${event.job_id}`}><i/><div><strong>{String(event.event_type || 'Update').replaceAll('_',' ')}</strong><p>{jobById.get(String(event.job_id))?.public_job_id || 'Job'} · {timeOnly(event.created_at)}</p></div></Link>):<p className="atelierQuiet">Your latest updates will appear here.</p>}</section></div>
    </>}
  </div>;
}
