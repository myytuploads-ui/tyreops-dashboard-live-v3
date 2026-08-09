'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/StatusBadge';
import { isTestJob } from '@/lib/dashboard/filters';

type Job = any;

function money(v:any){ return Number.isFinite(Number(v)) ? `£${Number(v).toFixed(0)}` : '—'; }

export default function OverviewPage() {
  const supabase = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [fitters, setFitters] = useState<any[]>([]);
  const [showTests, setShowTests] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [jobsRes, fittersRes] = await Promise.all([
        supabase.from('jobs')
          .select('id,public_job_id,customer_name,customer_phone,postcode,postcode_area,tyre_size,tyre_quantity,status,created_at,updated_at,source,customer_price,assigned_fitter_id,agreed_fitter_cost,agreed_eta_minutes,deposit_status')
          .order('created_at', { ascending: false }).limit(500),
        supabase.from('fitters').select('id,full_name,active,preferred')
      ]);
      if (jobsRes.error) setError(jobsRes.error.message);
      setJobs(jobsRes.data || []);
      setFitters(fittersRes.data || []);
      setLoading(false);
    })();
  }, [supabase]);

  const visible = jobs.filter(j => showTests || !isTestJob(j));
  const start = new Date(); start.setHours(0,0,0,0);
  const today = visible.filter(j => j.created_at && new Date(j.created_at) >= start);

  const count = (statuses:string[]) => visible.filter(j => statuses.includes(j.status)).length;
  const revenueToday = today.reduce((sum,j)=>sum + (Number(j.customer_price)||0),0);
  const assignedToday = today.filter(j=>['assigned','fitter_on_route','arrived','completed'].includes(j.status)).length;
  const completedToday = today.filter(j=>j.status==='completed').length;
  const completionRate = assignedToday ? Math.round((completedToday/assignedToday)*100) : 0;
  const activeFitters = fitters.filter(f=>f.active).length;

  const metrics = [
    ['Jobs today', today.length, 'Live intake'],
    ['Customer value', money(revenueToday), 'Booked today'],
    ['Dispatching', count(['dispatching_preferred','dispatching_general','offers_received','awaiting_owner_assignment']), 'Fitters being contacted'],
    ['Assigned', count(['assigned','fitter_on_route','arrived']), 'Jobs in progress'],
    ['Manual review', count(['manual_review']), 'Human action'],
    ['Completed today', completedToday, 'Finished jobs'],
  ];

  const attention = visible.filter(j=>['manual_review','awaiting_payment','dispatching_general','awaiting_owner_assignment'].includes(j.status)).slice(0,8);
  const active = visible.filter(j=>['assigned','fitter_on_route','arrived'].includes(j.status)).slice(0,5);

  return (
    <>
      <div className="topbar">
        <div className="headline">
          <div><h1>Operations Overview</h1><p>Live mobile tyre dispatch, payments and fitter activity.</p></div>
        </div>
        <div className="topActions">
          <label className="btn" style={{display:'flex',alignItems:'center',gap:8}}>
            <input type="checkbox" checked={showTests} onChange={e=>setShowTests(e.target.checked)} />
            Show test data
          </label>
        </div>
      </div>

      <section className="hero">
        <div className="heroGrid">
          <div>
            <h2>Everything important, one screen.</h2>
            <div className="heroCopy">
              See new work, money, dispatch state, active fitters and jobs needing intervention without opening n8n or Supabase.
            </div>
          </div>
          <div className="health">
            <div className="healthRow"><span>Database</span><strong><i className="dot"></i>Connected</strong></div>
            <div className="healthRow"><span>Dashboard</span><strong>Read-only V3</strong></div>
            <div className="healthRow"><span>Test records</span><strong>{showTests?'Visible':'Hidden'}</strong></div>
          </div>
        </div>
      </section>

      <div className="opsStrip">
        <div className="opsChip"><span>Active fitters</span><strong className="good">{activeFitters}</strong></div>
        <div className="opsChip"><span>Completion rate today</span><strong className="good">{completionRate}%</strong></div>
        <div className="opsChip"><span>Owner attention</span><strong className={count(['manual_review']) ? 'bad':'good'}>{count(['manual_review'])} jobs</strong></div>
        <div className="opsChip"><span>Visible production jobs</span><strong>{visible.length}</strong></div>
      </div>

      {loading ? <div className="empty">Loading live operations…</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="metrics">
        {metrics.map(([label,value,note])=>(
          <div className={`metricCard ${label==='Manual review'?'attn':''}`} key={String(label)}>
            <div className="metricLabel">{label}</div>
            <div className="metric">{value}</div>
            <div className="metricNote">{note}</div>
          </div>
        ))}
      </div>

      <div className="sectionGrid">
        <section className="panel">
          <div className="panelHead"><h2>Priority Queue</h2><p>Anything that needs attention before it becomes a missed job.</p></div>
          <div className="tableWrap" style={{border:0,borderRadius:0}}>
            <table>
              <thead><tr><th>Job</th><th>Customer</th><th>Area</th><th>Tyres</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {attention.map((j:any)=>(
                  <tr key={j.id}>
                    <td><Link href={`/jobs/${j.id}`}><strong>{j.public_job_id}</strong></Link></td>
                    <td>{j.customer_name||'—'}</td>
                    <td>{j.postcode_area||'—'}</td>
                    <td>{j.tyre_size||'—'} × {j.tyre_quantity??'—'}</td>
                    <td><StatusBadge status={j.status}/></td>
                    <td>{j.created_at?new Date(j.created_at).toLocaleString('en-GB'):'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!attention.length ? <div className="emptyState"><strong>Nothing needs attention.</strong><span>The automation has no production jobs waiting for intervention.</span></div> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panelHead"><h2>Jobs in Progress</h2><p>Assigned, on-route and arrived.</p></div>
          <div className="panelBody">
            {!active.length ? <div className="empty">No live assigned jobs.</div> : active.map((j:any)=>(
              <Link href={`/jobs/${j.id}`} className="offerCard" key={j.id}>
                <div className="offerMeta">
                  <strong>{j.public_job_id} · {j.customer_name||'Customer'}</strong>
                  <span>{j.postcode_area||'—'} · {j.tyre_size||'—'} × {j.tyre_quantity??'—'} · {j.status.replaceAll('_',' ')}</span>
                </div>
                <div className="offerPrice">
                  <strong>{j.agreed_eta_minutes!=null?`${j.agreed_eta_minutes}m`:'—'}</strong>
                  <span>ETA</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
