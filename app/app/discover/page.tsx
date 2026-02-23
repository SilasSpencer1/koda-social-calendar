'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  mergeIntervals,
  invertToFree,
  type Interval,
} from '@/lib/availability';

// --------------- types ---------------

interface Preferences {
  city: string;
  radiusMiles: number;
  interests: string[];
}

interface Slot {
  start: string;
  end: string;
  label: string;
}

interface SuggestionCard {
  id: string;
  title: string;
  description?: string;
  category?: string;
  venueName?: string;
  address?: string;
  url?: string;
  imageUrl?: string;
  distanceMiles?: number;
  isOpenAtTime: string;
  confidence: string;
  status: string;
  source: string;
}

const INTEREST_OPTIONS = [
  'cafe',
  'restaurant',
  'bar',
  'nightlife',
  'music',
  'park',
  'outdoors',
  'museum',
  'art',
  'cinema',
  'theatre',
  'gym',
  'sports',
  'shopping',
  'food',
  'coffee',
];

// --------------- helpers ---------------

function generateFreeSlots(
  events: Array<{ startAt: string; endAt: string }>,
  days: number
): Slot[] {
  const now = new Date();
  const rangeEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const busy: Interval[] = events.map((e) => ({
    start: new Date(e.startAt).getTime(),
    end: new Date(e.endAt).getTime(),
  }));

  const merged = mergeIntervals(busy);
  const range: Interval = { start: now.getTime(), end: rangeEnd.getTime() };
  const free = invertToFree(merged, range);

  // Generate evening-ish slots (roughly 6pm-9pm each day) from free time
  const slots: Slot[] = [];

  for (let d = 0; d < days && slots.length < 14; d++) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() + d);

    // Try a few time windows per day
    const windows = [
      { hour: 10, label: 'Morning' },
      { hour: 12, label: 'Lunch' },
      { hour: 15, label: 'Afternoon' },
      { hour: 18, label: 'Evening' },
      { hour: 20, label: 'Night' },
    ];

    for (const w of windows) {
      const slotStart = new Date(dayDate);
      slotStart.setHours(w.hour, 0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + 3 * 60 * 60 * 1000); // 3h

      if (slotStart.getTime() < now.getTime()) continue;

      // Check if this slot overlaps with any free interval
      const isFree = free.some(
        (f) => f.start <= slotStart.getTime() && f.end >= slotEnd.getTime()
      );

      if (isFree) {
        const dayStr = slotStart.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: `${dayStr} ${w.label} (${slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${slotEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })})`,
        });
      }
    }
  }

  return slots;
}

// --------------- component ---------------

