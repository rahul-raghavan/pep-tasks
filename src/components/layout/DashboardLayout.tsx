'use client';

import { ReactNode, createContext, useContext, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomTabs } from './MobileNav';
import { PepUser } from '@/types/database';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

function NotificationBanner() {
  const { permission, isSubscribed, isLoading, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  // Hide if: loading, already subscribed, permission denied, unsupported, or dismissed
  if (isLoading || isSubscribed || permission === 'denied' || permission === 'unsupported' || dismissed) {
    return null;
  }

  return (
    <div className="bg-[#5BB8D6]/10 border-b border-[#5BB8D6]/20 px-4 py-2.5 flex items-center gap-3">
      <Bell className="w-4 h-4 text-[#5BB8D6] shrink-0" />
      <p className="text-sm text-foreground/80 flex-1">
        Enable notifications to get alerts when tasks are assigned or updated.
      </p>
      <Button size="sm" variant="default" className="h-7 text-xs" onClick={subscribe}>
        Enable
      </Button>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted-foreground hover:text-foreground p-1"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
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
          <NotificationBanner />
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
