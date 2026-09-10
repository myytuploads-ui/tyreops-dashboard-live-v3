export function isTestJob(job: any) {
  const source = String(job?.source || '').toLowerCase();
  const notes = String(job?.owner_notes || job?.notes || '').toLowerCase();
  const area = String(job?.postcode_area || '').toUpperCase();
  const name = String(job?.customer_name || '').toLowerCase();
  const ref = String(job?.public_job_id || '').toUpperCase();

  return (
    source === 'e2e_test' ||
    source === 'e2e_status_test' ||
    source.includes('test') ||
    notes.includes('acceptance test') ||
    notes.startsWith('owner-acceptance-') ||
    area.startsWith('TEST') ||
    name.includes('migration probe') ||
    name.includes('test customer') ||
    name.includes('(e2e test)') ||
    ref.startsWith('RT-STATUS-')
  );
}

export function productionJobs<T = any>(rows: T[] | null | undefined) {
  return (rows || []).filter((row: any) => !isTestJob(row));
}
