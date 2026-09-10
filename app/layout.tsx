import './globals.css';
import './atelier.css';
import Sidebar from '@/components/Sidebar';
import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Rescue Tyres · TyreOps',
  description: 'Mobile tyre operations, from enquiry to completion.',
  applicationName: 'TyreOps',
  appleWebApp: { capable: true, title: 'TyreOps', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#080b0d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><div className="productApp">
    <Suspense fallback={<aside className="productSidebar productSidebarLoading" />}><Sidebar /></Suspense>
    <main className="productMain">{children}</main>
  </div></body></html>;
}
