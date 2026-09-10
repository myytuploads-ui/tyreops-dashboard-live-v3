import Link from 'next/link';

const items: Array<[string, string, string, string]> = [
  ['Business profile', 'Name, hours and how you present yourself', '/settings/business#setup-business', '◎'],
  ['Tyre catalogue', 'Save sizes and reference prices once', '/catalogue', '◉'],
  ['Your fitters', 'People you trust, one tap away', '/fitters', '♧'],
  ['Prices & deposits', 'Owner-approved quote and deposit pairs', '/settings/pricing-rules', '£'],
  ['Coverage', 'Where you work', '/settings/business#setup-business', '◷'],
  ['How jobs get fitters', 'Group vs registered — you stay in control', '/settings/business#setup-fitters_dispatch', '↗'],
  ['Customer chat', 'AI conversation preferences', '/settings/business#setup-customer_ai', '✧'],
  ['Connected services', 'WhatsApp and Meta readiness', '/settings/business#setup-whatsapp', '⌁'],
  ['Money', 'Payments and settlements', '/money', '▤'],
  ['Owner guides', 'How to run Rescue Tyres on TyreOps', '/settings/onboarding-pack', '?'],
];

export default function MorePage() {
  return <div className="atelierPage atelierMore">
    <header className="atelierHeading">
      <div>
        <span className="eyebrow">RESCUE TYRES</span>
        <h1>Your business home.</h1>
        <p>Set it up once. Run the day from Home, Jobs and Inbox.</p>
      </div>
    </header>
    <div className="atelierMenu">{items.map(([title, description, href, icon]) => (
      <Link href={href} key={title}>
        <span className="atelierMenuIcon">{icon}</span>
        <div><strong>{title}</strong><p>{description}</p></div>
        <span>↗</span>
      </Link>
    ))}</div>
    <details className="atelierDiagnostics">
      <summary>Admin & diagnostics (TyreOps only)</summary>
      <Link href="/settings/handover">Owner setup centre</Link>
      <Link href="/settings/system-test">System test</Link>
    </details>
  </div>;
}
