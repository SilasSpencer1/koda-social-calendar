'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { GuestPicker } from './GuestPicker';
import {
  EventFormSchema,
  type EventFormData,
  type CalendarEvent,
  TIMEZONE_OPTIONS,
  tzLabel,
  toDatetimeLocal,
  fromDatetimeLocal,
  defaultEventForm,
} from '@/lib/schemas/event';
import {
  Clock,
  MapPin,
  AlignLeft,
  Users,
  Eye,
  Shield,
  RefreshCw,
  Trash2,
  Globe,
  AlertCircle,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

interface EventEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, we're editing. Otherwise creating. */
  event?: CalendarEvent | null;
  /** Pre-fill start/end for new events (from quick-add or grid click) */
  defaultStart?: Date;
  defaultEnd?: Date;
  defaultTitle?: string;
  /** Callbacks */
  onSave: (
    data: EventFormData,
    eventId?: string
  ) => Promise<{ id: string } | void>;
  onDelete?: (eventId: string) => Promise<void>;
}

// ── Component ────────────────────────────────────────────────

export function EventEditorDialog({
  open,
  onOpenChange,
  event,
  defaultStart,
  defaultEnd,
  defaultTitle,
  onSave,
  onDelete,
}: EventEditorDialogProps) {
  const isEditing = !!event;

  // ── Form state ───────────────────────────────────────────

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [showTzPicker, setShowTzPicker] = useState(false);
  const [visibility, setVisibility] = useState<
    'PRIVATE' | 'FRIENDS' | 'PUBLIC'
  >('FRIENDS');
  const [coverMode, setCoverMode] = useState<'NONE' | 'BUSY_ONLY'>('NONE');
  const [syncToGoogle, setSyncToGoogle] = useState(false);
  const [guestIds, setGuestIds] = useState<string[]>([]);

  // ── UI state ─────────────────────────────────────────────

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);

  // ── Initialize form ──────────────────────────────────────

  const resetForm = useCallback(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setLocationName(event.locationName || '');
      setStartAt(toDatetimeLocal(new Date(event.startAt)));
      setEndAt(toDatetimeLocal(new Date(event.endAt)));
      setTimezone(
        event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      setVisibility(event.visibility);
      setCoverMode(event.coverMode);
      setSyncToGoogle(event.syncToGoogle || false);
      setGuestIds([]);
    } else {
      const defaults = defaultEventForm(defaultStart, defaultEnd);
      setTitle(defaultTitle || '');
      setDescription('');
      setLocationName('');
      setStartAt(toDatetimeLocal(defaults.startAt));
      setEndAt(toDatetimeLocal(defaults.endAt));
      setTimezone(defaults.timezone);
      setVisibility('FRIENDS');
      setCoverMode('NONE');
      setSyncToGoogle(false);
      setGuestIds([]);
    }
    setErrors({});
    setConfirmDelete(false);
  }, [event, defaultStart, defaultEnd, defaultTitle]);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  // ── Check Google connection ──────────────────────────────

  useEffect(() => {
    async function checkGoogle() {
      try {
        const res = await fetch('/api/integrations/google/status');
        if (res.ok) {
          const data = await res.json();
          setGoogleConnected(data.isConnected);
        }
      } catch {
        setGoogleConnected(false);
      }
    }
    if (open) checkGoogle();
  }, [open]);

  // ── Validation & save ────────────────────────────────────

  const validate = (): EventFormData | null => {
    const result = EventFormSchema.safeParse({
      title,
      description: description || undefined,
      locationName: locationName || undefined,
      startAt: fromDatetimeLocal(startAt),
      endAt: fromDatetimeLocal(endAt),
      timezone,
      visibility,
      coverMode,
      syncToGoogle,
      guestIds,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const err of result.error.errors) {
        const field = err.path[0]?.toString() || 'form';
        fieldErrors[field] = err.message;
      }
      setErrors(fieldErrors);
      return null;
    }

    // Extra: endAt > startAt
    if (result.data.endAt <= result.data.startAt) {
      setErrors({ endAt: 'End time must be after start time' });
      return null;
    }

    setErrors({});
    return result.data;
  };

  const handleSave = async () => {
    const data = validate();
    if (!data) return;

    setSaving(true);
    try {
      await onSave(data, event?.id);
      onOpenChange(false);
    } catch (err) {
      setErrors({
        form: err instanceof Error ? err.message : 'Failed to save event',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event?.id || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(event.id);
      onOpenChange(false);
    } catch (err) {
      setErrors({
        form: err instanceof Error ? err.message : 'Failed to delete event',
      });
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Edit Event' : 'Create Event'}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* Global error */}
          {errors.form && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              {errors.form}
            </div>
          )}

          {/* ─── Title ─────────────────────────────────── */}
          <div>
            <Input
              placeholder="Add title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-xl font-semibold border-0 border-b border-slate-200 rounded-none px-0 h-12 focus-visible:ring-0 focus-visible:border-blue-500 placeholder:text-slate-300"
              autoFocus
            />
            {errors.title && (
              <p className="text-xs text-red-500 mt-1">{errors.title}</p>
            )}
          </div>

          {/* ─── Date & Time ───────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Clock className="size-4 text-slate-400" />
              <span className="font-medium">Date & time</span>
            </div>

            <div className="grid grid-cols-2 gap-3 pl-6">
              <div>
                <Label className="text-xs text-slate-500">Start</Label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="w-full mt-1 text-sm px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
                {errors.startAt && (
                  <p className="text-xs text-red-500 mt-1">{errors.startAt}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-slate-500">End</Label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="w-full mt-1 text-sm px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                />
                {errors.endAt && (
                  <p className="text-xs text-red-500 mt-1">{errors.endAt}</p>
                )}
              </div>
            </div>

            {/* Timezone */}
            <div className="pl-6">
              <button
                type="button"
                onClick={() => setShowTzPicker(!showTzPicker)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors"
              >
                <Globe className="size-3" />
                {tzLabel(timezone)}
              </button>

              {showTzPicker && (
                <div className="mt-2 space-y-1.5">
                  <select
                    value={timezone}
                    onChange={(e) => {
                      setTimezone(e.target.value);
                      setShowTzPicker(false);
                    }}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz}>
                        {tzLabel(tz)}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Or type a timezone (e.g. Asia/Tokyo)"
                    className="text-sm h-8"
                    onBlur={(e) => {
                      if (e.target.value.trim()) {
                        setTimezone(e.target.value.trim());
                      }
                      setShowTzPicker(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) setTimezone(val);
                        setShowTzPicker(false);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* ─── Location ──────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="size-4 text-slate-400" />
              <span className="font-medium">Location</span>
            </div>
            <div className="pl-6">
              <Input
                placeholder="Add location"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <Separator />

          {/* ─── Description ───────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <AlignLeft className="size-4 text-slate-400" />
              <span className="font-medium">Description</span>
            </div>
            <div className="pl-6">
              <Textarea
                placeholder="Add description or notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>

          <Separator />

          {/* ─── Guests ────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Users className="size-4 text-slate-400" />
              <span className="font-medium">Guests</span>
            </div>
            <div className="pl-6">
              <GuestPicker selectedIds={guestIds} onChange={setGuestIds} />
            </div>
          </div>

          <Separator />

          {/* ─── Koda Extras ───────────────────────────── */}
          <div className="space-y-4">
            {/* Visibility */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Eye className="size-4 text-slate-400" />
                <span className="font-medium">Visibility</span>
              </div>
              <div className="pl-6 flex gap-1">
                {(
                  [
                    { value: 'PRIVATE', label: 'Private' },
                    { value: 'FRIENDS', label: 'Friends' },
                    { value: 'PUBLIC', label: 'Public' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVisibility(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all ${
                      visibility === opt.value
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cover Mode */}
            <div className="pl-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-slate-400" />
                <Label
                  htmlFor="cover-mode"
                  className="text-sm font-medium text-slate-600 cursor-pointer"
                >
                  Show as Busy to others
                </Label>
              </div>
              <Switch
                id="cover-mode"
                checked={coverMode === 'BUSY_ONLY'}
                onCheckedChange={(checked) =>
                  setCoverMode(checked ? 'BUSY_ONLY' : 'NONE')
                }
              />
            </div>

            {/* Sync to Google */}
            <div className="pl-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="size-4 text-slate-400" />
                <Label
                  htmlFor="sync-google"
                  className="text-sm font-medium text-slate-600 cursor-pointer"
                >
                  Sync to Google Calendar
                </Label>
                {googleConnected === false && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] text-slate-400"
                  >
                    Not connected
                  </Badge>
                )}
              </div>
              <div
                title={
                  googleConnected === false
                    ? 'Connect Google Calendar in Settings to enable sync'
                    : undefined
                }
              >
                <Switch
                  id="sync-google"
                  checked={syncToGoogle}
                  onCheckedChange={setSyncToGoogle}
                  disabled={googleConnected !== true}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* ─── Actions ───────────────────────────────── */}
          <div className="flex items-center justify-between pt-1">
            <div>
              {isEditing && onDelete && (
                <Button
                  type="button"
                  variant={confirmDelete ? 'destructive' : 'ghost'}
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className={
                    confirmDelete
                      ? ''
                      : 'text-red-500 hover:text-red-600 hover:bg-red-50'
                  }
                >
                  <Trash2 className="size-4 mr-1" />
                  {deleting
                    ? 'Deleting...'
                    : confirmDelete
                      ? 'Confirm Delete'
                      : 'Delete'}
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="min-w-[80px]"
              >
                {saving ? 'Saving...' : isEditing ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
