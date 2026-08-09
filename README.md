# TyreOps Dashboard — Live Read-Only V1

This is the real connected dashboard build based on the TyreOps dark control-centre design.

## What it does

- Supabase Auth login
- Live Overview
- Live Jobs list
- Job Detail
- Fitter network
- Manual Review queue
- Read-only Settings
- No business logic is recreated in the dashboard
- No direct write actions yet

## Safe setup

1. Copy `.env.example` to `.env.local`
2. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Do **not** use the Supabase service-role key in this frontend.
4. Create the owner account in Supabase Auth.
5. Make sure RLS policies allow the logged-in owner to read the required tables.
6. Run:
   - `npm install`
   - `npm run dev`
7. Open `http://localhost:3000`

## Tables used

- jobs
- fitters
- fitter_offers
- workflow_events
- payments
- system_config

The current code uses the columns already proven in your TyreOps testing. If your exact DB differs slightly, edit only the query in the relevant page.

## Important

V1 is intentionally read-only.

Later, safe direct writes can be added for simple config/fitter fields.
Business actions such as re-dispatch, reassignment, payment resend, cancel, etc.
should call protected n8n webhooks instead of changing job statuses directly.


## V2 change

Production jobs are shown by default. A `Show test data` toggle reveals UAT/E2E records without deleting them from Supabase.


## V3 polish
- Premium operations overview
- Better KPI strip
- Job detail redesigned around money, fitter offers, assignment and timeline
- Manual review queue prioritised oldest-first
- Fitter network summary
- Grouped settings
- Sign out control
