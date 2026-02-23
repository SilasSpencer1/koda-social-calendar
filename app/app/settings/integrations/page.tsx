'use client';

import { Button } from '@/components/ui/button';
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
  const [state, setState] = useState<ConnectionState>({
    isConnected: false,
    connection: null,
    loading: true,
  });
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState('');
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
    setMessage('');

    try {
      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
      });
      if (!res.ok) {
        setMessage('Failed to disconnect Google account');
        return;
      }
      setMessage('Google account disconnected successfully');
      await fetchConnection();
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('An error occurred while disconnecting');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage('');
    setLastSync(null);

    try {
      const res = await fetch('/api/integrations/google/sync', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Sync failed');
        return;
      }

      setLastSync(data);
      setMessage('Sync completed successfully');
      await fetchConnection();
      setTimeout(() => setMessage(''), 5000);
    } catch {
      setMessage('An error occurred during sync');
    } finally {
      setSyncing(false);
    }
  };

  const handleTogglePush = async () => {
    try {
      const newValue = !state.connection?.pushEnabled;
      const res = await fetch('/api/integrations/google/connection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pushEnabled: newValue }),
      });

      if (res.ok) {
        await fetchConnection();
      }
    } catch {
      setMessage('Failed to update push setting');
    }
  };

  const formatLastSynced = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
        <p className="mt-2 text-gray-600">
          Connect external services to sync your calendar and data
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg p-4 ${
            message.includes('successfully') || message.includes('completed')
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message}
        </div>
      )}

      {/* Google Calendar Card */}
      <div className="rounded-lg bg-white p-6 shadow-sm border border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex-1">
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
                <h2 className="text-lg font-semibold text-gray-900">
                  Google Calendar
                </h2>
                <p className="text-sm text-gray-600">
                  2-way sync between Koda and Google Calendar
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1">
                <div
                  className={`h-2 w-2 rounded-full mr-2 ${
                    state.isConnected ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                />
                <span className="text-sm font-medium text-gray-700">
                  {state.loading
                    ? 'Checking...'
                    : state.isConnected
                      ? 'Connected'
                      : 'Not connected'}
                </span>
              </div>
              {state.connection?.lastSyncedAt && (
                <span className="text-xs text-gray-500">
                  Last synced: {formatLastSynced(state.connection.lastSyncedAt)}
                </span>
              )}
            </div>
          </div>

          <div className="ml-4 flex flex-col gap-2">
            {state.loading ? (
              <Button disabled className="bg-gray-400">
                Loading...
              </Button>
            ) : state.isConnected ? (
              <>
                <Button
                  onClick={handleSync}
                  disabled={syncing}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Button>
                <Button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </>
            ) : (
              <Button
                onClick={handleConnect}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Connect
              </Button>
            )}
          </div>
        </div>

        {/* Sync settings (only when connected) */}
        {state.isConnected && (
          <div className="mt-6 border-t border-gray-100 pt-4 space-y-4">
            {/* Push toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Push Koda events to Google
                </p>
                <p className="text-xs text-gray-500">
                  When enabled, Koda-created events will sync to your Google
                  Calendar
                </p>
              </div>
              <button
                onClick={handleTogglePush}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  state.connection?.pushEnabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
                role="switch"
                aria-checked={state.connection?.pushEnabled ?? false}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    state.connection?.pushEnabled
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Sync window info */}
            <div className="text-xs text-gray-500">
              Sync window: {state.connection?.syncWindowPastDays ?? 30} days
              past
              {' / '}
              {state.connection?.syncWindowFutureDays ?? 90} days future
            </div>
          </div>
        )}

        {/* Sync results */}
        {lastSync && (
          <div className="mt-4 rounded-lg bg-blue-50 p-3">
            <p className="text-sm font-medium text-blue-900">Sync Results</p>
            <div className="mt-1 grid grid-cols-4 gap-2 text-xs text-blue-800">
              <div>Pulled: {lastSync.pulled}</div>
              <div>Pushed: {lastSync.pushed}</div>
              <div>Updated: {lastSync.updated}</div>
              <div>Deleted: {lastSync.deleted}</div>
            </div>
            {lastSync.errors.length > 0 && (
              <div className="mt-2 text-xs text-red-600">
                {lastSync.errors.length} error(s) occurred during sync
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
