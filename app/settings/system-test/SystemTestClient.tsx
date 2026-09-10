'use client';

import { useEffect, useState } from 'react';

type Row = Record<string, any>;
const mobileItems = ['Home', 'Jobs', 'Job Detail', 'Conversations', 'I Found a Fitter', 'Pricing & Rules', 'Business Setup / Meeting Mode', 'Fitters'];

function badge(status: string) {
  const cls = status === 'PASS' ? 'pass' : status === 'FAIL' ? 'fail' : status === 'DISABLED' ? 'disabled' : 'needs';
  return <span className={`testBadge ${cls}`}>{status}</span>;
}

export default function SystemTestClient() {
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mobileIndex, setMobileIndex] = useState(0);
  const [mobileNote, setMobileNote] = useState('');

  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/system-test', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'System test status could not be loaded.');
      setData(result); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'System test status could not be loaded.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function action(name: string, body: Row = {}) {
    if (busy) return;
    setBusy(name); setError(''); setNotice('');
    try {
      const response = await fetch('/api/system-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, ...body }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.error || 'Test did not pass.');
      setNotice(name === 'wf27_guest' ? 'WF-27 test completed and cleanup verified.' : 'Saved.');
      setMobileNote('');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Test failed.'); await load(); }
    finally { setBusy(''); }
  }

  const statuses = data?.statuses || {};
  const switches = data?.switches || {};
  const wf27 = switches.last_results?.wf27;
  const cleanup = switches.last_results?.cleanup;
  const currentMobile = mobileItems[mobileIndex];
  const mobileChecks = switches.mobile_checklist?.checks || {};
  const readinessPass = statuses.automation_switches === 'PASS' && statuses.manual_fitter_assignment === 'PASS' && statuses.mobile_owner_check === 'PASS';

  return <div className="systemTest">
    {loading ? <div className="empty">Loading system status...</div> : null}
    {error ? <div className="error">{error}</div> : null}
    {notice ? <div className="success">{notice}</div> : null}

    <section className="systemHero">
      <div><span>Owner acceptance</span><h2>TyreOps Readiness</h2><p>Run final safe checks from the dashboard. Unknown stays NEEDS TEST until verified.</p></div>
      <div className="readinessDial"><strong>{readinessPass ? 'PASS' : 'INCOMPLETE'}</strong><span>Business onboarding {switches.onboarding_percent ?? 0}%</span><small>Real pilot job: NOT COMPLETED</small></div>
    </section>

    <section className="panel"><div className="panelHead"><h2>System Status</h2><p>Owner-facing status only. Technical details are hidden unless a test fails.</p></div>
      <div className="testGrid">
        {[
          ['Customer AI', statuses.customer_ai],
          ['Pricing', statuses.pricing],
          ['Payments', statuses.payments],
          ['Manual fitter assignment', statuses.manual_fitter_assignment],
          ['Registered fitter assignment', statuses.registered_fitter_assignment],
          ['Group dispatch', statuses.group_dispatch],
          ['Conversations', statuses.conversations],
          ['Telegram', statuses.telegram],
          ['WhatsApp', statuses.whatsapp],
          ['Automation switches', statuses.automation_switches],
        ].map(([label, status]) => <article key={label as string}><strong>{label as string}</strong>{badge(String(status || 'NEEDS TEST'))}</article>)}
      </div>
    </section>

    <section className="panel"><div className="panelHead"><h2>Test Manual Fitter Assignment</h2><p>Creates a clearly marked temporary E2E job, sends it through the real dashboard WF-27 route, verifies database state, then cleans up only that run ID.</p></div>
      <div className="panelBody testActionBlock">
        <div>{data?.safe_whatsapp_configured ? <p>Safe WhatsApp test destination configured: <b>{data.safe_whatsapp_masked}</b></p> : <p className="warningText">Safe WhatsApp test destination is not configured. WF-27 will stay NEEDS TEST and will not send messages.</p>}</div>
        <button className="btn primary" type="button" disabled={busy === 'wf27_guest' || !data?.safe_whatsapp_configured} onClick={() => window.confirm('Run safe WF-27 guest fitter test now? It will use only temporary E2E data and the configured safe test WhatsApp destination.') && void action('wf27_guest')}>{busy === 'wf27_guest' ? 'Running...' : 'Run WF-27 Safe Test'}</button>
        {wf27 ? <div className="testEvidence"><strong>Last WF-27 evidence</strong><span>HTTP {wf27.http}; assigned {String(wf27.job_assigned)}; cost {String(wf27.fitter_cost_persisted)}; ETA {String(wf27.eta_persisted)}; event {String(wf27.event_exists)}; duplicate HTTP {wf27.duplicate_http}</span></div> : null}
        {cleanup ? <div className="testEvidence"><strong>Cleanup</strong><span>{cleanup.cleanup_verified ? 'Cleanup verified' : 'Cleanup needs attention'}</span></div> : null}
      </div>
    </section>

    <section className="panel"><div className="panelHead"><h2>Notification Tests</h2><p>Separate from WF-27. These will only become runnable when safe test destinations and provider workflows are configured.</p></div>
      <div className="panelBody testActionBlock">
        <div className="testEvidence"><strong>Telegram</strong><span>NEEDS TEST — no safe dashboard test workflow is connected yet.</span></div>
        <div className="testEvidence"><strong>WhatsApp</strong><span>{data?.safe_whatsapp_configured ? `Safe destination configured: ${data.safe_whatsapp_masked}. Provider test workflow still needs connecting.` : 'NEEDS TEST — add TYREOPS_SAFE_TEST_WHATSAPP_NUMBER first, then connect a safe provider test workflow.'}</span></div>
      </div>
    </section>

    <section className="panel"><div className="panelHead"><h2>Automation Switches</h2><p>Read from the same production sources used by workflows. These tests do not change the switches.</p></div>
      <div className="testGrid">
        <article><strong>Automatic Customer Pricing</strong>{badge(switches.automatic_customer_pricing_enabled ? 'FAIL' : 'DISABLED')}</article>
        <article><strong>Automatic Fitter Dispatch</strong>{badge(switches.automatic_fitter_dispatch_enabled ? 'FAIL' : 'DISABLED')}</article>
        <article><strong>Group First</strong>{badge(switches.group_first_dispatch_enabled ? 'FAIL' : 'DISABLED')}</article>
      </div>
    </section>

    <section className="panel"><div className="panelHead"><h2>Mobile Check</h2><p>Use this on the owner’s phone. One screen at a time; notes are stored as acceptance evidence.</p></div>
      <div className="panelBody mobileCheck">
        <div className="meetingQuestion"><span>{mobileIndex + 1} of {mobileItems.length}</span><h2>{currentMobile}</h2><p>Open this area on your phone. Confirm no horizontal overflow, no tiny trapped scroll panes, and controls are comfortable to tap.</p></div>
        <label className="meetingNotes"><span>Problem note</span><textarea value={mobileNote} onChange={(event) => setMobileNote(event.target.value)} rows={3} placeholder="Optional if something looks wrong" /></label>
        <div className="meetingActions"><button className="btn" disabled={mobileIndex === 0} onClick={() => setMobileIndex((value) => Math.max(0, value - 1))}>Back</button><button className="btn primary" onClick={() => { void action('mobile_check', { item: currentMobile, result: 'looks_good' }); setMobileIndex((value) => Math.min(mobileItems.length - 1, value + 1)); }}>Looks Good</button><button className="btn" onClick={() => void action('mobile_check', { item: currentMobile, result: 'problem', note: mobileNote })}>Problem</button></div>
        <div className="testGrid">{mobileItems.map((item) => <article key={item}><strong>{item}</strong>{badge(mobileChecks[item]?.result === 'looks_good' ? 'PASS' : mobileChecks[item]?.result === 'problem' ? 'FAIL' : 'NEEDS TEST')}</article>)}</div>
      </div>
    </section>
  </div>;
}
