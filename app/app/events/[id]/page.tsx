'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  MapPin,
  Users,
  Eye,
  Shield,
  Pencil,
  Trash2,
  Link2,
  CheckCircle2,
  XCircle,
  UserCheck,
} from 'lucide-react';

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
  const [linkCopied, setLinkCopied] = useState(false);

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

        const sessionResponse = await fetch('/api/auth/session');
        if (sessionResponse.ok) {
          const session = await sessionResponse.json();
          setCurrentUserId(session.user?.id);

          const attendee = data.attendees.find(
            (a: Attendee) => a.userId === session.user?.id
          );
          if (attendee) {
            setRsvpStatus(attendee.status);
            setIsAnonymous(attendee.anonymity === 'ANONYMOUS');
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

      if (!response.ok) throw new Error('Failed to update RSVP');

      setRsvpStatus(status);
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

      if (!response.ok) throw new Error('Failed to update anonymity');

      setIsAnonymous(anonymous);
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (eventResponse.ok) {
        const data = await eventResponse.json();
        setEvent(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/app/public/events/${event?.id}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-slate-500">Loading event...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="glass-panel rounded-2xl p-6 text-center">
          <p className="text-red-600 font-medium mb-4">
            {error || 'Event not found'}
          </p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const isOwner = currentUserId === event.ownerId;
  const isAttendee = event.attendees.some((a) => a.userId === currentUserId);
  const startTime = new Date(event.startAt);
  const endTime = new Date(event.endAt);

  const goingCount = event.attendees.filter((a) => a.status === 'GOING').length;
  const invitedCount = event.attendees.filter(
    (a) => a.status === 'INVITED'
  ).length;

  const visibilityConfig: Record<
    string,
    { label: string; icon: React.ReactNode; className: string }
  > = {
    PRIVATE: {
      label: 'Private',
      icon: <Shield className="size-3.5" />,
      className: 'bg-orange-50 text-orange-700 border-orange-200/50',
    },
    FRIENDS: {
      label: 'Friends',
      icon: <Users className="size-3.5" />,
      className: 'bg-blue-50 text-blue-700 border-blue-200/50',
    },
    PUBLIC: {
      label: 'Public',
      icon: <Eye className="size-3.5" />,
      className: 'bg-green-50 text-green-700 border-green-200/50',
    },
  };

  const vis = visibilityConfig[event.visibility] || visibilityConfig.FRIENDS;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 mb-6 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back
      </button>

      {/* Main card */}
      <div className="glass-panel rounded-3xl overflow-hidden">
        {/* Accent header bar */}
        <div
          className="h-2"
          style={{
            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6)',
            backgroundSize: '200% 100%',
          }}
        />

        <div className="p-8">
          {/* Title + badges */}
          <div className="mb-6">
            <div className="flex items-start justify-between gap-4 mb-3">
              <h1
                className="text-3xl font-bold text-slate-900 leading-tight"
                style={{ fontFamily: 'var(--font-fraunces, serif)' }}
              >
                {event.title}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${vis.className}`}
              >
                {vis.icon}
                {vis.label}
              </span>
            </div>

            {event.coverMode === 'BUSY_ONLY' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/50">
                <Shield className="size-3" />
                Shows as Busy to others
              </span>
            )}
          </div>

          {/* Event details grid */}
          <div className="grid gap-4 mb-8">
            {/* Date & Time */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Clock className="size-5 text-blue-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">
                  {startTime.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {startTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                  {' \u2013 '}
                  {endTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </p>
              </div>
            </div>

            {/* Location */}
            {event.locationName && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                  <MapPin className="size-5 text-violet-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">
                    {event.locationName}
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100">
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {event.description}
                </p>
              </div>
            )}
          </div>

          {/* Host card */}
          <div className="mb-8 flex items-center gap-3 p-4 rounded-2xl bg-blue-50/60 border border-blue-100/80">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-sm font-bold text-white">
              {event.owner.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {event.owner.name}
              </p>
              <p className="text-xs text-slate-500">Host</p>
            </div>
          </div>

          {/* RSVP section */}
          {!isOwner && isAttendee && (
            <div className="mb-8 p-6 rounded-2xl glass-card">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Your Response
              </h2>
              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => handleRSVP('GOING')}
                  className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                    rsvpStatus === 'GOING'
                      ? 'bg-green-500 text-white shadow-md shadow-green-500/25'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-green-50 hover:border-green-200 hover:text-green-700'
                  }`}
                >
                  <CheckCircle2 className="size-4" />
                  Going
                </button>
                <button
                  onClick={() => handleRSVP('DECLINED')}
                  className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                    rsvpStatus === 'DECLINED'
                      ? 'bg-red-500 text-white shadow-md shadow-red-500/25'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700'
                  }`}
                >
                  <XCircle className="size-4" />
                  Decline
                </button>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => handleAnonymityToggle(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">
                  Attend anonymously
                </span>
              </label>
            </div>
          )}

          {/* Attendees */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Attendees
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {goingCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <UserCheck className="size-3.5 text-green-500" />
                    {goingCount} going
                  </span>
                )}
                {invitedCount > 0 && <span>{invitedCount} pending</span>}
              </div>
            </div>
            <div className="space-y-2">
              {event.attendees.map((attendee) => (
                <div
                  key={attendee.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-600">
                      {attendee.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {attendee.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {attendee.status === 'GOING' && 'Going'}
                        {attendee.status === 'DECLINED' && 'Declined'}
                        {attendee.status === 'INVITED' && 'Invited'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {attendee.role === 'HOST' && (
                      <span className="px-2.5 py-1 text-[10px] font-semibold bg-blue-50 text-blue-600 rounded-full border border-blue-100">
                        Host
                      </span>
                    )}
                    {attendee.status === 'GOING' && (
                      <CheckCircle2 className="size-4 text-green-500" />
                    )}
                    {attendee.status === 'DECLINED' && (
                      <XCircle className="size-4 text-red-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Public event share */}
          {event.visibility === 'PUBLIC' && (
            <div className="mb-8 p-4 rounded-2xl bg-green-50/60 border border-green-100/80">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    Public Event
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    Share the link with anyone
                  </p>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-green-200 text-green-700 hover:bg-green-50 transition-colors"
                >
                  <Link2 className="size-3.5" />
                  {linkCopied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          )}

          {/* Owner actions */}
          {isOwner && (
            <div className="pt-6 border-t border-slate-100">
              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Event Visibility
                </label>
                <select
                  value={event.visibility}
                  onChange={async (e) => {
                    const newVisibility = e.target.value;
                    const previousVisibility = event.visibility;
                    setEvent((prev) =>
                      prev ? { ...prev, visibility: newVisibility } : prev
                    );
                    try {
                      const res = await fetch(`/api/events/${event.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ visibility: newVisibility }),
                      });
                      if (!res.ok) throw new Error();
                    } catch {
                      setEvent((prev) =>
                        prev
                          ? { ...prev, visibility: previousVisibility }
                          : prev
                      );
                      setError('Failed to update visibility');
                    }
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  <option value="PRIVATE">Private</option>
                  <option value="FRIENDS">Friends</option>
                  <option value="PUBLIC">Public</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    router.push(`/app/calendar?edit=${event.id}`);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]"
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    boxShadow: '0 4px 12px rgba(59,130,246,0.25)',
                  }}
                >
                  <Pencil className="size-4" />
                  Edit
                </button>
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="size-4" />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
