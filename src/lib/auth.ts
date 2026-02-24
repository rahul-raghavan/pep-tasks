import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { PepUser } from '@/types/database';

// Re-export permissions for convenience in server code
export { isAdmin, canAssignTo, canCreateUser, canVerifyTasks, canViewReportsFor, canManageUser, canManageTask, canDelegate, canDelegateTo, isWithinEditWindow, canCreatorEdit, canCreatorDelete } from '@/lib/permissions';

export const ALLOWED_DOMAINS = [
  'pepschoolv2.com',
  'accelschool.in',
  'ribbons.education',
];

export function isAllowedDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}

export async function getCurrentUser(): Promise<PepUser | null> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email) return null;

  if (!isAllowedDomain(authUser.email)) return null;

  const db = createServiceRoleClient();
  const { data: user } = await db
    .from('pep_users')
    .select('*')
    .eq('email', authUser.email.toLowerCase())
    .eq('is_active', true)
    .single();

  return user;
}
