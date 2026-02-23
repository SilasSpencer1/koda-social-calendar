'use client';

import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CalendarEvent } from '@/lib/schemas/event';
import {
  X,
  Clock,
  MapPin,
  Pencil,
  Trash2,
  Eye,
  Shield,
  Users,
} from 'lucide-react';

interface EventDetailsPopoverProps {
  event: CalendarEvent;
  /** Viewport coords to anchor near */
  anchorX: number;
  anchorY: number;
  /** Is current user the owner? */
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onViewDetails: () => void;
}

export function EventDetailsPopover({
  event,
  anchorX,
  anchorY,
  isOwner,
  onEdit,
  onDelete,
  onClose,
  onViewDetails,
}: EventDetailsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

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

  const computeStyle = (): React.CSSProperties => {
    const popW = 360;
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

  const startTime = new Date(event.startAt);
  const endTime = new Date(event.endAt);

  const visibilityMap: Record<string, { label: string; color: string }> = {
    PRIVATE: { label: 'Private', color: 'text-orange-600 bg-orange-50' },
    FRIENDS: { label: 'Friends', color: 'text-blue-600 bg-blue-50' },
    PUBLIC: { label: 'Public', color: 'text-green-600 bg-green-50' },
  };

  const vis = visibilityMap[event.visibility] || visibilityMap.FRIENDS;
  const attendeeCount = event.attendees?.length || 0;

  return (
    <div ref={popoverRef} style={computeStyle()}>
      <div className="w-[360px] bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Color bar */}
        <div className="h-2 bg-gradient-to-r from-blue-500 to-violet-500" />

        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900 leading-snug">
              {event.title}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              {isOwner && (
                <>
                  <button
                    type="button"
                    onClick={onEdit}
                    className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit event"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete event"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Time */}
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Clock className="size-4 text-slate-400 shrink-0" />
            <span>
              {startTime.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
              {', '}
              {startTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
              {' \u2013 '}
              {endTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </span>
          </div>

          {/* Location */}
          {event.locationName && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="size-4 text-slate-400 shrink-0" />
              <span className="truncate">{event.locationName}</span>
            </div>
          )}

          {/* Description preview */}
          {event.description && (
            <p className="text-sm text-slate-500 line-clamp-2">
              {event.description}
            </p>
          )}

          {/* Meta badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={`text-xs ${vis.color}`}>
              <Eye className="size-3 mr-1" />
              {vis.label}
            </Badge>
            {event.coverMode === 'BUSY_ONLY' && (
              <Badge
                variant="secondary"
                className="text-xs text-amber-600 bg-amber-50"
              >
                <Shield className="size-3 mr-1" />
                Busy
              </Badge>
            )}
            {attendeeCount > 1 && (
              <Badge variant="secondary" className="text-xs">
                <Users className="size-3 mr-1" />
                {attendeeCount} guests
              </Badge>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="default"
              size="sm"
              onClick={onViewDetails}
              className="flex-1"
            >
              View Details
            </Button>
            {isOwner && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
