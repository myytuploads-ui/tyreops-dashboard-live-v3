import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'TyreOps Control Centre',
  description: 'TyreOps owner operations dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          <Sidebar />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
