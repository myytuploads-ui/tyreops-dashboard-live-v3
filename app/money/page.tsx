import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const gbp = (value: unknown) => value == null
  ? '—'
  : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Number(value));

export default async function MoneyPage() {
  const supabase = await createClient();
  const [{ data: jobs }, { data: payments }, { data: settlements, error: settlementError }] = await Promise.all([
    supabase.from('jobs').select('id,public_job_id,status,customer_price,deposit_amount,remaining_customer_balance,agreed_fitter_cost,updated_at').order('updated_at', { ascending: false }).limit(500),
    supabase.from('payments').select('job_id,status,amount,paid_at').eq('status', 'paid'),
    supabase.from('job_settlements').select('job_id,customer_agreed_total,deposit_received,customer_remaining_balance,fitter_agreed_cost,rescue_tyres_entitlement,settlement_outstanding,settlement_status').order('created_at', { ascending: false }).limit(200),
  ]);

  const paid = (payments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const completed = (jobs || []).filter((job) => job.status === 'completed');
  const margin = completed.reduce((sum, job) => sum + (Number(job.customer_price) || 0) - (Number(job.agreed_fitter_cost) || 0), 0);

  return <div className="atelierPage">
    <header className="atelierHeading">
      <div>
        <span className="eyebrow">THE BUSINESS, AT A GLANCE</span>
        <h1>Money, made clear.</h1>
        <p>Confirmed payments and the balances still to settle.</p>
      </div>
    </header>
    <section className="atelierPriority">
      <span className="eyebrow">CONFIRMED PAYMENTS · ALL TIME</span>
      <h1 className="atelierBalance">{gbp(paid)}</h1>
      <p>Across recorded paid payments.</p>
    </section>
    <div className="atelierMoneyRow">
      <div><span>Customer balances</span><strong>{gbp((jobs || []).reduce((sum, job) => sum + (Number(job.remaining_customer_balance) || 0), 0))}</strong></div>
      <div><span>Completed jobs</span><strong>{completed.length}</strong></div>
      <div><span>Known gross margin</span><strong>{gbp(margin)}</strong></div>
    </div>
    <div className="atelierSectionHeading"><h2>Settlements</h2><span>{(settlements || []).length} records</span></div>
    {settlementError && <div className="error">Settlements could not be loaded. Please try again.</div>}
    <div className="atelierJobs">{(settlements || []).map((settlement) => (
      <Link className="atelierJob atelierJobLink" href={`/jobs/${settlement.job_id}`} key={settlement.job_id}>
        <span className="badge">{String(settlement.settlement_status || 'Pending').replaceAll('_', ' ')}</span>
        <h2>{(jobs || []).find((job) => job.id === settlement.job_id)?.public_job_id || 'Completed job'}</h2>
        <div className="atelierMoneyRow">
          {[['Customer total', settlement.customer_agreed_total], ['Deposit', settlement.deposit_received], ['Fitter cost', settlement.fitter_agreed_cost], ['Outstanding', settlement.settlement_outstanding]]
            .filter(([, value]) => value != null)
            .map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{gbp(value)}</strong></div>)}
        </div>
        <footer><small>Settlement</small><span className="atelierButton">View job ↗</span></footer>
      </Link>
    ))}</div>
    {!settlementError && !(settlements || []).length && <div className="atelierEmpty"><h2>Nothing to settle yet.</h2><p>Completed jobs will appear here.</p></div>}
  </div>;
}
