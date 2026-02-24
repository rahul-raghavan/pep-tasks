'use client';

import { useState, useEffect, useCallback } from 'react';

interface UsePushNotificationsReturn {
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  isLoading: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Lightweight check on mount — no SW registration, just check permission + existing subscription
  useEffect(() => {
    async function checkState() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setPermission('unsupported');
        setIsLoading(false);
        return;
      }

      setPermission(Notification.permission);

      // Only check subscription if SW is already registered (don't trigger registration)
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      }

      setIsLoading(false);
    }

    checkState();
  }, []);

  const subscribe = useCallback(async () => {
    try {
      setIsLoading(true);

      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setIsLoading(false);
        return;
      }

      // Register SW only when user opts in
      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (res.ok) {
        setIsSubscribed(true);
      } else {
        console.error('Failed to save subscription on server');
      }
    } catch (err) {
      console.error('Error subscribing to push:', err);
    }
    setIsLoading(false);
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      setIsLoading(true);

      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          await subscription.unsubscribe();
        }
      }

      setIsSubscribed(false);
    } catch (err) {
      console.error('Error unsubscribing from push:', err);
    }
    setIsLoading(false);
  }, []);

  return { permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
