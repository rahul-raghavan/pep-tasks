/**
 * Format a user's name for display as "First L." when a last name exists.
 * Falls back to email username or "Unknown".
 *
 * "Priya Sharma"              → "Priya S."
 * "Rahul"                     → "Rahul"
 * null + "rahul@pep.school"   → "rahul"
 * null + undefined            → "Unknown"
 */
export function formatDisplayName(
  name: string | null | undefined,
  email?: string | null,
): string {
  if (!name) return email ? email.split('@')[0] : 'Unknown';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }
  return parts[0];
}
