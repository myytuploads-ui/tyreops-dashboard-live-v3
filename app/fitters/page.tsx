import { createClient } from '@/lib/supabase/server';
import FittersControlCentre, { type FitterView } from './FittersControlCentre';

export default async function FittersPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fitters')
    .select('id,full_name,whatsapp_phone,active,preferred,coverage_areas,priority_level,reliability_score,completed_jobs')
    .order('active', { ascending: false })
    .order('priority_level', { ascending: true });

  const fitters: FitterView[] = (data || []).map((fitter) => ({
    id: String(fitter.id),
    fullName: String(fitter.full_name || 'Unnamed fitter'),
    whatsappPhone: String(fitter.whatsapp_phone || ''),
    active: fitter.active === true,
    preferred: fitter.preferred === true,
    coverageAreas: Array.isArray(fitter.coverage_areas) ? fitter.coverage_areas.map(String) : [],
    priority: Number.isInteger(Number(fitter.priority_level)) ? Number(fitter.priority_level) : 999,
    reliabilityScore: fitter.reliability_score == null ? null : Number(fitter.reliability_score),
    completedJobs: fitter.completed_jobs == null ? null : Number(fitter.completed_jobs),
  }));

  return <FittersControlCentre fitters={fitters} loadError={error ? 'Fitters could not be loaded.' : null} />;
}
