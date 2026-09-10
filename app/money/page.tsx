import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/PageHeader';

const gbp = (v: unknown) => v == null ? '—' : new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(Number(v));

export default async function MoneyPage() {
  const supabase = await createClient();
  const [{ data: jobs }, { data: payments }, { data: settlements, error: settlementError }] = await Promise.all([
    supabase.from('jobs').select('id,public_job_id,status,customer_price,deposit_amount,remaining_customer_balance,agreed_fitter_cost,updated_at').order('updated_at',{ascending:false}).limit(500),
    supabase.from('payments').select('job_id,status,amount,paid_at').eq('status','paid'),
    supabase.from('job_settlements').select('job_id,customer_agreed_total,deposit_received,customer_remaining_balance,fitter_agreed_cost,rescue_tyres_entitlement,settlement_outstanding,settlement_status').order('created_at',{ascending:false}).limit(200),
  ]);
  const paid = (payments||[]).reduce((n,p)=>n+ (Number(p.amount)||0),0);
  const completed = (jobs||[]).filter(j=>j.status==='completed');
  const margin = completed.reduce((n,j)=>n+(Number(j.customer_price)||0)-(Number(j.agreed_fitter_cost)||0),0);
  return <div className="atelierPage"><header className="atelierHeading"><div><span className="eyebrow">THE BUSINESS, AT A GLANCE</span><h1>Money, made clear.</h1><p>Confirmed payments and the balances still to settle.</p></div></header><section className="atelierPriority"><span className="eyebrow">CONFIRMED PAYMENTS · ALL TIME</span><h1 className="atelierBalance">{gbp(paid)}</h1><p>Across recorded paid payments.</p></section><div className="atelierMoneyRow"><div><span>Customer balances</span><strong>{gbp((jobs||[]).reduce((n,j)=>n+(Number(j.remaining_customer_balance)||0),0))}</strong></div><div><span>Completed jobs</span><strong>{completed.length}</strong></div><div><span>Known gross margin</span><strong>{gbp(margin)}</strong></div></div><div className="atelierSectionHeading"><h2>Settlements</h2><span>{(settlements||[]).length} records</span></div>{settlementError && <div className="error">Settlements could not be loaded. Please try again.</div>}<div className="atelierJobs">{(settlements||[]).map(s=><article className="atelierJob" key={s.job_id}><span className="badge">{String(s.settlement_status || 'Pending').replaceAll('_',' ')}</span><h2>{(jobs||[]).find(j=>j.id===s.job_id)?.public_job_id || 'Completed job'}</h2><div className="atelierMoneyRow">{[['Customer total',s.customer_agreed_total],['Deposit',s.deposit_received],['Fitter cost',s.fitter_agreed_cost],['Outstanding',s.settlement_outstanding]].filter(([,v])=>v!=null).map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{gbp(value)}</strong></div>)}</div><a className="atelierButton" href={`/jobs/${s.job_id}`}>View job ↗</a></article>)}</div>{!settlementError&&!(settlements||[]).length&&<div className="atelierEmpty"><h2>Nothing to settle yet.</h2><p>Completed jobs will appear here.</p></div>}</div>;
}
