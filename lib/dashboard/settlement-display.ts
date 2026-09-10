import { validMoney } from '@/lib/dashboard/operations';

type Row = Record<string, any>;

/** Amount the fitter still needs to send back to the business. */
export function fitterToSendAmount(settlement: Row | null | undefined, job?: Row | null) {
  if (settlement) {
    const outstanding = validMoney(settlement.settlement_outstanding);
    if (outstanding !== null) return Math.max(0, outstanding);
    const entitlement = validMoney(settlement.rescue_tyres_entitlement);
    const status = String(settlement.settlement_status || '').toLowerCase();
    if (['paid', 'settled', 'cleared', 'received', 'complete', 'completed'].includes(status)) return 0;
    if (entitlement !== null) return Math.max(0, entitlement);
  }
  if (job && !settlement) {
    const remaining = validMoney(job.remaining_customer_balance);
    if (remaining !== null && remaining > 0) return remaining;
  }
  return null;
}

/** Read-only. No owner-confirm write API exists for fitter remittance. */
export function fitterSentState(settlement: Row | null | undefined): { label: 'Yes' | 'No' | 'Unknown'; detail: string } {
  if (!settlement) return { label: 'Unknown', detail: 'No settlement record yet.' };
  const status = String(settlement.settlement_status || '').toLowerCase();
  const outstanding = validMoney(settlement.settlement_outstanding);
  if (['paid', 'settled', 'cleared', 'received', 'complete', 'completed'].includes(status) || outstanding === 0) {
    return { label: 'Yes', detail: status ? status.replaceAll('_', ' ') : 'Marked settled' };
  }
  if (outstanding !== null && outstanding > 0) {
    return { label: 'No', detail: 'Still outstanding' };
  }
  if (['pending', 'open', 'outstanding', 'awaiting', 'awaiting_remittance', 'unpaid'].includes(status)) {
    return { label: 'No', detail: status.replaceAll('_', ' ') };
  }
  if (status) return { label: 'Unknown', detail: status.replaceAll('_', ' ') };
  return { label: 'Unknown', detail: 'Status not recorded' };
}

export function owedNowAmount(settlement: Row | null | undefined, job?: Row | null) {
  const fromSettlement = fitterToSendAmount(settlement, job);
  if (fromSettlement !== null) return fromSettlement;
  const entitlement = settlement ? validMoney(settlement.rescue_tyres_entitlement) : null;
  if (entitlement !== null) return entitlement;
  return job ? validMoney(job.remaining_customer_balance) : null;
}
