export default function StatusBadge({ status }: { status?: string | null }) {
  const s = String(status || 'unknown').toLowerCase();
  const labels: Record<string, string> = {
    awaiting_details: 'Details needed',
    awaiting_owner_price: 'Price needed',
    awaiting_payment: 'Waiting for payment',
    payment_link_expired: 'Payment expired',
    deposit_paid: 'Deposit paid',
    awaiting_fitter: 'Fitter needed',
    awaiting_owner_assignment: 'Choose a fitter',
    awaiting_owner_first_refusal: 'Your decision',
    awaiting_group_dispatch: 'Group dispatch',
    dispatching_preferred: 'Finding fitter',
    dispatching_general: 'Finding fitter',
    offers_received: 'Offers ready',
    assigned: 'Fitter assigned',
    fitter_on_route: 'On the way',
    on_route: 'On the way',
    arrived: 'Arrived',
    in_progress: 'Fitting',
    completed: 'Completed',
    cancelled: 'Cancelled',
    manual_review: 'Needs attention',
  };
  return <span className={`badge ${s}`}>{labels[s] || s.replaceAll('_', ' ')}</span>;
}
