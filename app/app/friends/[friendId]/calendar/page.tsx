'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface RedactedEvent {
  id: string;
  startAt: string;
  endAt: string;
  title: string;
  locationName?: string | null;
  redacted: boolean;
}

interface CalendarPermission {
  allowed: boolean;
  detailLevel: 'BUSY_ONLY' | 'DETAILS' | null;
}

export default function FriendCalendarPage() {
  const params = useParams();
  const friendId = params.friendId as string;

  const [events, setEvents] = useState<RedactedEvent[]>([]);
  const [permission, setPermission] = useState<CalendarPermission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{
    from: string;
    to: string;
  } | null>(null);

  // Helper function to calculate this week's date range
  const getThisWeekDateRange = () => {
    const now = new Date();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - now.getDay());
    sunday.setHours(0, 0, 0, 0);

    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);

    return {
      from: sunday.toISOString(),
      to: saturday.toISOString(),
    };
  };

  // Initialize date range to this week (Sunday to Saturday)
  useEffect(() => {
    setDateRange(getThisWeekDateRange());
  }, []);

  // Fetch events when date range changes
  useEffect(() => {
    if (!dateRange) return;

    const fetchEvents = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/calendars/friends/${encodeURIComponent(friendId)}?from=${encodeURIComponent(
            dateRange.from
          )}&to=${encodeURIComponent(dateRange.to)}`
        );

        if (!response.ok) {
          if (response.status === 403) {
            setError('You do not have permission to view this calendar.');
          } else if (response.status === 404) {
            setError('Friend or calendar not found.');
          } else {
            setError('Failed to load calendar events.');
          }
          setEvents([]);
          setPermission(null);
          return;
        }

        const data = await response.json();
        setEvents(data.events || []);
        setPermission(data.permission);
      } catch (err) {
        console.error('Error fetching calendar:', err);
        setError('An error occurred while loading the calendar.');
        setEvents([]);
        setPermission(null);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [friendId, dateRange]);

  const handlePreviousWeek = () => {
    if (!dateRange) return;
    const from = new Date(dateRange.from);
    from.setDate(from.getDate() - 7);
    const to = new Date(dateRange.to);
    to.setDate(to.getDate() - 7);
    setDateRange({
      from: from.toISOString(),
      to: to.toISOString(),
    });
  };

  const handleNextWeek = () => {
    if (!dateRange) return;
    const from = new Date(dateRange.from);
    from.setDate(from.getDate() + 7);
    const to = new Date(dateRange.to);
    to.setDate(to.getDate() + 7);
    setDateRange({
      from: from.toISOString(),
      to: to.toISOString(),
    });
  };

  const handleThisWeek = () => {
    setDateRange(getThisWeekDateRange());
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Friend Calendar</h1>
        <Link
          href="/app/friends"
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          ← Back to Friends
        </Link>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      ) : null}

      {permission && !permission.allowed ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-center">
          <p className="text-yellow-800">
            You do not have permission to view this calendar.
          </p>
        </div>
      ) : (
        <>
          {/* Date range controls */}
          <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex gap-2">
              <button
                onClick={handlePreviousWeek}
                disabled={loading}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                ← Previous Week
              </button>
              <button
                onClick={handleThisWeek}
                disabled={loading}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                This Week
              </button>
              <button
                onClick={handleNextWeek}
                disabled={loading}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next Week →
              </button>
            </div>
            {dateRange && (
              <div className="text-sm text-gray-600">
                {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
              </div>
            )}
          </div>

          {/* Detail level indicator */}
          {permission && (
            <div className="mb-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
              Viewing as:{' '}
              <span className="font-medium">
                {permission.detailLevel === 'DETAILS'
                  ? 'Full details'
                  : 'Busy only'}
              </span>
            </div>
          )}

          {/* Events list */}
          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <p className="text-gray-600">Loading calendar...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <p className="text-gray-600">
                No events scheduled for this period.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className={`rounded-lg p-4 ${
                    event.redacted
                      ? 'border-l-4 border-l-gray-400 bg-gray-50'
                      : 'border-l-4 border-l-blue-500 bg-blue-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {event.title}
                      </h3>
                      <p className="mt-1 text-sm text-gray-600">
                        {formatDate(event.startAt)} •{' '}
                        {formatTime(event.startAt)} - {formatTime(event.endAt)}
                      </p>
                      {event.locationName && !event.redacted && (
                        <p className="mt-1 text-sm text-gray-600">
                          Location: {event.locationName}
                        </p>
                      )}
                    </div>
                    {event.redacted && (
                      <span className="ml-4 whitespace-nowrap rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700">
                        Busy
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
