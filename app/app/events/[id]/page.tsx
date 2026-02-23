'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

interface Attendee {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  status: string;
  role: string;
}

interface Event {
  id: string;
  title: string;
  description: string | null;
  locationName: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  visibility: string;
  coverMode: string;
  ownerId: string;
  owner: {
    id: string;
    name: string;
    email: string;
  };
  attendees: Attendee[];
}

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rsvpStatus, setRsvpStatus] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvent() {
      if (!eventId) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/events/${eventId}`);
        if (!response.ok) {
          throw new Error('Failed to load event');
        }
        const data = await response.json();
        setEvent(data);

        // Get current user from session
        const sessionResponse = await fetch('/api/auth/session');
        if (sessionResponse.ok) {
          const session = await sessionResponse.json();
          setCurrentUserId(session.user?.id);

          // Find current user's attendance
          const attendee = data.attendees.find(
            (a: Attendee) => a.userId === session.user?.id
          );
          if (attendee) {
            setRsvpStatus(attendee.status);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchEvent();
  }, [eventId]);

  const handleRSVP = async (status: 'GOING' | 'DECLINED') => {
    try {
      const response = await fetch(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error('Failed to update RSVP');
      }

      setRsvpStatus(status);
      // Refresh event data
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (eventResponse.ok) {
        const data = await eventResponse.json();
        setEvent(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleAnonymityToggle = async (anonymous: boolean) => {
    try {
      const response = await fetch(`/api/events/${eventId}/anonymity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anonymity: anonymous ? 'ANONYMOUS' : 'NAMED',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update anonymity');
      }

      setIsAnonymous(anonymous);
      // Refresh event data
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (eventResponse.ok) {
        const data = await eventResponse.json();
        setEvent(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50">
        <div className="container max-w-4xl mx-auto px-4 py-12">
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-600">Loading event...</div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50">
        <div className="container max-w-4xl mx-auto px-4 py-12">
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            {error || 'Event not found'}
          </div>
          <Link
            href="/app/calendar"
            className="mt-4 inline-block px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg"
          >
            Back to Calendar
          </Link>
        </div>
      </main>
    );
  }

  const isOwner = currentUserId === event.ownerId;
  const isAttendee = event.attendees.some((a) => a.userId === currentUserId);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-200/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container max-w-4xl mx-auto px-4 py-12">
        <Link
          href="/app/calendar"
          className="inline-block mb-6 text-blue-600 hover:text-blue-700 font-semibold"
        >
          ← Back to Calendar
        </Link>

        <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-white/30 p-8 shadow-xl">
          {/* Event header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              {event.title}
            </h1>
            <p className="text-slate-600 text-lg">
              {new Date(event.startAt).toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}{' '}
              -{' '}
              {new Date(event.endAt).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </p>

            {event.locationName && (
              <p className="text-slate-600 mt-2">{event.locationName}</p>
            )}
            {event.description && (
              <p className="text-slate-700 mt-4">{event.description}</p>
            )}
          </div>

          {/* Host info */}
          <div className="mb-8 p-4 rounded-xl bg-blue-50/50 border border-blue-100">
            <p className="text-sm text-slate-600">
              Hosted by{' '}
              <span className="font-semibold text-slate-900">
                {event.owner.name}
              </span>
            </p>
          </div>

          {/* RSVP section */}
          {!isOwner && isAttendee && (
            <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-blue-50 to-violet-50 border border-white/50">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Your Response
              </h2>
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => handleRSVP('GOING')}
                  className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                    rsvpStatus === 'GOING'
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Going
                </button>
                <button
                  onClick={() => handleRSVP('DECLINED')}
                  className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                    rsvpStatus === 'DECLINED'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Decline
                </button>
              </div>

              {/* Anonymity toggle */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => handleAnonymityToggle(e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-sm text-slate-700">
                    Attend anonymously (host cannot see your name)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Attendees list */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Attendees ({event.attendees.length})
            </h2>
            <div className="space-y-2">
              {event.attendees.map((attendee) => (
                <div
                  key={attendee.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">
                      {attendee.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {attendee.status === 'GOING' && 'Going'}
                      {attendee.status === 'DECLINED' && 'Declined'}
                      {attendee.status === 'INVITED' && '? Invited'}
                    </p>
                  </div>
                  {attendee.role === 'HOST' && (
                    <span className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full">
                      Host
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Public event link */}
          {event.visibility === 'PUBLIC' && (
            <div className="mt-6 p-4 rounded-xl bg-green-50/50 border border-green-100">
              <p className="text-sm text-slate-600 mb-2">
                This is a{' '}
                <span className="font-semibold text-green-700">
                  public event
                </span>
                . Share the link:
              </p>
              <Link
                href={`/app/public/events/${event.id}`}
                className="text-blue-600 hover:text-blue-700 font-semibold text-sm break-all"
              >
                {typeof window !== 'undefined' ? window.location.origin : ''}
                /app/public/events/{event.id}
              </Link>
            </div>
          )}

          {/* Owner actions */}
          {isOwner && (
            <div className="mt-8 pt-8 border-t border-slate-200">
              {/* Visibility toggle */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Event Visibility
                </label>
                <select
                  value={event.visibility}
                  onChange={async (e) => {
                    const newVisibility = e.target.value;
                    const previousVisibility = event.visibility;
                    // Optimistic update
                    setEvent((prev) =>
                      prev ? { ...prev, visibility: newVisibility } : prev
                    );
                    try {
                      const res = await fetch(`/api/events/${event.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ visibility: newVisibility }),
                      });
                      if (!res.ok) {
                        throw new Error('Failed to update visibility');
                      }
                    } catch {
                      // Revert on failure
                      setEvent((prev) =>
                        prev
                          ? { ...prev, visibility: previousVisibility }
                          : prev
                      );
                      setError('Failed to update event visibility');
                    }
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
                >
                  <option value="PRIVATE">Private</option>
                  <option value="FRIENDS">Friends</option>
                  <option value="PUBLIC">Public</option>
                </select>
              </div>

              <div className="flex gap-3">
                <Link
                  href={`/app/events/${event.id}/edit`}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
                >
                  Edit
                </Link>
                <button
                  onClick={() => {
                    if (
                      confirm('Are you sure you want to delete this event?')
                    ) {
                      fetch(`/api/events/${event.id}`, {
                        method: 'DELETE',
                      }).then(() => router.push('/app/calendar'));
                    }
                  }}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
