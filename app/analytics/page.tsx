import { createClient } from '@/lib/supabase/server';

const money = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const [{ data: jobs }, { data: events }] = await Promise.all([
    supabase.from('jobs').select('status,customer_price,agreed_fitter_cost,created_at,completed_at').limit(1000),
    supabase.from('workflow_events').select('event_type,created_at').order('created_at', { ascending: false }).limit(100),
  ]);
  const completed = (jobs || []).filter((job) => job.status === 'completed');
  const margins = completed
    .map((job) => (Number(job.customer_price) || 0) - (Number(job.agreed_fitter_cost) || 0))
    .filter((value) => Number.isFinite(value));
  const avg = margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : 0;

  return <div className="atelierPage">
    <header className="atelierHeading"><div><span className="eyebrow">SIGNALS</span><h1>Analytics.</h1><p>Read-only operational pulse. Nothing changes automatically.</p></div></header>
    <section className="atelierMoneyRow">
      <div><span>Jobs tracked</span><strong>{(jobs || []).length}</strong></div>
      <div><span>Completed</span><strong>{completed.length}</strong></div>
      <div><span>Average margin</span><strong>{money(Math.round(avg))}</strong></div>
      <div><span>Recent events</span><strong>{(events || []).length}</strong></div>
    </section>
    <section className="atelierSurface">
      <span className="eyebrow">INSIGHT</span>
      <h2>Keep an eye on the rhythm.</h2>
      <p>Review quote delays, fitter ETA accuracy and repeat owner interventions before changing any rules.</p>
    </section>
  </div>;
}
