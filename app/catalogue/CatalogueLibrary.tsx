'use client';

import { useEffect, useState } from 'react';

type Entry = Record<string, any>;
type FormState = {
  id?: string;
  tyre_size: string;
  tier: string;
  brand: string;
  model: string;
  supplier_cost: string;
  customer_base_price: string;
  notes: string;
  active: boolean;
};

const emptyForm: FormState = {
  tyre_size: '',
  tier: 'budget',
  brand: '',
  model: '',
  supplier_cost: '',
  customer_base_price: '',
  notes: '',
  active: true,
};

export default function CatalogueLibrary() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/pricing-rules');
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('Unavailable');
      setEntries(result.prices || []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const rows = entries.filter((entry) =>
    [entry.tyre_size, entry.tier, entry.brand, entry.model].some((value) =>
      String(value || '').toLowerCase().includes(query.toLowerCase()),
    ),
  );

  function openAdd() {
    setForm({ ...emptyForm });
    setFeedback(null);
  }

  function openEdit(entry: Entry) {
    setForm({
      id: String(entry.id),
      tyre_size: String(entry.tyre_size || ''),
      tier: String(entry.tier || 'budget'),
      brand: String(entry.brand || ''),
      model: String(entry.model || ''),
      supplier_cost: entry.supplier_cost != null ? String(entry.supplier_cost) : '',
      customer_base_price: entry.customer_base_price != null ? String(entry.customer_base_price) : '',
      notes: String(entry.notes || ''),
      active: entry.active !== false,
    });
    setFeedback(null);
  }

  async function saveForm() {
    if (!form || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/pricing-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          table: 'tyre_price_catalogue',
          id: form.id,
          values: {
            tyre_size: form.tyre_size,
            tier: form.tier,
            brand: form.brand || null,
            model: form.model || null,
            supplier_cost: form.supplier_cost || null,
            customer_base_price: form.customer_base_price || null,
            notes: form.notes || null,
            active: form.active,
            owner_confirmed: false,
            fitting_included: true,
            disposal_included: true,
            source: 'owner_catalogue',
          },
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Could not save catalogue entry.');
      setForm(null);
      setFeedback({ type: 'success', text: 'Saved as a reference price. It is not sent to customers automatically.' });
      await load();
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Could not save catalogue entry.' });
    } finally {
      setBusy(false);
    }
  }

  return <div className="atelierPage">
    <header className="atelierHeading">
      <div>
        <span className="eyebrow">YOUR TYRE LIBRARY</span>
        <h1>The right tyre.<br/>Already saved.</h1>
        <p>Reference costs and default prices for owner quoting. Never auto-sent to customers.</p>
      </div>
      <button type="button" className="atelierButton primary" onClick={openAdd}>Add tyre</button>
    </header>
    <div className="atelierSearch">
      <input aria-label="Search catalogue" placeholder="Find a size, brand or tier…" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {feedback ? <div className={feedback.type === 'error' ? 'error' : 'success'} role="status">{feedback.text}</div> : null}
    {loading ? <p className="atelierQuiet">Loading your tyre library…</p> : failed ? <div className="error">The catalogue couldn’t be loaded.</div> : (
      <div className="atelierJobs">{rows.map((entry) => (
        <article className="atelierJob" key={entry.id}>
          <div className="atelierCatalogueWheel">◎</div>
          <span className="badge">{entry.tier || 'Tyre'}</span>
          <h2>{entry.tyre_size}</h2>
          {(entry.brand || entry.model) ? <p className="atelierTyre">{entry.brand} {entry.model}</p> : null}
          <div className="atelierMoneyRow">
            {entry.supplier_cost != null && <div><span>Supplier cost</span><strong>£{entry.supplier_cost}</strong></div>}
            {entry.customer_base_price != null && <div><span>Default price</span><strong>£{entry.customer_base_price}</strong></div>}
          </div>
          <footer>
            <small>{entry.active === false ? 'Inactive' : 'Active'} · Owner approval required</small>
            <button type="button" className="atelierButton" onClick={() => openEdit(entry)}>Edit</button>
          </footer>
        </article>
      ))}</div>
    )}
    {!loading && !failed && !rows.length && <div className="atelierEmpty"><h2>{query ? 'No matching tyres.' : 'Your library starts here.'}</h2><p>Saved catalogue entries will appear here.</p></div>}
    <p className="atelierQuiet">Use these figures when pricing a job. Confirm &amp; Send Price on the job page is the only path that messages the customer.</p>

    {form ? <div className="fitterModalBackdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setForm(null); }}>
      <section className="fitterEditor" role="dialog" aria-modal="true" aria-labelledby="catalogue-editor-title">
        <div className="fitterEditorHead">
          <div>
            <h2 id="catalogue-editor-title">{form.id ? 'Edit catalogue tyre' : 'Add catalogue tyre'}</h2>
            <p>Saved for owner reference only. Does not message customers.</p>
          </div>
          <button type="button" onClick={() => !busy && setForm(null)} aria-label="Close">×</button>
        </div>
        <div className="fitterFormGrid">
          <label><span>Tyre size</span><input value={form.tyre_size} onChange={(event) => setForm({ ...form, tyre_size: event.target.value })} placeholder="205/55R16" /></label>
          <label><span>Tier</span><select value={form.tier} onChange={(event) => setForm({ ...form, tier: event.target.value })}><option value="budget">Budget</option><option value="mid_range">Mid range</option><option value="premium">Premium</option></select></label>
          <label><span>Brand</span><input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></label>
          <label><span>Model</span><input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></label>
          <label><span>Supplier cost £</span><input inputMode="decimal" value={form.supplier_cost} onChange={(event) => setForm({ ...form, supplier_cost: event.target.value })} /></label>
          <label><span>Default customer price £</span><input inputMode="decimal" value={form.customer_base_price} onChange={(event) => setForm({ ...form, customer_base_price: event.target.value })} /></label>
          <label className="wide"><span>Notes</span><textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <div className="fitterChoiceGroup"><span>Status</span><button className={form.active ? 'selected' : ''} type="button" onClick={() => setForm({ ...form, active: true })}>Active</button><button className={!form.active ? 'selected' : ''} type="button" onClick={() => setForm({ ...form, active: false })}>Inactive</button></div>
        </div>
        {feedback?.type === 'error' ? <div className="error">{feedback.text}</div> : null}
        <div className="fitterEditorActions">
          <button className="btn" type="button" onClick={() => setForm(null)} disabled={busy}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => void saveForm()} disabled={busy || !form.tyre_size.trim()}>{busy ? 'Saving…' : 'Save reference'}</button>
        </div>
      </section>
    </div> : null}
  </div>;
}
