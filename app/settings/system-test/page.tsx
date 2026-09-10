import PageHeader from '@/components/PageHeader';
import SystemTestClient from './SystemTestClient';

export default function SystemTestPage() {
  return <>
    <PageHeader title="System Test" subtitle="Owner acceptance checks for TyreOps V1 pre-onboarding." />
    <SystemTestClient />
  </>;
}
