'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, Clock, ChevronDown } from 'lucide-react';
import {
  generateTimeOptions,
  dateToTimeValue,
  applyTimeToDate,
  formatDuration,
} from '@/lib/calendar/time-options';

// ── Types ────────────────────────────────────────────────────

interface QuickAddPopoverProps {
  anchorX: number;
  anchorY: number;
  defaultStart: Date;
  defaultEnd: Date;
  onSave: (data: {
    title: string;
    startAt: Date;
    endAt: Date;
  }) => Promise<void>;
  onMoreOptions: (data: { title: string; startAt: Date; endAt: Date }) => void;
  onClose: () => void;
  /** Fires when the user changes start/end times in the popover. */
  onTimeChange?: (start: Date, end: Date) => void;
}

// ── Component ────────────────────────────────────────────────

export function QuickAddPopover({
  anchorX,
  anchorY,
  defaultStart,
  defaultEnd,
  onSave,
  onMoreOptions,
  onClose,
  onTimeChange,
}: QuickAddPopoverProps) {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState(() =>
    dateToTimeValue(defaultStart)
  );
  const [endTime, setEndTime] = useState(() => dateToTimeValue(defaultEnd));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fixed base date from the grid click (year/month/day only).
  // Use a primitive key so a new Date reference with the same date doesn't
  // trigger a recalculation → avoids infinite onTimeChange loop.
  const baseDateKey = defaultStart.toDateString();
  const baseDate = useMemo(() => {
    const d = new Date(defaultStart);
    d.setHours(0, 0, 0, 0);
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDateKey]);

  // All time options (30-min intervals, 8am–10pm)
  const allTimeOptions = useMemo(() => generateTimeOptions(), []);

  // End time options: only times strictly after selected start
  const endTimeOptions = useMemo(() => {
    const startOpt = allTimeOptions.find((o) => o.value === startTime);
    if (!startOpt) return allTimeOptions;
    return allTimeOptions.filter((o) => o.totalMinutes > startOpt.totalMinutes);
  }, [allTimeOptions, startTime]);

  // Reconstruct actual Date objects
  const computedStart = useMemo(
    () => applyTimeToDate(baseDate, startTime),
    [baseDate, startTime]
  );
  const computedEnd = useMemo(
    () => applyTimeToDate(baseDate, endTime),
    [baseDate, endTime]
  );

  const durationLabel = useMemo(
    () => formatDuration(computedStart, computedEnd),
    [computedStart, computedEnd]
  );

  // When start time changes, ensure end time is still valid
  useEffect(() => {
    const startOpt = allTimeOptions.find((o) => o.value === startTime);
    const endOpt = allTimeOptions.find((o) => o.value === endTime);
    if (startOpt && endOpt && endOpt.totalMinutes <= startOpt.totalMinutes) {
      const target = startOpt.totalMinutes + 60;
      const newEnd = allTimeOptions.find((o) => o.totalMinutes >= target);
      if (newEnd) {
        setEndTime(newEnd.value);
      } else {
        const last = allTimeOptions[allTimeOptions.length - 1];
        if (last && last.totalMinutes > startOpt.totalMinutes) {
          setEndTime(last.value);
        }
      }
    }
  }, [startTime, endTime, allTimeOptions]);

  // Notify parent when computed times change (for ghost block sync)
  useEffect(() => {
    onTimeChange?.(computedStart, computedEnd);
  }, [computedStart, computedEnd, onTimeChange]);

  // Focus title on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Viewport-aware positioning
  const computeStyle = (): React.CSSProperties => {
    const popW = 340;
    const popH = 320;
    let left = anchorX;
    let top = anchorY + 8;

    if (left + popW > window.innerWidth - 16) {
      left = window.innerWidth - popW - 16;
    }
    if (left < 16) left = 16;
    if (top + popH > window.innerHeight - 16) {
      top = anchorY - popH - 8;
    }

    return { position: 'fixed', left, top, zIndex: 9999 };
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        startAt: computedStart,
        endAt: computedEnd,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMoreOptions = () => {
    onMoreOptions({
      title: title.trim(),
      startAt: computedStart,
      endAt: computedEnd,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  // ── Render ──────────────────────────────────────────────

  return (
    <div ref={popoverRef} style={computeStyle()}>
      <div className="w-[340px] bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden cal-slide-in">
        {/* Blue accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-blue-500 to-blue-400" />

        <div className="p-4 space-y-3">
          {/* Close button */}
          <div className="flex justify-end -mt-1 -mr-1">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Title input */}
          <Input
            ref={inputRef}
            placeholder="Add title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-lg font-semibold border-0 border-b-2 border-slate-200 rounded-none px-0 h-11 focus-visible:ring-0 focus-visible:border-blue-500 placeholder:text-slate-400"
          />

          {/* Date context */}
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Clock className="size-4 text-slate-400 shrink-0" />
            <span className="font-medium">
              {defaultStart.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>

          {/* Time selects */}
          <div className="flex items-center gap-2 pl-6">
            {/* Start time */}
            <div className="relative flex-1">
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full appearance-none text-sm font-medium text-slate-900 px-3 py-2 pr-8 border border-slate-200 rounded-lg bg-white hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors cursor-pointer"
              >
                {allTimeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
            </div>

            <span className="text-slate-400 text-sm font-medium">&ndash;</span>

            {/* End time */}
            <div className="relative flex-1">
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full appearance-none text-sm font-medium text-slate-900 px-3 py-2 pr-8 border border-slate-200 rounded-lg bg-white hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors cursor-pointer"
              >
                {endTimeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Duration */}
          <div className="pl-6">
            <span className="text-xs text-slate-400 font-medium">
              {durationLabel}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleMoreOptions}
              className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
            >
              More options
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!title.trim() || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
