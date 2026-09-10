export type OperationalJob = Record<string, any>;
export type OperationalPayment = Record<string, any>;
export type OperationalEvent = Record<string, any>;

export const OWNER_ACTION_STATUSES = new Set([
  'manual_review',
  'awaiting_owner_price',
  'awaiting_owner_first_refusal',
  'awaiting_owner_assignment',
  'awaiting_group_dispatch',
  'offers_received',
  'deposit_paid',
  'payment_link_expired',
]);

export const ACTIVE_JOB_STATUSES = new Set([
  'awaiting_details',
  'awaiting_payment',
  'payment_link_expired',
  'awaiting_owner_price',
  'awaiting_owner_first_refusal',
  'awaiting_group_dispatch',
  'dispatching_preferred',
  'dispatching_general',
  'offers_received',
  'awaiting_owner_assignment',
  'deposit_paid',
  'assigned',
  'fitter_on_route',
  'arrived',
  'in_progress',
  'manual_review',
]);

export const ASSIGNMENT_STATUSES = new Set([
  'awaiting_group_dispatch',
  'dispatching_preferred',
  'dispatching_general',
  'offers_received',
  'awaiting_owner_assignment',
]);

export const IN_PROGRESS_STATUSES = new Set(['assigned', 'fitter_on_route', 'arrived', 'in_progress']);

function normalized(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function latestPayment(payments: OperationalPayment[]) {
  return [...payments].sort((a, b) => Date.parse(String(b.created_at || '')) - Date.parse(String(a.created_at || '')))[0];
}

export function jobProblems(job: OperationalJob, payments: OperationalPayment[] = [], events: OperationalEvent[] = []) {
  const problems: string[] = [];
  const status = normalized(job.status);
  const deposit = normalized(job.deposit_status);
  const payment = latestPayment(payments);
  const paymentStatus = normalized(payment?.status);

  if (IN_PROGRESS_STATUSES.has(status) && !job.assigned_fitter_id) problems.push('Active dispatch has no assigned fitter');
  if (status === 'payment_link_expired') problems.push('Payment link expired and needs owner review');
  if (status === 'awaiting_payment' && ['expired', 'failed', 'cancelled'].includes(paymentStatus)) problems.push('Customer payment needs intervention');
  if (status === 'awaiting_payment' && ['paid', 'succeeded', 'complete', 'completed'].includes(deposit)) problems.push('Paid deposit but job still awaits payment');
  if (['expired', 'failed'].includes(deposit) && job.deposit_verified_at) problems.push('Payment state conflicts with verified deposit');
  const updatedAt = Date.parse(String(job.updated_at || job.created_at || ''));
  if (events.some((event) => {
    if (normalized(event.event_type) !== 'stuck_job_detected') return false;
    const eventAt = Date.parse(String(event.created_at || ''));
    return Number.isFinite(eventAt) && (!Number.isFinite(updatedAt) || eventAt > updatedAt);
  })) problems.push('Stuck job requires review');
  return problems;
}

export function needsYou(job: OperationalJob, payments: OperationalPayment[] = [], events: OperationalEvent[] = []) {
  return OWNER_ACTION_STATUSES.has(normalized(job.status)) || jobProblems(job, payments, events).length > 0;
}

export function paymentLabel(job: OperationalJob, payments: OperationalPayment[] = []) {
  const deposit = normalized(job.deposit_status);
  const payment = latestPayment(payments);
  const paymentStatus = normalized(payment?.status);
  if (['paid', 'succeeded', 'complete', 'completed'].includes(deposit) || ['paid', 'succeeded'].includes(paymentStatus)) return 'Paid';
  if (paymentStatus === 'expired' || deposit === 'expired') return 'Expired';
  if (paymentStatus === 'failed' || deposit === 'failed') return 'Failed';
  if (normalized(job.status) === 'awaiting_payment') return 'Awaiting customer';
  return deposit && deposit !== 'none' ? deposit.replaceAll('_', ' ') : 'Not recorded';
}

export function dispatchLabel(job: OperationalJob, fitterName?: string) {
  const status = normalized(job.status);
  if (job.assigned_fitter_id) return fitterName ? `Assigned: ${fitterName}` : 'Fitter assigned';
  if (status === 'awaiting_group_dispatch') return 'Waiting for group fitter';
  if (ASSIGNMENT_STATUSES.has(status)) return 'Finding fitter';
  if (IN_PROGRESS_STATUSES.has(status)) return 'Assignment missing';
  return 'Not dispatched';
}

export function validMoney(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function expectedMargin(job: OperationalJob) {
  const customer = validMoney(job.customer_price);
  const fitter = validMoney(job.agreed_fitter_cost);
  return customer === null || fitter === null ? null : customer - fitter;
}

export function isToday(value: unknown) {
  if (!value) return false;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar week starting Monday (UK). */
export function isThisWeek(value: unknown) {
  if (!value) return false;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return false;
  const today = startOfLocalDay();
  const day = (today.getDay() + 6) % 7; // Mon=0
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - day);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return date >= weekStart && date < weekEnd;
}

export function isThisMonth(value: unknown) {
  if (!value) return false;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}
