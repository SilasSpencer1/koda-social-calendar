'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Bell,
  Calendar,
  UserPlus,
  CheckCircle2,
  XCircle,
  Check,
  X,
  Clock,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

interface Notification {
  id: string;
  type:
    | 'EVENT_INVITE'
    | 'JOIN_REQUEST'
    | 'JOIN_REQUEST_APPROVED'
    | 'JOIN_REQUEST_DENIED';
  title: string;
  body: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
  /** Enrichment: current attendee status from DB (EVENT_INVITE only) */
  attendeeStatus?: 'INVITED' | 'GOING' | 'DECLINED' | null;
  /** Enrichment: extracted event ID (EVENT_INVITE only) */
  eventId?: string | null;
  /** Enrichment: whether the event has already ended */
  isPast?: boolean;
}

/** Transient UI state for in-flight RSVP calls */
type InFlightState = 'accepting' | 'declining';

// ── Helpers ──────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function typeIcon(type: Notification['type']) {
  switch (type) {
    case 'EVENT_INVITE':
      return <Calendar className="h-5 w-5 text-blue-500" />;
    case 'JOIN_REQUEST':
      return <UserPlus className="h-5 w-5 text-violet-500" />;
    case 'JOIN_REQUEST_APPROVED':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'JOIN_REQUEST_DENIED':
      return <XCircle className="h-5 w-5 text-red-400" />;
    default:
      return <Bell className="h-5 w-5 text-gray-400" />;
  }
}

// ── Component ────────────────────────────────────────────────

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  /** Tracks only in-flight RSVP calls; once the call finishes we update
   *  the notification's `attendeeStatus` in state so it persists. */
  const [inFlight, setInFlight] = useState<Record<string, InFlightState>>({});

  // Load notifications (enriched with attendeeStatus + isPast)
  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Mark a single notification as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch {
      // Silently fail
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // Silently fail
    }
  }, []);

  // RSVP to an event invite (accept / decline)
  const handleRsvp = useCallback(
    async (
      notificationId: string,
      eventId: string,
      status: 'GOING' | 'DECLINED'
    ) => {
      setInFlight((prev) => ({
        ...prev,
        [notificationId]: status === 'GOING' ? 'accepting' : 'declining',
      }));

      try {
        const res = await fetch(`/api/events/${eventId}/rsvp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });

        if (res.ok) {
          // Persist the new status directly in the notification state
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === notificationId
                ? { ...n, attendeeStatus: status, isRead: true }
                : n
            )
          );
          // Fire-and-forget: mark notification read on server
          markAsRead(notificationId);
        } else {
          const data = await res.json().catch(() => ({}));
          alert(data.error || 'Failed to respond');
        }
      } catch {
        alert('Something went wrong. Try again.');
      } finally {
        setInFlight((prev) => {
          const next = { ...prev };
          delete next[notificationId];
          return next;
        });
      }
    },
    [markAsRead]
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="mt-1 text-sm text-gray-500">
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex gap-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Bell className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            No notifications yet
          </h3>
          <p className="text-sm text-gray-500">
            When someone invites you to an event or sends a join request, it
            will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const isInvite = notification.type === 'EVENT_INVITE';
            const eventId = notification.eventId ?? null;
            const attendeeStatus = notification.attendeeStatus ?? null;
            const isPast = notification.isPast ?? false;
            const flight = inFlight[notification.id];

            return (
              <div
                key={notification.id}
                className={`rounded-xl border bg-white p-4 transition-colors ${
                  notification.isRead
                    ? 'border-gray-100'
                    : 'border-blue-200 bg-blue-50/30'
                }`}
              >
                <div className="flex gap-3">
                  {/* Icon */}
                  <div className="mt-0.5 shrink-0">
                    {typeIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {notification.title}
                        </p>
                        <p className="mt-0.5 text-sm text-gray-600">
                          {notification.body}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-gray-400">
                        {timeAgo(notification.createdAt)}
                      </span>
                    </div>

                    {/* ── EVENT_INVITE action area ── */}
                    {isInvite && eventId && (
                      <div className="mt-3 flex items-center gap-2">
                        {/* In-flight spinner */}
                        {flight && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                            <Clock className="h-3.5 w-3.5 animate-spin" />
                            {flight === 'accepting'
                              ? 'Accepting...'
                              : 'Declining...'}
                          </span>
                        )}

                        {/* Already accepted (from DB or just-accepted) */}
                        {!flight && attendeeStatus === 'GOING' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Accepted -- on your calendar
                          </span>
                        )}

                        {/* Already declined */}
                        {!flight && attendeeStatus === 'DECLINED' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
                            <XCircle className="h-3.5 w-3.5" />
                            Declined
                          </span>
                        )}

                        {/* Past event that was never responded to */}
                        {!flight && attendeeStatus === 'INVITED' && isPast && (
                          <span className="text-xs text-gray-400">
                            This event has already passed.
                          </span>
                        )}

                        {/* Can still respond: INVITED + not past + not in flight */}
                        {!flight && attendeeStatus === 'INVITED' && !isPast && (
                          <>
                            <button
                              onClick={() =>
                                handleRsvp(notification.id, eventId, 'GOING')
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Accept
                            </button>
                            <button
                              onClick={() =>
                                handleRsvp(notification.id, eventId, 'DECLINED')
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                              Decline
                            </button>
                          </>
                        )}

                        {/* Attendee record removed / event deleted */}
                        {!flight && attendeeStatus === null && (
                          <span className="text-xs text-gray-400">
                            Invitation no longer available.
                          </span>
                        )}

                        {/* View event link */}
                        <Link
                          href={notification.href || '#'}
                          className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          View event
                        </Link>
                      </div>
                    )}

                    {/* For join requests (host view) - link to event to manage */}
                    {notification.type === 'JOIN_REQUEST' &&
                      notification.href && (
                        <div className="mt-3">
                          <Link
                            href={notification.href}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700"
                          >
                            Review request
                          </Link>
                        </div>
                      )}

                    {/* For approval/denial results - link to event */}
                    {(notification.type === 'JOIN_REQUEST_APPROVED' ||
                      notification.type === 'JOIN_REQUEST_DENIED') &&
                      notification.href && (
                        <div className="mt-3">
                          <Link
                            href={notification.href}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700"
                          >
                            View event
                          </Link>
                        </div>
                      )}

                    {/* Mark as read (if unread and no inline action available) */}
                    {!notification.isRead &&
                      !(
                        isInvite &&
                        eventId &&
                        attendeeStatus === 'INVITED' &&
                        !isPast
                      ) && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="mt-2 text-xs text-gray-400 hover:text-gray-600"
                        >
                          Mark as read
                        </button>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
