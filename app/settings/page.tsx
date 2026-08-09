import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/PageHeader';

const groups = [
  ['Owner Priority', ['owner_first_refusal_enabled','owner_first_refusal_minutes','owner_first_refusal_snooze_until']],
  ['Dispatch Windows', ['preferred_fitter_window_minutes','general_fitter_window_minutes']],
  ['Payments', ['stripe_mode','deposit_pilot_fixed_gbp']],
  ['Business', ['business_name','google_review_url']],
];

export default async function SettingsPage(){
  const supabase=await createClient();
  const keys=groups.flatMap(([,ks])=>ks as string[]);
  const {data,error}=await supabase.from('system_config').select('key,value').in('key',keys);
  const cfg=Object.fromEntries((data||[]).map((r:any)=>[r.key,r.value]));
  return <>
    <PageHeader title="Business Settings" subtitle="Operational values currently used by TyreOps." />
    <div className="readonly">Read-only by design. These values are live from system_config, but the dashboard cannot change them yet.</div>
    {error?<div className="error">{error.message}</div>:null}
    {groups.map(([title,ks])=><section className="settingsSection" key={String(title)}>
      <h3>{title}</h3>
      <div className="settingsGrid">
        {(ks as string[]).map(k=><div className="settingCard" key={k}><div className="slabel">{k.replaceAll('_',' ')}</div><div className="svalue">{cfg[k]===''||cfg[k]==null?'—':String(cfg[k])}</div></div>)}
      </div>
    </section>)}
  </>;
}
