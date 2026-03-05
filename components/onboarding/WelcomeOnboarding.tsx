'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Users,
  Shield,
  MapPin,
  ChevronRight,
  Check,
  Sparkles,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

interface WelcomeOnboardingProps {
  userName: string;
  onComplete: () => void;
}

interface StepConfig {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  content: React.ReactNode;
}

// ── Component ────────────────────────────────────────────────

export function WelcomeOnboarding({
  userName,
  onComplete,
}: WelcomeOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(-1); // -1 = splash
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Google integration state
  const [googleStatus, setGoogleStatus] = useState<
    'idle' | 'loading' | 'connected' | 'error'
  >('idle');

  // Privacy settings
  const [defaultDetailLevel, setDefaultDetailLevel] = useState('BUSY_ONLY');
  const [accountVisibility, setAccountVisibility] = useState('FRIENDS_ONLY');

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Check Google connection status
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/integrations/google/status');
        if (res.ok) {
          const data = await res.json();
          if (data.isConnected) setGoogleStatus('connected');
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const handleGoogleConnect = async () => {
    setGoogleStatus('loading');
    try {
      const res = await fetch('/api/integrations/google/connection', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
          return;
        }
        setGoogleStatus('connected');
      } else {
        setGoogleStatus('error');
      }
    } catch {
      setGoogleStatus('error');
    }
  };

  const handleSavePrivacy = useCallback(async () => {
    try {
      await fetch('/api/me/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultDetailLevel, accountVisibility }),
      });
    } catch {
      // ignore
    }
  }, [defaultDetailLevel, accountVisibility]);

  const handleFinish = async () => {
    await handleSavePrivacy();
    setExiting(true);
    try {
      await fetch('/api/me/onboarding', { method: 'POST' });
    } catch {
      // ignore
    }
    setTimeout(onComplete, 600);
  };

  const nextStep = () => {
    if (currentStep === steps.length - 1) {
      handleFinish();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const steps: StepConfig[] = [
    {
      id: 'calendar',
      icon: <Calendar className="size-7 text-blue-500" />,
      title: 'Your Social Calendar',
      description:
        'Koda helps you coordinate plans with friends while keeping your privacy in control. Share your availability, find common free time, and discover things to do together.',
      content: (
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            {
              icon: <Calendar className="size-5" />,
              label: 'Share Calendars',
              desc: "Let friends see when you're free",
            },
            {
              icon: <Users className="size-5" />,
              label: 'Find Time',
              desc: 'Discover when everyone is available',
            },
            {
              icon: <MapPin className="size-5" />,
              label: 'Discover',
              desc: 'Get suggestions for what to do',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl bg-white/60 backdrop-blur-sm border border-white/40 p-4 text-center"
            >
              <div className="mx-auto mb-2 w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                {item.icon}
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {item.label}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'privacy',
      icon: <Shield className="size-7 text-violet-500" />,
      title: 'Privacy First',
      description:
        'You control exactly who sees your calendar and how much detail they can see. Set your defaults here - you can always change them later.',
      content: (
        <div className="space-y-5 mt-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Who can find your profile?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'PUBLIC', label: 'Everyone' },
                { value: 'FRIENDS_ONLY', label: 'Friends Only' },
                { value: 'PRIVATE', label: 'Nobody' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAccountVisibility(opt.value)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    accountVisibility === opt.value
                      ? 'bg-violet-500 text-white shadow-md shadow-violet-500/25'
                      : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              What do friends see by default?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  value: 'BUSY_ONLY',
                  label: 'Busy/Free Only',
                  desc: 'Friends see time blocks without details',
                },
                {
                  value: 'DETAILS',
                  label: 'Full Details',
                  desc: 'Friends see event names and locations',
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDefaultDetailLevel(opt.value)}
                  className={`px-4 py-3 rounded-xl text-left transition-all ${
                    defaultDetailLevel === opt.value
                      ? 'bg-violet-500 text-white shadow-md shadow-violet-500/25'
                      : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
                  }`}
                >
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p
                    className={`text-xs mt-0.5 ${defaultDetailLevel === opt.value ? 'text-violet-100' : 'text-slate-400'}`}
                  >
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'google',
      icon: (
        <svg className="size-7" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      ),
      title: 'Connect Google Calendar',
      description:
        'Sync your existing events so friends can see when you\'re busy. Imported events show as "Busy" by default - your details stay private.',
      content: (
        <div className="mt-6 space-y-4">
          {googleStatus === 'connected' ? (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50/80 border border-green-200/60">
              <Check className="size-5 text-green-600" />
              <p className="text-sm font-semibold text-green-800">
                Google Calendar connected
              </p>
            </div>
          ) : (
            <button
              onClick={handleGoogleConnect}
              disabled={googleStatus === 'loading'}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-800 font-semibold shadow-sm hover:shadow-md hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              <svg className="size-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {googleStatus === 'loading'
                ? 'Connecting...'
                : 'Connect Google Calendar'}
            </button>
          )}
          {googleStatus === 'error' && (
            <p className="text-sm text-red-500 text-center">
              Could not connect. Try again later.
            </p>
          )}
          <p className="text-xs text-slate-400 text-center">
            You can skip this and connect later in Settings.
          </p>
        </div>
      ),
    },
  ];

  // ── Splash screen (step -1) ──────────────────────────────

  if (currentStep === -1) {
    return (
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-700 ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',
        }}
      >
        {/* Animated background orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-20"
            style={{
              background: 'radial-gradient(circle, #3b82f6, transparent)',
              top: '-10%',
              right: '-10%',
              animation: 'float 8s ease-in-out infinite',
            }}
          />
          <div
            className="absolute w-[500px] h-[500px] rounded-full blur-[100px] opacity-15"
            style={{
              background: 'radial-gradient(circle, #8b5cf6, transparent)',
              bottom: '-10%',
              left: '-5%',
              animation: 'float 10s ease-in-out infinite reverse',
            }}
          />
          <div
            className="absolute w-[300px] h-[300px] rounded-full blur-[80px] opacity-10"
            style={{
              background: 'radial-gradient(circle, #06b6d4, transparent)',
              top: '40%',
              left: '30%',
              animation: 'float 6s ease-in-out infinite',
            }}
          />
        </div>

        <div
          className={`relative z-10 text-center px-8 transition-all duration-1000 delay-300 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div
            className="mx-auto mb-6 w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{
              background:
                'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Sparkles className="size-10 text-blue-400" />
          </div>

          <h1
            className="text-5xl font-bold text-white mb-3 tracking-tight"
            style={{ fontFamily: 'var(--font-fraunces, serif)' }}
          >
            Welcome to Koda
          </h1>
          <p className="text-lg text-slate-400 max-w-md mx-auto mb-10">
            {userName
              ? `Hey ${userName.split(' ')[0]}, let's get you set up in just a moment.`
              : "Let's get you set up in just a moment."}
          </p>

          <button
            onClick={() => setCurrentStep(0)}
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-white font-semibold text-lg transition-all duration-300 hover:scale-[1.03]"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              boxShadow:
                '0 8px 32px rgba(59,130,246,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            Get Started
            <ChevronRight className="size-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        <style>{`
          @keyframes float {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-20px) scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

  // ── Step view ────────────────────────────────────────────

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-600 ${
        exiting ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
      }`}
      style={{
        background:
          'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 50%, #f0f9ff 100%)',
      }}
    >
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-violet-200/30 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-4">
        {/* Progress bar */}
        <div className="flex gap-2 mb-8 px-2">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-200/80"
            >
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width:
                    idx < currentStep
                      ? '100%'
                      : idx === currentStep
                        ? '50%'
                        : '0%',
                  background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                }}
              />
            </div>
          ))}
        </div>

        {/* Card */}
        <div
          key={step.id}
          className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/50 shadow-2xl p-8 animate-[calFadeUp_0.4s_ease-out_both]"
          style={{
            boxShadow:
              '0 25px 50px -12px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.5) inset',
          }}
        >
          <div className="mb-5">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
              {step.icon}
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {step.title}
            </h2>
            <p className="text-slate-500 leading-relaxed">{step.description}</p>
          </div>

          {step.content}

          {/* Actions */}
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
            {currentStep > 0 ? (
              <button
                onClick={() => setCurrentStep((s) => s - 1)}
                className="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              {!isLastStep && step.id === 'google' && (
                <button
                  onClick={nextStep}
                  className="text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Skip
                </button>
              )}
              <button
                onClick={nextStep}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  boxShadow: '0 4px 16px rgba(59,130,246,0.25)',
                }}
              >
                {isLastStep ? 'Finish Setup' : 'Continue'}
                {isLastStep ? (
                  <Check className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Step indicator */}
        <p className="text-center text-xs text-slate-400 mt-4">
          Step {currentStep + 1} of {steps.length}
        </p>
      </div>
    </div>
  );
}
