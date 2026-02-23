'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <main className="w-full max-w-4xl px-4 text-center">
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl font-bold tracking-tight text-gray-900 md:text-6xl">
              Share availability. Discover plans.
            </h1>
            <p className="text-xl text-gray-600">
              Privacy-first social calendar that helps you coordinate with
              friends and discover things to do in your city.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/calendar">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                Get Started
              </Button>
            </Link>
            <Link href="/discover">
              <Button
                size="lg"
                variant="outline"
                className="border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                Explore Events
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 pt-8 md:grid-cols-3">
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <div className="text-2xl"></div>
              <h3 className="mt-2 font-semibold text-gray-900">
                Share Calendar
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Control exactly what friends can see about your schedule
              </p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <div className="text-2xl"></div>
              <h3 className="mt-2 font-semibold text-gray-900">Find Friends</h3>
              <p className="mt-1 text-sm text-gray-600">
                Connect with friends and coordinate group activities
              </p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <div className="text-2xl"></div>
              <h3 className="mt-2 font-semibold text-gray-900">
                Discover Events
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Find activities and events happening near you
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
