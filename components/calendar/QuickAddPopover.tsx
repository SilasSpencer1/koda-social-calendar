'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toDatetimeLocal, fromDatetimeLocal } from '@/lib/schemas/event';
import { X } from 'lucide-react';

interface QuickAddPopoverProps {
  /** Position (viewport coords) to render near */
  anchorX: number;
  anchorY: number;
  /** Pre-filled start/end from the grid click */
  defaultStart: Date;
  defaultEnd: Date;
  /** Called when the user saves (quick create) */
  onSave: (data: {
    title: string;
    startAt: Date;
    endAt: Date;
  }) => Promise<void>;
  /** Called when user wants the full editor */
  onMoreOptions: (data: { title: string; startAt: Date; endAt: Date }) => void;
  /** Close */
  onClose: () => void;
}

export function QuickAddPopover({
  anchorX,
  anchorY,
  defaultStart,
  defaultEnd,
  onSave,
  onMoreOptions,
  onClose,
}: QuickAddPopoverProps) {
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState(toDatetimeLocal(defaultStart));
  const [endAt, setEndAt] = useState(toDatetimeLocal(defaultEnd));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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
    // Delay to avoid the click that opened the popover from closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Compute position so it stays in viewport
  const computeStyle = (): React.CSSProperties => {
    const popW = 340;
    const popH = 260;
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
        startAt: fromDatetimeLocal(startAt),
        endAt: fromDatetimeLocal(endAt),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMoreOptions = () => {
    onMoreOptions({
      title: title.trim(),
      startAt: fromDatetimeLocal(startAt),
      endAt: fromDatetimeLocal(endAt),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div ref={popoverRef} style={computeStyle()}>
      <div className="w-[340px] bg-white rounded-xl border border-slate-200 shadow-2xl p-4 space-y-3 animate-in fade-in-0 zoom-in-95 duration-150">
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

        {/* Title */}
        <Input
          ref={inputRef}
          placeholder="Add title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="text-lg font-semibold border-0 border-b border-slate-200 rounded-none px-0 h-10 focus-visible:ring-0 focus-visible:border-blue-500 placeholder:text-slate-300"
        />

        {/* Time range */}
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="flex-1 text-sm px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          <span className="text-slate-400 text-sm">to</span>
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className="flex-1 text-sm px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleMoreOptions}
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          >
            More options
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
