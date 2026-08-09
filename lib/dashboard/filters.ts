export function isTestJob(job: any) {
  const source = String(job?.source || '').toLowerCase();
  const area = String(job?.postcode_area || '').toUpperCase();
  const name = String(job?.customer_name || '').toLowerCase();
  const ref = String(job?.public_job_id || '').toUpperCase();

  return (
    source === 'e2e_test' ||
    source === 'e2e_status_test' ||
    area === 'TEST99' ||
    name.includes('test customer') ||
    name.includes('(e2e test)') ||
    ref.startsWith('RT-STATUS-')
  );
}

export function productionJobs<T = any>(rows: T[] | null | undefined) {
  return (rows || []).filter((row: any) => !isTestJob(row));
}
