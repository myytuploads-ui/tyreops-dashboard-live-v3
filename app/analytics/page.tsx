import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  ACTIVE_JOB_STATUSES,
  expectedMargin,
  isToday,
  isThisMonth,
  isThisWeek,
  needsYou,
  validMoney,
} from '@/lib/dashboard/operations';
import { fitterToSendAmount } from '@/lib/dashboard/settlement-display';

export const dynamic = 'force-dynamic';

const gbp = (value: unknown) =>
  value == null || Number.isNaN(Number(value))
    ? '—'
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Number(value));

type Row = Record<string, any>;
type PeriodKey = 'today' | 'week' | 'month';

const STATUS_LABELS: Record<string, string> = {
  awaiting_details: 'Details needed',
  awaiting_owner_price: 'Price needed',
  awaiting_payment: 'Waiting for payment',
  payment_link_expired: 'Payment expired',
  deposit_paid: 'Deposit paid',
  awaiting_fitter: 'Fitter needed',
  awaiting_owner_assignment: 'Assignment needed',
  awaiting_owner_first_refusal: 'Your decision',
  awaiting_group_dispatch: 'Group dispatch',
  dispatching_preferred: 'Finding fitter',
  dispatching_general: 'Finding fitter',
  offers_received: 'Offers ready',
  assigned: 'Fitter assigned',
  fitter_on_route: 'On the way',
  on_route: 'On the way',
  arrived: 'Arrived',
  in_progress: 'Fitting',
  completed: 'Completed',
  cancelled: 'Cancelled',
  manual_review: 'Needs attention',
};

const EVENT_LABELS: Record<string, string> = {
  stuck_job_detected: 'Job looks stuck',
  payment_confirmed: 'Payment confirmed',
  deposit_paid: 'Deposit paid',
  fitter_assigned: 'Fitter assigned',
  job_completed: 'Job completed',
  status_changed: 'Status updated',
  owner_priced: 'Price set',
  offer_received: 'Offer received',
  dispatch_started: 'Dispatch started',
  message_sent: 'Message sent',
  payment_link_created: 'Payment link sent',
  payment_link_expired: 'Payment link expired',
};

function periodPredicate(period: PeriodKey): (value: unknown) => boolean {
  if (period === 'today') return isToday;
  if (period === 'week') return isThisWeek;
  return isThisMonth;
}

function completedWhen(job: Row | undefined, settlement: Row) {
  return job?.completed_at || settlement.created_at;
}

function statusLabel(status: unknown) {
  const key = String(status || '').toLowerCase();
  return STATUS_LABELS[key] || key.replaceAll('_', ' ') || 'Unknown';
}

function eventLabel(eventType: unknown) {
  const key = String(eventType || '').toLowerCase();
  if (EVENT_LABELS[key]) return EVENT_LABELS[key];
  return key.replaceAll('_', ' ') || 'Update';
}

