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

// --- Multi-verification helpers ---

export interface VerificationSlot {
  role: 'assigned_by' | 'assigned_to';
  userId: string;
  label: string; // "assigner" or "delegator"
  filled: boolean;
}

export interface VerificationRequirements {
  slots: VerificationSlot[];
  canVerify: boolean;
  availableSlot: 'assigned_by' | 'assigned_to' | null;
}

/**
 * Determine which verification slots are required for a task,
 * and whether the current user can fill one.
 */
export function getVerificationRequirements(
  userRole: UserRole,
  userId: string,
  assignedBy: string | null,
  assignedTo: string | null,
  delegatedTo: string | null,
  filledSlots: Array<{ verifier_role: string }>
): VerificationRequirements {
  const filledSet = new Set(filledSlots.map((s) => s.verifier_role));

  // Build required slots
  const slots: VerificationSlot[] = [];

  // assigned_by always verifies (as "assigner")
  if (assignedBy) {
    slots.push({
      role: 'assigned_by',
      userId: assignedBy,
      label: 'assigner',
      filled: filledSet.has('assigned_by'),
    });
  }

  // For delegated tasks, assigned_to also verifies (as "delegator")
  // But only if assigned_to is a different person from assigned_by
  if (delegatedTo && assignedTo && assignedTo !== assignedBy) {
    slots.push({
      role: 'assigned_to',
      userId: assignedTo,
      label: 'delegator',
      filled: filledSet.has('assigned_to'),
    });
  }

  // Determine if current user can fill any slot
  let canVerify = false;
  let availableSlot: 'assigned_by' | 'assigned_to' | null = null;

  // Staff can never verify
  if (userRole === 'staff') {
    return { slots, canVerify: false, availableSlot: null };
  }

  // Super_admin can fill any unfilled slot
  if (userRole === 'super_admin') {
    const unfilled = slots.find((s) => !s.filled);
    if (unfilled) {
      canVerify = true;
      availableSlot = unfilled.role;
    }
    return { slots, canVerify, availableSlot };
  }

  // Regular admin: can only fill slots where they are the designated verifier
  for (const slot of slots) {
    if (!slot.filled && slot.userId === userId) {
      canVerify = true;
      availableSlot = slot.role;
      break;
    }
  }

  return { slots, canVerify, availableSlot };
}

/**
 * Check if all required verification slots are filled.
 */
export function isFullyVerified(
  delegatedTo: string | null,
  assignedBy: string | null,
  assignedTo: string | null,
  filledSlots: Array<{ verifier_role: string }>
): boolean {
  const filledSet = new Set(filledSlots.map((s) => s.verifier_role));

  // assigned_by slot is always required
  if (assignedBy && !filledSet.has('assigned_by')) return false;

  // For delegated tasks where assigned_to differs from assigned_by,
  // assigned_to slot is also required
  if (delegatedTo && assignedTo && assignedTo !== assignedBy) {
    if (!filledSet.has('assigned_to')) return false;
  }

  return true;
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

// Is the given timestamp within the 24-hour edit window?
export function isWithinEditWindow(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return now - created < twentyFourHours;
}

// Can the creator edit this task? Must be admin+, be the creator, and within 24h window.
export function canCreatorEdit(userId: string, taskAssignedBy: string | null, taskCreatedAt: string): boolean {
  if (userId !== taskAssignedBy) return false;
  return isWithinEditWindow(taskCreatedAt);
}

// Can the creator delete this task? Same logic as edit.
export function canCreatorDelete(userId: string, taskAssignedBy: string | null, taskCreatedAt: string): boolean {
  if (userId !== taskAssignedBy) return false;
  return isWithinEditWindow(taskCreatedAt);
}
