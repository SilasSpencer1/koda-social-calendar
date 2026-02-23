'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ToastProvider } from '@/components/ui/toast';
import { User, Shield, Puzzle, Bell } from 'lucide-react';

const navItems = [
  { href: '/app/settings/profile', label: 'Profile', icon: User },
  { href: '/app/settings/privacy', label: 'Privacy', icon: Shield },
  {
    href: '/app/settings/integrations',
    label: 'Integrations',
    icon: Puzzle,
  },
  {
    href: '/app/settings/notifications',
    label: 'Notifications',
    icon: Bell,
  },
];

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ToastProvider>
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

        {/* Mobile navigation - horizontal scrollable tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200 pb-px md:hidden">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <nav className="hidden w-48 shrink-0 md:block">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Content panel */}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </ToastProvider>
  );
}
