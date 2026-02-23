'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

type Visibility = 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE';
type DetailLevel = 'DETAILS' | 'BUSY_ONLY';

const visibilityOptions: {
  value: Visibility;
  label: string;
  description: string;
}[] = [
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Anyone can find you and see your basic info.',
  },
  {
    value: 'FRIENDS_ONLY',
    label: 'Friends only',
    description: 'Only your friends can see your profile and calendar.',
  },
  {
    value: 'PRIVATE',
    label: 'Private',
    description: "You won't appear in search results.",
  },
];

const detailOptions: {
  value: DetailLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 'DETAILS',
    label: 'Full details',
    description: 'Friends see event titles, times, and locations.',
  },
  {
    value: 'BUSY_ONLY',
    label: 'Busy only',
    description:
      "Friends only see that you're busy, not event details. Per-friend overrides can still grant full details.",
  },
];

export default function PrivacySettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [accountVisibility, setAccountVisibility] =
    useState<Visibility>('FRIENDS_ONLY');
  const [defaultDetailLevel, setDefaultDetailLevel] =
    useState<DetailLevel>('BUSY_ONLY');
  const [allowSuggestions, setAllowSuggestions] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.settings) {
          setAccountVisibility(data.settings.accountVisibility);
          setDefaultDetailLevel(data.settings.defaultDetailLevel);
          setAllowSuggestions(data.settings.allowSuggestions);
        }
      } catch {
        toast('Failed to load settings', 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/me/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountVisibility,
          defaultDetailLevel,
          allowSuggestions,
        }),
      });
      if (!res.ok) {
        toast('Failed to save', 'error');
        return;
      }
      toast('Privacy settings saved');
    } catch {
      toast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Privacy</h2>
        <p className="mt-1 text-sm text-gray-500">
          Control who can see your profile and calendar information.
        </p>
      </div>

      {/* Account visibility */}
      <div className="space-y-3">
        <Label>Account visibility</Label>
        <div className="space-y-2">
          {visibilityOptions.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                accountVisibility === opt.value
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                checked={accountVisibility === opt.value}
                onChange={() => setAccountVisibility(opt.value)}
                className="mt-0.5 accent-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Default calendar detail level */}
      <div className="space-y-3">
        <Label>Default calendar detail level</Label>
        <p className="-mt-1 text-xs text-gray-500">
          This is the default for new friends. You can override per-friend in
          sharing settings.
        </p>
        <div className="space-y-2">
          {detailOptions.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                defaultDetailLevel === opt.value
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="detailLevel"
                value={opt.value}
                checked={defaultDetailLevel === opt.value}
                onChange={() => setDefaultDetailLevel(opt.value)}
                className="mt-0.5 accent-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Allow suggestions toggle */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
        <div>
          <Label htmlFor="suggestions">Allow Discover suggestions</Label>
          <p className="mt-1 text-xs text-gray-500">
            Let Koda suggest events and activities based on your interests.
          </p>
        </div>
        <Switch
          id="suggestions"
          checked={allowSuggestions}
          onCheckedChange={setAllowSuggestions}
        />
      </div>

      <Button onClick={handleSave} disabled={saving} className="">
        {saving ? 'Saving...' : 'Save changes'}
      </Button>
    </div>
  );
}
