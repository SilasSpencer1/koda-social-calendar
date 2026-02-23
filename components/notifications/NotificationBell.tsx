'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

async function getUnreadCount(): Promise<number> {
  try {
    const res = await fetch('/api/notifications/unread-count');
    if (res.ok) {
      const data = await res.json();
      return data.count ?? 0;
    }
  } catch {
    // Silently fail -- non-critical
  }
  return 0;
}

/**
 * Notification bell icon with unread count badge.
 * Polls /api/notifications/unread-count every 30 seconds.
 */
export function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Initial fetch
    getUnreadCount().then((n) => {
      if (!cancelled) setCount(n);
    });

    // Poll every 30 s
    const interval = setInterval(() => {
      getUnreadCount().then((n) => {
        if (!cancelled) setCount(n);
      });
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <Link
      href="/app/notifications"
      className="relative block rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100"
    >
      Notifications
      {count > 0 && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
