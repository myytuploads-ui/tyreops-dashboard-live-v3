'use client';

import { useEffect,useMemo,useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { isTestJob } from '@/lib/dashboard/filters';

export default function ManualReviewPage(){
  const supabase=useMemo(()=>createClient(),[]);
  const [jobs,setJobs]=useState<any[]>([]);
  const [showTests,setShowTests]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{(async()=>{
    const {data,error}=await supabase.from('jobs')
      .select('id,public_job_id,customer_name,customer_phone,postcode,postcode_area,tyre_size,tyre_quantity,updated_at,created_at,status,source,customer_price')
      .eq('status','manual_review').order('updated_at',{ascending:true});
    if(error)setError(error.message);setJobs(data||[]);
  })()},[supabase]);

  const visible=jobs.filter(j=>showTests||!isTestJob(j));

  return <>
    <div className="topbar">
      <div className="headline"><div><h1>Needs Attention</h1><p>Jobs TyreOps has deliberately escalated to a human.</p></div></div>
      <div className="topActions"><label className="btn" style={{display:'flex',alignItems:'center',gap:8}}>
        <input type="checkbox" checked={showTests} onChange={e=>setShowTests(e.target.checked)}/> Show test data
      </label></div>
    </div>
    <div className="opsStrip">
      <div className="opsChip"><span>Open manual reviews</span><strong className={visible.length?'bad':'good'}>{visible.length}</strong></div>
      <div className="opsChip"><span>Oldest waiting</span><strong>{visible[0]?.updated_at?new Date(visible[0].updated_at).toLocaleString('en-GB'):'—'}</strong></div>
      <div className="opsChip"><span>Automation state</span><strong className="good">Paused safely</strong></div>
      <div className="opsChip"><span>Test records</span><strong>{showTests?'Visible':'Hidden'}</strong></div>
    </div>
    {error?<div className="error">{error}</div>:null}
    <section className="panel">
      <div className="panelHead"><h2>Manual Review Queue</h2><p>Oldest waiting job first.</p></div>
      {!visible.length?<div className="emptyState"><strong>No production jobs need attention.</strong><span>The automation has no unresolved escalations.</span></div>:visible.map((j:any)=><Link href={`/jobs/${j.id}`} key={j.id} className="manualCard manualUrgent">
        <div className="alertIcon">!</div>
        <div><strong>{j.public_job_id} · {j.customer_name||'Customer'}</strong><span>{j.postcode||j.postcode_area||'—'} · {j.tyre_size||'—'} × {j.tyre_quantity??'—'} · £{j.customer_price??'—'} · escalated {j.updated_at?new Date(j.updated_at).toLocaleString('en-GB'):'—'}</span></div>
      </Link>)}
    </section>
  </>;
}
