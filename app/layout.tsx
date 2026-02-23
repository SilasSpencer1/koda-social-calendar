import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
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
  title: 'Koda — Social Calendar',
  description: 'Share availability and discover things to do with friends',
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
      >
        <nav className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 justify-between">
              <div className="flex items-center">
                <Link href="/" className="text-2xl font-bold text-gray-900">
                  Koda
                </Link>
              </div>
              <div className="flex items-center space-x-8">
                <Link
                  href="/calendar"
                  className="text-gray-600 hover:text-gray-900"
                >
                  Calendar
                </Link>
                <Link
                  href="/friends"
                  className="text-gray-600 hover:text-gray-900"
                >
                  Friends
                </Link>
                <Link
                  href="/discover"
                  className="text-gray-600 hover:text-gray-900"
                >
                  Discover
                </Link>
                <Link
                  href="/settings"
                  className="text-gray-600 hover:text-gray-900"
                >
                  Settings
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
