'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/StatusBadge';
import { isTestJob } from '@/lib/dashboard/filters';

export default function JobsPage() {
  const supabase = useMemo(()=>createClient(),[]);
  const [jobs,setJobs]=useState<any[]>([]);
  const [q,setQ]=useState('');
  const [status,setStatus]=useState('');
  const [showTests,setShowTests]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{(async()=>{
    const {data,error}=await supabase.from('jobs')
      .select('id,public_job_id,customer_name,customer_phone,postcode,postcode_area,tyre_size,tyre_quantity,customer_price,status,assigned_fitter_id,created_at,updated_at,source,deposit_status,agreed_eta_minutes')
      .order('created_at',{ascending:false}).limit(500);
    if(error)setError(error.message); setJobs(data||[]);
  })()},[supabase]);

  const filtered=jobs.filter(j=>{
    if(!showTests&&isTestJob(j))return false;
    if(status&&j.status!==status)return false;
    if(q&&!JSON.stringify(j).toLowerCase().includes(q.toLowerCase()))return false;
    return true;
  });

  return <>
    <div className="topbar">
      <div className="headline"><div><h1>Live Jobs</h1><p>Every enquiry, payment and fitting in one queue.</p></div></div>
      <div className="topActions"><label className="btn" style={{display:'flex',alignItems:'center',gap:8}}>
        <input type="checkbox" checked={showTests} onChange={e=>setShowTests(e.target.checked)}/> Show test data
      </label></div>
    </div>

    <div className="toolbar">
      <input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search job ref, customer, phone, postcode…" />
      <select value={status} onChange={e=>setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {['awaiting_payment','awaiting_owner_first_refusal','dispatching_preferred','dispatching_general','offers_received','awaiting_owner_assignment','assigned','fitter_on_route','arrived','manual_review','completed','cancelled'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}
      </select>
      <button className="btn" onClick={()=>{setQ('');setStatus('')}}>Clear</button>
    </div>
    <div className="pageCount">{filtered.length} jobs shown · test data {showTests?'included':'hidden'}</div>
    {error?<div className="error">{error}</div>:null}

    <div className="tableWrap"><table>
      <thead><tr><th>Job</th><th>Customer</th><th>Phone</th><th>Location</th><th>Tyres</th><th>Price</th><th>Deposit</th><th>Status</th><th>ETA</th><th>Created</th></tr></thead>
      <tbody>
        {filtered.map((j:any)=><tr key={j.id}>
          <td><Link href={`/jobs/${j.id}`}><strong>{j.public_job_id}</strong></Link></td>
          <td>{j.customer_name||'—'}</td><td>{j.customer_phone||'—'}</td><td>{j.postcode||j.postcode_area||'—'}</td>
          <td>{j.tyre_size||'—'} × {j.tyre_quantity??'—'}</td><td>{j.customer_price!=null?`£${j.customer_price}`:'—'}</td>
          <td>{j.deposit_status||'—'}</td><td><StatusBadge status={j.status}/></td>
          <td>{j.agreed_eta_minutes!=null?`${j.agreed_eta_minutes}m`:'—'}</td>
          <td>{j.created_at?new Date(j.created_at).toLocaleString('en-GB'):'—'}</td>
        </tr>)}
      </tbody>
    </table>
    {!filtered.length?<div className="emptyState"><strong>No jobs match this view.</strong><span>Try clearing the filters or enabling test data.</span></div>:null}
    </div>
  </>;
}
