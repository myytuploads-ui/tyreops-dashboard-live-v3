import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { expectedMargin, isToday, isThisMonth, isThisWeek, validMoney } from '@/lib/dashboard/operations';
import { fitterSentState, fitterToSendAmount } from '@/lib/dashboard/settlement-display';

const gbp = (value: unknown) => value == null || Number.isNaN(Number(value))
  ? '—'
  : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Number(value));

type Row = Record<string, any>;
type PeriodKey = 'today' | 'week' | 'month' | 'all';

function periodPredicate(period: PeriodKey): (value: unknown) => boolean {
  if (period === 'today') return isToday;
  if (period === 'week') return isThisWeek;
  if (period === 'month') return isThisMonth;
  return () => true;
}

function completedWhen(job: Row | undefined, settlement: Row) {
  return job?.completed_at || settlement.created_at;
}

function formatDay(value: unknown) {
  if (!value) return '—';
  return new Date(String(value)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function MoneyPage({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const params = (await searchParams) || {};
  const raw = String(params.period || 'month').toLowerCase();
  const period: PeriodKey = raw === 'today' || raw === 'week' || raw === 'month' || raw === 'all' ? raw : 'month';
  const inPeriod = periodPredicate(period);

  const supabase = await createClient();
  const [{ data: jobs }, { data: payments }, { data: settlements, error: settlementError }] = await Promise.all([
    supabase.from('jobs').select('id,public_job_id,status,postcode,postcode_area,customer_price,deposit_amount,remaining_customer_balance,agreed_fitter_cost,assigned_fitter_id,completed_at,updated_at').order('updated_at', { ascending: false }).limit(500),
    supabase.from('payments').select('job_id,status,amount,paid_at').eq('status', 'paid'),
    supabase.from('job_settlements').select('job_id,customer_agreed_total,deposit_received,customer_remaining_balance,fitter_agreed_cost,rescue_tyres_entitlement,settlement_outstanding,settlement_status,created_at').order('created_at', { ascending: false }).limit(200),
  ]);

  const jobList = jobs || [];
  const paymentList = payments || [];
  const settlementList = settlements || [];
  const jobsById = new Map(jobList.map((job) => [String(job.id), job]));
  const assignedFitterIds = [...new Set(jobList.map((job) => job.assigned_fitter_id).filter(Boolean).map(String))];
  const { data: moneyFitters } = assignedFitterIds.length
    ? await supabase.from('fitters').select('id,whatsapp_phone,phone').in('id', assignedFitterIds)
    : { data: [] as Row[] };
  const fitterPhoneById = new Map((moneyFitters || []).map((fitter) => {
    const phone = String(fitter.whatsapp_phone || fitter.phone || '').trim();
    return [String(fitter.id), phone] as const;
  }).filter(([, phone]) => Boolean(phone)));

  const paidAll = paymentList.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const completed = jobList.filter((job) => job.status === 'completed');
  const margin = completed.reduce((sum, job) => sum + (Number(job.customer_price) || 0) - (Number(job.agreed_fitter_cost) || 0), 0);

  const earningsPeriods: Array<[string, (value: unknown) => boolean]> = [
    ['Today', isToday],
    ['This week', isThisWeek],
    ['This month', isThisMonth],
  ];

  const settledRows = settlementList
    .map((settlement) => {
      const job = jobsById.get(String(settlement.job_id));
      return { settlement: settlement as Row | null, job, when: completedWhen(job, settlement) };
    })
    .filter((row) => inPeriod(row.when));

  const settledIds = new Set(settlementList.map((s) => String(s.job_id)));
  const orphanCompleted = completed
    .filter((job) => !settledIds.has(String(job.id)) && inPeriod(job.completed_at))
    .map((job) => ({ settlement: null as Row | null, job, when: job.completed_at }));

  const list = [...settledRows, ...orphanCompleted].sort((a, b) => Date.parse(String(b.when || 0)) - Date.parse(String(a.when || 0)));

  const fittersStillToSend = list.reduce((sum, row) => {
    const amount = fitterToSendAmount(row.settlement, row.job);
    return amount === null ? sum : sum + amount;
  }, 0);

  const filters: Array<[PeriodKey, string]> = [
    ['today', 'Today'],
    ['week', 'This week'],
    ['month', 'This month'],
    ['all', 'All'],
  ];

  return <div className="atelierPage">
    <header className="atelierHeading">
      <div>
        <span className="eyebrow">THE BUSINESS, AT A GLANCE</span>
        <h1>Money, made clear.</h1>
        <p>What fitters still need to send back — and what you have earned.</p>
      </div>
    </header>

    <section className="atelierEarningsBreakdown" aria-label="Owner earnings by period">
      <span className="eyebrow">YOUR EARNINGS</span>
      <div className="atelierEarningsPeriodGrid">
        {earningsPeriods.map(([label, predicate]) => {
          const earnings = settlementList.length
            ? settlementList.reduce((sum, settlement) => {
                const job = jobsById.get(String(settlement.job_id));
                if (!predicate(completedWhen(job, settlement))) return sum;
                const entitlement = validMoney(settlement.rescue_tyres_entitlement);
                if (entitlement !== null) return sum + entitlement;
                return sum + (job ? (expectedMargin(job) || 0) : 0);
              }, 0)
            : completed.filter((job) => predicate(job.completed_at)).map(expectedMargin).filter((v): v is number => v !== null).reduce((a, b) => a + b, 0);
          const takenIn = paymentList.reduce((sum, payment) => predicate(payment.paid_at) ? sum + (validMoney(payment.amount) || 0) : sum, 0);
          const done = completed.filter((job) => predicate(job.completed_at)).length;
          return <div className="atelierEarningsPeriod" key={label}>
            <span>{label}</span>
            <strong>{gbp(earnings)}</strong>
            <p>Taken in {gbp(takenIn)} · {done} completed</p>
          </div>;
        })}
      </div>
    </section>

    <section className="atelierFitterRemit">
      <div className="atelierSectionHeading">
        <h2>Fitters to send</h2>
        <nav className="atelierPeriodFilters" aria-label="Date range">
          {filters.map(([key, label]) => (
            <Link key={key} href={key === 'month' ? '/money' : `/money?period=${key}`} className={period === key ? 'active' : undefined}>{label}</Link>
          ))}
        </nav>
      </div>
      <div className="atelierRemitTotal">
        <span>Still to send this period</span>
        <strong>{gbp(fittersStillToSend)}</strong>
      </div>
      {settlementError ? <div className="error">Settlements could not be loaded. Showing completed jobs where possible.</div> : null}
      <div className="atelierRemitList">
        {list.map(({ settlement, job, when }) => {
          const toSend = fitterToSendAmount(settlement, job);
          const sent = fitterSentState(settlement);
          const title = job?.public_job_id || 'Completed job';
          const place = job?.postcode || job?.postcode_area || '';
          const id = settlement?.job_id || job?.id;
          const fitterPhone = job?.assigned_fitter_id ? (fitterPhoneById.get(String(job.assigned_fitter_id)) || '') : '';
          const digits = fitterPhone.replace(/\D/g, '');
          const amount = toSend !== null && toSend > 0 ? toSend : null;
          const chaseText = amount !== null
            ? `Hi — job ${String(title)}. Please send the remaining £${amount.toLocaleString('en-GB', { maximumFractionDigits: 0 })} for Rescue Tyres when you can. Thanks.`
            : '';
          const chaseHref = digits && amount !== null
            ? `https://wa.me/${digits}?text=${encodeURIComponent(chaseText)}`
            : '';
          return <div className="atelierRemitRow" key={String(id)}>
            <Link className="atelierRemitMain" href={`/jobs/${id}`}>
              <div>
                <strong>{title}</strong>
                <p>{place ? `${place} · ` : ''}{formatDay(when)}</p>
              </div>
              <div className="atelierRemitRowRight">
                <strong>{toSend === null ? '—' : toSend > 0 ? `Fitter to send ${gbp(toSend)}` : 'Cleared'}</strong>
                <span className={`sent-${sent.label.toLowerCase()}`}>Sent? {sent.label}</span>
              </div>
            </Link>
            <div className="atelierRemitChase">
              {amount !== null ? (
                chaseHref
                  ? <a className="atelierButton primary atelierRemitChaseBtn" href={chaseHref} target="_blank" rel="noreferrer">Chase WhatsApp</a>
                  : <Link className="atelierButton atelierRemitChaseBtn" href={`/jobs/${id}#settlement`}>Open settlement</Link>
              ) : null}
            </div>
          </div>;
        })}
      </div>
      {!list.length ? <div className="atelierEmpty"><h2>Nothing in this period.</h2><p>Completed jobs will appear here.</p></div> : null}
    </section>

    <div className="atelierMoneyRow">
      <div><span>Confirmed payments · all time</span><strong>{gbp(paidAll)}</strong></div>
      <div><span>Completed jobs</span><strong>{completed.length}</strong></div>
      <div><span>Known gross margin</span><strong>{gbp(margin)}</strong></div>
    </div>
  </div>;
}
