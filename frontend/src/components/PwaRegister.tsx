'use client';
import { useEffect } from 'react';

export default function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Non-fatal: the app works fine without the service worker, it just loses
        // the install prompt / offline fallback.
      });
    }
  }, []);

  return null;
}
