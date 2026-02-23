/**
 * Compact read-only week calendar for the social feed.
 * Shows a friend's events as positioned blocks on a time grid.
 * Click an event to see details and request to join.
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Clock, X } from 'lucide-react';
import {
  HOURS,
  DAYS,
  getEventPosition,
  eventOverlapsDay,
  isAllDayEvent,
  allDayEventOverlapsDay,
} from '@/lib/calendar/grid';

// ── Types ────────────────────────────────────────────────────

export interface MiniEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  description?: string | null;
  locationName?: string | null;
  visibility?: string;
}

interface MiniWeekCalendarProps {
  events: MiniEvent[];
  weekStart: Date;
  /** Called when user clicks "Request to Join" on an event */
  onRequestJoin?: (eventId: string) => void;
}

// ── Constants (component-specific) ───────────────────────────

const ROW_HEIGHT = 28; // px per hour – compact

// ── Helpers ──────────────────────────────────────────────────

function formatHour(h: number): string {
  if (h === 12) return '12p';
  return h > 12 ? `${h - 12}p` : `${h}a`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDayDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Soft palette for event blocks
const BLOCK_COLORS = [
  'from-blue-400/50 to-blue-500/40 border-blue-300/50',
  'from-violet-400/50 to-violet-500/40 border-violet-300/50',
  'from-emerald-400/50 to-emerald-500/40 border-emerald-300/50',
  'from-amber-400/50 to-amber-500/40 border-amber-300/50',
  'from-rose-400/50 to-rose-500/40 border-rose-300/50',
];

// ── Event Detail Popover ─────────────────────────────────────

function EventPopover({
  event,
  position,
  onClose,
  onRequestJoin,
  requesting,
}: {
  event: MiniEvent;
  position: { x: number; y: number };
  onClose: () => void;
  onRequestJoin?: (eventId: string) => void;
  requesting: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Position the popover near the click, but keep it on screen
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth - 16) {
      el.style.left = `${window.innerWidth - rect.width - 16}px`;
    }
    if (rect.bottom > window.innerHeight - 16) {
      el.style.top = `${window.innerHeight - rect.height - 16}px`;
    }
  }, []);

  const isPublic = event.visibility === 'PUBLIC';

  return (
    <div
      ref={ref}
      className="fixed z-50 w-72 rounded-xl border border-gray-200 bg-white shadow-xl"
      style={{ left: position.x, top: position.y }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <h3 className="text-sm font-bold text-gray-900 leading-tight pr-4">
            {event.title}
          </h3>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Time */}
        <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            {formatDayDate(event.startAt)} &middot; {formatTime(event.startAt)}{' '}
            – {formatTime(event.endAt)}
          </span>
        </div>

        {/* Location */}
        {event.locationName && (
          <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>{event.locationName}</span>
          </div>
        )}

        {/* Description */}
        {event.description && (
          <p className="mb-3 text-xs text-gray-500 line-clamp-3">
            {event.description}
          </p>
        )}

        {/* Visibility badge */}
        <div className="mb-3">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
              isPublic
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {isPublic ? 'Public Event' : 'Friends Only'}
          </span>
        </div>

        {/* Request to join */}
        {onRequestJoin && (
          <button
            onClick={() => onRequestJoin(event.id)}
            disabled={requesting}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {requesting ? 'Requesting...' : 'Request to Join'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────

export function MiniWeekCalendar({
  events,
  weekStart,
  onRequestJoin,
}: MiniWeekCalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const gridHeight = HOURS.length * ROW_HEIGHT;

  // Separate all-day events from timed events
  const allDayEvents = events.filter((e) => isAllDayEvent(e));
  const timedEvents = events.filter((e) => !isAllDayEvent(e));

  const [selectedEvent, setSelectedEvent] = useState<MiniEvent | null>(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [requesting, setRequesting] = useState(false);

  const handleEventClick = (event: MiniEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEvent(event);
    setPopoverPos({ x: e.clientX - 136, y: e.clientY + 8 });
  };

  const handleRequestJoin = async (eventId: string) => {
    if (onRequestJoin) {
      setRequesting(true);
      try {
        onRequestJoin(eventId);
      } finally {
        // Parent controls the async, we just debounce the UI
        setTimeout(() => setRequesting(false), 1500);
      }
    }
  };

  return (
    <div className="w-full relative">
      <div>
        {/* Day headers */}
        <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-px mb-1">
          <div /> {/* spacer for hour labels */}
          {DAYS.map((day, idx) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + idx);
            const isToday = date.toDateString() === today.toDateString();
            return (
              <div key={day} className="text-center py-1">
                <div
                  className={`text-[9px] sm:text-[10px] font-medium ${isToday ? 'text-blue-600' : 'text-gray-400'}`}
                >
                  {day}
                </div>
                <div
                  className={`text-[10px] sm:text-xs font-semibold leading-5 inline-flex items-center justify-center w-5 h-5 rounded-full ${
                    isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
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
          <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-px mb-1">
            <div /> {/* spacer */}
            {DAYS.map((day, idx) => {
              const colDate = new Date(weekStart);
              colDate.setDate(weekStart.getDate() + idx);
              const dayAllDay = allDayEvents.filter((e) =>
                allDayEventOverlapsDay(e, colDate)
              );
              return (
                <div key={day} className="space-y-px">
                  {dayAllDay.map((event, evIdx) => (
                    <div
                      key={event.id}
                      onClick={(e) => handleEventClick(event, e)}
                      className={`cursor-pointer rounded-sm px-0.5 py-px text-[7px] sm:text-[8px] font-semibold truncate bg-gradient-to-r ${
                        BLOCK_COLORS[evIdx % BLOCK_COLORS.length]
                      } border text-white backdrop-blur-sm`}
                    >
                      {event.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid */}
        <div
          className="grid grid-cols-[28px_repeat(7,1fr)] gap-px relative"
          style={{ height: gridHeight }}
        >
          {/* Hour labels */}
          <div className="relative">
            {HOURS.map((hour, i) => (
              <div
                key={hour}
                className="absolute right-0.5 text-[8px] sm:text-[9px] text-gray-300 font-medium leading-none"
                style={{ top: i * ROW_HEIGHT - 4 }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((day, dayIdx) => {
            const colDate = new Date(weekStart);
            colDate.setDate(weekStart.getDate() + dayIdx);
            colDate.setHours(0, 0, 0, 0);
            const isToday = colDate.toDateString() === today.toDateString();

            // Timed events that overlap this day (all-day events render above)
            const dayEvents = timedEvents.filter((e) =>
              eventOverlapsDay(e, colDate)
            );

            return (
              <div
                key={day}
                className={`relative rounded-md ${
                  isToday ? 'bg-blue-50/60' : 'bg-gray-50/40'
                }`}
                style={{ height: gridHeight }}
              >
                {/* Hour grid lines */}
                {HOURS.map((hour, i) => (
                  <div
                    key={hour}
                    className="absolute w-full border-b border-gray-100"
                    style={{ top: i * ROW_HEIGHT }}
                  />
                ))}

                {/* Event blocks */}
                {dayEvents.map((event, evIdx) => {
                  const start = new Date(event.startAt);
                  const end = new Date(event.endAt);
                  const pos = getEventPosition(start, end, colDate);
                  if (!pos) return null;
                  const { topPercent, heightPercent } = pos;
                  const color = BLOCK_COLORS[evIdx % BLOCK_COLORS.length];

                  return (
                    <div
                      key={event.id}
                      className="absolute left-0.5 right-0.5 cursor-pointer"
                      style={{
                        top: `${topPercent}%`,
                        height: `${Math.max(heightPercent, 3)}%`,
                        minHeight: 14,
                        zIndex: 1,
                      }}
                      onClick={(e) => handleEventClick(event, e)}
                    >
                      <div
                        className={`h-full rounded-[4px] bg-gradient-to-br ${color} border backdrop-blur-sm px-1 py-0.5 overflow-hidden hover:brightness-110 transition-all`}
                      >
                        <div className="text-[9px] font-semibold text-white truncate leading-tight">
                          {event.title}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Event detail popover */}
      {selectedEvent && (
        <EventPopover
          event={selectedEvent}
          position={popoverPos}
          onClose={() => setSelectedEvent(null)}
          onRequestJoin={onRequestJoin ? handleRequestJoin : undefined}
          requesting={requesting}
        />
      )}
    </div>
  );
}
