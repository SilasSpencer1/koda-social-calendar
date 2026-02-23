'use client';

import { type ReactNode, useEffect } from 'react';
import { initPostHog } from '@/lib/analytics/posthog';

/**
 * PostHog provider component.
 * Place this in your app layout to initialize PostHog on the client.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return <>{children}</>;
}
