'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Calendar, Users, MapPin, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MiniWeekCalendar } from '@/components/calendar/MiniWeekCalendar';
import type { MiniEvent } from '@/components/calendar/MiniWeekCalendar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedFriend {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  detailLevel: string;
  eventCount: number;
  events: MiniEvent[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute Monday 00:00 of the current week in the user's local timezone. */
function getLocalWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun .. 6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const ws = new Date(now);
  ws.setDate(now.getDate() + diffToMon);
  ws.setHours(0, 0, 0, 0);
  return ws;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [friends, setFriends] = useState<FeedFriend[]>([]);
  // Compute weekStart in the user's local timezone to avoid UTC-offset day shift
  const [weekStart] = useState<Date>(() => getLocalWeekStart());
  const [loading, setLoading] = useState(true);

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/feed');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFriends(data.friends || []);
    } catch {
      // Silently fail - feed is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handleRequestJoin = useCallback(async (eventId: string) => {
    try {
      const res = await fetch(`/api/public/events/${eventId}/join-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Could not send request.');
        return;
      }
      alert('Join request sent!');
    } catch {
      alert('Something went wrong. Try again.');
    }
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Your Feed</h1>
        <p className="mt-1 text-sm text-gray-500">
          See what your friends are up to this week
        </p>
      </div>

      {/* Quick actions */}
      <div className="mb-8 flex gap-3">
        <Link href="/app/calendar">
          <Button variant="outline" size="sm" className="gap-2">
            <Calendar className="h-4 w-4" />
            My Calendar
          </Button>
        </Link>
        <Link href="/app/friends">
          <Button variant="outline" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
            Friends
          </Button>
        </Link>
        <Link href="/app/discover">
          <Button variant="outline" size="sm" className="gap-2">
            <MapPin className="h-4 w-4" />
            Discover
          </Button>
        </Link>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-6"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
                <div className="space-y-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
              <div className="h-48 animate-pulse rounded-lg bg-gray-100" />
            </div>
          ))}
        </div>
      ) : friends.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            Your feed is empty
          </h3>
          <p className="mx-auto mb-6 max-w-sm text-sm text-gray-500">
            Connect with friends and enable calendar sharing to see their
            calendars here.
          </p>
          <Link href="/app/friends">
            <Button className="gap-2">
              Find Friends
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {friends.map((friend) => (
            <div
              key={friend.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              {/* Card header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  {friend.avatarUrl ? (
                    <img
                      src={friend.avatarUrl}
                      alt={friend.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-sm font-bold text-white">
                      {friend.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {friend.name}
                    </p>
                    {friend.username && (
                      <p className="text-xs text-gray-500">
                        @{friend.username}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs font-medium text-gray-400">
                  {friend.eventCount} event
                  {friend.eventCount !== 1 ? 's' : ''} this week
                </span>
              </div>

              {/* Mini calendar */}
              <div className="px-4 py-3">
                <MiniWeekCalendar
                  events={friend.events}
                  weekStart={weekStart}
                  onRequestJoin={handleRequestJoin}
                />
              </div>

              {/* Card footer */}
              <div className="border-t border-gray-100 px-5 py-3">
                <Link
                  href={`/app/friends/${friend.id}/calendar`}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  View full calendar
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
