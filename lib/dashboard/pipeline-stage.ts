/** Owner pipeline stages from real job status / timestamps only — no invented metrics. */
export type PipelineStageKey =
  | 'enquiry'
  | 'quote'
  | 'deposit'
  | 'fitter'
  | 'on_route'
  | 'fitting'
  | 'settle';

export type PipelineStage = {
  key: PipelineStageKey;
  label: string;
  index: number;
};

export const PIPELINE_STAGES: PipelineStage[] = [
  { key: 'enquiry', label: 'Enquiry', index: 0 },
  { key: 'quote', label: 'Quote', index: 1 },
  { key: 'deposit', label: 'Deposit', index: 2 },
  { key: 'fitter', label: 'Fitter', index: 3 },
  { key: 'on_route', label: 'On route', index: 4 },
  { key: 'fitting', label: 'Fitting', index: 5 },
  { key: 'settle', label: 'Settle', index: 6 },
];

type Row = Record<string, unknown>;

function statusOf(job: Row) {
  return String(job.status || '').trim().toLowerCase();
}

function parseTs(value: unknown): number | null {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

/** Map job status → owner-facing pipeline stage (command surface). */
export function pipelineStageForJob(job: Row): PipelineStage {
  const s = statusOf(job);
  if (s === 'completed') return PIPELINE_STAGES[6];
  if (s === 'in_progress' || s === 'arrived') return PIPELINE_STAGES[5];
  if (s === 'fitter_on_route' || s === 'on_route') return PIPELINE_STAGES[4];
  if (['assigned', 'deposit_paid', 'offers_received', 'awaiting_owner_assignment', 'awaiting_group_dispatch', 'dispatching_preferred', 'dispatching_general'].includes(s)) {
    return PIPELINE_STAGES[3];
  }
  if (s === 'awaiting_payment' || s === 'payment_link_expired') return PIPELINE_STAGES[2];
  if (s === 'awaiting_owner_price' || s === 'awaiting_owner_first_refusal') return PIPELINE_STAGES[1];
  if (s === 'manual_review' || s === 'awaiting_details') return PIPELINE_STAGES[0];
  if (job.assigned_fitter_id) return PIPELINE_STAGES[3];
  if (job.deposit_verified_at) return PIPELINE_STAGES[3];
  if (job.customer_price != null) return PIPELINE_STAGES[2];
  return PIPELINE_STAGES[0];
}

/** Best-effort "entered this stage" timestamp from job fields + optional workflow events. */
export function stageEnteredAt(job: Row, events: Row[] = []): { at: string | null; known: boolean } {
  const stage = pipelineStageForJob(job);
  const byType = (types: string[]) => {
    const want = new Set(types.map((t) => t.toLowerCase()));
    const match = [...events]
      .filter((event) => want.has(String(event.event_type || '').toLowerCase()))
      .sort((a, b) => (parseTs(a.created_at) || 0) - (parseTs(b.created_at) || 0));
    return match.length ? String(match[match.length - 1].created_at || '') : null;
  };

  if (stage.key === 'enquiry') {
    const at = job.created_at ? String(job.created_at) : null;
    return { at, known: Boolean(at) };
  }
  if (stage.key === 'quote') {
    const fromEvent = byType(['owner_price_set', 'awaiting_owner_price']);
    const at = fromEvent || String(job.updated_at || job.created_at || '') || null;
    return { at, known: Boolean(fromEvent) };
  }
  if (stage.key === 'deposit') {
    const fromEvent = byType(['stripe_checkout_session_created', 'payment_link_created', 'awaiting_payment']);
    const at = fromEvent || String(job.updated_at || job.created_at || '') || null;
    return { at, known: Boolean(fromEvent) };
  }
  if (stage.key === 'fitter') {
    const fromEvent = byType(['deposit_paid', 'fitter_assigned', 'fitter_assigned_from_group', 'group_dispatch_started', 'offers_received']);
    const at = fromEvent || (job.deposit_verified_at ? String(job.deposit_verified_at) : String(job.updated_at || '')) || null;
    return { at, known: Boolean(fromEvent || job.deposit_verified_at) };
  }
  if (stage.key === 'on_route') {
    const fromEvent = byType(['fitter_on_route', 'on_route']);
    const at = fromEvent || String(job.updated_at || '') || null;
    return { at, known: Boolean(fromEvent) };
  }
  if (stage.key === 'fitting') {
    const fromEvent = byType(['arrived', 'in_progress', 'fitting_started']);
    const at = fromEvent || String(job.updated_at || '') || null;
    return { at, known: Boolean(fromEvent) };
  }
  const fromEvent = byType(['completed']);
  const at = fromEvent || String(job.completed_at || job.updated_at || '') || null;
  return { at, known: Boolean(fromEvent || job.completed_at) };
}

export function formatStageAge(at: string | null, known: boolean, now = Date.now()): string {
  if (!at) return 'unknown since';
  const ms = parseTs(at);
  if (ms === null) return 'unknown since';
  const minutes = Math.max(0, Math.round((now - ms) / 60000));
  const age =
    minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 1440)}d`;
  return known ? `${age} in stage` : `unknown since · ~${age}`;
}

/** One primary CTA for Needs You / Home command cards. */
export function stagePrimaryCta(job: Row): { label: string; hrefSuffix?: string } {
  const s = statusOf(job);
  if (s === 'awaiting_owner_price') return { label: 'Set price' };
  if (s === 'awaiting_payment' || s === 'payment_link_expired') return { label: 'Chase payment', hrefSuffix: '#payment-resend' };
  if (s === 'awaiting_owner_first_refusal') return { label: 'Decide now' };
  if (s === 'awaiting_group_dispatch') return { label: 'Group dispatch' };
  if (['deposit_paid', 'offers_received', 'awaiting_owner_assignment'].includes(s)) return { label: 'Assign fitter' };
  if (s === 'manual_review') return { label: 'Open job' };
  if (s === 'completed') return { label: 'Settlement', hrefSuffix: '#settlement' };
  if (['assigned', 'fitter_on_route', 'arrived', 'in_progress'].includes(s)) return { label: 'Open job' };
  return { label: 'Open job' };
}

export function groupJobsByPipelineStage<T extends Row>(jobs: T[]): Array<{ stage: PipelineStage; jobs: T[] }> {
  const buckets = new Map<PipelineStageKey, T[]>();
  for (const stage of PIPELINE_STAGES) buckets.set(stage.key, []);
  for (const job of jobs) {
    const stage = pipelineStageForJob(job);
    buckets.get(stage.key)!.push(job);
  }
  return PIPELINE_STAGES.map((stage) => ({ stage, jobs: buckets.get(stage.key) || [] })).filter((row) => row.jobs.length > 0);
}
