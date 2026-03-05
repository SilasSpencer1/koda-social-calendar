'use client';

import { useState, useEffect } from 'react';
import { WelcomeOnboarding } from './WelcomeOnboarding';

interface OnboardingGateProps {
  userName: string;
  children: React.ReactNode;
}

export function OnboardingGate({ userName, children }: OnboardingGateProps) {
  const [status, setStatus] = useState<'loading' | 'show' | 'complete'>(
    'loading'
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/me/onboarding');
        if (res.ok) {
          const data = await res.json();
          setStatus(data.hasCompletedOnboarding ? 'complete' : 'show');
        } else {
          setStatus('complete'); // fail-open
        }
      } catch {
        setStatus('complete'); // fail-open
      }
    })();
  }, []);

  if (status === 'loading') {
    return <>{children}</>;
  }

  if (status === 'show') {
    return (
      <>
        {children}
        <WelcomeOnboarding
          userName={userName}
          onComplete={() => setStatus('complete')}
        />
      </>
    );
  }

  return <>{children}</>;
}
