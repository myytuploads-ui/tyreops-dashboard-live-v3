import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/PageHeader';

export default async function DispatchPage(){
  const supabase=await createClient();
  const {data:jobs}=await supabase.from('jobs').select('id,public_job_id,status,postcode,tyre_size,customer_price,deposit_status,assigned_fitter_id,agreed_eta_minutes').in('status',['deposit_paid','awaiting_owner_assignment','offers_received','assigned','fitter_on_route','arrived','in_progress']).order('updated_at',{ascending:false}).limit(200);
  return <><PageHeader title="Dispatch" subtitle="Owner-controlled fitter decisions and live job progress."/><div className="readonly">Automatic fitter selection and dispatch remain disabled. Every assignment is owner-approved.</div><section className="panel"><div className="panelHead"><h2>Jobs needing operational attention</h2><p>{(jobs||[]).length} live jobs</p></div><div className="panelBody"><div className="ownerQueue">{(jobs||[]).map((j:any)=><Link className="ownerQueueRow" href={`/jobs/${j.id}`} key={j.id}><div><strong>{j.public_job_id}</strong><p>{j.postcode||'Location pending'} · {j.tyre_size||'Tyre pending'} · {j.status.replaceAll('_',' ')}</p></div><small>{j.assigned_fitter_id?'Assigned':'Owner decision required'}<br/>{j.agreed_eta_minutes?`${j.agreed_eta_minutes}m ETA`:''}</small></Link>)}{!(jobs||[]).length&&<div className="emptyState"><strong>No dispatch decisions waiting</strong><span>Paid jobs will appear here.</span></div>}</div></div></section></>;
}
