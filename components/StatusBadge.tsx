export default function StatusBadge({ status }: { status?: string | null }) {
  const s = status || 'unknown';
  const labels: Record<string,string> = {awaiting_details:'Details needed',awaiting_owner_price:'Price needed',awaiting_payment:'Waiting for payment',deposit_paid:'Deposit paid',awaiting_fitter:'Fitter needed',awaiting_owner_assignment:'Choose a fitter',awaiting_owner_first_refusal:'Your decision',assigned:'Fitter assigned',fitter_on_route:'On route',on_route:'On route',arrived:'Arrived',in_progress:'Fitting',completed:'Completed',cancelled:'Cancelled',manual_review:'Needs attention',payment_link_expired:'Payment expired'};
  return <span className={`badge ${s}`}>{labels[s] || s.replaceAll('_', ' ')}</span>;
}
