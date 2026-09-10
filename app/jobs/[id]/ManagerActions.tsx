'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Row = Record<string, any>;
type Job = {
  id: string;
  status: string;
  tyre_size?: string | null;
  tyre_quantity?: number | string | null;
  postcode?: string | null;
  postcode_area?: string | null;
  vehicle_registration?: string | null;
  urgency?: string | null;
  requested_time?: string | null;
  requested_at?: string | null;
  locking_wheel_nut?: string | boolean | null;
  customer_notes?: string | null;
  notes?: string | null;
  customer_price?: number | string | null;
  maximum_fitter_cost?: number | string | null;
  maximum_eta_minutes?: number | string | null;
};
type SuggestedQuote = {
  quote_status: 'priced' | 'manual_review';
  customer_price?: number;
  reason?: string;
  rule_sources?: string[];
} | null;

function text(value: unknown, fallback = '—') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}
function moneyInput(value: string, setter: (value: string) => void, label: string) {
  return <label><span>{label}</span><input inputMode="decimal" value={value} onChange={(event) => setter(event.target.value)} /></label>;
}
function responseError(result: unknown, fallback: string) {
  return result && typeof result === 'object' && typeof (result as Row).error === 'string' ? (result as Row).error : fallback;
}
function groupMessage(job: Job) {
  const area = text(job.postcode || job.postcode_area, 'the area');
  const urgency = String(job.urgency || '').toLowerCase().includes('urgent') || String(job.urgency || '').toLowerCase().includes('asap') ? 'needed ASAP' : 'needed when available';
  return `Got a job in ${area} - ${text(job.tyre_quantity, '1')}x ${text(job.tyre_size, 'tyre')}, ${urgency}. Customer is ready. Send me your price + ETA if you can cover it.`;
}

