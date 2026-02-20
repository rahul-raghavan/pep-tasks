import { TaskStatus, TaskPriority, UserRole } from '@/types/database';
import { LayoutDashboard, ListTodo, Users, BarChart3, RefreshCw, LucideIcon } from 'lucide-react';

export const STATUS_COLORS: Record<TaskStatus, string> = {
  open: 'bg-[#5BB8D6]/15 text-[#3A8BA8]',
  in_progress: 'bg-[#F2C94C]/20 text-[#8A7229]',
  completed: 'bg-[#8BC49E]/20 text-[#4A7A5A]',
  verified: 'bg-[#9B8EC4]/20 text-[#6B5E94]',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: 'bg-[#D4705A]/15 text-[#A85643]',
  high: 'bg-[#E8A84C]/15 text-[#8A6A2E]',
  normal: 'bg-[#F0EFED] text-[#666666]',
  low: 'bg-[#E5E4E2] text-[#888888]',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-[#9B8EC4]/20 text-[#6B5E94]',
  admin: 'bg-[#5BB8D6]/15 text-[#3A8BA8]',
  staff: 'bg-[#8BC49E]/20 text-[#4A7A5A]',
};

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Tasks', href: '/tasks', icon: ListTodo },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { name: 'Recurring', href: '/recurring', icon: RefreshCw },
  { name: 'Users', href: '/users', icon: Users },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
];
