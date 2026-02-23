/**
 * Calendar availability component in glassmorphism style
 * Premium liquid glass aesthetic with spring physics
 */

'use client';

import React, { useCallback, useMemo, useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  GRID_START_HOUR,
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
  /** Current user ID — used to detect pending invite status for styling */
  currentUserId?: string | null;
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

/**
 * Pre-compute the set of event IDs where the current user has a pending
 * INVITED attendee status.  O(events + attendees) up-front instead of
 * O(events * attendees) per render when called inside a map loop.
 */
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
        break; // one match per event is enough
      }
    }
  }
  return set;
}

// ── Constants (component-specific) ───────────────────────────

const HOUR_HEIGHT = 60; // px per hour in the grid

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
    return `${weekStart.toLocaleDateString('en-US', { month: 'long' })} ${weekStart.getDate()}–${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  if (sameYear) {
    return `${weekStart.toLocaleDateString('en-US', { month: 'short' })} ${weekStart.getDate()} – ${weekEnd.toLocaleDateString('en-US', { month: 'short' })} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// ── Calendar Grid ────────────────────────────────────────────

export function CalendarGrid({
  events,
  weekStart,
  currentUserId,
  onEventClick,
  onEmptyCellClick,
  onCreateClick,
  onPrevWeek,
  onNextWeek,
}: CalendarGridProps) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Pre-compute pending invite set once per render instead of per event
  const pendingInviteIds = useMemo(
    () => buildPendingInviteSet(events, currentUserId),
    [events, currentUserId]
  );

  // Separate all-day events from timed events
  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: EventBlock[] = [];
    const timed: EventBlock[] = [];
    for (const event of events) {
      if (isAllDayEvent(event)) {
        allDay.push(event);
      } else {
        timed.push(event);
      }
    }
    return { allDayEvents: allDay, timedEvents: timed };
  }, [events]);

  const gridRef = useRef<HTMLDivElement>(null);

  const handleDayColumnClick = useCallback(
    (dayIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
      if (!onEmptyCellClick) return;

      // Don't fire if the user clicked on an event block
      const target = e.target as HTMLElement;
      if (target.closest('[data-event-block]')) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const totalHeight = rect.height;

      // Map click position to hour
      const minutesFromStart = (relativeY / totalHeight) * TOTAL_MINUTES;
      const roundedMinutes = Math.floor(minutesFromStart / 30) * 30; // snap to 30-min
      const hour = Math.floor(roundedMinutes / 60) + GRID_START_HOUR;
      const minute = roundedMinutes % 60;

      const clickDate = new Date(weekStart);
      clickDate.setDate(weekStart.getDate() + dayIdx);
      clickDate.setHours(hour, minute, 0, 0);

      const endDate = new Date(clickDate.getTime() + 60 * 60 * 1000); // +1h default

      onEmptyCellClick(clickDate, endDate, e.clientX, e.clientY);
    },
    [onEmptyCellClick, weekStart]
  );

  const handleEventBlockClick = useCallback(
    (event: EventBlock, e: React.MouseEvent) => {
      e.stopPropagation();
      onEventClick?.(event, e.clientX, e.clientY);
    },
    [onEventClick]
  );

  return (
    <div className="relative w-full bg-gradient-to-br from-white/50 via-blue-50/30 to-white/50 backdrop-blur-xl rounded-3xl border border-white/30 shadow-xl p-6 lg:p-8 overflow-hidden">
      {/* Ambient light effect */}
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-violet-300/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Header ──────────────────────────────────────── */}
      <div className="relative z-10 mb-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {/* Create button (Google Calendar style) */}
            <Button
              onClick={onCreateClick}
              size="sm"
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-md hover:shadow-lg rounded-full px-4 gap-1.5 font-semibold transition-all"
              variant="outline"
            >
              <Plus className="size-5 text-blue-600" />
              Create
            </Button>

            <h2 className="text-lg font-semibold text-slate-900">
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

        {/* Day headers with date chips */}
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1">
          {/* Spacer for hour labels */}
          <div />
          {days.map((day, idx) => {
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

        {/* All-day event banners (Google Calendar style) */}
        {allDayEvents.length > 0 && (
          <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1 mt-2">
            {/* Spacer for hour labels */}
            <div />
            {days.map((day, idx) => {
              const colDate = new Date(weekStart);
              colDate.setDate(weekStart.getDate() + idx);
              const dayAllDay = allDayEvents.filter((e) =>
                allDayEventOverlapsDay(e, colDate)
              );
              return (
                <div key={day} className="space-y-0.5">
                  {dayAllDay.map((event) => {
                    const pending = pendingInviteIds.has(event.id);
                    return (
                      <div
                        key={event.id}
                        data-event-block
                        onClick={(e) => handleEventBlockClick(event, e)}
                        className={`cursor-pointer rounded-md px-1.5 py-0.5 text-[10px] font-semibold truncate transition-all hover:brightness-110 ${
                          pending
                            ? 'bg-white/60 border border-dashed border-blue-400/60 text-blue-600'
                            : 'bg-gradient-to-r from-blue-400/70 to-blue-500/60 text-white border border-white/30'
                        }`}
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
      <div ref={gridRef} className="relative z-10">
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1">
          {/* Hour labels column */}
          <div className="pt-0">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="text-[11px] font-medium text-slate-400 text-right pr-2"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                {`${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIdx) => {
            const colDate = new Date(weekStart);
            colDate.setDate(weekStart.getDate() + dayIdx);
            colDate.setHours(0, 0, 0, 0);
            const isToday = colDate.toDateString() === today.toDateString();

            return (
              <div
                key={day}
                className={`rounded-xl overflow-hidden relative cursor-pointer transition-colors ${
                  isToday
                    ? 'bg-blue-50/30 border border-blue-200/40'
                    : 'bg-white/10 border border-white/20 hover:bg-white/20'
                }`}
                style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
                onClick={(e) => handleDayColumnClick(dayIdx, e)}
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

                {/* Timed events for this day (all-day events render above) */}
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

                      return (
                        <div
                          key={event.id}
                          data-event-block
                          onClick={(e) => handleEventBlockClick(event, e)}
                          className="absolute left-1 right-1 cursor-pointer group"
                          style={{
                            top: `${topPercent}%`,
                            height: `${Math.max(heightPercent, 2.5)}%`,
                          }}
                        >
                          {pending ? (
                            /* ── Pending invite: dashed outline, no fill ── */
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
                            /* ── Accepted / owned: filled glass style ── */
                            <div className="relative h-full bg-gradient-to-br from-blue-400/40 via-blue-500/30 to-violet-500/40 backdrop-blur-md rounded-lg border border-white/40 p-1.5 shadow-lg hover:shadow-xl hover:from-blue-400/50 hover:to-violet-500/50 transition-all duration-200 overflow-hidden group-hover:scale-[1.02] origin-top-left">
                              {/* Glass shine effect */}
                              <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />

                              {/* Event content */}
                              <div className="relative z-10 text-[11px] text-white font-semibold truncate leading-tight">
                                {event.title}
                              </div>
                              <div className="relative z-10 text-[10px] text-white/80 mt-0.5 leading-tight">
                                {formatTime(startTime)} – {formatTime(endTime)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
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

  return (
    <div className="space-y-3">
      {upcomingEvents.map((event) => {
        const startTime = new Date(event.startAt);
        const endTime = new Date(event.endAt);
        const pending = pendingInviteIds.has(event.id);

        return (
          <div
            key={event.id}
            onClick={() => onEventClick?.(event)}
            className={`group p-4 rounded-2xl backdrop-blur-md cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02] origin-left ${
              pending
                ? 'bg-white/30 border-2 border-dashed border-blue-300/50 hover:border-blue-400/70'
                : 'bg-white/50 border border-white/30 hover:bg-white/70 hover:border-white/50'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3
                  className={`font-semibold truncate transition-colors ${
                    pending
                      ? 'text-blue-600 group-hover:text-blue-700'
                      : 'text-slate-900 group-hover:text-blue-600'
                  }`}
                >
                  {event.title}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  {startTime.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  • {formatTime(startTime)} – {formatTime(endTime)}
                </p>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                  pending
                    ? 'bg-amber-100/50 text-amber-700'
                    : 'bg-blue-100/50 text-blue-700'
                }`}
              >
                {pending ? 'PENDING' : event.status || 'SCHEDULED'}
              </div>
            </div>
          </div>
        );
      })}

      {upcomingEvents.length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-400 text-sm">
            No upcoming events. Create your first event to get started!
          </div>
        </div>
      )}
    </div>
  );
}
