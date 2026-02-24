import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Get all user IDs that share centers with the given user.
 * Returns [] if the user has no centers (they only see their own tasks).
 * Never called for super_admin — caller should skip.
 */
export async function getCenterUserIds(
  db: SupabaseClient,
  userId: string
): Promise<string[]> {
  // Step 1: Get center IDs for this user
  const { data: userCenters } = await db
    .from('pep_user_centers')
    .select('center_id')
    .eq('user_id', userId);

  if (!userCenters || userCenters.length === 0) return [];

  const centerIds = userCenters.map((uc: { center_id: string }) => uc.center_id);

  // Step 2: Get all user IDs in those centers
  const { data: centerMembers } = await db
    .from('pep_user_centers')
    .select('user_id')
    .in('center_id', centerIds);

  if (!centerMembers || centerMembers.length === 0) return [];

  // Deduplicate
  return [...new Set(centerMembers.map((cm: { user_id: string }) => cm.user_id))];
}
