'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CityAutocomplete } from '@/components/ui/CityAutocomplete';
import {
  mergeIntervals,
  invertToFree,
  type Interval,
} from '@/lib/availability';
import {
  MapPin,
  Clock,
  Star,
  X,
  ExternalLink,
  CalendarPlus,
  Bookmark,
  AlertTriangle,
  Compass,
  Search,
  Plus,
} from 'lucide-react';

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

// --------------- visual helpers ---------------

function getTimeOfDay(isoString: string): {
  label: string;
  accent: string;
} {
  const h = new Date(isoString).getHours();
  if (h < 12)
    return {
      label: 'Morning',
      accent: 'from-amber-400/20 to-orange-400/20',
    };
  if (h < 14)
    return {
      label: 'Midday',
      accent: 'from-orange-400/20 to-rose-400/20',
    };
  if (h < 17)
    return {
      label: 'Afternoon',
      accent: 'from-sky-400/20 to-blue-400/20',
    };
  if (h < 20)
    return {
      label: 'Evening',
      accent: 'from-violet-400/20 to-purple-400/20',
    };
  return {
    label: 'Night',
    accent: 'from-indigo-400/20 to-blue-400/20',
  };
}

function formatSlotDay(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatSlotTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// --------------- slot generation ---------------

function generateFreeSlots(
  events: Array<{ startAt: string; endAt: string }>,
  days: number
): Slot[] {
  const now = new Date();
  const minNoticeHours = 2; // require at least 2 hours notice
  const minNoticeMs = minNoticeHours * 60 * 60 * 1000;
  const slotDurationHours = 2; // 2-hour blocks

  const rangeEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const busy: Interval[] = events.map((e) => ({
    start: new Date(e.startAt).getTime(),
    end: new Date(e.endAt).getTime(),
  }));

  const merged = mergeIntervals(busy);
  const range: Interval = { start: now.getTime(), end: rangeEnd.getTime() };
  const free = invertToFree(merged, range);

  const slots: Slot[] = [];

  for (let d = 0; d < days && slots.length < 5; d++) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() + d);

    const windows = [
      { hour: 10, label: 'Morning' },
      { hour: 12, label: 'Lunch' },
      { hour: 15, label: 'Afternoon' },
      { hour: 18, label: 'Evening' },
      { hour: 20, label: 'Night' },
    ];

    for (const w of windows) {
      if (slots.length >= 5) break;

      const slotStart = new Date(dayDate);
      slotStart.setHours(w.hour, 0, 0, 0);
      const slotEnd = new Date(
        slotStart.getTime() + slotDurationHours * 60 * 60 * 1000
      );

      // Require minimum notice period
      if (slotStart.getTime() < now.getTime() + minNoticeMs) continue;

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
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('12:00');
  const [customDuration, setCustomDuration] = useState(2);

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
      try {
        await fetch('/api/me/discover-preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...prefs, ...updated }),
        });
        setPrefs((prev) => ({ ...prev, ...updated }));
      } catch {
        // ignore
      } finally {
        setPrefsSaving(false);
      }
    },
    [prefs]
  );

  // Fetch suggestions for a slot
  const fetchSuggestions = useCallback(
    async (slot: Slot) => {
      if (!prefs.city) {
        setSuggestionsError(
          'Set your city above to get personalized suggestions.'
        );
        setSuggestions([]);
        return;
      }
      setSuggestionsLoading(true);
      setSuggestionsError(null);
      try {
        const url = new URL('/api/suggestions', window.location.origin);
        url.searchParams.set('slotStart', slot.start);
        url.searchParams.set('slotEnd', slot.end);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('Failed to load suggestions');
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch (err) {
        setSuggestionsError(
          err instanceof Error ? err.message : 'Failed to fetch'
        );
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    },
    [prefs.city]
  );

  const handleSlotClick = (slot: Slot) => {
    setSelectedSlot(slot);
    setUseCustomTime(false);
    fetchSuggestions(slot);
  };

  const handleCustomTimeSubmit = () => {
    if (!customDate || !customTime) return;

    const start = new Date(`${customDate}T${customTime}`);
    const end = new Date(start.getTime() + customDuration * 60 * 60 * 1000);

    if (start.getTime() < new Date().getTime()) {
      return;
    }

    const slot: Slot = {
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${formatSlotDay(start.toISOString())} ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
    };

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

  // ── Loading state ─────────────────────────────────────

  if (prefsLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50">
        <div className="container max-w-7xl mx-auto px-4 py-12">
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 cal-time-pulse" />
              <span className="text-slate-600">Loading Discover...</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Main render ───────────────────────────────────────

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-200/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container max-w-7xl mx-auto px-4 py-12">
        {/* ── Header (title only) ─────────────────────── */}
        <div className="mb-8 cal-fade-up">
          <h1
            className="text-4xl font-bold text-slate-900 mb-2"
            style={{ fontFamily: 'var(--font-fraunces, inherit)' }}
          >
            Discover
          </h1>
          <p className="text-slate-600">Find things to do in your free time</p>
        </div>

        {/* ── Unified filter panel ────────────────────── */}
        {/* NOTE: uses bg-white/90 instead of backdrop-blur-md to avoid    */}
        {/* creating a stacking context that traps the city autocomplete    */}
        <div
          className="mb-10 bg-white/90 rounded-2xl border border-slate-200/60 p-5 shadow-md cal-fade-up"
          style={{ animationDelay: '0.05s' }}
        >
          {/* Top row: City + Radius */}
          <div className="relative z-20 flex flex-wrap items-end gap-4 mb-4">
            <div className="w-56">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                City
              </label>
              <CityAutocomplete
                value={prefs.city}
                onChange={(v) => setPrefs({ ...prefs, city: v })}
                onBlur={() => savePrefs({ city: prefs.city })}
                placeholder="e.g. New York"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
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
                className="w-full accent-blue-500"
              />
            </div>
            {prefsSaving && (
              <span className="text-xs text-slate-400 pb-1">Saving...</span>
            )}
          </div>

          {/* Interest chips (wrapping) */}
          <div className="relative z-10">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Interests
            </label>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((interest) => (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    prefs.interests.includes(interest)
                      ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Step 1: Pick a time ─────────────────────── */}
        <div className="mb-8 cal-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-bold">
              1
            </span>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              Pick a time
            </h2>
          </div>

          {/* Toggle between presets and custom */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setUseCustomTime(false)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                !useCustomTime
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Suggested times
            </button>
            <button
              onClick={() => setUseCustomTime(true)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                useCustomTime
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Plus className="size-3.5" />
              Pick my own
            </button>
          </div>

          {useCustomTime ? (
            <div className="bg-white rounded-xl border border-slate-200/60 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Duration
                  </label>
                  <select
                    value={customDuration}
                    onChange={(e) => setCustomDuration(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                  >
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={3}>3 hours</option>
                    <option value={4}>4 hours</option>
                  </select>
                </div>
                <button
                  onClick={handleCustomTimeSubmit}
                  disabled={!customDate || !customTime}
                  className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            </div>
          ) : slots.length === 0 ? (
            <div className="bg-white/50 backdrop-blur-sm rounded-xl border border-slate-200/50 p-6 text-center">
              <p className="text-sm text-slate-500">
                No free slots found in the next 7 days.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
                {slots.map((slot) => {
                  const tod = getTimeOfDay(slot.start);
                  const isSelected = selectedSlot?.start === slot.start;
                  return (
                    <button
                      key={slot.start}
                      onClick={() => handleSlotClick(slot)}
                      className={`flex-shrink-0 w-36 p-3 rounded-xl text-left cursor-pointer transition-all duration-200 ${
                        isSelected
                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-[1.03] border-2 border-blue-400'
                          : 'bg-white border border-slate-200/60 text-slate-700 hover:border-blue-300 hover:shadow-md hover:scale-[1.02]'
                      }`}
                    >
                      <div
                        className={`text-xs font-medium mb-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}
                      >
                        {formatSlotDay(slot.start)}
                      </div>
                      <div
                        className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-slate-900'}`}
                      >
                        {tod.label}
                      </div>
                      <div
                        className={`text-xs mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}
                      >
                        {formatSlotTime(slot.start)} –{' '}
                        {formatSlotTime(slot.end)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Inline prompt when no slot selected */}
              {!selectedSlot && (
                <p className="text-sm text-slate-400 mt-2 flex items-center gap-1.5">
                  <Compass className="size-3.5" />
                  Select a slot to see suggestions
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Step 2: Explore suggestions ─────────────── */}
        <div className="cal-fade-up" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span
              className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${selectedSlot ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400'}`}
            >
              2
            </span>
            <h2
              className={`text-sm font-semibold uppercase tracking-wider ${selectedSlot ? 'text-slate-700' : 'text-slate-400'}`}
            >
              Explore suggestions
            </h2>
          </div>

          {!selectedSlot ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
              <p className="text-sm text-slate-400">
                Suggestions will appear here after you pick a time
              </p>
            </div>
          ) : suggestionsLoading ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white/40 backdrop-blur-sm rounded-2xl border border-white/30">
              <Search className="size-8 text-blue-400 mb-3 animate-pulse" />
              <p className="text-slate-600">Finding suggestions...</p>
            </div>
          ) : suggestionsError ? (
            <div className="p-5 rounded-xl bg-red-50/80 border border-red-200/60 text-red-700 text-sm flex items-start gap-3">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{suggestionsError}</span>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white/40 backdrop-blur-sm rounded-2xl border border-white/30">
              <MapPin className="size-8 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium mb-1">
                Nothing found for this slot
              </p>
              <p className="text-slate-400 text-sm">
                Try different interests or a larger radius
              </p>
            </div>
          ) : (
            <div>
              {/* Section header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {suggestions.length} suggestion
                    {suggestions.length !== 1 ? 's' : ''}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {formatSlotDay(selectedSlot.start)} &middot;{' '}
                    {formatSlotTime(selectedSlot.start)} –{' '}
                    {formatSlotTime(selectedSlot.end)}
                  </p>
                </div>
              </div>

              {/* Low confidence banner */}
              {suggestions.some((s) => s.confidence === 'LOW') && (
                <div className="mb-5 p-3 rounded-xl bg-amber-50/80 border border-amber-200/60 text-amber-800 text-sm flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-500" />
                  <span>
                    Some suggestions have unknown opening hours and may be
                    closed.
                  </span>
                </div>
              )}

              {/* Suggestion cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {suggestions.map((s, i) => (
                  <div
                    key={s.id}
                    className="group bg-white/70 backdrop-blur-md rounded-2xl border border-white/30 overflow-hidden shadow-sm hover:shadow-lg hover:bg-white/90 transition-all duration-300 cal-fade-up"
                    style={{ animationDelay: `${0.05 * i}s` }}
                  >
                    {/* Image */}
                    {s.imageUrl && (
                      <div className="h-36 overflow-hidden bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.imageUrl}
                          alt={s.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    )}

                    <div className="p-4">
                      {/* Badges row */}
                      <div className="flex gap-1.5 mb-2">
                        <span
                          className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md font-semibold ${
                            s.source === 'TICKETMASTER'
                              ? 'bg-violet-100/80 text-violet-700'
                              : 'bg-emerald-100/80 text-emerald-700'
                          }`}
                        >
                          {s.source === 'TICKETMASTER' ? 'Event' : 'Place'}
                        </span>
                        {s.confidence === 'LOW' && (
                          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md font-semibold bg-amber-100/80 text-amber-700">
                            Hours unknown
                          </span>
                        )}
                        {s.status === 'SAVED' && (
                          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-md font-semibold bg-blue-100/80 text-blue-700">
                            Saved
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="font-semibold text-slate-900 truncate mb-1 group-hover:text-blue-600 transition-colors">
                        {s.title}
                      </h3>

                      {/* Meta */}
                      <div className="space-y-0.5 mb-2">
                        {s.category && (
                          <p className="text-xs text-slate-500">{s.category}</p>
                        )}
                        {s.venueName && s.venueName !== s.title && (
                          <p className="text-xs text-slate-600 font-medium">
                            {s.venueName}
                          </p>
                        )}
                        {s.address && (
                          <p className="text-xs text-slate-400 truncate">
                            {s.address}
                          </p>
                        )}
                        {s.distanceMiles != null && (
                          <p className="text-xs text-slate-400">
                            <MapPin className="size-3 inline -mt-0.5 mr-0.5" />
                            {s.distanceMiles} mi away
                          </p>
                        )}
                      </div>

                      {/* Description */}
                      {s.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                          {s.description}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => handleAction(s.id, 'add-to-calendar')}
                          disabled={actionLoading === s.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          <CalendarPlus className="size-3.5" />
                          Add
                        </button>
                        {s.status !== 'SAVED' ? (
                          <button
                            onClick={() => handleAction(s.id, 'save')}
                            disabled={actionLoading === s.id}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Bookmark className="size-3.5" />
                            Save
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg">
                            <Star className="size-3.5 fill-current" />
                            Saved
                          </span>
                        )}
                        <button
                          onClick={() => handleAction(s.id, 'dismiss')}
                          disabled={actionLoading === s.id}
                          className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50 ml-auto"
                          title="Dismiss"
                        >
                          <X className="size-3.5" />
                        </button>
                        {s.url && (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                            title="View details"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
