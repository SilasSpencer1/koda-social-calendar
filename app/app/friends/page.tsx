'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserSummary {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

interface FriendEntry {
  id: string;
  user: UserSummary;
  status: string;
  canViewCalendar: boolean;
  detailLevel: string;
  createdAt: string;
}

interface SearchResult extends UserSummary {
  relationshipStatus: string | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  locationName: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FriendsPage() {
  // Friends lists
  const [accepted, setAccepted] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<FriendEntry[]>([]);
  const [outgoing, setOutgoing] = useState<FriendEntry[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);

  // Search
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Calendar preview
  const [viewingCalendar, setViewingCalendar] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarPermission, setCalendarPermission] = useState<{
    allowed: boolean;
    detailLevel: string | null;
  } | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarFriendName, setCalendarFriendName] = useState('');

  // Feedback
  const [actionMessage, setActionMessage] = useState('');

  // Refs for dialog a11y
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // -------------------------------------------------------------------------
  // Fetch friends
  // -------------------------------------------------------------------------

  const fetchFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const res = await fetch('/api/friends');
      if (!res.ok) return;
      const data = await res.json();
      setAccepted(data.accepted ?? []);
      setIncoming(data.incomingPending ?? []);
      setOutgoing(data.outgoingPending ?? []);
    } catch {
      // Network error — keep existing state, surface nothing disruptive
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  // -------------------------------------------------------------------------
  // Search users
  // -------------------------------------------------------------------------

  const handleSearch = async (preserveMessage = false) => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    if (!preserveMessage) setActionMessage('');
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch {
      setActionMessage('Search failed. Please try again.');
    } finally {
      setSearching(false);
      setHasSearched(true);
    }
  };

  // -------------------------------------------------------------------------
  // Send friend request
  // -------------------------------------------------------------------------

  const sendRequest = async (targetUserId: string) => {
    setActionMessage('');
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });
      if (res.ok) {
        setActionMessage('Friend request sent');
        await fetchFriends();
        // Refresh search results to update relationship status (preserve the success message)
        if (query.trim()) await handleSearch(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setActionMessage(data.error || 'Failed to send request');
      }
    } catch {
      setActionMessage('Network error. Please try again.');
    }
  };

  // -------------------------------------------------------------------------
  // Accept / decline
  // -------------------------------------------------------------------------

  const respondToRequest = async (
    friendshipId: string,
    action: 'accept' | 'decline'
  ) => {
    setActionMessage('');
    try {
      const res = await fetch(`/api/friends/request/${friendshipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setActionMessage(
          action === 'accept'
            ? 'Friend request accepted'
            : 'Friend request declined'
        );
        await fetchFriends();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionMessage(data.error || 'Failed to respond');
      }
    } catch {
      setActionMessage('Network error. Please try again.');
    }
  };

  // -------------------------------------------------------------------------
  // Remove friend
  // -------------------------------------------------------------------------

  const removeFriend = async (friendshipId: string) => {
    setActionMessage('');
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setActionMessage('Friend removed');
        await fetchFriends();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionMessage(data.error || 'Failed to remove friend');
      }
    } catch {
      setActionMessage('Network error. Please try again.');
    }
  };

  // -------------------------------------------------------------------------
  // View friend calendar
  // -------------------------------------------------------------------------

  const viewCalendar = async (friendUserId: string, friendName: string) => {
    setCalendarLoading(true);
    setViewingCalendar(friendUserId);
    setCalendarFriendName(friendName);
    setCalendarEvents([]);
    setCalendarPermission(null);

    // Fetch events for the next 30 days
    const from = new Date();
    const to = new Date(Date.now() + 30 * 86_400_000);
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });

    try {
      const res = await fetch(
        `/api/calendars/friends/${friendUserId}?${params.toString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(data.events ?? []);
        setCalendarPermission(data.permission ?? null);
      } else if (res.status === 403) {
        setCalendarPermission({ allowed: false, detailLevel: null });
      }
    } catch {
      setActionMessage('Failed to load calendar. Please try again.');
      setViewingCalendar(null);
    } finally {
      setCalendarLoading(false);
    }
  };

  const closeCalendar = () => {
    setViewingCalendar(null);
    setCalendarEvents([]);
    setCalendarPermission(null);
  };

  // -------------------------------------------------------------------------
  // Dialog keyboard handling
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!viewingCalendar) return;

    // Focus the close button when the dialog opens
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCalendar();
        return;
      }

      // Trap focus within the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewingCalendar]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const UserAvatar = ({ user }: { user: UserSummary }) => (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
      {user.name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );

  const dialogLabelId = 'calendar-dialog-title';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-4xl">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">Friends</h1>

      {/* Action feedback */}
      {actionMessage && (
        <div className="mb-6 rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {actionMessage}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Search */}
      {/* ----------------------------------------------------------------- */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-gray-800">
          Find Friends
        </h2>
        <div className="flex gap-2">
          <input
            id="friend-search"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Reset search state when input changes so stale "No users found"
              // doesn't show before a new search is performed
              if (hasSearched) {
                setHasSearched(false);
                setSearchResults([]);
              }
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name, username, or email"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Button
            onClick={() => handleSearch()}
            disabled={searching || !query.trim()}
          >
            {searching ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {searchResults.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200">
            {searchResults.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar user={r} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {r.name}
                    </p>
                    {r.username && (
                      <p className="text-xs text-gray-500">@{r.username}</p>
                    )}
                  </div>
                </div>
                {r.relationshipStatus === 'friends' ? (
                  <span className="text-xs font-medium text-green-700">
                    Already friends
                  </span>
                ) : r.relationshipStatus === 'pending_outgoing' ||
                  r.relationshipStatus === 'pending_incoming' ? (
                  <span className="text-xs font-medium text-yellow-700">
                    Request pending
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => sendRequest(r.id)}
                    className=""
                  >
                    Add Friend
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {searchResults.length === 0 && hasSearched && !searching && (
          <p className="mt-3 text-sm text-gray-500">No users found.</p>
        )}
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Incoming requests */}
      {/* ----------------------------------------------------------------- */}
      {incoming.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-gray-800">
            Incoming Requests ({incoming.length})
          </h2>
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {incoming.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar user={f.user} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {f.user.name}
                    </p>
                    {f.user.username && (
                      <p className="text-xs text-gray-500">
                        @{f.user.username}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => respondToRequest(f.id, 'accept')}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respondToRequest(f.id, 'decline')}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Outgoing requests */}
      {/* ----------------------------------------------------------------- */}
      {outgoing.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-gray-800">
            Sent Requests ({outgoing.length})
          </h2>
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {outgoing.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar user={f.user} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {f.user.name}
                    </p>
                    {f.user.username && (
                      <p className="text-xs text-gray-500">
                        @{f.user.username}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs font-medium text-yellow-700">
                  Pending
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Accepted friends */}
      {/* ----------------------------------------------------------------- */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">
          Your Friends ({accepted.length})
        </h2>

        {friendsLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : accepted.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-6 py-8 text-center">
            <p className="text-gray-600">
              No friends yet. Use the search above to find people and send a
              request.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {accepted.map((f) => (
              <li key={f.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={f.user} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {f.user.name}
                      </p>
                      {f.user.username && (
                        <p className="text-xs text-gray-500">
                          @{f.user.username}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => viewCalendar(f.user.id, f.user.name)}
                      className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    >
                      View Calendar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeFriend(f.id)}
                      className="border-red-300 text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Calendar dialog */}
      {/* ----------------------------------------------------------------- */}
      {viewingCalendar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            // Close when clicking the backdrop
            if (e.target === e.currentTarget) closeCalendar();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogLabelId}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3
                id={dialogLabelId}
                className="text-lg font-semibold text-gray-900"
              >
                {calendarFriendName}&apos;s Calendar
              </h3>
              <Button
                ref={closeBtnRef}
                size="sm"
                variant="outline"
                onClick={closeCalendar}
              >
                Close
              </Button>
            </div>

            {calendarLoading ? (
              <p className="text-sm text-gray-500">Loading calendar...</p>
            ) : calendarPermission && !calendarPermission.allowed ? (
              <p className="text-sm text-gray-500">
                This user&apos;s calendar is private. You don&apos;t have
                permission to view it.
              </p>
            ) : calendarEvents.length === 0 ? (
              <p className="text-sm text-gray-500">
                No upcoming events in the next 30 days.
              </p>
            ) : (
              <div>
                {calendarPermission && (
                  <p className="mb-3 text-xs text-gray-400">
                    Viewing as:{' '}
                    {calendarPermission.detailLevel === 'DETAILS'
                      ? 'Full details'
                      : 'Busy/free only'}
                  </p>
                )}
                <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
                  {calendarEvents.map((ev) => (
                    <li key={ev.id} className="py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {ev.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(ev.startAt)} &mdash; {formatDate(ev.endAt)}
                      </p>
                      {ev.locationName && (
                        <p className="text-xs text-gray-400">
                          {ev.locationName}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
