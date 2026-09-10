import './globals.css';
import './atelier.css';
import Sidebar from '@/components/Sidebar';
import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Rescue Tyres · Owner OS',
  description: 'Rescue Tyres owner app — mobile tyre operations from enquiry to completion.',
  applicationName: 'Rescue Tyres',
  appleWebApp: { capable: true, title: 'Rescue Tyres', statusBarStyle: 'black-translucent' },
  openGraph: {
    title: 'Rescue Tyres · Owner OS',
    description: 'Owner command for mobile tyre jobs, money, and Needs You — graphite pulse.',
    siteName: 'Rescue Tyres',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rescue Tyres · Owner OS',
    description: 'Owner command for mobile tyre jobs, money, and Needs You.',
  },
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
