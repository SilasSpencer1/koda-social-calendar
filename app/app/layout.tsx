import { getCurrentUser, signOut } from '@/lib/auth';
import Link from 'next/link';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

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
            Dashboard
          </Link>
          <Link
            href="/app/friends"
            className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Friends
          </Link>
          <Link
            href="/app/settings/integrations"
            className="block rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            Integrations
          </Link>
        </nav>

        <div className="border-t border-gray-200 p-4">
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
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
