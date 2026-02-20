'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PepUser } from '@/types/database';
import { isAdmin } from '@/lib/permissions';
import { NAV_ITEMS, ADMIN_NAV_ITEMS } from '@/lib/constants/theme';

interface BottomTabsProps {
  user: PepUser;
}

export function BottomTabs({ user }: BottomTabsProps) {
  const pathname = usePathname();
  const userIsAdmin = isAdmin(user.role);

  const tabs = userIsAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E5E4E2] lg:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-16">
        {tabs.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                isActive
                  ? 'text-[#5BB8D6] border-t-2 border-[#5BB8D6]'
                  : 'text-[#666666] border-t-2 border-transparent'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
