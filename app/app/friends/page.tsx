import Link from 'next/link';

export default function FriendsPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">Friends</h1>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-600">
          Friends feature coming soon.{' '}
          <Link
            href="/app"
            className="font-medium text-blue-600 hover:text-blue-700"
          >
            Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
