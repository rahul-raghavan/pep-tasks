'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { isAdmin } from '@/lib/permissions';
import { isOverdue as checkOverdue } from '@/lib/utils';
import { PepTask, PepUser, PepCenter, TaskStatus, TaskPriority } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';
import { STATUS_COLORS, PRIORITY_COLORS, STATUS_LABELS } from '@/lib/constants/theme';

export default function TasksPage() {
  const { user } = useUserContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const statusParam = searchParams.get('status');
  const [tasks, setTasks] = useState<PepTask[]>([]);
  const [users, setUsers] = useState<PepUser[]>([]);
  const [centers, setCenters] = useState<PepCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(statusParam || 'all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [centerFilter, setCenterFilter] = useState<string>('all');

  useEffect(() => {
    if (isAdmin(user.role)) {
      fetch('/api/users').then(r => r.json()).then(setUsers);
      fetch('/api/centers').then(r => r.json()).then(setCenters);
    }
  }, [user.role]);

  useEffect(() => {
    fetchTasks();
  }, [statusFilter, priorityFilter, assigneeFilter, centerFilter, viewParam]);

  async function fetchTasks() {
    setLoading(true);
    const params = new URLSearchParams();
    if (viewParam) params.set('view', viewParam);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    if (assigneeFilter !== 'all') params.set('assignee', assigneeFilter);
    if (centerFilter !== 'all') params.set('center', centerFilter);

    const res = await fetch(`/api/tasks?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(data);
    }
    setLoading(false);
  }

  function isTaskOverdue(task: PepTask): boolean {
    if (!task.due_date) return false;
    if (task.status === 'completed' || task.status === 'verified') return false;
    return checkOverdue(task.due_date);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl pep-heading">Tasks</h1>
          {viewParam === 'overdue' && (
            <p className="text-sm text-[#D4705A] mt-1">Showing overdue tasks</p>
          )}
          {viewParam === 'due_this_week' && (
            <p className="text-sm text-[#5BB8D6] mt-1">Showing tasks due this week</p>
          )}
        </div>
        {isAdmin(user.role) && (
          <Button onClick={() => router.push('/tasks/new')} className="uppercase tracking-wider">
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        {isAdmin(user.role) && users.length > 0 && (
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name || u.email.split('@')[0]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {isAdmin(user.role) && centers.length > 0 && (
          <Select value={centerFilter} onValueChange={setCenterFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Center" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Centers</SelectItem>
              {centers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Task List */}
      {loading ? (
        <div className="text-muted-foreground animate-pulse">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No tasks found</p>
          {isAdmin(user.role) && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push('/tasks/new')}
            >
              Create your first task
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => router.push(`/tasks/${task.id}`)}
              className={`bg-card border rounded p-4 cursor-pointer hover:shadow-sm transition-shadow ${
                isTaskOverdue(task) ? 'border-[#D4705A]/40 bg-[#D4705A]/5' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-foreground truncate">
                      {task.title}
                    </h3>
                    <Badge
                      variant="secondary"
                      className={STATUS_COLORS[task.status]}
                    >
                      {STATUS_LABELS[task.status]}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={PRIORITY_COLORS[task.priority]}
                    >
                      {task.priority}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    {task.assignee && (
                      <span>
                        Assigned to{' '}
                        {task.assignee.name || task.assignee.email.split('@')[0]}
                      </span>
                    )}
                    {task.delegate && (
                      <span className="text-muted-foreground">
                        Delegated to{' '}
                        {task.delegate.name || task.delegate.email.split('@')[0]}
                      </span>
                    )}
                    {task.due_date && (
                      <span className={isTaskOverdue(task) ? 'text-[#D4705A] font-medium' : ''}>
                        Due {format(new Date(task.due_date), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
