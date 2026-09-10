import { redirect } from 'next/navigation';

export default function ManualReviewPage() {
  redirect('/jobs?view=needs-you');
}
