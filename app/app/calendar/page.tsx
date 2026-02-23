'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarGrid, AgendaList } from '@/components/calendar/CalendarGrid';
import { QuickAddPopover } from '@/components/calendar/QuickAddPopover';
import { EventEditorDialog } from '@/components/calendar/EventEditorDialog';
import { EventDetailsPopover } from '@/components/calendar/EventDetailsPopover';
import type { CalendarEvent, EventFormData } from '@/lib/schemas/event';

// ── Types ────────────────────────────────────────────────────

interface FriendEntry {
  id: string;
  user: { id: string; name: string; avatarUrl: string | null };
}

interface Slot {
  startAt: string;
  endAt: string;
}

// ── Helpers ──────────────────────────────────────────────────

function getWeekStart(base: Date): Date {
  const d = new Date(base);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Page ─────────────────────────────────────────────────────

export default function CalendarPage() {
  const router = useRouter();

  // ── Calendar state ─────────────────────────────────────
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // ── Quick Add popover ──────────────────────────────────
  const [quickAdd, setQuickAdd] = useState<{
    startDate: Date;
    endDate: Date;
    anchorX: number;
    anchorY: number;
  } | null>(null);

  // ── Event details popover ──────────────────────────────
  const [detailsPopover, setDetailsPopover] = useState<{
    event: CalendarEvent;
    anchorX: number;
    anchorY: number;
  } | null>(null);

  // ── Full editor dialog ─────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editorDefaults, setEditorDefaults] = useState<{
    start?: Date;
    end?: Date;
    title?: string;
  }>({});

  // ── Find Time state ────────────────────────────────────
  const [showFindTime, setShowFindTime] = useState(false);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
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

  // ── Fetch current user ID ──────────────────────────────
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const session = await res.json();
          setCurrentUserId(session.user?.id || null);
        }
      } catch {
        // Silently handle
      }
    }
    fetchUser();
  }, []);

  // ── Fetch events for current week ──────────────────────
  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const url = new URL('/api/events', window.location.origin);
      url.searchParams.set('from', weekStart.toISOString());
      url.searchParams.set('to', weekEnd.toISOString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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
  }, [weekStart]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // ── Week navigation ────────────────────────────────────

  const goToPrevWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const goToNextWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  // ── API: Create event ──────────────────────────────────

  const createEvent = async (data: EventFormData): Promise<{ id: string }> => {
    const payload = {
      title: data.title,
      description: data.description || undefined,
      locationName: data.locationName || undefined,
      startAt: data.startAt.toISOString(),
      endAt: data.endAt.toISOString(),
      timezone: data.timezone,
      visibility: data.visibility,
      coverMode: data.coverMode,
      syncToGoogle: data.syncToGoogle,
    };

    const res = await fetch('/api/events', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to create event');
    }

    const created = await res.json();

    // Invite guests if any
    if (data.guestIds.length > 0) {
      try {
        await fetch(`/api/events/${created.id}/invite`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: data.guestIds }),
        });
      } catch {
        console.error('Failed to send invites, but event was created');
      }
    }

    // Refresh events
    fetchEvents();
    return { id: created.id };
  };

  // ── API: Update event ──────────────────────────────────

  const updateEvent = async (
    data: EventFormData,
    eventId: string
  ): Promise<void> => {
    const payload = {
      title: data.title,
      description: data.description || undefined,
      locationName: data.locationName || undefined,
      startAt: data.startAt.toISOString(),
      endAt: data.endAt.toISOString(),
      timezone: data.timezone,
      visibility: data.visibility,
      coverMode: data.coverMode,
      syncToGoogle: data.syncToGoogle,
    };

    const res = await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to update event');
    }

    // Invite new guests if any
    if (data.guestIds.length > 0) {
      try {
        await fetch(`/api/events/${eventId}/invite`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: data.guestIds }),
        });
      } catch {
        console.error('Failed to send invites');
      }
    }

    fetchEvents();
  };

  // ── API: Delete event ──────────────────────────────────

  const deleteEvent = async (eventId: string): Promise<void> => {
    const res = await fetch(`/api/events/${eventId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to delete event');
    }

    fetchEvents();
  };

  // ── Handlers ───────────────────────────────────────────

  const handleSave = async (
    data: EventFormData,
    eventId?: string
  ): Promise<{ id: string } | void> => {
    if (eventId) {
      await updateEvent(data, eventId);
    } else {
      return await createEvent(data);
    }
  };

  // Quick add from grid click
  const handleQuickSave = async (data: {
    title: string;
    startAt: Date;
    endAt: Date;
  }) => {
    const formData: EventFormData = {
      title: data.title,
      description: '',
      locationName: '',
      startAt: data.startAt,
      endAt: data.endAt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      visibility: 'FRIENDS',
      coverMode: 'NONE',
      syncToGoogle: false,
      guestIds: [],
    };
    await createEvent(formData);
    setQuickAdd(null);
  };

  // Quick add -> "More options" opens full editor
  const handleMoreOptions = (data: {
    title: string;
    startAt: Date;
    endAt: Date;
  }) => {
    setQuickAdd(null);
    setEditingEvent(null);
    setEditorDefaults({
      start: data.startAt,
      end: data.endAt,
      title: data.title,
    });
    setEditorOpen(true);
  };

  // "Create" button -> open full editor with fresh defaults
  const handleCreateClick = () => {
    setEditingEvent(null);
    setEditorDefaults({});
    setEditorOpen(true);
  };

  // Click existing event on grid -> show details popover
  const handleEventClick = (
    event: CalendarEvent,
    anchorX: number,
    anchorY: number
  ) => {
    setQuickAdd(null);
    setDetailsPopover({ event, anchorX, anchorY });
  };

  // Click empty grid cell -> show quick add popover
  const handleEmptyCellClick = (
    startDate: Date,
    endDate: Date,
    anchorX: number,
    anchorY: number
  ) => {
    setDetailsPopover(null);
    setQuickAdd({ startDate, endDate, anchorX, anchorY });
  };

  // From details popover -> open full editor
  const handleEditFromDetails = () => {
    if (!detailsPopover) return;
    const evt = detailsPopover.event;
    setDetailsPopover(null);
    setEditingEvent(evt);
    setEditorDefaults({});
    setEditorOpen(true);
  };

  // From details popover -> delete
  const handleDeleteFromDetails = async () => {
    if (!detailsPopover) return;
    const eventId = detailsPopover.event.id;
    setDetailsPopover(null);
    await deleteEvent(eventId);
  };

  // From details popover -> navigate to full event page
  const handleViewDetails = () => {
    if (!detailsPopover) return;
    router.push(`/app/events/${detailsPopover.event.id}`);
    setDetailsPopover(null);
  };

  // Agenda list click -> show details popover centered
  const handleAgendaEventClick = (event: CalendarEvent) => {
    setDetailsPopover({
      event,
      anchorX: window.innerWidth / 2 - 180,
      anchorY: window.innerHeight / 3,
    });
  };

  // ── Find Time logic (preserved from original) ─────────

  const openFindTime = async () => {
    setShowFindTime(true);
    setFtStep('search');
    setFtSlots([]);
    setFtError(null);
    setFtSelectedSlot(null);
    setFtTitle('');
    setFtLocation('');

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

  // ── Render ─────────────────────────────────────────────

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
              <CalendarGrid
                events={events}
                weekStart={weekStart}
                onEventClick={(event, x, y) =>
                  handleEventClick(event as CalendarEvent, x, y)
                }
                onEmptyCellClick={handleEmptyCellClick}
                onCreateClick={handleCreateClick}
                onPrevWeek={goToPrevWeek}
                onNextWeek={goToNextWeek}
              />
            </div>

            {/* Agenda list - sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-4">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">
                  Upcoming Events
                </h2>
                <AgendaList
                  events={events}
                  onEventClick={(e) =>
                    handleAgendaEventClick(e as CalendarEvent)
                  }
                />

                <button
                  onClick={openFindTime}
                  className="block w-full mt-4 px-6 py-3 text-center bg-white hover:bg-slate-50 text-slate-900 font-semibold rounded-full border border-slate-200 shadow-md hover:shadow-lg transition-all duration-300"
                >
                  Find Time
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Quick Add Popover ────────────────────────── */}
        {quickAdd && (
          <QuickAddPopover
            anchorX={quickAdd.anchorX}
            anchorY={quickAdd.anchorY}
            defaultStart={quickAdd.startDate}
            defaultEnd={quickAdd.endDate}
            onSave={handleQuickSave}
            onMoreOptions={handleMoreOptions}
            onClose={() => setQuickAdd(null)}
          />
        )}

        {/* ── Event Details Popover ────────────────────── */}
        {detailsPopover && (
          <EventDetailsPopover
            event={detailsPopover.event}
            anchorX={detailsPopover.anchorX}
            anchorY={detailsPopover.anchorY}
            isOwner={detailsPopover.event.ownerId === currentUserId}
            onEdit={handleEditFromDetails}
            onDelete={handleDeleteFromDetails}
            onClose={() => setDetailsPopover(null)}
            onViewDetails={handleViewDetails}
          />
        )}

        {/* ── Full Event Editor Dialog ─────────────────── */}
        <EventEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          event={editingEvent}
          defaultStart={editorDefaults.start}
          defaultEnd={editorDefaults.end}
          defaultTitle={editorDefaults.title}
          onSave={handleSave}
          onDelete={deleteEvent}
        />

        {/* ── Find Time Modal (preserved) ──────────────── */}
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
                        {ftSlots.length} slot
                        {ftSlots.length !== 1 ? 's' : ''} found:
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