export default function DiscoverPage() {
  const router = useRouter();

  // Preferences
  const [prefs, setPrefs] = useState<Preferences>({
    city: '',
    radiusMiles: 10,
    interests: [],
  });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Slots
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Suggestions
  const [suggestions, setSuggestions] = useState<SuggestionCard[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load preferences
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/me/discover-preferences');
        if (res.ok) {
          const data = await res.json();
          setPrefs({
            city: data.city || '',
            radiusMiles: data.radiusMiles || 10,
            interests: data.interests || [],
          });
        }
      } catch {
        // ignore
      } finally {
        setPrefsLoading(false);
      }
    })();
  }, []);

  // Load free slots from events
  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const rangeEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const url = new URL('/api/events', window.location.origin);
        url.searchParams.set('from', now.toISOString());
        url.searchParams.set('to', rangeEnd.toISOString());

        const res = await fetch(url.toString());
        if (res.ok) {
          const events = await res.json();
          const freeSlots = generateFreeSlots(
            Array.isArray(events) ? events : [],
            7
          );
          setSlots(freeSlots);
        }
      } catch {
        // ignore — show default slots
      }
    })();
  }, []);

  // Save preferences
  const savePrefs = useCallback(
    async (updated: Partial<Preferences>) => {
      setPrefsSaving(true);
      const merged = { ...prefs, ...updated };
      setPrefs(merged);
      try {
        await fetch('/api/me/discover-preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merged),
        });
      } catch {
        // ignore
      } finally {
        setPrefsSaving(false);
      }
    },
    [prefs]
  );

  // Fetch suggestions for selected slot
  const fetchSuggestions = useCallback(
    async (slot: Slot) => {
      if (!prefs.city) {
        setSuggestionsError('Please enter your city above to get suggestions.');
        return;
      }

      setSuggestionsLoading(true);
      setSuggestionsError(null);
      setSuggestions([]);

      try {
        const url = new URL('/api/suggestions', window.location.origin);
        url.searchParams.set('slotStart', slot.start);
        url.searchParams.set('slotEnd', slot.end);

        const res = await fetch(url.toString());
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error || `Failed to fetch suggestions (${res.status})`
          );
        }

        const data = await res.json();
        setSuggestions(data);
      } catch (err) {
        setSuggestionsError(
          err instanceof Error ? err.message : 'Unknown error'
        );
      } finally {
        setSuggestionsLoading(false);
      }
    },
    [prefs.city]
  );

  const handleSlotClick = (slot: Slot) => {
    setSelectedSlot(slot);
    fetchSuggestions(slot);
  };

  const toggleInterest = (interest: string) => {
    const updated = prefs.interests.includes(interest)
      ? prefs.interests.filter((i) => i !== interest)
      : [...prefs.interests, interest];
    savePrefs({ interests: updated });
  };

  const handleAction = async (
    suggestionId: string,
    action: 'save' | 'dismiss' | 'add-to-calendar'
  ) => {
    setActionLoading(suggestionId);
    try {
      const res = await fetch(`/api/suggestions/${suggestionId}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Action failed');
      }

      if (action === 'add-to-calendar') {
        const data = await res.json();
        router.push(`/app/events/${data.eventId}`);
        return;
      }

      // Update local state
      if (action === 'dismiss') {
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
      } else {
        setSuggestions((prev) =>
          prev.map((s) =>
            s.id === suggestionId ? { ...s, status: 'SAVED' } : s
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  if (prefsLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50">
        <div className="container max-w-7xl mx-auto px-4 py-12">
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-600">Loading Discover...</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-200/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Discover</h1>
          <p className="text-slate-600">Find things to do in your free time</p>
        </div>

        {/* Preferences bar */}
        <div className="mb-8 bg-white/70 backdrop-blur-md rounded-2xl border border-white/30 p-6 shadow-lg">
          <div className="flex flex-wrap gap-4 items-end mb-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={prefs.city}
                onChange={(e) => setPrefs({ ...prefs, city: e.target.value })}
                onBlur={(e) => savePrefs({ city: e.target.value })}
                placeholder="e.g. New York"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <div className="w-40">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Radius ({prefs.radiusMiles} mi)
              </label>
              <input
                type="range"
                min={1}
                max={50}
                value={prefs.radiusMiles}
                onChange={(e) =>
                  setPrefs({ ...prefs, radiusMiles: Number(e.target.value) })
                }
                onMouseUp={(e) =>
                  savePrefs({
                    radiusMiles: Number((e.target as HTMLInputElement).value),
                  })
                }
                onTouchEnd={(e) =>
                  savePrefs({
                    radiusMiles: Number((e.target as HTMLInputElement).value),
                  })
                }
                className="w-full"
              />
            </div>
            {prefsSaving && (
              <span className="text-xs text-slate-500">Saving...</span>
            )}
          </div>

          {/* Interest chips */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Interests
            </label>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((interest) => (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    prefs.interests.includes(interest)
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main layout: slots + suggestions */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Slot rail */}
          <div className="lg:col-span-1">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              Free Slots
            </h2>
            {slots.length === 0 ? (
              <p className="text-sm text-slate-500">
                No free slots found in the next 7 days.
              </p>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {slots.map((slot) => (
                  <button
                    key={slot.start}
                    onClick={() => handleSlotClick(slot)}
                    className={`w-full text-left p-3 rounded-xl text-sm transition-all ${
                      selectedSlot?.start === slot.start
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'bg-white/70 border border-white/30 text-slate-700 hover:bg-blue-50'
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Suggestions panel */}
          <div className="lg:col-span-3">
            {!selectedSlot ? (
              <div className="flex items-center justify-center py-20 bg-white/50 rounded-2xl border border-white/30">
                <p className="text-slate-500">
                  Select a free slot to see suggestions
                </p>
              </div>
            ) : suggestionsLoading ? (
              <div className="flex items-center justify-center py-20 bg-white/50 rounded-2xl border border-white/30">
                <p className="text-slate-600">Loading suggestions...</p>
              </div>
            ) : suggestionsError ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {suggestionsError}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="flex items-center justify-center py-20 bg-white/50 rounded-2xl border border-white/30">
                <p className="text-slate-500">
                  No suggestions found for this slot. Try different interests or
                  a larger radius.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Low confidence banner */}
                {suggestions.some((s) => s.confidence === 'LOW') && (
                  <div className="p-3 rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                    Some suggestions have unknown opening hours. They may be
                    closed during this time.
                  </div>
                )}

                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/30 p-5 shadow-md flex gap-4"
                  >
                    {/* Image */}
                    {s.imageUrl && (
                      <div className="w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.imageUrl}
                          alt={s.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900 truncate">
                          {s.title}
                        </h3>
                        <div className="flex gap-1 flex-shrink-0">
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                              s.source === 'TICKETMASTER'
                                ? 'bg-violet-100 text-violet-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {s.source === 'TICKETMASTER' ? 'Event' : 'Place'}
                          </span>
                          {s.confidence === 'LOW' && (
                            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-yellow-100 text-yellow-700">
                              Hours unknown
                            </span>
                          )}
                        </div>
                      </div>

                      {s.category && (
                        <p className="text-xs text-slate-500 mb-1">
                          {s.category}
                        </p>
                      )}

                      {s.venueName && s.venueName !== s.title && (
                        <p className="text-sm text-slate-600">{s.venueName}</p>
                      )}

                      {s.address && (
                        <p className="text-xs text-slate-500 truncate">
                          {s.address}
                        </p>
                      )}

                      {s.distanceMiles != null && (
                        <p className="text-xs text-slate-500">
                          {s.distanceMiles} mi away
                        </p>
                      )}

                      {s.description && (
                        <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                          {s.description}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleAction(s.id, 'add-to-calendar')}
                          disabled={actionLoading === s.id}
                          className="px-3 py-1.5 text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          Add to Calendar
                        </button>
                        {s.status !== 'SAVED' ? (
                          <button
                            onClick={() => handleAction(s.id, 'save')}
                            disabled={actionLoading === s.id}
                            className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            Save
                          </button>
                        ) : (
                          <span className="px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 rounded-lg">
                            Saved
                          </span>
                        )}
                        <button
                          onClick={() => handleAction(s.id, 'dismiss')}
                          disabled={actionLoading === s.id}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                        {s.url && (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                          >
                            Details &rarr;
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
