import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/PageHeader';

export default async function FittersPage(){
  const supabase=await createClient();
  const {data:fitters,error}=await supabase.from('fitters').select('*').order('active',{ascending:false}).order('priority_level',{ascending:true});
  const active=(fitters||[]).filter((f:any)=>f.active).length;
  const preferred=(fitters||[]).filter((f:any)=>f.active&&f.preferred).length;

  return <>
    <PageHeader title="Fitter Network" subtitle="Availability, coverage, priority and performance." />
    <div className="opsStrip">
      <div className="opsChip"><span>Total fitters</span><strong>{(fitters||[]).length}</strong></div>
      <div className="opsChip"><span>Available now</span><strong className="good">{active}</strong></div>
      <div className="opsChip"><span>Preferred active</span><strong>{preferred}</strong></div>
      <div className="opsChip"><span>Offline</span><strong>{(fitters||[]).length-active}</strong></div>
    </div>
    {error?<div className="error">{error.message}</div>:null}
    <div className="fitterGrid">
      {(fitters||[]).map((f:any)=><article className="fitterCard" key={f.id}>
        <div className="fitterTop">
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div className="fitterAvatar">{(f.full_name||'FT').split(' ').map((x:string)=>x[0]).slice(0,2).join('').toUpperCase()}</div>
            <div className="fitterName"><strong>{f.full_name}</strong><span>{f.whatsapp_phone||f.phone||'—'}</span></div>
          </div>
          <span className={`toggle ${f.active?'':'off'}`}>{f.active?'AVAILABLE':'OFFLINE'}</span>
        </div>
        <div className="fitterStats">
          <div className="fstat"><span>Reliability</span><strong>{f.reliability_score??'—'}{f.reliability_score!=null?'%':''}</strong></div>
          <div className="fstat"><span>Completed</span><strong>{f.completed_jobs??'—'}</strong></div>
          <div className="fstat"><span>Priority</span><strong>{f.priority_level??'—'}</strong></div>
        </div>
        <div className="coverage"><strong>Coverage:</strong> {Array.isArray(f.coverage_areas)?f.coverage_areas.join(', '):'—'}</div>
        <div className="coverage"><strong>Preferred fitter:</strong> {f.preferred?'Yes':'No'}</div>
      </article>)}
    </div>
  </>;
}
