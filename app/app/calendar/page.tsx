'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarGrid, AgendaList } from '@/components/calendar/CalendarGrid';

interface Event {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status?: string;
}

interface Friend {
  id: string;
  user: { id: string; name: string; avatarUrl: string | null };
}

interface Slot {
  startAt: string;
  endAt: string;
}

export default function CalendarPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  // Find Time state
  const [showFindTime, setShowFindTime] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [ftDuration, setFtDuration] = useState(60);
  const [ftDays, setFtDays] = useState(7);
  const [ftSlots, setFtSlots] = useState<Slot[]>([]);
  const [ftLoading, setFtLoading] = useState(false);
  const [ftError, setFtError] = useState<string | null>(null);
  const [ftStep, setFtStep] = useState<'search' | 'results' | 'confirm'>(
    'search'
  );
  const [ftSelectedSlot, setFtSelectedSlot] = useState<Slot | null>(null);
  const [ftTitle, setFtTitle] = useState('');
  const [ftLocation, setFtLocation] = useState('');
  const [ftVisibility, setFtVisibility] = useState<string>('FRIENDS');
  const [ftConfirmLoading, setFtConfirmLoading] = useState(false);

  useEffect(() => {
    async function fetchEvents() {
      try {
        setLoading(true);
        setError(null);

        const now = new Date();
        const weekStart = new Date(now);
        const day = now.getDay();
        // getDay() returns 0 for Sunday; offset so Monday is always the start
        const mondayOffset = day === 0 ? -6 : 1 - day;
        weekStart.setDate(now.getDate() + mondayOffset);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const url = new URL('/api/events', window.location.origin);
        url.searchParams.set('from', weekStart.toISOString());
        url.searchParams.set('to', weekEnd.toISOString());

        const response = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: response.statusText }));
          throw new Error(
            errorData.error || `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const data = await response.json();
        setEvents(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching events:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch events');
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, []);

  const handleEventClick = (event: Event) => {
    setSelectedEvent(event);
  };

  const openFindTime = async () => {
    setShowFindTime(true);
    setFtStep('search');
    setFtSlots([]);
    setFtError(null);
    setFtSelectedSlot(null);
    setFtTitle('');
    setFtLocation('');

    // Fetch friends
    try {
      const res = await fetch('/api/friends');
      if (res.ok) {
        const data = await res.json();
        setFriends(data.accepted || []);
      }
    } catch {
      // Silently handle
    }
  };

  const toggleFriend = (userId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleFindSlots = async () => {
    setFtLoading(true);
    setFtError(null);

    try {
      const now = new Date();
      const from = now.toISOString();
      const to = new Date(
        now.getTime() + ftDays * 24 * 60 * 60 * 1000
      ).toISOString();

      // Get current user id from session
      const sessionRes = await fetch('/api/auth/session');
      let currentUserId = '';
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        currentUserId = session.user?.id || '';
      }

      const participantIds = [currentUserId, ...selectedFriends].filter(
        Boolean
      );

      const res = await fetch('/api/find-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantIds,
          from,
          to,
          durationMinutes: ftDuration,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to find time');
      }

      const data = await res.json();
      setFtSlots(data.slots || []);
      setFtStep('results');
    } catch (err) {
      setFtError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setFtLoading(false);
    }
  };

  const handleSelectSlot = (slot: Slot) => {
    setFtSelectedSlot(slot);
    setFtStep('confirm');
  };

  const handleConfirmSlot = async () => {
    if (!ftSelectedSlot || !ftTitle.trim()) return;

    setFtConfirmLoading(true);
    setFtError(null);

    try {
      const res = await fetch('/api/find-time/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: ftTitle.trim(),
          startAt: ftSelectedSlot.startAt,
          endAt: ftSelectedSlot.endAt,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          visibility: ftVisibility,
          coverMode: 'NONE',
          locationName: ftLocation.trim() || undefined,
          inviteeIds: selectedFriends,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create event');
      }

      const data = await res.json();
      setShowFindTime(false);
      router.push(`/app/events/${data.eventId}`);
    } catch (err) {
      setFtError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setFtConfirmLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50">
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-200/10 rounded-full blur-3xl" />
      </div>

      {/* Page content */}
      <div className="relative z-10 container max-w-7xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Calendar</h1>
          <p className="text-slate-600">
            View and manage your events with friends
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-600">Loading your calendar...</div>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            Error: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Calendar grid - main content */}
            <div className="lg:col-span-2">
              <CalendarGrid events={events} onEventClick={handleEventClick} />
            </div>

            {/* Agenda list - sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-4">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">
                  Upcoming Events
                </h2>
                <AgendaList events={events} onEventClick={handleEventClick} />

                <Link
                  href="/app/events/new"
                  className="block mt-6 px-6 py-3 text-center bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white font-semibold rounded-full backdrop-blur-md border border-white/30 shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  Create Event
                </Link>

                <button
                  onClick={openFindTime}
                  className="block w-full mt-3 px-6 py-3 text-center bg-white hover:bg-slate-50 text-slate-900 font-semibold rounded-full border border-slate-200 shadow-md hover:shadow-lg transition-all duration-300"
                >
                  Find Time
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Event detail modal */}
        {selectedEvent && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedEvent(null)}
          >
            <div
              className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {selectedEvent.title}
                  </h2>
                  <p className="text-slate-600 mt-1">
                    {new Date(selectedEvent.startAt).toLocaleString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}{' '}
                    -{' '}
                    {new Date(selectedEvent.endAt).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  &#x2715;
                </button>
              </div>

              <div className="flex gap-3">
                <Link
                  href={`/app/events/${selectedEvent.id}`}
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors text-center"
                >
                  View Details
                </Link>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Find Time Modal */}
        {showFindTime && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowFindTime(false)}
          >
            <div
              className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Find Time</h2>
                <button
                  onClick={() => setShowFindTime(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  &#x2715;
                </button>
              </div>

              {ftError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {ftError}
                </div>
              )}

              {/* Step 1: Search */}
              {ftStep === 'search' && (
                <div className="space-y-6">
                  {/* Friend selector */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Select Friends
                    </label>
                    {friends.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No accepted friends yet.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {friends.map((f) => (
                          <label
                            key={f.user.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedFriends.includes(f.user.id)}
                              onChange={() => toggleFriend(f.user.id)}
                              className="w-4 h-4 rounded"
                            />
                            <span className="text-sm text-slate-900">
                              {f.user.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Date range */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Search Range
                    </label>
                    <select
                      value={ftDays}
                      onChange={(e) => setFtDays(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    >
                      <option value={3}>Next 3 days</option>
                      <option value={7}>Next 7 days</option>
                      <option value={14}>Next 14 days</option>
                    </select>
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Duration
                    </label>
                    <select
                      value={ftDuration}
                      onChange={(e) => setFtDuration(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    >
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hours</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </div>

                  <button
                    onClick={handleFindSlots}
                    disabled={ftLoading}
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
                  >
                    {ftLoading ? 'Finding slots...' : 'Find Slots'}
                  </button>
                </div>
              )}

              {/* Step 2: Results */}
              {ftStep === 'results' && (
                <div className="space-y-4">
                  <button
                    onClick={() => setFtStep('search')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    &larr; Back to search
                  </button>

                  {ftSlots.length === 0 ? (
                    <p className="text-slate-600 text-center py-8">
                      No available slots found. Try a different range or
                      duration.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-600 mb-3">
                        {ftSlots.length} slot{ftSlots.length !== 1 ? 's' : ''}{' '}
                        found:
                      </p>
                      {ftSlots.map((slot, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelectSlot(slot)}
                          className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all"
                        >
                          <p className="font-semibold text-slate-900">
                            {new Date(slot.startAt).toLocaleDateString(
                              'en-US',
                              {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              }
                            )}
                          </p>
                          <p className="text-sm text-slate-600">
                            {new Date(slot.startAt).toLocaleTimeString(
                              'en-US',
                              {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                              }
                            )}{' '}
                            &ndash;{' '}
                            {new Date(slot.endAt).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Confirm */}
              {ftStep === 'confirm' && ftSelectedSlot && (
                <div className="space-y-6">
                  <button
                    onClick={() => setFtStep('results')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    &larr; Back to slots
                  </button>

                  <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100">
                    <p className="font-semibold text-slate-900">
                      {new Date(ftSelectedSlot.startAt).toLocaleDateString(
                        'en-US',
                        {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        }
                      )}
                    </p>
                    <p className="text-sm text-slate-600">
                      {new Date(ftSelectedSlot.startAt).toLocaleTimeString(
                        'en-US',
                        {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }
                      )}{' '}
                      &ndash;{' '}
                      {new Date(ftSelectedSlot.endAt).toLocaleTimeString(
                        'en-US',
                        {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Event Title *
                    </label>
                    <input
                      type="text"
                      value={ftTitle}
                      onChange={(e) => setFtTitle(e.target.value)}
                      placeholder="e.g. Team lunch"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Location (optional)
                    </label>
                    <input
                      type="text"
                      value={ftLocation}
                      onChange={(e) => setFtLocation(e.target.value)}
                      placeholder="e.g. Cafe on Main St"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Visibility
                    </label>
                    <select
                      value={ftVisibility}
                      onChange={(e) => setFtVisibility(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    >
                      <option value="PRIVATE">Private</option>
                      <option value="FRIENDS">Friends</option>
                      <option value="PUBLIC">Public</option>
                    </select>
                  </div>

                  <button
                    onClick={handleConfirmSlot}
                    disabled={!ftTitle.trim() || ftConfirmLoading}
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
                  >
                    {ftConfirmLoading
                      ? 'Creating event...'
                      : 'Create Event & Send Invites'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
