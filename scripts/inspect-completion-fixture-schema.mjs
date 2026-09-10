import fs from 'node:fs';

const lines = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/);
const env = Object.fromEntries(lines
  .filter((line) => /^\s*[A-Z0-9_]+=/.test(line))
  .map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));

const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) throw new Error('Missing local Supabase service configuration');

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const read = async (path) => {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`Supabase read failed: ${response.status}`);
  return response.json();
};

const [jobRows, fitterRows, customerRows] = await Promise.all([
  read('jobs?select=*&limit=1'),
  read('fitters?select=*&limit=1'),
  read('customers?select=*&limit=1'),
]);

console.log(JSON.stringify({
  jobColumns: Object.keys(jobRows[0] ?? {}).sort(),
  fitterColumns: Object.keys(fitterRows[0] ?? {}).sort(),
  customerColumns: Object.keys(customerRows[0] ?? {}).sort(),
}, null, 2));
