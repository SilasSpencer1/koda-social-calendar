import { getCurrentUser, signOut } from '@/lib/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NotificationBell } from '@/components/notifications/NotificationBell';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?callbackUrl=%2Fapp');
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 border-r border-gray-200 bg-white">
        <div className="p-6">
          <Link href="/app" className="text-xl font-bold text-gray-900">
            Koda
          </Link>
        </div>

        <nav className="space-y-2 px-4 py-6">
          <Link
            href="/app"
            className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Feed
          </Link>
          <Link
            href="/app/calendar"
            className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Calendar
          </Link>
          <Link
            href="/app/friends"
            className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Friends
          </Link>
          <Link
            href="/app/discover"
            className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Discover
          </Link>
          <NotificationBell />
          <Link
            href="/app/settings"
            className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Settings
          </Link>
        </nav>

        <div className="border-t border-gray-200 p-4">
          <div className="mb-4 flex items-center gap-3">
            {user.image ? (
              <img
                src={user.image}
                alt={user.name || ''}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                {user.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {user.name}
              </p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
