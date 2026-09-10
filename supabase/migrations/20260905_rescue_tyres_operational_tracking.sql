begin;

alter table public.jobs
  add column if not exists quote_sent_at timestamptz,
  add column if not exists quote_expires_at timestamptz,
  add column if not exists quote_follow_up_due_at timestamptz,
  add column if not exists quote_follow_up_sent_at timestamptz,
  add column if not exists arrived_at timestamptz;

alter table public.deposit_rules
  add column if not exists owner_confirmed boolean not null default false,
  add column if not exists ai_may_use boolean not null default false;

alter table public.deposit_rules
  drop constraint if exists dr_range_order;

alter table public.deposit_rules
  add constraint dr_range_order
  check (min_job_value_gbp <= max_job_value_gbp);

create table if not exists public.job_settlements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  customer_agreed_total numeric check (customer_agreed_total >= 0),
  deposit_due numeric check (deposit_due >= 0),
  deposit_received numeric check (deposit_received >= 0),
  deposit_received_at timestamptz,
  fitter_agreed_cost numeric check (fitter_agreed_cost >= 0),
  customer_remaining_balance numeric check (customer_remaining_balance >= 0),
  amount_fitter_collected numeric check (amount_fitter_collected >= 0),
  rescue_tyres_entitlement numeric check (rescue_tyres_entitlement >= 0),
  amount_fitter_owes numeric check (amount_fitter_owes >= 0),
  amount_fitter_settled numeric check (amount_fitter_settled >= 0),
  settlement_outstanding numeric check (settlement_outstanding >= 0),
  settlement_status text not null default 'pending'
    check (settlement_status in ('pending','partially_settled','settled','disputed','manual_review','not_applicable')),
  settlement_due_at timestamptz,
  settled_at timestamptz,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitter_performance_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  fitter_id uuid references public.fitters(id) on delete set null,
  event_type text not null check (event_type in ('offer','assigned','arrived','late','completed','cancelled','warning','customer_feedback')),
  quoted_eta_minutes integer check (quoted_eta_minutes >= 0),
  actual_arrival_at timestamptz,
  eta_variance_minutes integer,
  quoted_cost numeric check (quoted_cost >= 0),
  accepted_cost numeric check (accepted_cost >= 0),
  warning_reason text,
  event_data jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  feedback_requested_at timestamptz,
  feedback_received_at timestamptz,
  overall_outcome text check (overall_outcome in ('satisfied','problem','no_response','manual_review')),
  fitter_professional boolean,
  felt_safe boolean,
  unexpected_extra_charge boolean,
  complaint_flag boolean not null default false,
  customer_comments text,
  review_requested_at timestamptz,
  review_destination text check (review_destination in ('google','trustpilot','both')),
  review_request_status text not null default 'not_requested'
    check (review_request_status in ('not_requested','pending_destination','requested','skipped','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_settlements enable row level security;
alter table public.fitter_performance_events enable row level security;
alter table public.customer_feedback enable row level security;

revoke all on public.job_settlements, public.fitter_performance_events, public.customer_feedback from anon, authenticated;
grant select on public.job_settlements, public.fitter_performance_events, public.customer_feedback to authenticated;
grant all on public.job_settlements, public.fitter_performance_events, public.customer_feedback to service_role;

drop policy if exists "dashboard owner reads job settlements" on public.job_settlements;
create policy "dashboard owner reads job settlements" on public.job_settlements
  for select to authenticated using (public.is_dashboard_owner());

drop policy if exists "dashboard owner reads fitter performance" on public.fitter_performance_events;
create policy "dashboard owner reads fitter performance" on public.fitter_performance_events
  for select to authenticated using (public.is_dashboard_owner());

drop policy if exists "dashboard owner reads customer feedback" on public.customer_feedback;
create policy "dashboard owner reads customer feedback" on public.customer_feedback
  for select to authenticated using (public.is_dashboard_owner());

commit;
