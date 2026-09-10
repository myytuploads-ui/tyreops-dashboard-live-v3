import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import StatusBadge from '@/components/StatusBadge';

export default async function DispatchPage() {
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id,public_job_id,status,postcode,postcode_area,tyre_size,tyre_quantity,assigned_fitter_id,agreed_eta_minutes,updated_at')
    .in('status', ['deposit_paid', 'awaiting_owner_assignment', 'offers_received', 'awaiting_group_dispatch', 'assigned', 'fitter_on_route', 'arrived', 'in_progress'])
    .order('updated_at', { ascending: false })
    .limit(200);

  return <div className="atelierPage">
    <header className="atelierHeading"><div><span className="eyebrow">FITTER SOURCING</span><h1>Dispatch.</h1><p>Owner-approved assignments only. Automatic selection stays off.</p></div></header>
    <div className="atelierJobs">{(jobs || []).map((job: any) => (
      <Link className="atelierJob atelierJobLink" href={`/jobs/${job.id}`} key={job.id}>
        <div className="atelierJobMeta"><StatusBadge status={job.status}/><span>{job.agreed_eta_minutes ? `${job.agreed_eta_minutes}m ETA` : '—'}</span></div>
        <h2>{job.postcode || job.postcode_area || 'Location pending'}</h2>
        <p className="atelierTyre">{job.tyre_size || 'Tyre pending'}{job.tyre_quantity ? ` × ${job.tyre_quantity}` : ''}</p>
        <footer><small>{job.public_job_id || 'Job'}</small><span className="atelierButton">{job.assigned_fitter_id ? 'View job' : 'Choose fitter'} ↗</span></footer>
      </Link>
    ))}</div>
    {!(jobs || []).length && <div className="atelierEmpty"><h2>No dispatch decisions waiting.</h2><p>Paid jobs needing a fitter will appear here.</p></div>}
  </div>;
}
