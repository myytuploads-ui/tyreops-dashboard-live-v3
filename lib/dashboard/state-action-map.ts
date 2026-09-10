export type StateClass = 'OWNER ACTION' | 'CUSTOMER ACTION' | 'FITTER ACTION' | 'AUTOMATION' | 'EXCEPTION' | 'COMPLETE';

export type JobStateAction = {
  status: string;
  className: StateClass;
  nextOwner: string;
  dashboardAction: string;
  workflow: string;
  next: string;
};

export const jobStateActionMap: JobStateAction[] = [
  { status: 'awaiting_details', className: 'CUSTOMER ACTION', nextOwner: 'Customer / AI', dashboardAction: 'Open conversation / TAKE OVER', workflow: 'Customer conversation', next: 'Move to pricing or dispatch once details are complete.' },
  { status: 'awaiting_owner_price', className: 'OWNER ACTION', nextOwner: 'Owner', dashboardAction: 'Price This Job', workflow: 'WF-24 price job', next: 'Customer payment link is created and sent.' },
  { status: 'awaiting_payment', className: 'CUSTOMER ACTION', nextOwner: 'Customer', dashboardAction: 'Read-only payment monitoring', workflow: 'Stripe payment flow', next: 'Dispatch begins after payment confirmation.' },
  { status: 'payment_link_expired', className: 'EXCEPTION', nextOwner: 'Owner', dashboardAction: 'Open conversation; payment recovery workflow required', workflow: 'Payment recovery required', next: 'Customer needs a safe recovery path.' },
  { status: 'awaiting_owner_first_refusal', className: 'OWNER ACTION', nextOwner: 'Owner', dashboardAction: 'Take Job / Decline & Send On / Snooze', workflow: 'WF-25 first refusal', next: 'Job is owner-reserved, sent onward, or snoozed.' },
  { status: 'awaiting_group_dispatch', className: 'OWNER ACTION', nextOwner: 'Owner', dashboardAction: 'Copy Group Message / Assign group offer / Release direct', workflow: 'WF-23 group dispatch', next: 'Fitter sourcing continues.' },
  { status: 'dispatching_preferred', className: 'AUTOMATION', nextOwner: 'Preferred fitters', dashboardAction: 'Monitor / I Found a Fitter if owner sourced one', workflow: 'WF-04/WF-06 registered fitter dispatch', next: 'Preferred fitter accepts or job moves to general dispatch.' },
  { status: 'dispatching_general', className: 'AUTOMATION', nextOwner: 'General fitters', dashboardAction: 'Monitor / I Found a Fitter if owner sourced one', workflow: 'WF-04/WF-06 registered fitter dispatch', next: 'A fitter accepts or owner intervenes.' },
  { status: 'offers_received', className: 'OWNER ACTION', nextOwner: 'Owner', dashboardAction: 'Review offers / assign fitter', workflow: 'WF-26 registered fitter assignment', next: 'Selected fitter and customer are notified.' },
  { status: 'awaiting_owner_assignment', className: 'OWNER ACTION', nextOwner: 'Owner', dashboardAction: 'Assign Fitter', workflow: 'WF-26 registered fitter assignment', next: 'Fitter and customer are notified.' },
  { status: 'deposit_paid', className: 'OWNER ACTION', nextOwner: 'Owner / dispatch', dashboardAction: 'I Found a Fitter or dispatch according to settings', workflow: 'WF-04 dispatch entry', next: 'Job moves into fitter sourcing or assignment.' },
  { status: 'assigned', className: 'FITTER ACTION', nextOwner: 'Fitter', dashboardAction: 'Monitor status', workflow: 'Fitter status updates', next: 'Fitter progresses job.' },
  { status: 'fitter_on_route', className: 'FITTER ACTION', nextOwner: 'Fitter', dashboardAction: 'Monitor status', workflow: 'Fitter status updates', next: 'Arrival / work in progress.' },
  { status: 'arrived', className: 'FITTER ACTION', nextOwner: 'Fitter', dashboardAction: 'Monitor status', workflow: 'Fitter status updates', next: 'Completion update.' },
  { status: 'in_progress', className: 'FITTER ACTION', nextOwner: 'Fitter', dashboardAction: 'Monitor status', workflow: 'Fitter status updates', next: 'Completion update.' },
  { status: 'manual_review', className: 'EXCEPTION', nextOwner: 'Owner / TyreOps', dashboardAction: 'Open conversation where customer-related; dispatch retry contract required', workflow: 'Manual review workflows', next: 'Reason-specific recovery.' },
  { status: 'completed', className: 'COMPLETE', nextOwner: 'Complete', dashboardAction: 'Review only', workflow: 'Completion/payment audit', next: 'No further action.' },
  { status: 'cancelled', className: 'COMPLETE', nextOwner: 'Complete', dashboardAction: 'Review only', workflow: 'Cancellation workflow', next: 'No dashboard action unless payment/refund policy requires follow-up.' },
];

export function stateActionFor(status: unknown) {
  return jobStateActionMap.find((row) => row.status === String(status || '').toLowerCase()) || {
    status: String(status || 'unknown'),
    className: 'AUTOMATION' as StateClass,
    nextOwner: 'TyreOps',
    dashboardAction: 'Monitor state',
    workflow: 'Production workflow',
    next: 'TyreOps continues when the workflow condition is met.',
  };
}
