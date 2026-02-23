import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import { PostHogProvider } from '@/components/providers/PostHogProvider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Koda — Social Calendar for Friends',
    template: '%s | Koda',
  },
  description:
    'Share availability, coordinate plans, and discover things to do with friends. Privacy-first social calendar with Google Calendar sync.',
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'https://koda.app'),
  openGraph: {
    title: 'Koda — Social Calendar for Friends',
    description:
      'Share availability, coordinate plans, and discover things to do with friends.',
    url: '/',
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
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <nav className="glass-nav border-b border-gray-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 justify-between">
              <div className="flex items-center">
                <Link href="/" className="text-2xl font-bold text-gray-900">
                  Koda
                </Link>
              </div>
              <div className="flex items-center space-x-8">
                <Link
                  href="/app/calendar"
                  className="glass-link text-gray-600 hover:text-gray-900"
                >
                  Calendar
                </Link>
                <Link
                  href="/app/friends"
                  className="glass-link text-gray-600 hover:text-gray-900"
                >
                  Friends
                </Link>
                <Link
                  href="/app/discover"
                  className="glass-link text-gray-600 hover:text-gray-900"
                >
                  Discover
                </Link>
                <Link
                  href="/app/settings"
                  className="glass-link text-gray-600 hover:text-gray-900"
                >
                  Settings
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <PostHogProvider>
          <main>{children}</main>
        </PostHogProvider>
      </body>
    </html>
  );
}
