'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface AttendeeDTO {
  id: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  status: string;
  role: string;
}

interface EventDTO {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  locationName: string | null;
  hostId: string;
  visibility: string;
  owner: { id: string; name: string; avatarUrl: string | null };
}

interface JoinRequestDTO {
  id: string;
  requesterId: string;
  status: string;
  createdAt: string;
  requester: { id: string; name: string; avatarUrl: string | null };
}

interface ViewerState {
  isHost: boolean;
  isAttendee: boolean;
  joinRequestStatus: string | null;
}

export default function PublicEventPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventDTO | null>(null);
  const [attendees, setAttendees] = useState<AttendeeDTO[]>([]);
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<string | null>(null);

  const fetchEvent = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/events/${eventId}`);
      if (!response.ok) {
        throw new Error('Event not found or not accessible');
      }
      const data = await response.json();
      setEvent(data.event);
      setAttendees(data.attendees);
      setViewerState(data.viewerState);

      // If attendee, find RSVP status
      if (data.viewerState.isAttendee) {
        const sessionRes = await fetch('/api/auth/session');
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          const myAttendee = data.attendees.find(
            (a: AttendeeDTO) => a.userId === session.user?.id
          );
          if (myAttendee) {
            setRsvpStatus(myAttendee.status);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const fetchJoinRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/events/${eventId}/join-requests`);
      if (res.ok) {
        const data = await res.json();
        setJoinRequests(data);
      }
    } catch {
      // Silently fail — non-hosts get 403
    }
  }, [eventId]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  useEffect(() => {
    if (viewerState?.isHost) {
      fetchJoinRequests();
    }
  }, [viewerState?.isHost, fetchJoinRequests]);

  const handleJoinRequest = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/public/events/${eventId}/join-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send join request');
      }
      await fetchEvent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelJoinRequest = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/public/events/${eventId}/join-request`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to cancel join request');
      }
      await fetchEvent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveOrDeny = async (
    requestId: string,
    action: 'approve' | 'deny'
  ) => {
    setActionLoading(true);
    try {
      const res = await fetch(
        `/api/public/events/${eventId}/join-requests/${requestId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action}`);
      }
      await Promise.all([fetchEvent(), fetchJoinRequests()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRSVP = async (status: 'GOING' | 'DECLINED') => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        throw new Error('Failed to update RSVP');
      }
      setRsvpStatus(status);
      await fetchEvent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(false);
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

  const pendingRequests = joinRequests.filter((r) => r.status === 'PENDING');

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
          &larr; Back to Calendar
        </Link>

        <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-white/30 p-8 shadow-xl">
          {/* Public badge */}
          <div className="mb-4">
            <span className="px-3 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full">
              Public Event
            </span>
          </div>

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
                timeZone: event.timezone,
              })}{' '}
              &ndash;{' '}
              {new Date(event.endAt).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: event.timezone,
              })}
            </p>

            {event.locationName && (
              <p className="text-slate-600 mt-2">
                <span className="mr-1">&#x1F4CD;</span>
                {event.locationName}
              </p>
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

          {/* RSVP section for attendees */}
          {viewerState?.isAttendee && !viewerState?.isHost && (
            <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-blue-50 to-violet-50 border border-white/50">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Your Response
              </h2>
              <div className="flex gap-3">
                <button
                  onClick={() => handleRSVP('GOING')}
                  disabled={actionLoading}
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
                  disabled={actionLoading}
                  className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-all ${
                    rsvpStatus === 'DECLINED'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Declined
                </button>
              </div>
            </div>
          )}

          {/* Join request section for non-attendees */}
          {!viewerState?.isAttendee && !viewerState?.isHost && (
            <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-violet-50 to-blue-50 border border-white/50">
              {viewerState?.joinRequestStatus === 'PENDING' ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="inline-block px-3 py-1 text-sm font-semibold bg-yellow-100 text-yellow-800 rounded-full">
                      Pending approval
                    </span>
                    <p className="text-sm text-slate-600 mt-2">
                      Your request to join this event is awaiting host approval.
                    </p>
                  </div>
                  <button
                    onClick={handleCancelJoinRequest}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : viewerState?.joinRequestStatus === 'APPROVED' ? (
                <div>
                  <span className="inline-block px-3 py-1 text-sm font-semibold bg-green-100 text-green-800 rounded-full">
                    Approved
                  </span>
                  <p className="text-sm text-slate-600 mt-2">
                    Your request was approved! Refresh to see your RSVP
                    controls.
                  </p>
                </div>
              ) : viewerState?.joinRequestStatus === 'DENIED' ? (
                <div>
                  <span className="inline-block px-3 py-1 text-sm font-semibold bg-red-100 text-red-800 rounded-full">
                    Denied
                  </span>
                  <p className="text-sm text-slate-600 mt-2">
                    Your request to join this event was not approved.
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-slate-700 mb-4">
                    Want to attend? Request to join this event.
                  </p>
                  <button
                    onClick={handleJoinRequest}
                    disabled={actionLoading}
                    className="px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
                  >
                    {actionLoading ? 'Sending...' : 'Request to Join'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Attendees list */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Attendees ({attendees.length})
            </h2>
            <div className="space-y-2">
              {attendees.map((attendee) => (
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
                      {attendee.status === 'INVITED' && 'Invited'}
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

          {/* Host admin panel — join requests */}
          {viewerState?.isHost && pendingRequests.length > 0 && (
            <div className="mt-8 pt-8 border-t border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Join Requests ({pendingRequests.length})
              </h2>
              <div className="space-y-3">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {req.requester.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Requested {new Date(req.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveOrDeny(req.id, 'approve')}
                        disabled={actionLoading}
                        className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleApproveOrDeny(req.id, 'deny')}
                        disabled={actionLoading}
                        className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Host link to event management */}
          {viewerState?.isHost && (
            <div className="mt-8 pt-8 border-t border-slate-200">
              <Link
                href={`/app/events/${event.id}`}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
              >
                Manage Event
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
