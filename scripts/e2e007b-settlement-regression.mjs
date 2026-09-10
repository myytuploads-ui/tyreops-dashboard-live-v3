import crypto from 'node:crypto';
import fs from 'node:fs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((line) => /^\s*[A-Z0-9_]+=/.test(line))
  .map((line) => {
    const index = line.indexOf('=');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));

const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) throw new Error('Missing local Supabase service configuration');

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: { ...headers, ...(options.headers ?? {}) },
    ...options,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : null;
};

const runId = `E2E007B-${crypto.randomUUID()}`;
const publicJobId = `RT-${runId.slice(-8).toUpperCase()}`;
const now = new Date().toISOString();

const testNumbers = await request('fitters?select=whatsapp_phone&full_name=ilike.*E2E*&limit=20');
const safePhone = testNumbers.map((row) => String(row.whatsapp_phone ?? '')).find((phone) => /7412$/.test(phone));
if (!safePhone) throw new Error('No approved E2E safe WhatsApp destination is available');

let customer;
const existingCustomers = await request(`customers?phone=eq.${safePhone}&select=id,full_name&limit=1`);
if (existingCustomers[0]) {
  customer = existingCustomers[0];
} else {
  [customer] = await request('customers', {
    method: 'POST',
    body: JSON.stringify({ full_name: `TEST ONLY ${runId} Customer`, phone: safePhone, notes: runId }),
  });
}
const [fitter] = await request('fitters', {
  method: 'POST',
  body: JSON.stringify({
    full_name: `TEST ONLY ${runId} Fitter`,
    whatsapp_phone: safePhone,
    phone: safePhone,
    coverage_areas: ['E2E'],
    priority_level: 999,
    preferred: false,
    active: true,
    is_guest: false,
    notes: runId,
  }),
});
const [job] = await request('jobs', {
  method: 'POST',
  body: JSON.stringify({
    public_job_id: publicJobId,
    customer_id: customer.id,
    customer_name: customer.full_name,
    customer_phone: safePhone,
    status: 'assigned',
    assigned_fitter_id: fitter.id,
    customer_price: 200,
    deposit_amount: 80,
    deposit_status: 'paid',
    deposit_verified_at: now,
    remaining_customer_balance: 120,
    agreed_fitter_cost: 50,
    agreed_eta_minutes: 30,
    postcode: 'E2E 1AA',
    postcode_area: 'E2E',
    exact_location: 'TEST ONLY — no attendance required',
    tyre_size: '205/55 R16',
    tyre_quantity: 1,
    locking_wheel_nut_status: 'known',
    requested_time: 'ASAP',
    source: runId,
    conversation_mode: 'human',
    ai_paused: true,
    manual_reply_mode: true,
  }),
});

const statusUrl = new URL('https://tyres.app.n8n.cloud/webhook/tyreops-status');
statusUrl.searchParams.set('job_id', job.id);
statusUrl.searchParams.set('fitter_id', fitter.id);
statusUrl.searchParams.set('status', 'completed');
const workflowResponse = await fetch(statusUrl, { method: 'GET' });
const workflowBody = await workflowResponse.text();
if (!workflowResponse.ok) throw new Error(`Status workflow failed: ${workflowResponse.status} ${workflowBody.slice(0, 240)}`);

let settlement = null;
let completedJob = null;
for (let attempt = 0; attempt < 12; attempt += 1) {
  [settlement] = await request(`job_settlements?job_id=eq.${job.id}&select=*&limit=1`);
  [completedJob] = await request(`jobs?id=eq.${job.id}&select=status,completed_at,assigned_fitter_id,customer_price,deposit_amount,remaining_customer_balance&limit=1`);
  if (settlement && completedJob?.status === 'completed' && completedJob?.completed_at) break;
  await new Promise((resolve) => setTimeout(resolve, 2500));
}

const numeric = (value) => Number(value);
const checks = {
  workflowAccepted: workflowResponse.status === 200,
  jobCompleted: completedJob?.status === 'completed' && Boolean(completedJob?.completed_at),
  settlementCreated: Boolean(settlement),
  customerAgreedTotal: numeric(settlement?.customer_agreed_total) === 200,
  depositReceived: numeric(settlement?.deposit_received) === 80,
  fitterAgreedCost: numeric(settlement?.fitter_agreed_cost) === 50,
  remainingCustomerBalance: numeric(settlement?.customer_remaining_balance) === 120,
  rescueEntitlement: numeric(settlement?.rescue_tyres_entitlement) === 150,
  fitterOwes: numeric(settlement?.amount_fitter_owes) === 70,
  settlementOutstanding: numeric(settlement?.settlement_outstanding) === 70,
  settlementPending: settlement?.settlement_status === 'pending',
  fitterStillAssigned: completedJob?.assigned_fitter_id === fitter.id,
};

console.log(JSON.stringify({
  runId,
  publicJobId,
  jobId: job.id,
  fitterId: fitter.id,
  customerId: customer.id,
  reusedExistingSafeCustomer: Boolean(existingCustomers[0]),
  workflowStatus: workflowResponse.status,
  workflowResponse: workflowBody.slice(0, 160),
  checks,
  settlementSummary: settlement ? {
    customer_agreed_total: settlement.customer_agreed_total,
    deposit_received: settlement.deposit_received,
    fitter_agreed_cost: settlement.fitter_agreed_cost,
    customer_remaining_balance: settlement.customer_remaining_balance,
    rescue_tyres_entitlement: settlement.rescue_tyres_entitlement,
    amount_fitter_owes: settlement.amount_fitter_owes,
    settlement_outstanding: settlement.settlement_outstanding,
    settlement_status: settlement.settlement_status,
    deposit_received_at_present: Boolean(settlement.deposit_received_at),
    source: settlement.source,
  } : null,
}, null, 2));

if (!Object.values(checks).every(Boolean)) process.exitCode = 2;
