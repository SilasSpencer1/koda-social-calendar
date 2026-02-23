'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

export default function NotificationsSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [emailInvitesEnabled, setEmailInvitesEnabled] = useState(true);
  const [emailDigestEnabled, setEmailDigestEnabled] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.settings) {
          setEmailInvitesEnabled(data.settings.emailInvitesEnabled ?? true);
          setEmailDigestEnabled(data.settings.emailDigestEnabled ?? false);
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
      const res = await fetch('/api/me/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailInvitesEnabled,
          emailDigestEnabled,
        }),
      });
      if (!res.ok) {
        toast('Failed to save', 'error');
        return;
      }
      toast('Notification settings saved');
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
          {[1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose how and when Koda notifies you.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">
          Email notifications
        </h3>

        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
          <div>
            <Label htmlFor="email-invites">Event invitations</Label>
            <p className="mt-1 text-xs text-gray-500">
              Receive an email when someone invites you to an event.
            </p>
          </div>
          <Switch
            id="email-invites"
            checked={emailInvitesEnabled}
            onCheckedChange={setEmailInvitesEnabled}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
          <div>
            <Label htmlFor="email-digest">Weekly digest</Label>
            <p className="mt-1 text-xs text-gray-500">
              A weekly summary of your upcoming events and friend activity.
            </p>
          </div>
          <Switch
            id="email-digest"
            checked={emailDigestEnabled}
            onCheckedChange={setEmailDigestEnabled}
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="">
        {saving ? 'Saving...' : 'Save changes'}
      </Button>
    </div>
  );
}
