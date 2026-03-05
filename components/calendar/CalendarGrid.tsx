/**
 * Calendar week-view grid — glassmorphism aesthetic
 *
 * Matches the app's blue-violet glass theme with per-event
 * color palettes, a live current-time indicator, and grouped agenda.
 */

'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  GRID_START_HOUR,
  GRID_DEFAULT_SCROLL_HOUR,
  HOURS,
  TOTAL_MINUTES,
  getEventPosition,
  eventOverlapsDay,
  isAllDayEvent,
  allDayEventOverlapsDay,
} from '@/lib/calendar/grid';

// ── Types ────────────────────────────────────────────────────

interface EventAttendee {
  id: string;
  userId: string | null;
  status: 'INVITED' | 'GOING' | 'DECLINED';
  role: 'HOST' | 'ATTENDEE';
  anonymity?: string;
}

interface EventBlock {
  id: string;
  ownerId?: string;
  title: string;
  startAt: string;
  endAt: string;
  status?: string;
  timezone: string;
  description?: string | null;
  locationName?: string | null;
  visibility?: string;
  coverMode?: string;
  syncToGoogle?: boolean;
  attendees?: EventAttendee[];
}

interface CalendarGridProps {
  events: EventBlock[];
  weekStart: Date;
  currentUserId?: string | null;
  /** When set, renders a ghost selection block on the grid at this time range. */
  selectedSlot?: { start: Date; end: Date } | null;
  onEventClick?: (event: EventBlock, anchorX: number, anchorY: number) => void;
  onEmptyCellClick?: (
    startDate: Date,
    endDate: Date,
    anchorX: number,
    anchorY: number
  ) => void;
  onCreateClick?: () => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
}

// ── Drag state type ─────────────────────────────────────────
interface DragState {
  dayIdx: number;
  startMinutes: number;
  currentMinutes: number;
}

// ── Event color palettes (cool-toned for glass theme) ────────

