'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Compact Rescue Tyres mark in top chrome on every owner route (mobile-first). */
export default function OwnerTopChrome() {
  const pathname = usePathname();
  if (pathname === '/login') return null;

  return (
    <header className="ownerTopChrome" aria-label="Rescue Tyres">
      <Link href="/" className="ownerTopChromeBrand" aria-label="Rescue Tyres home">
        <span className="ownerTopChromeMark">
          <Image src="/brand/rescue-tyres-mark.png" alt="" width={28} height={28} priority />
        </span>
        <span className="ownerTopChromeText">
          <strong>Rescue Tyres</strong>
          <em>Owner</em>
        </span>
      </Link>
    </header>
  );
}
