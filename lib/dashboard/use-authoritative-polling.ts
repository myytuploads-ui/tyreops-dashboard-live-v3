'use client';

import { useEffect, useRef } from 'react';

export function useAuthoritativePolling(refresh: () => void, intervalMs = 7000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let running = false;
    async function tick() {
      if (document.visibilityState !== 'visible' || running) return;
      running = true;
      try { await refreshRef.current(); } finally { running = false; }
    }
    const interval = window.setInterval(() => { void tick(); }, intervalMs);
    const visibility = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visibility); };
  }, [intervalMs]);
}
