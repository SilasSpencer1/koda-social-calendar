'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  locationName: string | null;
  visibility: string;
  redacted: boolean;
}

interface FriendInfo {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

function getWeekStart(base: Date): Date {
  const d = new Date(base);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function FriendCalendarPage() {
  const params = useParams();
  const friendId = params.friendId as string;

  const [friend, setFriend] = useState<FriendInfo | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLevel, setDetailLevel] = useState<string | null>(null);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const res = await fetch(
        `/api/calendars/friends/${encodeURIComponent(friendId)}?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`
      );

      if (!res.ok) {
        if (res.status === 403)
          setError("You don't have permission to view this calendar.");
        else if (res.status === 404) setError('Friend not found.');
        else setError('Failed to load calendar.');
        return;
      }

      const data = await res.json();
      setFriend(data.friend);
      setDetailLevel(data.permission?.detailLevel ?? null);
      setEvents(data.events || []);
    } catch {
      setError('An error occurred while loading the calendar.');
    } finally {
      setLoading(false);
    }
  }, [friendId, weekStart]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  // Map API events to CalendarGrid format
  const gridEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    startAt:
      typeof e.startAt === 'string'
        ? e.startAt
        : new Date(e.startAt).toISOString(),
    endAt:
      typeof e.endAt === 'string' ? e.endAt : new Date(e.endAt).toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    description: e.description,
    locationName: e.locationName,
    visibility: e.visibility,
    status: 'SCHEDULED',
  }));

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/app/friends"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Friends
        </Link>

        {friend && (
          <div className="flex items-center gap-3">
            {friend.avatarUrl ? (
              <img
                src={friend.avatarUrl}
                alt={friend.name}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-xs font-bold text-white">
                {friend.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {friend.name}&apos;s Calendar
              </h1>
              {detailLevel === 'BUSY_ONLY' && (
                <p className="text-xs text-gray-400">Viewing busy/free only</p>
              )}
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
          {error}
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500">Loading calendar...</p>
        </div>
      ) : (
        <CalendarGrid
          events={gridEvents}
          weekStart={weekStart}
          onPrevWeek={() => {
            const prev = new Date(weekStart);
            prev.setDate(prev.getDate() - 7);
            setWeekStart(prev);
          }}
          onNextWeek={() => {
            const next = new Date(weekStart);
            next.setDate(next.getDate() + 7);
            setWeekStart(next);
          }}
        />
      )}
    </div>
  );
}
