'use client';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { signIn } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';

interface ConnectionState {
  isConnected: boolean;
  connection: {
    isEnabled: boolean;
    pushEnabled: boolean;
    lastSyncedAt: string | null;
    syncWindowPastDays: number;
    syncWindowFutureDays: number;
  } | null;
  loading: boolean;
}

interface SyncSummary {
  pulled: number;
  pushed: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export default function IntegrationsPage() {
  const toast = useToast();
  const [state, setState] = useState<ConnectionState>({
    isConnected: false,
    connection: null,
    loading: true,
  });
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [lastSync, setLastSync] = useState<SyncSummary | null>(null);

  const fetchConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/google/connection');
      const data = await res.json();
      setState({
        isConnected: data.isConnected,
        connection: data.connection,
        loading: false,
      });
    } catch {
      setState({ isConnected: false, connection: null, loading: false });
    }
  }, []);

  useEffect(() => {
    fetchConnection();
  }, [fetchConnection]);

  const handleConnect = async () => {
    await signIn('google', {
      callbackUrl: '/app/settings/integrations',
      redirect: true,
    });
  };

  const handleDisconnect = async () => {
    if (
      !confirm(
        'Are you sure you want to disconnect your Google account? Imported events will be kept but stop syncing.'
      )
    ) {
      return;
    }

    setDisconnecting(true);
    try {
      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
      });
      if (!res.ok) {
        toast('Failed to disconnect Google account', 'error');
        return;
      }
      toast('Google account disconnected');
      await fetchConnection();
    } catch {
      toast('An error occurred while disconnecting', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setLastSync(null);

    try {
      const res = await fetch('/api/integrations/google/sync', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        toast(data.error || 'Sync failed', 'error');
        return;
      }

      setLastSync(data);
      toast('Sync completed');
      await fetchConnection();
    } catch {
      toast('An error occurred during sync', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleTogglePush = async (checked: boolean) => {
    try {
      const res = await fetch('/api/integrations/google/connection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pushEnabled: checked }),
      });

      if (res.ok) {
        await fetchConnection();
        toast(checked ? 'Push to Google enabled' : 'Push to Google disabled');
      } else {
        toast('Failed to update setting', 'error');
      }
    } catch {
      toast('Failed to update setting', 'error');
    }
  };

  const formatLastSynced = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (state.loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-48 animate-pulse rounded-lg bg-gray-200" />
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Integrations</h2>
        <p className="mt-1 text-sm text-gray-500">
          Connect external services to sync your calendar and data.
        </p>
      </div>

      {/* Google Calendar Card */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <svg
                  className="h-6 w-6 text-blue-600"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15c0 .825.675 1.5 1.5 1.5h15c.825 0 1.5-.675 1.5-1.5v-15c0-.825-.675-1.5-1.5-1.5zm0 16.5h-15V8.25h15v11.25z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Google Calendar
                </h3>
                <p className="text-xs text-gray-500">
                  2-way sync between Koda and Google Calendar
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  state.isConnected ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <span className="text-xs font-medium text-gray-600">
                {state.isConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>
          </div>

          {/* Last synced */}
          {state.connection?.lastSyncedAt && (
            <p className="mt-3 text-xs text-gray-400">
              Last synced: {formatLastSynced(state.connection.lastSyncedAt)}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-gray-100 px-5 py-4">
          {state.isConnected ? (
            <div className="space-y-4">
              {/* Push toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="push-google">
                    Push Koda events to Google
                  </Label>
                  <p className="text-xs text-gray-500">
                    Koda-created events will sync to your Google Calendar
                  </p>
                </div>
                <Switch
                  id="push-google"
                  checked={state.connection?.pushEnabled ?? false}
                  onCheckedChange={handleTogglePush}
                />
              </div>

              {/* Sync window info */}
              <p className="text-xs text-gray-400">
                Sync window: {state.connection?.syncWindowPastDays ?? 30} days
                past / {state.connection?.syncWindowFutureDays ?? 90} days
                future
              </p>

              {/* Buttons */}
              <div className="flex gap-2">
                <Button onClick={handleSync} disabled={syncing} size="sm">
                  {syncing ? 'Syncing...' : 'Sync now'}
                </Button>
                <Button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={handleConnect} className="">
              Connect Google Calendar
            </Button>
          )}
        </div>

        {/* Sync results */}
        {lastSync && (
          <div className="border-t border-gray-100 px-5 py-3">
            <p className="text-xs font-medium text-blue-900">Sync Results</p>
            <div className="mt-1 grid grid-cols-4 gap-2 text-xs text-blue-800">
              <div>Pulled: {lastSync.pulled}</div>
              <div>Pushed: {lastSync.pushed}</div>
              <div>Updated: {lastSync.updated}</div>
              <div>Deleted: {lastSync.deleted}</div>
            </div>
            {lastSync.errors.length > 0 && (
              <p className="mt-1 text-xs text-red-600">
                {lastSync.errors.length} error(s) occurred during sync
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
