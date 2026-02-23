import Link from 'next/link';
import type { Metadata } from 'next';

// ---------------------------------------------------------------------------
// SEO + OpenGraph metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Koda — Social Calendar for Friends',
  description:
    'Share availability, coordinate plans, and discover things to do with friends. Privacy-first calendar that syncs with Google Calendar.',
  openGraph: {
    title: 'Koda — Social Calendar for Friends',
    description:
      'Share availability, coordinate plans, and discover things to do with friends.',
    url: 'https://koda.app',
    siteName: 'Koda',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Koda — Social Calendar',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Koda — Social Calendar for Friends',
    description:
      'Share availability, coordinate plans, and discover things to do with friends.',
    images: ['/og-image.png'],
  },
};

// ---------------------------------------------------------------------------
// Icons (inline SVGs — no emojis)
// ---------------------------------------------------------------------------

function IconLock({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

function IconEnvelope({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      />
    </svg>
  );
}

function IconGlobe({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  );
}

function IconSparkles({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
      />
    </svg>
  );
}

function IconSync({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644v-4.992"
      />
    </svg>
  );
}

function IconUsers({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Feature data
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: IconLock,
    title: 'Privacy First',
    description:
      'Control exactly what friends can see — full details, busy/free, or nothing at all. Per-friend overrides give you total control.',
  },
  {
    icon: IconEnvelope,
    title: 'Smart Invites',
    description:
      'Invite friends to events with one click. They can RSVP, stay anonymous, or join public events.',
  },
  {
    icon: IconGlobe,
    title: 'Public Events',
    description:
      'Host public events anyone can discover and join. Request-based entry keeps things safe.',
  },
  {
    icon: IconSparkles,
    title: 'Discover',
    description:
      'Get personalized suggestions for events and places based on your free time and interests.',
  },
  {
    icon: IconSync,
    title: 'Google Calendar Sync',
    description:
      'Two-way sync with Google Calendar. Import events, push Koda events — all loop-free and automatic.',
  },
  {
    icon: IconUsers,
    title: 'Friends & Groups',
    description:
      'Build your circle. See when friends are free, coordinate group plans, and find the best times to meet.',
  },
];

const FAQ = [
  {
    q: 'Is Koda free?',
    a: 'Yes! Koda is completely free during beta. We may introduce optional premium features in the future.',
  },
  {
    q: 'Can my friends see all my events?',
    a: 'No — you control visibility per-friend. Choose between full details, busy/free only, or completely hidden. Private events are always hidden from friends.',
  },
  {
    q: 'Does Google Calendar sync work both ways?',
    a: 'Yes. Koda imports your Google Calendar events and can optionally push Koda events back to Google. Sync is automatic and loop-free.',
  },
  {
    q: 'What about Apple Calendar?',
    a: 'Apple Calendar support is on our roadmap. For now, we support Google Calendar sync.',
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. OAuth tokens are stored server-side and never exposed to clients. We use industry-standard encryption and Supabase for database hosting.',
  },
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[#dfe6f2] pt-20 pb-28 sm:pt-28 sm:pb-36">
      {/* Ambient orbs — soft cool blue tones */}
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[#c5d4f0]/40 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-[#cdd8f0]/40 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-[#d5ddf0]/30 blur-3xl" />

      <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <div className="glass-panel inline-block rounded-full px-5 py-2 mb-8">
          <span className="text-sm font-semibold text-[#0071e3]">
            Now in Beta
          </span>
        </div>

        <div className="glass-panel mx-auto max-w-3xl rounded-2xl px-8 py-8 sm:px-12 sm:py-10">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            Share availability.{' '}
            <span className="text-[#0071e3]">Discover plans.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-500">
            Privacy-first social calendar that helps you coordinate with friends
            and discover things to do in your city.
          </p>
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="glass-button rounded-full px-8 py-3 text-sm font-semibold text-[#0071e3]"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="glass-button rounded-full px-8 py-3 text-sm font-semibold text-[#0071e3]"
          >
            Sign In
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative overflow-hidden bg-gradient-to-b from-[#dfe6f2] to-[#e8edf5] py-20 sm:py-28"
    >
      <div className="absolute top-0 right-1/4 h-80 w-80 rounded-full bg-[#c5d4f0]/20 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Everything you need to plan with friends
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-500">
            Koda brings your social calendar to life with powerful features
            designed for privacy, flexibility, and fun.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="glass-card rounded-2xl p-8">
              <div className="inline-flex items-center justify-center rounded-xl bg-[#0071e3]/10 p-3 text-[#0071e3]">
                <feature.icon />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DeepDiveSection() {
  return (
    <section className="relative overflow-hidden bg-[#e8edf5] py-20 sm:py-28">
      <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-[#c5d4f0]/20 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-24">
        {/* Privacy */}
        <div className="flex flex-col items-center gap-12 lg:flex-row">
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Privacy controls that actually work
            </h3>
            <p className="mt-4 text-gray-500 leading-relaxed">
              Set your default visibility to friends-only or private. Override
              settings per friend — show full details to close friends and
              busy/free to acquaintances. Private events are always hidden.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Per-friend detail level overrides',
                'Busy/free or full details',
                'Private events always hidden',
                'Block users completely',
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-sm text-gray-600"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0071e3]/10 text-[#0071e3]">
                    <IconCheck />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1">
            <div className="glass-card rounded-3xl p-14 text-center">
              <IconLock className="mx-auto h-16 w-16 text-[#0071e3]/60" />
              <p className="mt-4 text-sm font-medium text-gray-500">
                Your calendar, your rules
              </p>
            </div>
          </div>
        </div>

        {/* Google Sync */}
        <div className="flex flex-col items-center gap-12 lg:flex-row-reverse">
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Seamless Google Calendar sync
            </h3>
            <p className="mt-4 text-gray-500 leading-relaxed">
              Connect your Google Calendar and Koda keeps everything in sync.
              Your Google events appear as blocks in Koda, and you can
              optionally push Koda events back to Google. Automatic sync runs
              hourly with zero manual effort.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Import events automatically',
                'Push Koda events to Google (opt-in)',
                'Loop-free bidirectional sync',
                'Manual sync anytime',
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-sm text-gray-600"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0071e3]/10 text-[#0071e3]">
                    <IconCheck />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1">
            <div className="glass-card rounded-3xl p-14 text-center">
              <IconSync className="mx-auto h-16 w-16 text-[#0071e3]/60" />
              <p className="mt-4 text-sm font-medium text-gray-500">
                Always in sync, never in loops
              </p>
            </div>
          </div>
        </div>

        {/* Discover */}
        <div className="flex flex-col items-center gap-12 lg:flex-row">
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Discover what to do next
            </h3>
            <p className="mt-4 text-gray-500 leading-relaxed">
              Koda analyzes your free time and suggests events, venues, and
              activities near you. From concerts to coffee shops — always
              personalized, never overwhelming.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Personalized by interests & location',
                'Based on your actual free time',
                'Concerts, restaurants, activities',
                'Add suggestions to calendar instantly',
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-sm text-gray-600"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0071e3]/10 text-[#0071e3]">
                    <IconCheck />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1">
            <div className="glass-card rounded-3xl p-14 text-center">
              <IconSparkles className="mx-auto h-16 w-16 text-[#0071e3]/60" />
              <p className="mt-4 text-sm font-medium text-gray-500">
                Never wonder what to do next
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  return (
    <section
      id="faq"
      className="relative overflow-hidden bg-gradient-to-b from-[#e8edf5] to-[#dfe6f2] py-20 sm:py-28"
    >
      <div className="absolute top-20 left-1/3 h-60 w-60 rounded-full bg-[#c5d4f0]/20 blur-3xl" />

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Frequently asked questions
        </h2>
        <div className="mt-12 space-y-4">
          {FAQ.map((item) => (
            <div key={item.q} className="glass-panel rounded-2xl p-6">
              <h3 className="text-base font-semibold text-gray-900">
                {item.q}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative overflow-hidden bg-[#dfe6f2] py-20 sm:py-24">
      <div className="absolute -top-40 right-1/4 h-80 w-80 rounded-full bg-[#c5d4f0]/30 blur-3xl" />
      <div className="absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-[#cdd8f0]/30 blur-3xl" />

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <div className="glass-panel rounded-3xl px-10 py-14">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Ready to plan better with friends?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-500">
            Join the beta and start coordinating your social life with ease.
          </p>
          <Link
            href="/signup"
            className="glass-button mt-8 inline-block rounded-full px-8 py-3 text-sm font-semibold text-[#0071e3]"
          >
            Get Started
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-gradient-to-b from-[#dfe6f2] to-[#d8e0ee] py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div>
            <span className="text-xl font-bold text-gray-900">Koda</span>
            <p className="mt-1 text-sm text-gray-500">
              Social calendar for friends
            </p>
          </div>
          <div className="flex gap-8 text-sm text-gray-400">
            <Link
              href="/signup"
              className="glass-link hover:text-gray-700 transition-colors"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="glass-link hover:text-gray-700 transition-colors"
            >
              Sign In
            </Link>
            <a
              href="#features"
              className="glass-link hover:text-gray-700 transition-colors"
            >
              Features
            </a>
            <a
              href="#faq"
              className="glass-link hover:text-gray-700 transition-colors"
            >
              FAQ
            </a>
          </div>
        </div>
        <div className="mt-8 border-t border-white/30 pt-8 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Koda. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <DeepDiveSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  );
}
