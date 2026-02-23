import { getCurrentUser } from '@/lib/auth';

export default async function AppPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome, {user?.name}!
        </h1>
        <p className="mt-2 text-gray-600">
          You&apos;re all set. Start exploring Koda.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900">Share Calendar</h3>
          <p className="mt-2 text-sm text-gray-600">
            Control exactly what friends can see about your schedule
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900">Find Friends</h3>
          <p className="mt-2 text-sm text-gray-600">
            Connect with friends and coordinate group activities
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900">Discover Events</h3>
          <p className="mt-2 text-sm text-gray-600">
            Find activities and events happening near you
          </p>
        </div>
      </div>
    </div>
  );
}
