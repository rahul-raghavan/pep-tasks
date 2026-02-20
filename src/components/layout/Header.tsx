'use client';

import { PepUser } from '@/types/database';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut } from 'lucide-react';

interface HeaderProps {
  user: PepUser;
  onSignOut: () => void;
}

export function Header({ user, onSignOut }: HeaderProps) {
  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : (user.email?.[0] || 'U').toUpperCase();

  return (
    <header className="bg-white border-b border-[#E5E4E2] px-4 lg:px-6 py-3 sticky top-0 z-30">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium uppercase tracking-[0.15em] text-[#5BB8D6] lg:hidden">
          PEP Tasks
        </h2>
        <div className="hidden lg:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 focus:outline-none">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[#5BB8D6] text-white text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-[#333333] hidden sm:inline">
                {user.name || user.email.split('@')[0]}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user.name || 'User'}</span>
                <span className="text-xs font-normal text-[#666666] truncate">
                  {user.email}
                </span>
                <span className="text-xs font-normal text-[#888888] capitalize mt-0.5">
                  {user.role.replace('_', ' ')}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} className="text-[#D4705A]">
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