const EVENT_PALETTES = [
  {
    bg: 'rgba(99, 102, 241, 0.12)',
    accent: '#6366F1',
    text: '#4338CA',
    sub: '#6366F1',
  }, // indigo
  {
    bg: 'rgba(20, 184, 166, 0.12)',
    accent: '#14B8A6',
    text: '#0D9488',
    sub: '#14B8A6',
  }, // teal
  {
    bg: 'rgba(168, 85, 247, 0.12)',
    accent: '#A855F7',
    text: '#7C3AED',
    sub: '#A855F7',
  }, // purple
  {
    bg: 'rgba(236, 72, 153, 0.12)',
    accent: '#EC4899',
    text: '#DB2777',
    sub: '#EC4899',
  }, // pink
  {
    bg: 'rgba(245, 158, 11, 0.12)',
    accent: '#F59E0B',
    text: '#D97706',
    sub: '#F59E0B',
  }, // amber
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function getEventPalette(eventId: string) {
  return EVENT_PALETTES[hashStr(eventId) % EVENT_PALETTES.length];
}

// ── Pending invite detection ────────────────────────────────

function buildPendingInviteSet(
  events: EventBlock[],
  currentUserId?: string | null
): Set<string> {
  const set = new Set<string>();
  if (!currentUserId) return set;
  for (const event of events) {
    if (!event.attendees) continue;
    for (const a of event.attendees) {
      if (a.userId === currentUserId && a.status === 'INVITED') {
        set.add(event.id);
        break;
      }
    }
  }
  return set;
}

// ── Constants ────────────────────────────────────────────────

const HOUR_HEIGHT = 60;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();

  if (sameMonth) {
    return `${weekStart.toLocaleDateString('en-US', { month: 'long' })} ${weekStart.getDate()}\u2013${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  if (sameYear) {
    return `${weekStart.toLocaleDateString('en-US', { month: 'short' })} ${weekStart.getDate()} \u2013 ${weekEnd.toLocaleDateString('en-US', { month: 'short' })} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} \u2013 ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatHourLabel(hour: number): string {
  if (hour === 0 || hour === 12) return hour === 0 ? '12am' : '12pm';
  return hour > 12 ? `${hour - 12}pm` : `${hour}am`;
}

// ── Calendar Grid ────────────────────────────────────────────

export function CalendarGrid({
  events,
  weekStart,
  currentUserId,
  selectedSlot,
  onEventClick,
  onEmptyCellClick,
  onCreateClick,
  onPrevWeek,
  onNextWeek,
}: CalendarGridProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Live clock for time indicator
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const pendingInviteIds = useMemo(
    () => buildPendingInviteSet(events, currentUserId),
    [events, currentUserId]
  );

  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: EventBlock[] = [];
    const timed: EventBlock[] = [];
    for (const event of events) {
      (isAllDayEvent(event) ? allDay : timed).push(event);
    }
    return { allDayEvents: allDay, timedEvents: timed };
  }, [events]);

  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Auto-scroll to default hour (8am) on mount
  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo =
        (GRID_DEFAULT_SCROLL_HOUR - GRID_START_HOUR) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  // Convert mouse Y position to minutes from grid start (snapped to 15 min)
  const yToMinutes = useCallback(
    (clientY: number, columnEl: HTMLDivElement) => {
      const rect = columnEl.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const minutesFromStart = (relativeY / rect.height) * TOTAL_MINUTES;
      return Math.max(
        0,
        Math.min(TOTAL_MINUTES - 15, Math.floor(minutesFromStart / 15) * 15)
      );
    },
    []
  );

  // Handle drag start on empty cell
  const handleDayMouseDown = useCallback(
    (dayIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
      if (!onEmptyCellClick) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-event-block]')) return;

      const minutes = yToMinutes(e.clientY, e.currentTarget);
      const state: DragState = {
        dayIdx,
        startMinutes: minutes,
        currentMinutes: minutes + 15,
      };
      dragRef.current = state;
      setDragState(state);
    },
    [onEmptyCellClick, yToMinutes]
  );

  // Handle drag move (attached to the scroll container for smooth tracking)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current || !scrollRef.current) return;
      const dayIdx = dragRef.current.dayIdx;
      // Find the day column element
      const columns =
        scrollRef.current.querySelectorAll<HTMLDivElement>('[data-day-column]');
      const col = columns[dayIdx];
      if (!col) return;

      const rect = col.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const minutesFromStart = (relativeY / rect.height) * TOTAL_MINUTES;
      const snapped = Math.max(
        0,
        Math.min(TOTAL_MINUTES, Math.round(minutesFromStart / 15) * 15)
      );

      const updated = { ...dragRef.current, currentMinutes: snapped };
      dragRef.current = updated;
      setDragState(updated);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragRef.current || !onEmptyCellClick) {
        dragRef.current = null;
        setDragState(null);
        return;
      }

      const { dayIdx, startMinutes, currentMinutes } = dragRef.current;
      const minMin = Math.min(startMinutes, currentMinutes);
      const maxMin = Math.max(startMinutes, currentMinutes);
      const duration = maxMin - minMin;

      // If barely dragged (< 15 min movement), treat as a click with 1hr default
      const effectiveStart = minMin;
      const effectiveEnd = duration < 15 ? minMin + 60 : maxMin;

      const startHour = Math.floor(effectiveStart / 60) + GRID_START_HOUR;
      const startMinute = effectiveStart % 60;

      const clickDate = new Date(weekStart);
      clickDate.setDate(weekStart.getDate() + dayIdx);
      clickDate.setHours(startHour, startMinute, 0, 0);

      const endHour = Math.floor(effectiveEnd / 60) + GRID_START_HOUR;
      const endMinute = effectiveEnd % 60;

      const endDate = new Date(weekStart);
      endDate.setDate(weekStart.getDate() + dayIdx);
      endDate.setHours(endHour, endMinute, 0, 0);

      dragRef.current = null;
      setDragState(null);

      onEmptyCellClick(clickDate, endDate, e.clientX, e.clientY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onEmptyCellClick, weekStart]);

  const handleEventBlockClick = useCallback(
    (event: EventBlock, e: React.MouseEvent) => {
      e.stopPropagation();
      onEventClick?.(event, e.clientX, e.clientY);
    },
    [onEventClick]
  );

  // Current time indicator position
  const timeIndicator = useMemo(() => {
    const todayCol = DAYS.findIndex((_, idx) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + idx);
      d.setHours(0, 0, 0, 0);
      return d.toDateString() === today.toDateString();
    });
    if (todayCol < 0) return null;

    const h = now.getHours();
    const m = now.getMinutes();
    if (h < GRID_START_HOUR || h >= HOURS[HOURS.length - 1] + 1) return null;

    const minutesFromStart = (h - GRID_START_HOUR) * 60 + m;
    const topPercent = (minutesFromStart / TOTAL_MINUTES) * 100;
    return { colIdx: todayCol, topPercent };
  }, [weekStart, today, now]);

  return (
    <div className="relative w-full bg-white/70 backdrop-blur-xl rounded-3xl border border-white/30 shadow-xl p-6 lg:p-8 overflow-hidden cal-fade-up">
      {/* Ambient light effects */}
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-violet-300/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Header ──────────────────────────────────────── */}
      <div className="relative z-10 mb-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Button
              onClick={onCreateClick}
              size="sm"
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-md hover:shadow-lg rounded-full px-4 gap-1.5 font-semibold transition-all"
              variant="outline"
            >
              <Plus className="size-5 text-blue-600" />
              Create
            </Button>

            <h2
              className="text-lg font-semibold text-slate-900"
              style={{ fontFamily: 'var(--font-fraunces, inherit)' }}
            >
              {formatWeekLabel(weekStart)}
            </h2>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onPrevWeek}
              className="text-slate-500 hover:text-slate-900"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onNextWeek}
              className="text-slate-500 hover:text-slate-900"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1">
          <div />
          {DAYS.map((day, idx) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + idx);
            const isToday = date.toDateString() === today.toDateString();
            return (
              <div key={day} className="text-center">
                <div
                  className={`text-xs font-medium mb-1.5 ${isToday ? 'text-blue-600' : 'text-slate-500'}`}
                >
                  {day}
                </div>
                <div
                  className={`text-sm px-2.5 py-1 rounded-full font-medium inline-block ${
                    isToday
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/60 backdrop-blur-md border border-white/50 text-slate-900'
                  }`}
                >
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day event banners */}
        {allDayEvents.length > 0 && (
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1 mt-2">
            <div />
            {DAYS.map((day, idx) => {
              const colDate = new Date(weekStart);
              colDate.setDate(weekStart.getDate() + idx);
              const dayAllDay = allDayEvents.filter((e) =>
                allDayEventOverlapsDay(e, colDate)
              );
              return (
                <div key={day} className="space-y-0.5">
                  {dayAllDay.map((event) => {
                    const pending = pendingInviteIds.has(event.id);
                    const palette = getEventPalette(event.id);
                    return (
                      <div
                        key={event.id}
                        data-event-block
                        onClick={(e) => handleEventBlockClick(event, e)}
                        className={`cursor-pointer rounded-md px-1.5 py-0.5 text-[10px] font-semibold truncate transition-all hover:brightness-110 ${
                          pending
                            ? 'bg-white/60 border border-dashed border-blue-400/60 text-blue-600'
                            : 'text-white border border-white/30'
                        }`}
                        style={
                          pending
                            ? undefined
                            : { backgroundColor: palette.accent }
                        }
                      >
                        {event.title}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Time grid ───────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="relative z-10 overflow-y-auto max-h-[840px]"
      >
        <div
          ref={gridRef}
          className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1"
        >
          {/* Hour labels */}
          <div className="pt-0">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="text-[11px] font-medium text-slate-400 text-right pr-2"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((day, dayIdx) => {
            const colDate = new Date(weekStart);
            colDate.setDate(weekStart.getDate() + dayIdx);
            colDate.setHours(0, 0, 0, 0);
            const isToday = colDate.toDateString() === today.toDateString();

            return (
              <div
                key={day}
                data-day-column
                className={`rounded-xl overflow-hidden relative cursor-pointer transition-colors select-none ${
                  isToday
                    ? 'bg-blue-50/40 border border-blue-200/40'
                    : 'bg-white/10 border border-white/20 hover:bg-white/20'
                }`}
                style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
                onMouseDown={(e) => handleDayMouseDown(dayIdx, e)}
              >
                {/* Hour grid lines */}
                {HOURS.map((hour) => (
                  <div
                    key={`grid-${hour}`}
                    className="absolute w-full border-b border-slate-200/30"
                    style={{
                      top: `${((hour - GRID_START_HOUR) / HOURS.length) * 100}%`,
                      height: `${HOUR_HEIGHT}px`,
                    }}
                  />
                ))}

                {/* Current time indicator */}
                {timeIndicator && timeIndicator.colIdx === dayIdx && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: `${timeIndicator.topPercent}%` }}
                  >
                    <div className="relative flex items-center">
                      <div className="absolute -left-[5px] w-[10px] h-[10px] rounded-full bg-blue-500 cal-time-pulse" />
                      <div className="w-full h-[1.5px] bg-blue-500" />
                    </div>
                  </div>
                )}

                {/* Timed events */}
                <div className="absolute inset-0">
                  {timedEvents
                    .filter((event) => eventOverlapsDay(event, colDate))
                    .map((event) => {
                      const startTime = new Date(event.startAt);
                      const endTime = new Date(event.endAt);
                      const pos = getEventPosition(startTime, endTime, colDate);
                      if (!pos) return null;
                      const { topPercent, heightPercent } = pos;
                      const pending = pendingInviteIds.has(event.id);
                      const palette = getEventPalette(event.id);

                      return (
                        <div
                          key={event.id}
                          data-event-block
                          onClick={(e) => handleEventBlockClick(event, e)}
                          className="absolute left-1 right-1 cursor-pointer group"
                          style={{
                            top: `${topPercent}%`,
                            height: `${Math.max(heightPercent, 2.5)}%`,
                            zIndex: 10,
                          }}
                        >
                          {pending ? (
                            <div className="relative h-full bg-white/60 backdrop-blur-md rounded-lg border-2 border-dashed border-blue-400/60 p-1.5 hover:bg-blue-50/40 hover:border-blue-500/80 transition-all duration-200 overflow-hidden group-hover:scale-[1.02] origin-top-left">
                              <div className="relative z-10 text-[11px] text-blue-600 font-semibold truncate leading-tight">
                                {event.title}
                              </div>
                              <div className="relative z-10 text-[10px] text-blue-400 mt-0.5 leading-tight">
                                {formatTime(startTime)} – {formatTime(endTime)}
                              </div>
                              <div className="relative z-10 text-[9px] text-blue-400/80 mt-0.5 italic leading-tight">
                                Pending invite
                              </div>
                            </div>
                          ) : (
                            <div
                              className="cal-event h-full backdrop-blur-sm p-1.5 overflow-hidden"
                              style={{
                                backgroundColor: palette.bg,
                                borderLeftColor: palette.accent,
                              }}
                            >
                              <div
                                className="text-[11px] font-semibold truncate leading-tight"
                                style={{ color: palette.text }}
                              >
                                {event.title}
                              </div>
                              <div
                                className="text-[10px] mt-0.5 leading-tight"
                                style={{ color: palette.sub }}
                              >
                                {formatTime(startTime)} – {formatTime(endTime)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>

                {/* Ghost selection block */}
                {selectedSlot &&
                  (() => {
                    const slotDay = new Date(selectedSlot.start);
                    slotDay.setHours(0, 0, 0, 0);
                    if (slotDay.toDateString() !== colDate.toDateString())
                      return null;

                    const pos = getEventPosition(
                      selectedSlot.start,
                      selectedSlot.end,
                      colDate
                    );
                    if (!pos) return null;

                    return (
                      <div
                        className="absolute left-1 right-1 rounded-lg pointer-events-none cal-ghost-block"
                        style={{
                          top: `${pos.topPercent}%`,
                          height: `${Math.max(pos.heightPercent, 2.5)}%`,
                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                          border: '2px solid rgba(59, 130, 246, 0.35)',
                          zIndex: 5,
                        }}
                      >
                        <div className="px-2 py-1 text-[11px] font-medium text-blue-500/70">
                          New event
                        </div>
                      </div>
                    );
                  })()}

                {/* Drag ghost block */}
                {dragState &&
                  dragState.dayIdx === dayIdx &&
                  (() => {
                    const minMin = Math.min(
                      dragState.startMinutes,
                      dragState.currentMinutes
                    );
                    const maxMin = Math.max(
                      dragState.startMinutes,
                      dragState.currentMinutes
                    );
                    const topPct = (minMin / TOTAL_MINUTES) * 100;
                    const heightPct = Math.max(
                      ((maxMin - minMin) / TOTAL_MINUTES) * 100,
                      1
                    );
                    const durationMins = maxMin - minMin;
                    const hrs = Math.floor(durationMins / 60);
                    const mins = durationMins % 60;
                    const label =
                      durationMins < 60
                        ? `${durationMins} min`
                        : mins > 0
                          ? `${hrs}h ${mins}m`
                          : `${hrs} hr${hrs > 1 ? 's' : ''}`;

                    return (
                      <div
                        className="absolute left-1 right-1 rounded-lg pointer-events-none"
                        style={{
                          top: `${topPct}%`,
                          height: `${heightPct}%`,
                          backgroundColor: 'rgba(59, 130, 246, 0.15)',
                          border: '2px solid rgba(59, 130, 246, 0.45)',
                          zIndex: 15,
                          transition: 'top 0.05s ease, height 0.05s ease',
                        }}
                      >
                        <div className="px-2 py-1 text-[11px] font-semibold text-blue-600/80">
                          {label}
                        </div>
                      </div>
                    );
                  })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Agenda List ──────────────────────────────────────────────

interface AgendaListProps {
  events: EventBlock[];
  currentUserId?: string | null;
  onEventClick?: (event: EventBlock) => void;
}

export function AgendaList({
  events,
  currentUserId,
  onEventClick,
}: AgendaListProps) {
  const pendingInviteIds = useMemo(
    () => buildPendingInviteSet(events, currentUserId),
    [events, currentUserId]
  );

  const today = new Date();
  const dayStart = new Date(today);
  dayStart.setHours(0, 0, 0, 0);

  const upcomingEvents = events
    .filter((e) => new Date(e.startAt) >= dayStart)
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );

  // Group events by date
  const grouped = useMemo(() => {
    const map = new Map<string, EventBlock[]>();
    for (const event of upcomingEvents) {
      const dateKey = new Date(event.startAt).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(event);
    }
    return Array.from(map.entries());
  }, [upcomingEvents]);

  if (upcomingEvents.length === 0) {
    return (
      <div className="text-center py-12 cal-fade-up">
        <div className="text-slate-400 text-sm">
          No upcoming events. Create your first event to get started!
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 cal-fade-up" style={{ animationDelay: '0.1s' }}>
      {grouped.map(([dateLabel, dateEvents]) => (
        <div key={dateLabel}>
          {/* Date group header */}
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {dateLabel}
            </h3>
            <div className="flex-1 border-t border-slate-200/50" />
          </div>

          {/* Events */}
          <div className="space-y-2">
            {dateEvents.map((event) => {
              const startTime = new Date(event.startAt);
              const endTime = new Date(event.endAt);
              const pending = pendingInviteIds.has(event.id);
              const palette = getEventPalette(event.id);

              return (
                <div
                  key={event.id}
                  onClick={() => onEventClick?.(event)}
                  className={`group flex items-start gap-4 p-4 rounded-2xl backdrop-blur-md cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.01] origin-left ${
                    pending
                      ? 'bg-white/30 border-2 border-dashed border-blue-300/50 hover:border-blue-400/70'
                      : 'bg-white/50 border border-white/30 hover:bg-white/70 hover:border-white/50'
                  }`}
                >
                  {/* Color dot */}
                  <div className="mt-1 shrink-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: pending ? '#3B82F6' : palette.accent,
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <h3
                        className={`font-semibold truncate transition-colors ${
                          pending
                            ? 'text-blue-600 group-hover:text-blue-700'
                            : 'text-slate-900 group-hover:text-blue-600'
                        }`}
                      >
                        {event.title}
                      </h3>
                      {pending && (
                        <span className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100/50 text-amber-700">
                          PENDING
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      {formatTime(startTime)} – {formatTime(endTime)}
                      {event.locationName && (
                        <span className="text-slate-400">
                          {' \u00B7 '}
                          {event.locationName}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
