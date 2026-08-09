import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/PageHeader';
import StatusBadge from '@/components/StatusBadge';

function gbp(v:any){
  const n=Number(v);
  return Number.isFinite(n)?`£${n.toFixed(0)}`:'—';
}

export default async function JobDetailPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const supabase=await createClient();

  const [jobRes,offersRes,eventsRes,paymentsRes]=await Promise.all([
    supabase.from('jobs').select('*').eq('id',id).maybeSingle(),
    supabase.from('fitter_offers').select('*').eq('job_id',id).order('submitted_at',{ascending:false}),
    supabase.from('workflow_events').select('*').eq('job_id',id).order('created_at',{ascending:false}).limit(80),
    supabase.from('payments').select('*').eq('job_id',id).order('created_at',{ascending:false}).limit(20),
  ]);

  const job:any=jobRes.data;
  if(!job)return <div className="error">Job not found.</div>;

  const fitterIds=[...new Set((offersRes.data||[]).map((o:any)=>o.fitter_id).filter(Boolean))];
  if(job.assigned_fitter_id) fitterIds.push(job.assigned_fitter_id);
  let fitterMap:Record<string,any>={};
  if(fitterIds.length){
    const {data}=await supabase.from('fitters').select('id,full_name,whatsapp_phone,phone,reliability_score,priority_level').in('id',[...new Set(fitterIds)]);
    fitterMap=Object.fromEntries((data||[]).map((f:any)=>[f.id,f]));
  }

  const assigned=fitterMap[job.assigned_fitter_id];
  const customerPrice=Number(job.customer_price)||0;
  const fitterCost=Number(job.agreed_fitter_cost)||0;
  const margin=customerPrice&&fitterCost?customerPrice-fitterCost:null;

  return <>
    <PageHeader title={job.public_job_id||'Job'} subtitle={`${job.customer_name||'Customer'} · ${job.postcode||job.postcode_area||'No postcode'}`} right={<StatusBadge status={job.status}/>}/>

    <div className="detailHero">
      <div className="detailHeroGrid">
        <div>
          <div className="detailPrimary">
            <div className="detailStat"><span>Tyres</span><strong>{job.tyre_size||'—'} × {job.tyre_quantity??'—'}</strong></div>
            <div className="detailStat"><span>Location</span><strong>{job.postcode||job.postcode_area||'—'}</strong></div>
            <div className="detailStat"><span>Urgency</span><strong>{job.urgency||'Standard'}</strong></div>
            <div className="detailStat"><span>ETA</span><strong>{job.agreed_eta_minutes!=null?`${job.agreed_eta_minutes} min`:'—'}</strong></div>
          </div>
        </div>
        <div className="panelBody">
          <div className="kv"><div className="k">Customer</div><div><strong>{job.customer_name||'—'}</strong></div></div>
          <div className="kv"><div className="k">Phone</div><div>{job.customer_phone||'—'}</div></div>
          <div className="kv"><div className="k">Assigned fitter</div><div>{assigned?.full_name||job.assigned_fitter_id||'Not assigned'}</div></div>
          <div className="kv"><div className="k">Deposit</div><div>{job.deposit_status||'—'}</div></div>
        </div>
      </div>
    </div>

    <div className="sectionTitle">Money</div>
    <div className="moneyGrid">
      <div className="moneyBox"><span>Customer price</span><strong>{gbp(job.customer_price)}</strong></div>
      <div className="moneyBox"><span>Fitter cost</span><strong>{gbp(job.agreed_fitter_cost)}</strong></div>
      <div className="moneyBox"><span>Remaining balance</span><strong>{gbp(job.remaining_customer_balance)}</strong></div>
      <div className="moneyBox margin"><span>Gross margin</span><strong>{margin!=null?gbp(margin):'—'}</strong></div>
    </div>

    <div className="sectionTitle">Operations</div>
    <div className="sectionGrid">
      <div style={{display:'grid',gap:14}}>
        <section className="panel">
          <div className="panelHead"><h2>Fitter Offers</h2><p>Quotes received for this job.</p></div>
          <div className="panelBody">
            {(offersRes.data||[]).length===0?<div className="empty">No fitter offers.</div>:(offersRes.data||[]).map((o:any)=>{
              const fitter=fitterMap[o.fitter_id];
              return <div className="offerCard" key={o.id}>
                <div className="offerMeta">
                  <strong>{fitter?.full_name||o.fitter_id||'Fitter'}</strong>
                  <span>{o.offer_status||'—'} · reliability {fitter?.reliability_score??'—'}%</span>
                </div>
                <div className="offerPrice"><strong>{o.quoted_cost!=null?gbp(o.quoted_cost):'—'}</strong><span>{o.eta_minutes!=null?`${o.eta_minutes} min ETA`:'No ETA'}</span></div>
              </div>
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panelHead"><h2>Owner Actions</h2><p>Read-only until safe n8n action webhooks are connected.</p></div>
          <div className="panelBody">
            <div className="actionBar">
              <button className="readonlyAction" disabled>WhatsApp customer</button>
              <button className="readonlyAction" disabled>Resend payment link</button>
              <button className="readonlyAction" disabled>Release to fitters</button>
              <button className="readonlyAction" disabled>Reassign</button>
              <button className="readonlyAction" disabled>Resolve manual review</button>
            </div>
          </div>
        </section>
      </div>

      <div style={{display:'grid',gap:14}}>
        <section className="panel">
          <div className="panelHead"><h2>Payment History</h2></div>
          <div className="panelBody">
            {(paymentsRes.data||[]).length===0?<div className="empty">No payment rows.</div>:(paymentsRes.data||[]).map((p:any)=><div className="kv" key={p.id}>
              <div className="k">{p.status||p.payment_status||'Payment'}</div>
              <div>{p.amount!=null?String(p.amount):p.amount_paid!=null?String(p.amount_paid):'—'}</div>
            </div>)}
          </div>
        </section>

        <section className="panel">
          <div className="panelHead"><h2>Timeline</h2><p>Workflow events for this job.</p></div>
          <div className="panelBody timeline2">
            {(eventsRes.data||[]).length===0?<div className="empty">No workflow events.</div>:(eventsRes.data||[]).map((e:any)=><div className="timelineRow" key={e.id}>
              <div className="timelineDot"></div>
              <div className="timelineText"><strong>{e.event_type||'event'}</strong><span>{e.workflow_name||''}</span></div>
              <div className="timelineTime">{e.created_at?new Date(e.created_at).toLocaleString('en-GB'):'—'}</div>
            </div>)}
          </div>
        </section>
      </div>
    </div>
  </>;
}
