'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import LogoutButton from './LogoutButton';

type IconName = 'home' | 'inbox' | 'jobs' | 'alert' | 'fitters' | 'control' | 'dispatch' | 'money' | 'analytics';
type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  match: (pathname: string, search: URLSearchParams) => boolean;
};

const primary: NavItem[] = [
  { href: '/', label: 'Home', icon: 'home', match: (path) => path === '/' },
  { href: '/conversations', label: 'Inbox', icon: 'inbox', match: (path) => path.startsWith('/conversations') },
  { href: '/jobs', label: 'Jobs', icon: 'jobs', match: (path, search) => path === '/jobs' && search.get('view') !== 'needs-you' || path.startsWith('/jobs/') },
  { href: '/jobs?view=needs-you', label: 'Needs You', icon: 'alert', match: (path, search) => path === '/jobs' && search.get('view') === 'needs-you' },
  { href: '/fitters', label: 'Fitters', icon: 'fitters', match: (path) => path.startsWith('/fitters') },
];

const operations: NavItem[] = [
  { href: '/dispatch', label: 'Dispatch', icon: 'dispatch', match: (path) => path.startsWith('/dispatch') },
  { href: '/money', label: 'Money', icon: 'money', match: (path) => path.startsWith('/money') },
  { href: '/analytics', label: 'Analytics', icon: 'analytics', match: (path) => path.startsWith('/analytics') },
];

const control: NavItem = {
  href: '/settings',
  label: 'Control',
  icon: 'control',
  match: (path) => path.startsWith('/settings'),
};

function Icon({ name }: { name: IconName }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'home') return <svg {...common}><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>;
  if (name === 'inbox') return <svg {...common}><path d="M4 5.5h16v13H4z"/><path d="M4 13h4l2 2.5h4L16 13h4"/></svg>;
  if (name === 'jobs') return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>;
  if (name === 'alert') return <svg {...common}><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4.5M12 17h.01"/></svg>;
  if (name === 'fitters') return <svg {...common}><circle cx="12" cy="8" r="3"/><path d="M5 20c.8-4.1 3.1-6 7-6s6.2 1.9 7 6"/></svg>;
  if (name === 'dispatch') return <svg {...common}><path d="M4 17h16M6 17l2-8h8l2 8M9 9V6h6v3"/><circle cx="8" cy="19" r="1.5"/><circle cx="16" cy="19" r="1.5"/></svg>;
  if (name === 'money') return <svg {...common}><path d="M4 7h16v10H4z"/><circle cx="12" cy="12" r="2.5"/><path d="M7 10h.01M17 14h.01"/></svg>;
  if (name === 'analytics') return <svg {...common}><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.05 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.3V9.55h.09A1.7 1.7 0 0 0 3.95 8.45a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.4 3.65l.06.06A1.7 1.7 0 0 0 8.35 4.05a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.3h4.05v.09a1.7 1.7 0 0 0 1.1 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06a1.7 1.7 0 0 0-.34 1.88c.14.38.35.72.6 1 .3.3.68.45 1.1.4H21v4.05h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>;
}

function Brand() {
  return (
    <div className="productBrandMark productBrandMarkLogo" aria-hidden="true">
      <Image src="/brand/rescue-tyres-mark.png" alt="" width={36} height={36} />
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isActive = (item: NavItem) => item.match(pathname, searchParams);

  return <>
    <aside className="productSidebar">
      <div className="productSidebarTop">
        <Link className="productBrand" href="/" aria-label="TyreOps home">
          <Brand />
          <div><strong>Rescue Tyres</strong><span>TyreOps operations</span></div>
        </Link>
        <div className="productLive"><i></i><span>Live</span></div>
      </div>

      <nav className="productNav" aria-label="TyreOps navigation">
        <div className="productNavLabel">Operate</div>
        {primary.map((item) => <Link key={item.href} href={item.href} className={isActive(item) ? 'active' : undefined} aria-current={isActive(item) ? 'page' : undefined}>
          <span className="productNavIcon"><Icon name={item.icon} /></span>
          <span>{item.label}</span>
        </Link>)}
        <div className="productNavLabel productNavLabelControl">Run the business</div>
        {operations.map((item) => <Link key={item.href} href={item.href} className={isActive(item) ? 'active' : undefined} aria-current={isActive(item) ? 'page' : undefined}>
          <span className="productNavIcon"><Icon name={item.icon} /></span><span>{item.label}</span>
        </Link>)}
        <div className="productNavLabel productNavLabelControl">System</div>
        <Link href={control.href} className={isActive(control) ? 'active' : undefined} aria-current={isActive(control) ? 'page' : undefined}>
          <span className="productNavIcon"><Icon name={control.icon} /></span>
          <span>{control.label}</span>
        </Link>
      </nav>

      <div className="productSidebarFoot">
        <div className="productTenant"><div className="productTenantAvatar productTenantAvatarLogo"><Image src="/brand/rescue-tyres-mark-64.png" alt="" width={28} height={28} /></div><div><strong>Rescue Tyres</strong><span>Owner workspace</span></div></div>
        <LogoutButton />
      </div>
    </aside>

    <nav className="mobileDock" aria-label="Mobile navigation">
      {primary.slice(0, 4).map((item) => <Link key={item.href} href={item.href} className={isActive(item) ? 'active' : undefined}>
        <Icon name={item.icon} /><span>{item.label}</span>
      </Link>)}
      <Link href="/settings" className={isActive(control) ? 'active' : undefined}><Icon name="control" /><span>More</span></Link>
    </nav>
  </>;
}

