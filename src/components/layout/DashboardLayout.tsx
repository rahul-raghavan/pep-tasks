'use client';

import { ReactNode, createContext, useContext } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomTabs } from './MobileNav';
import { PepUser } from '@/types/database';

interface UserContextType {
  user: PepUser;
}

const UserContext = createContext<UserContextType | null>(null);

export function useUserContext() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUserContext must be used within DashboardLayout');
  }
  return context;
}

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, isLoading, signOut } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Not authenticated</div>
      </div>
    );
  }

  return (
    <UserContext.Provider value={{ user }}>
      <div className="flex min-h-screen bg-background">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <Sidebar user={user} />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <Header
            user={user}
            onSignOut={signOut}
          />
          <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6 overflow-x-hidden">
            <div className="max-w-[1100px] mx-auto">
              {children}
            </div>
          </main>
        </div>

        {/* Mobile Bottom Tabs */}
        <BottomTabs user={user} />
      </div>
    </UserContext.Provider>
  );
}
