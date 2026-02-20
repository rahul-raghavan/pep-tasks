'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PepUser } from '@/types/database';
import { isAdmin } from '@/lib/permissions';
import { NAV_ITEMS, ADMIN_NAV_ITEMS } from '@/lib/constants/theme';

interface SidebarProps {
  user: PepUser;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const userIsAdmin = isAdmin(user.role);

  return (
    <div className="flex flex-col w-64 bg-white border-r border-[#E5E4E2] min-h-screen">
      <div className="p-4 border-b border-[#E5E4E2]">
        <h1 className="text-lg font-medium uppercase tracking-[0.15em] text-[#5BB8D6]">
          PEP Tasks
        </h1>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#5BB8D6]/10 text-[#5BB8D6] border-l-2 border-[#5BB8D6] -ml-[2px]'
                  : 'text-[#333333] hover:bg-[#F0EFED]'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}

        {userIsAdmin && (
          <>
            <div className="pt-4 pb-2">
              <p className="px-3 text-xs font-medium uppercase tracking-[0.15em] text-[#5BB8D6]">
                Admin
              </p>
            </div>
            {ADMIN_NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-[#5BB8D6]/10 text-[#5BB8D6] border-l-2 border-[#5BB8D6] -ml-[2px]'
                      : 'text-[#333333] hover:bg-[#F0EFED]'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-[#E5E4E2]">
        <div className="text-xs text-[#666666]">
          {user.name || user.email.split('@')[0]}
        </div>
        <div className="text-xs text-[#888888] capitalize">{user.role.replace('_', ' ')}</div>
      </div>
    </div>
  );
}
