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

// Can this user manage (edit/deactivate) a target user?
// Admins can only manage admin + staff, not super_admins.
export function canManageUser(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'staff') return false;
  return ROLE_LEVEL[actorRole] > ROLE_LEVEL[targetRole] || actorRole === targetRole;
}

// Can this user delegate a task?
// Staff can't delegate. Super_admin always can. Admin can only delegate tasks assigned to themselves.
export function canDelegate(actorRole: UserRole, actorId: string, taskAssignedTo: string | null): boolean {
  if (actorRole === 'staff') return false;
  if (actorRole === 'super_admin') return true;
  // Admin can only delegate tasks assigned to themselves
  return actorId === taskAssignedTo;
}

// Can a user of this role be a delegate? Only staff can be delegated to.
export function canDelegateTo(targetRole: UserRole): boolean {
  return targetRole === 'staff';
}

// Can this user manage a task that involves a target role?
// Admins can't touch tasks assigned to/by super_admins.
export function canManageTask(actorRole: UserRole, targetRole: UserRole | null | undefined): boolean {
  if (actorRole === 'super_admin') return true;
  if (actorRole === 'staff') return false;
  // admin — can manage admin + staff, not super_admin
  if (targetRole === 'super_admin') return false;
  return true;
}
