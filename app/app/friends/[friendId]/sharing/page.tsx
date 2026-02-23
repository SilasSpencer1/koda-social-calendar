'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface SharingSettings {
  canViewCalendar: boolean;
  detailLevel: 'BUSY_ONLY' | 'DETAILS';
}

interface Friendship {
  id: string;
  user: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
  canViewCalendar: boolean;
  detailLevel: string;
}

export default function SharingSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const friendId = params.friendId as string;

  const [settings, setSettings] = useState<SharingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  // Fetch current settings from the friendship
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        // First, get all friendships to find the one with this friend
        const response = await fetch('/api/friends');

        if (!response.ok) {
          setError('Failed to load sharing settings');
          return;
        }

        const data = await response.json();
        // Find the friendship with this friend
        const allFriendships = [
          ...(data.accepted || []),
          ...(data.incomingPending || []),
          ...(data.outgoingPending || []),
        ];

        const friendship = allFriendships.find(
          (f: Friendship) => f.user.id === friendId
        );

        if (!friendship) {
          setError('Friendship not found');
          return;
        }

        setFriendshipId(friendship.id);
        setSettings({
          canViewCalendar: friendship.canViewCalendar ?? false,
          detailLevel: friendship.detailLevel ?? 'BUSY_ONLY',
        });
      } catch (err) {
        console.error('Error fetching settings:', err);
        setError('An error occurred while loading settings.');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [friendId]);

  const handleSave = async () => {
    if (!settings || !friendshipId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/friends/${friendshipId}/sharing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to save settings');
        return;
      }

      setSuccess('Settings saved successfully!');
      setTimeout(() => {
        router.push('/app/friends');
      }, 1500);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('An error occurred while saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="text-red-800">Could not load sharing settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Sharing Settings</h1>
        <Link
          href="/app/friends"
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          ← Back to Friends
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          {success}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-8">
        <div className="space-y-6">
          {/* Allow Calendar View Toggle */}
          <div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.canViewCalendar}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    canViewCalendar: e.target.checked,
                  })
                }
                disabled={saving}
                className="h-5 w-5 rounded border-gray-300 text-blue-600"
              />
              <span className="text-lg font-medium text-gray-900">
                Allow this friend to view my calendar
              </span>
            </label>
            <p className="mt-2 text-sm text-gray-600">
              When disabled, this friend cannot see any of your calendar events.
            </p>
          </div>

          {/* Detail Level Selection */}
          {settings.canViewCalendar && (
            <div>
              <p className="mb-4 text-lg font-medium text-gray-900">
                Calendar Detail Level
              </p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
                  <input
                    type="radio"
                    name="detailLevel"
                    value="BUSY_ONLY"
                    checked={settings.detailLevel === 'BUSY_ONLY'}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        detailLevel: e.target.value as 'BUSY_ONLY' | 'DETAILS',
                      })
                    }
                    disabled={saving}
                    className="mt-1 h-4 w-4 border-gray-300 text-blue-600"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Busy Only</p>
                    <p className="text-sm text-gray-600">
                      Show when you&apos;re busy, but not event details (title,
                      location, etc.)
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
                  <input
                    type="radio"
                    name="detailLevel"
                    value="DETAILS"
                    checked={settings.detailLevel === 'DETAILS'}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        detailLevel: e.target.value as 'BUSY_ONLY' | 'DETAILS',
                      })
                    }
                    disabled={saving}
                    className="mt-1 h-4 w-4 border-gray-300 text-blue-600"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Full Details</p>
                    <p className="text-sm text-gray-600">
                      Show event titles, times, and locations (except for
                      private events)
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex gap-3 border-t border-gray-200 pt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <Link
              href="/app/friends"
              className="rounded-lg border border-gray-300 px-6 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