export default function ManagerActions({ job, offers, fitters, depositRules, firstRefusalReady, assignmentReady, suggestedQuote }: { job: Job; offers: Row[]; fitters: Row[]; depositRules: Row[]; firstRefusalReady: boolean; assignmentReady: boolean; suggestedQuote?: SuggestedQuote }) {
  const router = useRouter();
  const fitterMap = new Map(fitters.map((fitter) => [String(fitter.id), fitter]));
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [customerPrice, setCustomerPrice] = useState('');
  const [maxFitterCost, setMaxFitterCost] = useState('');
  const [maxEta, setMaxEta] = useState('');
  const [ownerNotes, setOwnerNotes] = useState('');
  const [manualMode, setManualMode] = useState<'existing' | 'guest'>('existing');
  const [manualFitterId, setManualFitterId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [manualCost, setManualCost] = useState('');
  const [manualEta, setManualEta] = useState('');
  const [manualSource, setManualSource] = useState('whatsapp_group');
  const [manualNotes, setManualNotes] = useState('');

  async function post(path: string, payload: Row, success: string) {
    if (busy) return;
    setBusy(path); setError(''); setNotice('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseError(result, 'The action could not be completed.'));
      setNotice(success);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The action could not be completed.');
    } finally {
      setBusy('');
    }
  }

  const isPricing = job.status === 'awaiting_owner_price';
  const isFirstRefusal = job.status === 'awaiting_owner_first_refusal';
  const isAssignment = job.status === 'awaiting_owner_assignment';
  const manualAssignmentEligible = ['deposit_paid', 'awaiting_group_dispatch', 'dispatching_preferred', 'dispatching_general', 'awaiting_owner_assignment', 'manual_review', 'awaiting_owner_first_refusal'].includes(job.status);
  const needsFitterSourcing = manualAssignmentEligible || job.status === 'payment_link_expired';
  if (!isPricing && !isFirstRefusal && !isAssignment && !needsFitterSourcing) return null;
  const activeFitters = fitters.filter((fitter) => fitter.active !== false);
  const selectedFitter = activeFitters.find((fitter) => String(fitter.id) === manualFitterId);
  const customer = Number(job.customer_price);
  const manual = Number(manualCost);
  const manualMargin = Number.isFinite(customer) && Number.isFinite(manual) ? customer - manual : null;
  const enteredCustomerPrice = Number(customerPrice);
  const matchingDeposit = depositRules.find((rule) => Number(rule.min_job_value_gbp) === enteredCustomerPrice && Number(rule.max_job_value_gbp) === enteredCustomerPrice);

  return <section className="panel ownerActionPanel">
    <div className="panelHead"><div><h2>{isPricing ? 'Price This Job' : isFirstRefusal ? 'Owner Decision' : 'Assign Fitter'}</h2><p>{isPricing ? 'Enter the quote and TyreOps will send the customer their payment link.' : isFirstRefusal ? 'Choose what should happen to this owner-reserved job.' : 'Choose the fitter offer to accept.'}</p></div></div>
    <div className="panelBody">
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="success">{notice}</div> : null}
      {isPricing ? <>
        <dl className="jobPricingFacts"><div><dt>Tyre</dt><dd>{text(job.tyre_size)} x {text(job.tyre_quantity)}</dd></div><div><dt>Postcode</dt><dd>{text(job.postcode || job.postcode_area)}</dd></div><div><dt>Registration</dt><dd>{text(job.vehicle_registration, 'Not recorded')}</dd></div><div><dt>Urgency</dt><dd>{text(job.urgency, 'Standard')}</dd></div><div><dt>Requested time</dt><dd>{text(job.requested_time || job.requested_at, 'Not recorded')}</dd></div><div><dt>Locking wheel nut</dt><dd>{text(job.locking_wheel_nut, 'Not recorded')}</dd></div><div><dt>Customer notes</dt><dd>{text(job.customer_notes || job.notes, 'Not recorded')}</dd></div></dl>
        {suggestedQuote ? <div className={suggestedQuote.quote_status === 'priced' ? 'suggestedQuoteBox priced' : 'suggestedQuoteBox'}>
          <div><span>Suggested price engine</span><strong>{suggestedQuote.quote_status === 'priced' ? `£${Number(suggestedQuote.customer_price).toFixed(0)}` : 'Manual pricing required'}</strong><p>{suggestedQuote.reason || 'Owner-confirmed pricing rules matched this job.'}</p></div>
          {suggestedQuote.quote_status === 'priced' ? <button type="button" className="btn" onClick={() => setCustomerPrice(String(suggestedQuote.customer_price || ''))}>Use Suggested Price</button> : null}
        </div> : null}
        {customerPrice ? <div className={matchingDeposit ? 'suggestedQuoteBox priced' : 'suggestedQuoteBox'}><div><span>Confirmed deposit rule</span><strong>{matchingDeposit ? `£${Number(matchingDeposit.deposit_fixed_gbp).toFixed(0)} deposit` : 'Owner decision required'}</strong><p>{matchingDeposit ? `Exact match for a £${enteredCustomerPrice.toFixed(0)} customer quote. TyreOps will use this deposit automatically.` : 'No exact owner-confirmed pair matches this price. TyreOps will not interpolate.'}</p></div></div> : null}
        <div className="managerForm">
          {moneyInput(customerPrice, setCustomerPrice, 'Customer price £')}
          {moneyInput(maxFitterCost, setMaxFitterCost, 'Maximum fitter cost £')}
          <label><span>Maximum ETA minutes</span><input inputMode="numeric" value={maxEta} onChange={(event) => setMaxEta(event.target.value)} /></label>
          <label className="wide"><span>Owner note</span><textarea rows={3} value={ownerNotes} onChange={(event) => setOwnerNotes(event.target.value)} placeholder="Optional" /></label>
          <button type="button" className="btn primary" disabled={Boolean(busy) || !matchingDeposit} onClick={() => void post('/api/price-job', { job_id: job.id, customer_price: customerPrice, deposit_amount: matchingDeposit?.deposit_fixed_gbp, maximum_fitter_cost: maxFitterCost, maximum_eta_minutes: maxEta, owner_notes: ownerNotes }, 'Quote sent. Refreshing the authoritative job state...')}>{busy ? 'Sending...' : matchingDeposit ? 'Confirm & Send Price' : 'Needs Confirmed Deposit Rule'}</button>
        </div>
      </> : null}
      {isFirstRefusal && !firstRefusalReady ? <div className="backendContractNotice">This owner decision is still handled from the owner alert link for this job.</div> : null}
      {isFirstRefusal && firstRefusalReady ? <div className="firstRefusalActions">
        <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => window.confirm('Take this job yourself?') && void post('/api/first-refusal', { job_id: job.id, action: 'accept' }, 'Job accepted. Refreshing...')}>Take Job</button>
        <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => window.confirm('Decline and send this job onward?') && void post('/api/first-refusal', { job_id: job.id, action: 'decline' }, 'Job sent onward. Refreshing...')}>Decline & Send On</button>
        {[15, 30, 60, 1440].map((minutes) => <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void post('/api/first-refusal', { job_id: job.id, action: 'snooze', snooze_minutes: minutes }, 'Snoozed. Refreshing...')} key={minutes}>{minutes === 1440 ? 'Snooze until tomorrow' : `Snooze ${minutes} min`}</button>)}
      </div> : null}
      {isAssignment && !assignmentReady ? <div className="backendContractNotice">Fitter assignment is still handled by the existing dispatch flow for this job.</div> : null}
      {isAssignment && assignmentReady ? <div className="assignmentOffers">{offers.length ? offers.map((offer) => {
        const fitter = fitterMap.get(String(offer.fitter_id));
        return <article className="assignmentOffer" key={offer.id}><div><strong>{fitter?.full_name || offer.fitter_name || 'Fitter'}</strong><span>{fitter?.priority_level ? `Priority ${fitter.priority_level}` : 'General'} · reliability {fitter?.reliability_score ?? '—'} · completed {fitter?.completed_jobs ?? '—'}</span></div><div><b>{offer.quoted_cost != null ? `£${Number(offer.quoted_cost).toFixed(0)}` : '—'}</b><span>{offer.eta_minutes != null ? `${offer.eta_minutes} min ETA` : 'ETA —'}</span></div><button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => window.confirm(`Assign ${fitter?.full_name || 'this fitter'}?`) && void post('/api/fitter-assignment', { job_id: job.id, offer_id: offer.id }, 'Fitter assigned. Refreshing...')}>Assign Fitter</button></article>;
      }) : <div className="empty">No pending fitter offers are visible for this job.</div>}</div> : null}
      {needsFitterSourcing ? <div className="manualFitterPanel">
        <div className="manualFitterBlock"><h3>Group Message</h3><p>Copy this into your fitter group. It uses job details only and does not include customer contact details, budgets, margin or internal notes.</p><textarea readOnly rows={4} value={groupMessage(job)} /><button type="button" className="btn" onClick={async () => { await navigator.clipboard.writeText(groupMessage(job)); setNotice('Group message copied.'); }}>Copy Message</button></div>
        <div className="manualFitterBlock foundFitterFlow"><h3>I Found a Fitter</h3>
          {manualAssignmentEligible ? <>
            <div className="choiceTabs"><button type="button" className={manualMode === 'existing' ? 'active' : ''} onClick={() => setManualMode('existing')}>Existing fitter</button><button type="button" className={manualMode === 'guest' ? 'active' : ''} onClick={() => setManualMode('guest')}>New / guest fitter</button></div>
            <div className="managerForm manualAssignForm">
              {manualMode === 'existing' ? <label className="wide"><span>Fitter</span><select value={manualFitterId} onChange={(event) => setManualFitterId(event.target.value)}><option value="">Choose active fitter...</option>{activeFitters.map((fitter) => <option value={fitter.id} key={fitter.id}>{fitter.full_name || 'Fitter'} · {fitter.whatsapp_phone || fitter.phone || 'no phone'}</option>)}</select></label> : <>
                <label><span>Name</span><input value={guestName} onChange={(event) => setGuestName(event.target.value)} /></label>
                <label><span>Phone</span><input inputMode="tel" value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="447700900000" /></label>
              </>}
              {moneyInput(manualCost, setManualCost, 'Fitter cost £')}
              <label><span>ETA minutes</span><input inputMode="numeric" value={manualEta} onChange={(event) => setManualEta(event.target.value)} /></label>
              <label><span>Found via</span><select value={manualSource} onChange={(event) => setManualSource(event.target.value)}><option value="whatsapp_group">WhatsApp group</option><option value="owner_manual">Owner manual</option><option value="phone_call">Phone call</option><option value="known_contact">Known contact</option></select></label>
              <label className="wide"><span>Notes</span><textarea rows={2} value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} placeholder="Optional" /></label>
            </div>
            <dl className="assignmentPreview"><div><dt>Job</dt><dd>{text((job as Row).public_job_id || job.id)}</dd></div><div><dt>Tyres</dt><dd>{text(job.tyre_size)} x {text(job.tyre_quantity)}</dd></div><div><dt>Location</dt><dd>{text(job.postcode || job.postcode_area)}</dd></div><div><dt>Fitter</dt><dd>{manualMode === 'existing' ? text(selectedFitter?.full_name, 'Choose fitter') : text(guestName, 'Enter guest')}</dd></div><div><dt>Customer price</dt><dd>{Number.isFinite(customer) ? `£${customer.toFixed(0)}` : 'Not priced'}</dd></div><div><dt>Fitter cost</dt><dd>{Number.isFinite(manual) ? `£${manual.toFixed(0)}` : 'Enter cost'}</dd></div><div><dt>Gross margin</dt><dd>{manualMargin === null ? '—' : `£${manualMargin.toFixed(0)}`}</dd></div><div><dt>ETA</dt><dd>{manualEta ? `${manualEta} min` : 'Enter ETA'}</dd></div></dl>
            <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => {
              const who = manualMode === 'existing' ? selectedFitter?.full_name || 'this fitter' : guestName || 'this guest fitter';
              if (!window.confirm(`Assign ${who} to ${text((job as Row).public_job_id || job.id)}? TyreOps will notify the customer and fitter after the workflow accepts it.`)) return;
              const payload: Row = { job_id: job.id, fitter_cost: manualCost, eta_minutes: manualEta, source: manualSource, notes: manualNotes };
              if (manualMode === 'existing') payload.fitter_id = manualFitterId;
              else payload.guest_fitter = { name: guestName, phone: guestPhone };
              void post('/api/manual-fitter-assignment', payload, 'Manual fitter assigned. Refreshing the authoritative job state...');
            }}>{busy ? 'Assigning...' : 'Assign Fitter'}</button>
          </> : <p>This job is not in a state where manual fitter assignment is safe. Use the timeline and conversation to decide the next step.</p>}
        </div>
      </div> : null}
    </div>
  </section>;
}
