import { UserRole } from '@/types/database';

// Role hierarchy: super_admin > admin > staff
const ROLE_LEVEL: Record<UserRole, number> = {
  super_admin: 3,
  admin: 2,
  staff: 1,
};

export function canAssignTo(assignerRole: UserRole, targetRole: UserRole): boolean {
  if (assignerRole === 'staff') return false;
  return ROLE_LEVEL[assignerRole] >= ROLE_LEVEL[targetRole];
}

export function canCreateUser(creatorRole: UserRole, newUserRole: UserRole): boolean {
  if (creatorRole === 'staff') return false;
  return ROLE_LEVEL[creatorRole] >= ROLE_LEVEL[newUserRole];
}

export function canViewReportsFor(viewerRole: UserRole, targetRole: UserRole): boolean {
  if (viewerRole === 'staff') return false;
  return ROLE_LEVEL[viewerRole] >= ROLE_LEVEL[targetRole];
}

export function canVerifyTasks(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin';
}

export function isAdmin(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin';
}
