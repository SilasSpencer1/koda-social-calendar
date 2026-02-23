'use client';

import { Button } from '@/components/ui/button';
import { signIn } from 'next-auth/react';
import { useEffect, useState } from 'react';

interface GoogleIntegration {
  isConnected: boolean;
  loading: boolean;
}

export default function IntegrationsPage() {
  const [googleIntegration, setGoogleIntegration] = useState<GoogleIntegration>(
    {
      isConnected: false,
      loading: true,
    }
  );
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    checkGoogleIntegration();
  }, []);

  const checkGoogleIntegration = async () => {
    try {
      const response = await fetch('/api/integrations/google/status');
      const data = await response.json();
      setGoogleIntegration({
        isConnected: data.isConnected,
        loading: false,
      });
    } catch (error) {
      console.error('Failed to check Google integration:', error);
      setGoogleIntegration({
        isConnected: false,
        loading: false,
      });
    }
  };

  const handleConnect = async () => {
    await signIn('google', {
      callbackUrl: '/app/settings/integrations',
      redirect: true,
    });
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Google account?')) {
      return;
    }

    setDisconnecting(true);
    setMessage('');

    try {
      const response = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
      });

      if (!response.ok) {
        setMessage('Failed to disconnect Google account');
        return;
      }

      setMessage('Google account disconnected successfully');
      await checkGoogleIntegration();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to disconnect Google account:', error);
      setMessage('An error occurred while disconnecting');
    } finally {
      setDisconnecting(false);
    }
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
            message.includes('successfully')
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message}
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              Google Calendar
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Sync your Google Calendar events with Koda
            </p>
            <div className="mt-4">
              <div className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1">
                <div
                  className={`h-2 w-2 rounded-full mr-2 ${
                    googleIntegration.isConnected
                      ? 'bg-green-500'
                      : 'bg-gray-400'
                  }`}
                />
                <span className="text-sm font-medium text-gray-700">
                  {googleIntegration.isConnected
                    ? 'Connected'
                    : 'Not connected'}
                </span>
              </div>
            </div>
          </div>

          <div className="ml-4">
            {googleIntegration.loading ? (
              <Button disabled className="bg-gray-400">
                Loading...
              </Button>
            ) : googleIntegration.isConnected ? (
              <Button
                onClick={handleDisconnect}
                disabled={disconnecting}
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            ) : (
              <Button
                onClick={handleConnect}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Connect
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-medium">Coming soon</p>
        <p className="mt-1">
          Calendar sync will automatically pull events from your connected
          services.
        </p>
        <p className="mt-2 text-xs opacity-75">
          TODO: Implement calendar event syncing from Google Calendar (Epic
          1.2+)
        </p>
      </div>
    </div>
  );
}
