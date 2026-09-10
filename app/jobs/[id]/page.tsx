import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import { createClient } from '@/lib/supabase/server';
import { jobProblems, needsYou, validMoney } from '@/lib/dashboard/operations';
import { calculateQuote } from '@/lib/pricing/quote';
import { createAdminClient } from '@/lib/supabase/admin';
import GroupDispatchCard from './GroupDispatchCard';
import ManagerActions from './ManagerActions';
import PaymentResendActions from './PaymentResendActions';
import ChaseFitterBalanceButton from './ChaseFitterBalanceButton';
import FitterSentConfirm from './FitterSentConfirm';
import ConversationControls from './ConversationControls';
import { fitterSentState, fitterToSendAmount, owedNowAmount } from '@/lib/dashboard/settlement-display';

type Row = Record<string, any>;

function money(value: unknown) {
  const amount = validMoney(value);
  return amount === null ? '-' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}
function text(value: unknown, fallback = '-') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}
function when(value: unknown) {
  return value ? new Date(String(value)).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
}
function margin(customer: unknown, fitter: unknown) {
  const customerPrice = validMoney(customer);
  const fitterCost = validMoney(fitter);
  return customerPrice === null || fitterCost === null ? null : customerPrice - fitterCost;
}
function formatPostcode(value: unknown) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(raw)) return text(value);
  return `${raw.slice(0, -3)} ${raw.slice(-3)}`;
}
function readableEvent(value: unknown) {
  const raw = String(value || 'event');
  const labels: Record<string, string> = {
    stuck_job_detected: 'Stuck job detected',
    customer_message: 'Customer message',
    human_takeover_initiated: 'Human takeover',
    human_takeover_inbound_received: 'Customer message in HUMAN mode',
    owner_conversation_reply_sent: 'Owner reply sent',
    returned_to_ai: 'Returned to AI',
    owner_price_set: 'Owner price set',
    stripe_checkout_session_created: 'Payment link created',
    deposit_paid: 'Deposit paid',
    fitter_assigned: 'Fitter assigned',
    fitter_assigned_from_group: 'Group fitter assigned',
    group_dispatch_started: 'Group dispatch started',
    group_offer_received: 'Group offer received',
    completed: 'Job completed',
  };
  return labels[raw] || raw.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function compactEvents(events: Row[]) {
  const rows: Array<Row & { repeatCount?: number; latestAt?: string }> = [];
  for (const event of events) {
    const last = rows[rows.length - 1];
    if (last && last.event_type === event.event_type && last.workflow_name === event.workflow_name) {
      last.repeatCount = (last.repeatCount || 1) + 1;
      last.latestAt = last.latestAt || last.created_at;
    } else {
      rows.push({ ...event, repeatCount: 1, latestAt: event.created_at });
    }
  }
  return rows;
}

function nextStepCopy(status: unknown, ownerNeeded: boolean, opts: { hasSuggested?: boolean; firstRefusalReady?: boolean; assignmentReady?: boolean; hasPhone?: boolean; paymentExpired?: boolean; needsRemittance?: boolean } = {}) {
  const s = String(status || '').toLowerCase();
  if (s === 'awaiting_owner_price') return {
    title: 'Set price',
    body: opts.hasSuggested ? 'Suggested price is ready below. Review and confirm — TyreOps sends the payment link.' : 'Confirm the quote below. TyreOps sends the payment link.',
    cta: 'Set price', href: '#set-price', panel: true as const, assist: opts.hasSuggested ? 'Assist: suggested price prepared — you still Approve.' : null as string | null, blocked: false,
  };
  if (s === 'awaiting_owner_first_refusal') return {
    title: 'Your call on this job',
    body: opts.firstRefusalReady ? 'Take it, send it on, or snooze — one clear decision.' : 'Decision API is not wired here yet — use Inbox / WhatsApp / Call while that is fixed.',
    cta: opts.firstRefusalReady ? 'Decide now' : 'Open inbox', href: opts.firstRefusalReady ? '#owner-action' : 'INBOX', panel: true as const, assist: null, blocked: !opts.firstRefusalReady,
  };
  if (s === 'awaiting_group_dispatch') return {
    title: 'Find a group fitter', body: 'Copy the group message, then assign when an offer lands.',
    cta: 'Open group dispatch', href: '#owner-action', panel: true as const, assist: null, blocked: false,
  };
  if (['offers_received', 'awaiting_owner_assignment', 'deposit_paid'].includes(s)) return {
    title: 'Choose a fitter',
    body: 'Assign someone now so the customer gets moving.',
    cta: 'Assign fitter', href: '#owner-action', panel: true as const, assist: null, blocked: false,
  };
  if (s === 'awaiting_payment' && opts.paymentExpired) return {
    title: 'Payment expired', body: 'Chase the customer on WhatsApp or Inbox — do not wait on a webhook.',
    cta: 'Chase payment', href: '#payment-resend', panel: true as const, assist: null, blocked: false,
  };
  if (s === 'awaiting_payment') return {
    title: 'Waiting on payment', body: 'Customer has the link. Chase if they stall — WhatsApp first.',
    cta: 'Chase payment', href: '#payment-resend', panel: true as const, assist: null, blocked: false,
  };
  if (s === 'payment_link_expired') return {
    title: 'Payment expired', body: 'Chase the customer on WhatsApp or Inbox — do not wait on a webhook.',
    cta: 'Chase payment', href: '#payment-resend', panel: true as const, assist: null, blocked: false,
  };
  if (s === 'manual_review') return {
    title: 'Needs a human look', body: 'Open the conversation or assign a fitter if that unblocks it.',
    cta: 'Open inbox', href: 'INBOX', panel: false as const, assist: null, blocked: false,
  };
  if (['assigned', 'fitter_on_route', 'arrived', 'in_progress'].includes(s)) return {
    title: 'Fitter is progressing', body: 'Monitor here. Intervene only if needed.',
    cta: opts.hasPhone ? 'Call customer' : 'Open inbox', href: opts.hasPhone ? 'TEL' : 'INBOX', panel: false as const, assist: null, blocked: false,
  };
  if (s === 'completed') return {
    title: 'Job complete',
    body: opts.needsRemittance ? 'Confirm if the fitter sent what they owe.' : 'Review settlement — confirm remittance if anything was owed.',
    cta: opts.needsRemittance ? 'Confirm remittance' : 'Review settlement',
    href: '#settlement', panel: false as const, assist: null, blocked: false,
  };
  if (ownerNeeded) return {
    title: 'Needs your attention', body: 'Take the clearest next step below.',
    cta: 'Take action', href: '#owner-action', panel: true as const, assist: null, blocked: false,
  };
  return { title: 'On track', body: 'Nothing blocked. Details stay below.', cta: 'Open inbox', href: 'INBOX', panel: false as const, assist: null, blocked: false };
}
function slimStage(status: unknown, job: Row) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return 6;
  if (s === 'in_progress' || s === 'arrived') return 5;
  if (s === 'fitter_on_route' || s === 'on_route') return 4;
  if (job.assigned_fitter_id) return 3;
  if (job.deposit_verified_at) return 2;
  if (job.customer_price != null) return 1;
  return 0;
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [jobRes, offersRes, eventsRes, paymentsRes, settlementRes] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', id).maybeSingle(),
    supabase.from('fitter_offers').select('*').eq('job_id', id).order('submitted_at', { ascending: false }),
    supabase.from('workflow_events').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(120),
    supabase.from('payments').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(20),
    supabase.from('job_settlements').select('job_id,customer_agreed_total,deposit_received,customer_remaining_balance,fitter_agreed_cost,rescue_tyres_entitlement,settlement_outstanding,settlement_status,created_at').eq('job_id', id).maybeSingle(),
  ]);

  const job: Row | null = jobRes.data;
  if (!job) return <div className="error">Job not found.</div>;

  const offers = offersRes.data || [];
  const fitterIds = [...new Set([...offers.map((offer: Row) => offer.fitter_id).filter(Boolean), job.assigned_fitter_id].filter(Boolean))];
  const [linkedFittersRes, allFittersRes] = await Promise.all([
    fitterIds.length ? supabase.from('fitters').select('id,full_name,whatsapp_phone,phone,reliability_score,priority_level,completed_jobs,preferred,active').in('id', fitterIds) : Promise.resolve({ data: [] as Row[] }),
    supabase.from('fitters').select('id,full_name,whatsapp_phone,phone,reliability_score,priority_level,completed_jobs,preferred,active').order('active', { ascending: false }).order('priority_level', { ascending: true }).limit(200),
  ]);
  const fitters = allFittersRes.data || linkedFittersRes.data || [];
  const fitterMap = Object.fromEntries(fitters.map((fitter) => [fitter.id, fitter]));
  const payments = paymentsRes.data || [];
  const events = eventsRes.data || [];
  const settlement = settlementRes.data || null;
  const assigned = fitterMap[job.assigned_fitter_id];
  const grossMargin = margin(job.customer_price, job.agreed_fitter_cost);
  const problems = jobProblems(job, payments, events);
  const ownerNeeded = needsYou(job, payments, events);
  const timeline = compactEvents(events);
  let suggestedQuote: Row | null = null;
  let depositRules: Row[] = [];
  if (job.status === 'awaiting_owner_price') {
    const admin = createAdminClient();
    if (admin) {
      const depositRulesRes = await admin.from('deposit_rules').select('id,min_job_value_gbp,max_job_value_gbp,deposit_fixed_gbp').eq('active', true).eq('owner_confirmed', true).order('min_job_value_gbp');
      depositRules = depositRulesRes.data || [];
      suggestedQuote = await calculateQuote(admin, {
        tyre_size: job.tyre_size,
        tier: job.tyre_tier || job.tier || 'budget',
        quantity: Number(job.tyre_quantity || 1),
        postcode: job.postcode || job.postcode_area,
        requested_time: job.requested_time || job.requested_at,
        vehicle_category: job.vehicle_category || 'car',
        locking_wheel_nut: job.locking_wheel_nut,
        motorway: String(job.location_type || '').toLowerCase().includes('motorway'),
      });
    }
  }

  const latestPayment = payments[0] || null;
  const latestPaymentStatus = String(latestPayment?.status || '').toLowerCase();
  const depositStatus = String(job.deposit_status || '').toLowerCase();
  const jobStatus = String(job.status || '').toLowerCase();
  const paymentExpired =
    jobStatus === 'payment_link_expired' ||
    ['expired', 'failed', 'cancelled'].includes(latestPaymentStatus) ||
    (jobStatus === 'awaiting_payment' && ['expired', 'failed'].includes(depositStatus));
  const paymentResendMode: 'expired' | 'awaiting' =
    jobStatus === 'payment_link_expired' ||
    ['expired', 'failed', 'cancelled'].includes(latestPaymentStatus) ||
    ['expired', 'failed'].includes(depositStatus)
      ? 'expired'
      : 'awaiting';
  const paymentAmountLabel = (() => {
    const amount = validMoney(latestPayment?.amount ?? job.deposit_amount);
    return amount === null
      ? undefined
      : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
  })();
  const firstRefusalReady = Boolean(process.env.TYREOPS_FIRST_REFUSAL_URL?.trim());
  const assignmentReady = Boolean(process.env.TYREOPS_FITTER_ASSIGNMENT_URL?.trim());
  const tel = job.customer_phone ? `tel:${String(job.customer_phone).replace(/[^+0-9]/g, '')}` : '';
  const waDigits = job.customer_phone ? String(job.customer_phone).replace(/\D/g, '') : '';
  const waPaymentText = (() => {
    const jobLabel = String(job.public_job_id || job.id).slice(0, 24);
    const amountBit = paymentAmountLabel ? ` (${paymentAmountLabel} deposit)` : '';
    return `Hi — job ${jobLabel}. Just following up on the Rescue Tyres payment${amountBit}. Reply here if you need the link again — happy to resend. Thanks.`;
  })();
  const wa = waDigits
    ? (paymentExpired
      ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waPaymentText)}`
      : `https://wa.me/${waDigits}`)
    : '';
  const maps = (job.postcode || job.postcode_area) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.postcode || job.postcode_area)}` : '';
  const previewToSend = fitterToSendAmount(settlement, job);
  const needsRemittance = String(job.status || '').toLowerCase() === 'completed' && previewToSend !== null && previewToSend > 0;
  const paymentResendConfigured = Boolean(process.env.TYREOPS_PAYMENT_RESEND_URL?.trim());
  const next = nextStepCopy(job.status, ownerNeeded, {
    hasSuggested: Boolean(suggestedQuote && (suggestedQuote as any).quote_status === 'priced'),
    firstRefusalReady,
    assignmentReady,
    hasPhone: Boolean(tel || wa),
    paymentExpired,
    needsRemittance,
  });
  const ctaHref = next.href === 'INBOX' ? `/conversations?job=${job.id}` : next.href === 'WHATSAPP' ? wa : next.href === 'TEL' ? tel : next.href;
  const stage = slimStage(job.status, job);
  const panelOwnsPrimary = Boolean(next.panel && !next.blocked);

  return <div className="atelierPage atelierJobDetail">
    <header className="atelierCommand">
      <Link className="atelierBack" href="/jobs">← All jobs</Link>
      <div className="atelierCommandTop">
        <div>
          <h1>{formatPostcode(job.postcode || job.postcode_area)}</h1>
          <p>{job.tyre_size || 'Tyre details pending'}{job.tyre_quantity ? ` × ${job.tyre_quantity}` : ''}</p>
          <small>{job.public_job_id}</small>
        </div>
        <div className="atelierCommandActions atelierCommandActionsQuiet">
          <Link className="atelierButton" href={`/conversations?job=${job.id}`}>Inbox</Link>
        </div>
      </div>
      <section className={`atelierNextStep${ownerNeeded ? ' needsYou' : ''}`}>
        <div>
          <span className="eyebrow">{ownerNeeded ? 'NEXT FOR YOU' : 'STATUS'}</span>
          <div className="atelierNextStatus"><StatusBadge status={job.status} /></div>
          <h2>{next.title}</h2>
          <p>{next.body}</p>
          {next.assist ? <p className="atelierAssistHint">{next.assist}</p> : null}
          {next.blocked ? <p className="atelierBackendGap">Backend gap on this step — use Inbox / WhatsApp / Call so you are not stuck.</p> : null}
        </div>
        {ctaHref ? (
          next.href === 'INBOX' ? (
            <Link className={panelOwnsPrimary || next.blocked ? 'atelierButton' : 'atelierButton primary'} href={ctaHref}>{next.cta} ↗</Link>
          ) : next.href.startsWith('#') ? (
            <a className={panelOwnsPrimary || next.blocked ? 'atelierButton' : 'atelierButton primary'} href={ctaHref}>{next.cta}</a>
          ) : (
            <a className="atelierButton primary" href={ctaHref} target={next.href === 'WHATSAPP' ? '_blank' : undefined} rel={next.href === 'WHATSAPP' ? 'noreferrer' : undefined}>{next.cta} ↗</a>
          )
        ) : null}
      </section>
      <div className="atelierProgress atelierProgressSlim" aria-hidden="true">{['Enquiry','Quote','Deposit','Fitter','On route','Fitting','Done'].map((label,i)=><div className={i<=stage?'reached':''} key={label}><i>{i<stage?'✓':i+1}</i><span>{label}</span></div>)}</div>
    </header>

    {(paymentExpired || jobStatus === 'awaiting_payment') ? <PaymentResendActions jobId={job.id} mode={paymentResendMode} amountLabel={paymentAmountLabel} customerPhone={job.customer_phone ? String(job.customer_phone) : undefined} publicJobId={job.public_job_id ? String(job.public_job_id) : undefined} webhookResendAvailable={paymentResendConfigured} /> : null}
    {job.status === 'awaiting_group_dispatch' ? <GroupDispatchCard jobId={job.id} tyreSize={job.tyre_size || ''} quantity={job.tyre_quantity} area={job.postcode || job.postcode_area || ''} /> : null}
    <ManagerActions job={job as any} offers={offers} fitters={fitters} depositRules={depositRules} firstRefusalReady={firstRefusalReady} assignmentReady={assignmentReady} suggestedQuote={suggestedQuote as any} />

    {String(job.status || '').toLowerCase() === 'completed' ? (() => {
      const owed = owedNowAmount(settlement, job);
      const toSend = fitterToSendAmount(settlement, job);
      const sent = fitterSentState(settlement);
      const fitterPhone = String(assigned?.whatsapp_phone || assigned?.phone || '').trim();
      const canChase = toSend !== null && toSend > 0 && Boolean(fitterPhone);
      return <section className="atelierSettlementCard atelierSettlementCardEmphatic" id="settlement" aria-label="Settlement">
        <div className="atelierSettlementOwed">
          <span className="eyebrow">OWED RIGHT NOW</span>
          <strong>{owed === null ? '—' : money(owed)}</strong>
          <p>{toSend !== null && toSend > 0 ? `Fitter to send ${money(toSend)}` : sent.label === 'Yes' ? 'Nothing outstanding from the fitter.' : settlement ? 'Settlement on file — amount unclear.' : 'No settlement record yet.'}</p>
          {canChase ? <ChaseFitterBalanceButton jobId={job.id} amountLabel={money(toSend)} amountGbp={toSend} fitterPhone={fitterPhone} publicJobId={job.public_job_id ? String(job.public_job_id) : undefined} /> : null}
          {!canChase && toSend !== null && toSend > 0 ? <p className="atelierSettlementHint">No fitter phone on file — add one on the fitter record to chase on WhatsApp.</p> : null}
        </div>
        <div className="atelierSettlementSent">
          <FitterSentConfirm
            jobId={job.id}
            currentLabel={sent.label}
            detail={sent.detail}
            owedLabel={toSend !== null && toSend > 0 ? money(toSend) : undefined}
          />
        </div>
      </section>;
    })() : null}


    {[job.customer_price,job.deposit_amount,job.remaining_customer_balance,job.agreed_fitter_cost].some(v=>v!=null) && <section className="atelierMoneyRow">{[['Customer total',job.customer_price],['Deposit',job.deposit_amount],['Balance',job.remaining_customer_balance],['Fitter cost',job.agreed_fitter_cost],['Gross margin',grossMargin]].filter(([,v])=>v!=null).map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{money(value)}</strong></div>)}</section>}

    <div className="atelierDetailGrid">
      <section className="atelierSurface">
        <span className="eyebrow">CUSTOMER</span>
        <h2>{job.customer_name || 'Customer'}</h2>
        {job.customer_phone && <p>{job.customer_phone}</p>}
                <div className="atelierContactActions">
          {tel ? <a className="atelierButton" href={tel}>Call</a> : null}
          {wa ? <a className="atelierButton" href={wa} target="_blank" rel="noreferrer">WhatsApp</a> : null}
          {maps ? <a className="atelierButton" href={maps} target="_blank" rel="noreferrer">Maps</a> : null}
          <Link className="atelierButton" href={`/conversations?job=${job.id}`}>Open conversation</Link>
          <ConversationControls jobId={job.id} mode={String(job.conversation_mode || '')} />
        </div>
        <small>{String(job.conversation_mode).toLowerCase()==='human' ? 'You are handling this conversation' : 'AI is handling this conversation'}</small>
      </section>
      <section className="atelierSurface">
        <span className="eyebrow">THE FITTING</span>
        <h2>{job.tyre_size || 'Awaiting tyre details'}</h2>
        <p>{job.tyre_quantity ? `${job.tyre_quantity} tyres` : 'Quantity pending'}{job.requested_time ? ` · ${job.requested_time}` : ''}</p>
        {job.vehicle_registration && <p>{job.vehicle_registration}</p>}
        {assigned && <p>Fitter · {assigned.full_name}</p>}
        {paymentExpired ? <p className="atelierProblem">Resend the payment link below · <a href="#payment-resend">Open resend</a></p> : problems.length > 0 ? <p className="atelierProblem">{problems[0]}</p> : null}
      </section>
    </div>

    {(offers.length > 0 || payments.length > 0) && <div className="atelierDetailGrid">
      {offers.length > 0 && <section className="atelierSurface"><span className="eyebrow">FITTER OFFERS</span>{offers.map((offer: Row) => <div className="atelierActiveRow" key={offer.id}><div><strong>{fitterMap[offer.fitter_id]?.full_name || 'Fitter'}</strong>{offer.eta_minutes != null && <p>{offer.eta_minutes} min ETA</p>}</div>{offer.quoted_cost != null && <strong>{money(offer.quoted_cost)}</strong>}</div>)}</section>}
      {payments.length > 0 && <section className="atelierSurface"><span className="eyebrow">PAYMENTS</span>{payments.map((payment: Row) => {
        const bad = ['expired', 'failed', 'cancelled'].includes(String(payment.status || '').toLowerCase());
        return <div className="atelierActiveRow" key={payment.id}><div><strong>{String(payment.status || 'Payment').replaceAll('_', ' ')}</strong><p>{when(payment.created_at)}</p></div><div className="paymentRowActions"><strong>{money(payment.amount)}</strong>{bad ? <a className="atelierButton primary paymentRowResend" href="#payment-resend">Resend</a> : null}</div></div>;
      })}{paymentExpired ? <div className="paymentResendUnderList"><a className="atelierButton primary" href="#payment-resend">Resend payment link</a></div> : null}</section>}
    </div>}

    {timeline.length > 0 && <details className="atelierDiagnostics"><summary>Activity timeline · {timeline.length} updates</summary>{timeline.map((event: Row) => <div className="atelierActivity" key={event.id}><i /><div><strong>{readableEvent(event.event_type)}</strong><p>{when(event.latestAt || event.created_at)}{event.repeatCount > 1 ? ` · ${event.repeatCount} updates` : ''}</p></div></div>)}</details>}
  </div>;
}
