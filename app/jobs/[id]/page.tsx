import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';
import { createClient } from '@/lib/supabase/server';
import { dispatchLabel, jobProblems, needsYou, paymentLabel, validMoney } from '@/lib/dashboard/operations';
import { calculateQuote } from '@/lib/pricing/quote';
import { createAdminClient } from '@/lib/supabase/admin';
import { stateActionFor } from '@/lib/dashboard/state-action-map';
import GroupDispatchCard from './GroupDispatchCard';
import ManagerActions from './ManagerActions';

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

function statusNarrative(status: unknown) {
  const map: Record<string, { owner: string; what: string; action: string; next: string }> = {
    awaiting_details: {
      owner: 'Customer / AI',
      what: 'TyreOps is collecting the remaining tyre, vehicle or location details.',
      action: 'Watch the conversation or take over if the customer needs human help.',
      next: 'Once details are complete, TyreOps moves the job to pricing or dispatch.',
    },
    awaiting_owner_price: {
      owner: 'Owner',
      what: 'This job needs a quote before the customer can pay.',
      action: 'Enter the quote below and TyreOps will send the customer their payment link.',
      next: 'TyreOps creates the payment step, messages the customer, then waits for Stripe confirmation.',
    },
    awaiting_payment: {
      owner: 'Customer',
      what: 'The customer has their payment link.',
      action: 'No owner action unless payment expires, fails or becomes inconsistent.',
      next: 'TyreOps continues automatically after Stripe confirms payment.',
    },
    payment_link_expired: {
      owner: 'Owner',
      what: 'The payment link expired before the customer completed payment.',
      action: 'Review the conversation and decide the recovery path.',
      next: 'A supported payment recovery action is still needed for one-click dashboard recovery.',
    },
    awaiting_owner_first_refusal: {
      owner: 'Owner',
      what: 'This job is reserved for an owner decision.',
      action: 'Take the job, send it onward, or snooze the decision below.',
      next: 'TyreOps updates the job and sends the right messages after your decision.',
    },
    awaiting_group_dispatch: {
      owner: 'Owner',
      what: 'This job is ready for group-first fitter dispatch.',
      action: 'Post the prepared job into your fitter group and review offers here.',
      next: 'Choose a group offer or release the job to direct dispatch.',
    },
    awaiting_owner_assignment: {
      owner: 'Owner',
      what: 'Fitter offers are ready for a decision.',
      action: 'Choose a fitter below.',
      next: 'TyreOps notifies the fitter and customer after assignment succeeds.',
    },
    assigned: {
      owner: 'Fitter',
      what: 'A fitter is assigned.',
      action: 'No owner action unless the job becomes stuck or inconsistent.',
      next: 'TyreOps waits for fitter progress updates.',
    },
    manual_review: {
      owner: 'Owner / TyreOps',
      what: 'Automation escalated this job for manual review.',
      action: 'Open the conversation and take over if this is customer-message related. Dispatch retry is not available here yet.',
      next: 'The next state depends on the review reason.',
    },
    completed: {
      owner: 'Complete',
      what: 'The job is complete.',
      action: 'Review payment and timeline only.',
      next: 'No operational action is expected.',
    },
  };
  return map[String(status || '').toLowerCase()] || {
    owner: 'TyreOps',
    what: 'This state is visible but not fully mapped yet.',
    action: 'No manual status-change button is available.',
    next: 'Use the timeline and conversation to verify the next step.',
  };
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [jobRes, offersRes, eventsRes, paymentsRes] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', id).maybeSingle(),
    supabase.from('fitter_offers').select('*').eq('job_id', id).order('submitted_at', { ascending: false }),
    supabase.from('workflow_events').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(120),
    supabase.from('payments').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(20),
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
  const assigned = fitterMap[job.assigned_fitter_id];
  const grossMargin = margin(job.customer_price, job.agreed_fitter_cost);
  const problems = jobProblems(job, payments, events);
  const ownerNeeded = needsYou(job, payments, events);
  const narrative = stateActionFor(job.status);
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

  return <>
    <header className="atelierCommand">
      <Link className="atelierBack" href="/jobs">← All jobs</Link>
      <div className="atelierCommandTop"><div><StatusBadge status={job.status}/><h1>{formatPostcode(job.postcode || job.postcode_area)}</h1><p>{job.tyre_size || 'Tyre details pending'}{job.tyre_quantity ? ` × ${job.tyre_quantity}` : ''}</p><small>{job.public_job_id}</small></div><Link className="atelierButton" href={`/conversations?job=${job.id}`}>Open conversation ↗</Link></div>
      <div className="atelierProgress">{['Enquiry','Quote','Deposit','Fitter','On route','Fitting','Complete'].map((label,i)=>{const stage=job.status==='completed'?6:job.status==='in_progress'||job.status==='arrived'?5:job.status==='fitter_on_route'||job.status==='on_route'?4:job.assigned_fitter_id?3:job.deposit_verified_at?2:job.customer_price!=null?1:0;return <div className={i<=stage?'reached':''} key={label}><i>{i<stage?'✓':i+1}</i><span>{label}</span></div>})}</div>
    </header>
    <div className="atelierDetailGrid">
      <section className="atelierSurface"><span className="eyebrow">CUSTOMER</span><h2>{job.customer_name || 'Customer'}</h2>{job.customer_phone && <p>{job.customer_phone}</p>}<div className="atelierContactActions">{job.customer_phone && <><a className="atelierButton" href={`tel:${String(job.customer_phone).replace(/[^+0-9]/g,'')}`}>Call</a><a className="atelierButton" href={`https://wa.me/${String(job.customer_phone).replace(/\D/g,'')}`} target="_blank" rel="noreferrer">WhatsApp ↗</a></>}{(job.postcode || job.postcode_area) && <a className="atelierButton" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.postcode || job.postcode_area)}`} target="_blank" rel="noreferrer">Directions ↗</a>}</div><small>{String(job.conversation_mode).toLowerCase()==='human'?'You are handling this conversation':'AI is handling this conversation'}</small></section>
      <section className="atelierSurface"><span className="eyebrow">THE FITTING</span><h2>{job.tyre_size || 'Awaiting tyre details'}</h2><p>{job.tyre_quantity ? `${job.tyre_quantity} tyres` : 'Quantity pending'}{job.requested_time ? ` · ${job.requested_time}` : ''}</p>{job.vehicle_registration && <p>{job.vehicle_registration}</p>}{assigned && <p>Fitter · {assigned.full_name}</p>}{problems.length>0 && <p>{problems[0]}</p>}</section>
    </div>
    {[job.customer_price,job.deposit_amount,job.remaining_customer_balance,job.agreed_fitter_cost].some(v=>v!=null) && <section className="atelierMoneyRow">{[['Customer total',job.customer_price],['Deposit',job.deposit_amount],['Balance',job.remaining_customer_balance],['Fitter cost',job.agreed_fitter_cost],['Gross margin',grossMargin]].filter(([,v])=>v!=null).map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{money(value)}</strong></div>)}</section>}
    <ManagerActions job={job as any} offers={offers} fitters={fitters} depositRules={depositRules} firstRefusalReady={Boolean(process.env.TYREOPS_FIRST_REFUSAL_URL?.trim())} assignmentReady={Boolean(process.env.TYREOPS_FITTER_ASSIGNMENT_URL?.trim())} suggestedQuote={suggestedQuote as any} />
    {job.status === 'awaiting_group_dispatch' ? <GroupDispatchCard jobId={job.id} tyreSize={job.tyre_size || ''} quantity={job.tyre_quantity} area={job.postcode || job.postcode_area || ''} /> : null}

    <div className="atelierDetailGrid">
      <section className="atelierSurface"><span className="eyebrow">CONVERSATION</span><h2>Stay in the loop.</h2><p>{String(job.conversation_mode).toLowerCase()==='human'?'You are handling this customer.':'View the conversation or take over when needed.'}</p><Link className="atelierButton" href={`/conversations?job=${job.id}`}>Open conversation ↗</Link></section>
      {offers.length>0 && <section className="atelierSurface"><span className="eyebrow">FITTER OFFERS</span>{offers.map((offer:Row)=><div className="atelierActiveRow" key={offer.id}><div><strong>{fitterMap[offer.fitter_id]?.full_name || 'Fitter'}</strong>{offer.eta_minutes!=null&&<p>{offer.eta_minutes} min ETA</p>}</div>{offer.quoted_cost!=null&&<strong>{money(offer.quoted_cost)}</strong>}</div>)}</section>}
      {payments.length>0 && <section className="atelierSurface"><span className="eyebrow">PAYMENTS</span>{payments.map((payment:Row)=><div className="atelierActiveRow" key={payment.id}><div><strong>{String(payment.status || 'Payment').replaceAll('_',' ')}</strong><p>{when(payment.created_at)}</p></div><strong>{money(payment.amount)}</strong></div>)}</section>}
    </div>
    {timeline.length>0 && <details className="atelierDiagnostics"><summary>Activity timeline · {timeline.length} updates</summary>{timeline.map((event:Row)=><div className="atelierActivity" key={event.id}><i/><div><strong>{readableEvent(event.event_type)}</strong><p>{when(event.latestAt || event.created_at)}{event.repeatCount>1?` · ${event.repeatCount} updates`:''}</p></div></div>)}</details>}
  </>;
}
