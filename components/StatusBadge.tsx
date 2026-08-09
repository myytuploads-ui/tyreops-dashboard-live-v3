export default function StatusBadge({ status }: { status?: string | null }) {
  const s = status || 'unknown';
  return <span className={`badge ${s}`}>{s.replaceAll('_', ' ')}</span>;
}
