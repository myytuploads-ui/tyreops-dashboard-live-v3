import Link from 'next/link';
import LogoutButton from './LogoutButton';

const nav = [
  ['/conversations', 'Conversations', '●'],
  ['/', 'Overview', '◉'],
  ['/jobs', 'Live Jobs', '▦'],
  ['/fitters', 'Fitters', '◆'],
  ['/manual-review', 'Needs Attention', '!'],
  ['/settings', 'Settings', '⚙'],
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="tyreMark"></div>
        <div className="logoText">
          <strong>TyreOps</strong>
          <span>Control Centre</span>
        </div>
      </div>

      <div className="modePill">
        <b>System</b>
        <span><i className="dot"></i>CONNECTED</span>
      </div>

      <nav className="nav">
        {nav.map(([href, label, icon]) => (
          <Link href={href} key={href}>
            <span className="navIcon">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebarFoot">
        <div className="ownerCard">
          <div className="avatar">TO</div>
          <div className="ownerMeta">
            <strong>TyreOps Owner</strong>
            <span>Operations Admin</span>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
