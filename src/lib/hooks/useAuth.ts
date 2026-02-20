'use client';

import { createClient } from '@/lib/supabase/client';
import { PepUser } from '@/types/database';
import { useEffect, useState } from 'react';

interface AuthState {
  user: PepUser | null;
  isLoading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
  });

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser?.email) {
        setState({ user: null, isLoading: false });
        return;
      }

      const { data: user } = await supabase
        .from('pep_users')
        .select('*')
        .eq('email', authUser.email.toLowerCase())
        .eq('is_active', true)
        .single();

      if (!user) {
        await supabase.auth.signOut();
        setState({ user: null, isLoading: false });
        return;
      }

      setState({ user, isLoading: false });
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return { ...state, signOut };
}