function postcodeArea(job: Row) {
  const area = String(job.postcode_area || '').trim().toUpperCase();
  if (area) return area;
  const postcode = String(job.postcode || '').trim().toUpperCase();
  if (!postcode) return null;
  const match = postcode.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  return match ? match[1] : postcode.split(/\s+/)[0] || null;
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(value: unknown) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatShortDay(isoDay: string) {
  const date = new Date(`${isoDay}T12:00:00`);
  return date.toLocaleDateString('en-GB', { weekday: 'narrow', day: 'numeric' });
}

function formatTime(value: unknown) {
  if (!value) return '—';
  return new Date(String(value)).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function periodHref(key: PeriodKey) {
  return key === 'month' ? '/analytics' : `/analytics?period=${key}`;
}

export default async function AnalyticsPage({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const params = (await searchParams) || {};
  const raw = String(params.period || 'month').toLowerCase();
  const period: PeriodKey = raw === 'today' || raw === 'week' || raw === 'month' ? raw : 'month';
  const inPeriod = periodPredicate(period);
  const periodLabel = period === 'today' ? 'Today' : period === 'week' ? 'This week' : 'This month';

  const supabase = await createClient();
  const [
    { data: jobs },
    { data: payments },
    { data: settlements },
    { data: events, error: eventsError },
  ] = await Promise.all([
    supabase
      .from('jobs')
      .select('id,public_job_id,status,postcode,postcode_area,customer_price,agreed_fitter_cost,remaining_customer_balance,completed_at,created_at,updated_at,deposit_status,assigned_fitter_id')
      .order('updated_at', { ascending: false })
      .limit(500),
    supabase.from('payments').select('id,job_id,status,amount,paid_at,created_at').eq('status', 'paid').limit(1000),
    supabase
      .from('job_settlements')
      .select('job_id,rescue_tyres_entitlement,settlement_outstanding,settlement_status,created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('workflow_events')
      .select('id,job_id,event_type,workflow_name,created_at')
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const jobList = jobs || [];
  const paymentList = payments || [];
  const settlementList = settlements || [];
  const eventList = eventsError ? [] : events || [];
  const jobsById = new Map(jobList.map((job) => [String(job.id), job]));

  const paymentsByJob = new Map<string, Row[]>();
  for (const payment of paymentList) {
    const key = String(payment.job_id || '');
    if (!key) continue;
    paymentsByJob.set(key, [...(paymentsByJob.get(key) || []), payment]);
  }
  const eventsByJob = new Map<string, Row[]>();
  for (const event of eventList) {
    const key = String(event.job_id || '');
    if (!key) continue;
    eventsByJob.set(key, [...(eventsByJob.get(key) || []), event]);
  }

  const completed = jobList.filter((job) => String(job.status || '').toLowerCase() === 'completed');
  const active = jobList.filter((job) => ACTIVE_JOB_STATUSES.has(String(job.status || '').toLowerCase()));
  const needsYouJobs = jobList.filter((job) =>
    needsYou(job, paymentsByJob.get(String(job.id)) || [], eventsByJob.get(String(job.id)) || []),
  );

  const completedInPeriod = completed.filter((job) => inPeriod(job.completed_at));
  const createdInPeriod = jobList.filter((job) => inPeriod(job.created_at));
  const conversion =
    createdInPeriod.length > 0
      ? Math.round((completedInPeriod.length / createdInPeriod.length) * 100)
      : null;

  const earnings = settlementList.length
    ? settlementList.reduce((sum, settlement) => {
        const job = jobsById.get(String(settlement.job_id));
        if (!inPeriod(completedWhen(job, settlement))) return sum;
        const entitlement = validMoney(settlement.rescue_tyres_entitlement);
        if (entitlement !== null) return sum + entitlement;
        return sum + (job ? expectedMargin(job) || 0 : 0);
      }, 0)
    : completedInPeriod
        .map(expectedMargin)
        .filter((value): value is number => value !== null)
        .reduce((a, b) => a + b, 0);

  const confirmedPayments = paymentList.reduce((sum, payment) => {
    if (!inPeriod(payment.paid_at || payment.created_at)) return sum;
    return sum + (validMoney(payment.amount) || 0);
  }, 0);

  const settledRows = settlementList
    .map((settlement) => {
      const job = jobsById.get(String(settlement.job_id));
      return { settlement: settlement as Row, job, when: completedWhen(job, settlement) };
    })
    .filter((row) => inPeriod(row.when));
  const settledIds = new Set(settlementList.map((s) => String(s.job_id)));
  const orphanCompleted = completedInPeriod
    .filter((job) => !settledIds.has(String(job.id)))
    .map((job) => ({ settlement: null as Row | null, job, when: job.completed_at }));
  const remitUniverse = [...settledRows, ...orphanCompleted];
  const stillOwed = remitUniverse.reduce((sum, row) => {
    const amount = fitterToSendAmount(row.settlement, row.job);
    return amount === null ? sum : sum + amount;
  }, 0);

  const today = startOfLocalDay();
  const last14: Array<{ key: string; label: string; count: number }> = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    last14.push({ key, label: formatShortDay(key), count: 0 });
  }
  const dayIndex = new Map(last14.map((day, index) => [day.key, index]));
  for (const job of completed) {
    const key = dayKey(job.completed_at);
    if (!key || !dayIndex.has(key)) continue;
    last14[dayIndex.get(key)!].count += 1;
  }
  const maxCompletions = Math.max(1, ...last14.map((day) => day.count));
  const sparkTotal = last14.reduce((sum, day) => sum + day.count, 0);

  const areaCounts = new Map<string, number>();
  for (const job of jobList) {
    const when = job.completed_at || job.created_at;
    if (!inPeriod(when)) continue;
    const area = postcodeArea(job);
    if (!area) continue;
    areaCounts.set(area, (areaCounts.get(area) || 0) + 1);
  }
  const topAreas = [...areaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxArea = Math.max(1, ...topAreas.map(([, count]) => count));

  const statusCounts = new Map<string, number>();
  for (const job of active) {
    const key = String(job.status || 'unknown').toLowerCase();
    statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
  }
  const statusMix = [...statusCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxStatus = Math.max(1, ...statusMix.map(([, count]) => count));
  const activeTotal = statusMix.reduce((sum, [, count]) => sum + count, 0);

  const meaningfulEvents = eventList
    .filter((event) => {
      const type = String(event.event_type || '').toLowerCase();
      return type && type !== 'heartbeat' && type !== 'poll' && type !== 'noop';
    })
    .slice(0, 8);

  const filters: Array<[PeriodKey, string]> = [
    ['today', 'Today'],
    ['week', 'Week'],
    ['month', 'Month'],
  ];

  return (
    <div className="atelierPage atelierAnalytics" data-period={period}>
      <header className="atelierHeading atelierAnalyticsHeading">
        <div>
          <span className="eyebrow">ANALYTICS</span>
          <h1>Business pulse</h1>
        </div>
        <nav className="atelierAnalyticsSeg" aria-label="Date range">
          {filters.map(([key, label]) => (
            <Link
              key={key}
              href={periodHref(key)}
              scroll={false}
              prefetch={false}
              aria-current={period === key ? 'page' : undefined}
              className={period === key ? 'active' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="atelierAnalyticsHero" aria-label={`${periodLabel} pulse`}>
        <div className="atelierAnalyticsHeroMain">
          <div className="atelierAnalyticsHeroFigure">
            <span className="eyebrow">EARNINGS · {periodLabel.toUpperCase()}</span>
            <strong className="atelierAnalyticsHeroNumber">{gbp(earnings)}</strong>
            <p>Owner entitlement from settlements in range</p>
          </div>
          <div className="atelierAnalyticsHeroStats" aria-label="Throughput">
            <div>
              <span>Completed</span>
              <strong>{completedInPeriod.length}</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>{createdInPeriod.length}</strong>
            </div>
            <div>
              <span>Conversion</span>
              <strong>{conversion === null ? '—' : `${conversion}%`}</strong>
            </div>
            <div>
              <span>Active now</span>
              <strong>{active.length}</strong>
            </div>
            <div className={needsYouJobs.length ? 'needsAttention' : undefined}>
              <span>Needs You</span>
              <strong>{needsYouJobs.length}</strong>
            </div>
            {needsYouJobs.length > 0 ? (
              <Link href="/jobs?view=needs-you" className="atelierAnalyticsHeroCta">
                Open queue ↗
              </Link>
            ) : (
              <div className="atelierAnalyticsHeroQuiet">
                <span>Queue</span>
                <strong>Clear</strong>
              </div>
            )}
          </div>
        </div>

        <div className="atelierAnalyticsSpark" aria-label="Last 14 days completions">
          <div className="atelierAnalyticsSparkHead">
            <span className="eyebrow">14-DAY THROUGHPUT</span>
            <span>{sparkTotal ? `${sparkTotal} completed` : 'No completions yet'}</span>
          </div>
          <div className="atelierAnalyticsBars" role="img" aria-label="Completions over the last 14 days">
            {last14.map((day) => {
              const height = day.count === 0 ? 4 : Math.max(8, Math.round((day.count / maxCompletions) * 100));
              return (
                <div className="atelierAnalyticsBarCol" key={day.key} title={`${day.key}: ${day.count}`}>
                  <i style={{ height: `${height}%` }} className={day.count > 0 ? 'hasValue' : undefined} />
                  <span>{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="atelierAnalyticsMoneyPulse" aria-label="Money pulse">
        <div className="atelierAnalyticsMoneyPulseHead">
          <div>
            <span className="eyebrow">MONEY PULSE</span>
            <h2>Cash in · owed · entitlement</h2>
          </div>
          <Link href={period === 'month' ? '/money' : `/money?period=${period}`} className="atelierAnalyticsLink">
            Money ↗
          </Link>
        </div>
        <div className="atelierAnalyticsMoneyGrid">
          <div>
            <span>Earnings</span>
            <strong>{gbp(earnings)}</strong>
          </div>
          <div>
            <span>Confirmed paid</span>
            <strong>{gbp(confirmedPayments)}</strong>
          </div>
          <div>
            <span>Still owed</span>
            <strong>{gbp(stillOwed)}</strong>
          </div>
        </div>
      </section>

      <div className="atelierAnalyticsGrid">
        <section className="atelierAnalyticsCard">
          <span className="eyebrow">POSTCODES</span>
          <h2>Where work lands</h2>
          {topAreas.length ? (
            <div className="atelierAnalyticsHBars">
              {topAreas.map(([area, count]) => (
                <div className="atelierAnalyticsHBar" key={area}>
                  <div className="atelierAnalyticsHBarMeta">
                    <strong>{area}</strong>
                    <span>{count}</span>
                  </div>
                  <div className="atelierAnalyticsHBarTrack">
                    <i style={{ width: `${Math.max(8, Math.round((count / maxArea) * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="atelierAnalyticsEmpty">No area data for this period yet.</p>
          )}
        </section>

        <section className="atelierAnalyticsCard">
          <div className="atelierAnalyticsCardHead">
            <div>
              <span className="eyebrow">STATUS MIX</span>
              <h2>Active right now</h2>
            </div>
            <span className="atelierAnalyticsCardCount">{activeTotal}</span>
          </div>
          {statusMix.length ? (
            <div className="atelierAnalyticsChips">
              {statusMix.map(([status, count]) => (
                <div className="atelierAnalyticsChip" key={status}>
                  <div className="atelierAnalyticsChipTop">
                    <span>{statusLabel(status)}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="atelierAnalyticsChipTrack">
                    <i style={{ width: `${Math.max(10, Math.round((count / maxStatus) * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="atelierAnalyticsEmpty">No active jobs right now.</p>
          )}
        </section>
      </div>

      {!eventsError && meaningfulEvents.length > 0 ? (
        <section className="atelierAnalyticsTimelineCard">
          <div className="atelierSectionHeading">
            <div>
              <span className="eyebrow">TIMELINE</span>
              <h2>Recent rhythm</h2>
            </div>
          </div>
          <ol className="atelierAnalyticsTimeline">
            {meaningfulEvents.map((event) => {
              const job = jobsById.get(String(event.job_id));
              const title = eventLabel(event.event_type);
              const place = job?.public_job_id || job?.postcode || job?.postcode_area || 'Job';
              return (
                <li key={String(event.id)}>
                  <Link href={`/jobs/${event.job_id}`} className="atelierAnalyticsTimelineRow">
                    <i />
                    <div>
                      <strong>{title}</strong>
                      <p>
                        {place} · {formatTime(event.created_at)}
                      </p>
                    </div>
                    <span>↗</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
