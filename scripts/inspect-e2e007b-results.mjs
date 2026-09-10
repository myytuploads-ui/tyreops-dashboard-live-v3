import fs from 'node:fs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((line) => /^\s*[A-Z0-9_]+=/.test(line))
  .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const get = async (path) => {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

const jobs = await get('jobs?source=like.E2E007B*&select=id,public_job_id,status,completed_at,assigned_fitter_id,customer_price,deposit_amount,remaining_customer_balance,source&order=created_at.desc&limit=3');
const results = [];
for (const job of jobs) {
  const settlements = await get(`job_settlements?job_id=eq.${job.id}&select=customer_agreed_total,deposit_received,fitter_agreed_cost,customer_remaining_balance,rescue_tyres_entitlement,amount_fitter_owes,settlement_outstanding,settlement_status,deposit_received_at,source&limit=1`);
  results.push({ job, settlement: settlements[0] ?? null });
}
console.log(JSON.stringify(results, null, 2));
