/**
 * Calendar availability component in glassmorphism style
 * Premium liquid glass aesthetic with spring physics
 */

'use client';

import React from 'react';

interface EventBlock {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status?: string;
  timezone: string;
}

interface CalendarGridProps {
  events: EventBlock[];
  onEventClick?: (event: EventBlock) => void;
  onTimeRangeSelect?: (start: Date, end: Date) => void;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8am to 10pm

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getEventPosition(startAt: Date, endAt: Date) {
  const dayStart = new Date(startAt);
  dayStart.setHours(8, 0, 0, 0);

  const offsetMinutes = (startAt.getTime() - dayStart.getTime()) / (1000 * 60);
  const durationMinutes = (endAt.getTime() - startAt.getTime()) / (1000 * 60);

  const topPercent = (offsetMinutes / (15 * 60)) * 100; // 15 hours total
  const heightPercent = (durationMinutes / (15 * 60)) * 100;

  return { topPercent, heightPercent };
}

export function CalendarGrid({ events, onEventClick }: CalendarGridProps) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  const weekStart = new Date(today);
  const dayOfWeek = today.getDay();
  // getDay() returns 0 for Sunday; offset so Monday is always the start
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(today.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);

  return (
    <div className="relative w-full bg-gradient-to-br from-white/50 via-blue-50/30 to-white/50 backdrop-blur-xl rounded-3xl border border-white/30 shadow-xl p-8 overflow-hidden">
      {/* Ambient light effect */}
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-violet-300/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-slate-900">This Week</h2>
          <div className="flex gap-2">
            <button className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              ← Prev
            </button>
            <button className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              Next →
            </button>
          </div>
        </div>

        {/* Day headers with date chips */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {days.map((day, idx) => {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + idx);
            return (
              <div key={day} className="text-center">
                <div className="text-sm font-medium text-slate-600 mb-2">
                  {day}
                </div>
                <div className="text-xs px-3 py-1 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-slate-900 font-medium">
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Time grid */}
      <div className="relative z-10 overflow-x-auto">
        <div className="grid grid-cols-8 gap-2 min-w-max">
          {/* Hour labels column */}
          <div className="w-16 pt-4">
            <div className="space-y-[60px]">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="text-xs font-medium text-slate-500 text-right pr-2"
                >
                  {`${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}`}
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          {days.map((day, dayIdx) => (
            <div
              key={day}
              className="w-32 border border-white/20 rounded-xl bg-white/10 backdrop-blur-sm overflow-hidden relative"
            >
              {/* Hour grid lines */}
              {HOURS.map((hour) => (
                <div
                  key={`grid-${hour}`}
                  className="absolute w-full h-[60px] border-b border-white/10"
                  style={{ top: `${(((hour - 8) * 60) / (15 * 60)) * 100}%` }}
                />
              ))}

              {/* Events for this day */}
              <div className="absolute inset-0">
                {events
                  .filter((event) => {
                    const eventDate = new Date(event.startAt);
                    const compareDate = new Date(weekStart);
                    compareDate.setDate(weekStart.getDate() + dayIdx);
                    return (
                      eventDate.toDateString() === compareDate.toDateString()
                    );
                  })
                  .map((event) => {
                    const startTime = new Date(event.startAt);
                    const endTime = new Date(event.endAt);
                    const { topPercent, heightPercent } = getEventPosition(
                      startTime,
                      endTime
                    );

                    return (
                      <div
                        key={event.id}
                        onClick={() => onEventClick?.(event)}
                        className="absolute left-1 right-1 cursor-pointer group"
                        style={{
                          top: `${topPercent}%`,
                          height: `${heightPercent}%`,
                        }}
                      >
                        <div className="relative h-full bg-gradient-to-br from-blue-400/40 via-blue-500/30 to-violet-500/40 backdrop-blur-md rounded-lg border border-white/40 p-2 shadow-lg hover:shadow-xl hover:from-blue-400/50 hover:to-violet-500/50 transition-all duration-300 overflow-hidden group-hover:scale-105 origin-top-left">
                          {/* Glass shine effect */}
                          <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />

                          {/* Event content */}
                          <div className="relative z-10 text-xs text-white font-semibold truncate">
                            {event.title}
                          </div>
                          <div className="relative z-10 text-[10px] text-white/80 mt-0.5">
                            {formatTime(startTime)} - {formatTime(endTime)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create event button */}
      <button className="relative z-10 mt-8 mx-auto block px-6 py-3 bg-gradient-to-r from-blue-500/80 to-violet-500/80 hover:from-blue-600 hover:to-violet-600 text-white font-semibold rounded-full backdrop-blur-md border border-white/30 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
        + Create Event
      </button>
    </div>
  );
}

export function AgendaList({ events, onEventClick }: CalendarGridProps) {
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

        return (
          <div
            key={event.id}
            onClick={() => onEventClick?.(event)}
            className="group p-4 rounded-2xl bg-white/50 backdrop-blur-md border border-white/30 hover:bg-white/70 cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-white/50 hover:scale-105 origin-left"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                  {event.title}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  {startTime.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  • {formatTime(startTime)} - {formatTime(endTime)}
                </p>
              </div>
              <div className="px-3 py-1 rounded-full bg-blue-100/50 text-blue-700 text-xs font-semibold whitespace-nowrap">
                {event.status || 'SCHEDULED'}
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
