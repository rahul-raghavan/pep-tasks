'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { isAdmin, canVerifyTasks, canDelegate, canDelegateTo } from '@/lib/permissions';
import { isOverdue as checkOverdue } from '@/lib/utils';
import { PepTask, PepComment, PepActivityLog, PepUser, TaskStatus } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Clock, User, UserPlus, CalendarDays, Flag, Send } from 'lucide-react';
import { format } from 'date-fns';
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS } from '@/lib/constants/theme';

function formatActivityAction(log: PepActivityLog): string {
  const details = log.details || {};
  switch (log.action) {
    case 'created':
      return 'created this task';
    case 'status_changed':
      return `changed status from ${(details.from as string || '').replace('_', ' ')} to ${(details.to as string || '').replace('_', ' ')}`;
    case 'commented':
      return 'posted a comment';
    case 'delegated':
      return `delegated this task to ${(details.to_name as string) || 'a staff member'}`;
    case 'undelegated':
      return 'removed delegation from this task';
    case 'updated': {
      const parts: string[] = [];
      if (details.reassigned) parts.push('reassigned the task');
      if (details.due_date_changed) parts.push('changed the due date');
      if (details.priority_changed) parts.push(`changed priority to ${(details.priority_changed as Record<string, string>).to}`);
      if (details.title_changed) parts.push('updated the title');
      return parts.join(', ') || 'updated the task';
    }
    default:
      return log.action;
  }
}

export default function TaskDetailPage() {
  const { user } = useUserContext();
  const router = useRouter();
  const params = useParams();
  const taskId = params.id as string;

  const [task, setTask] = useState<PepTask | null>(null);
  const [comments, setComments] = useState<PepComment[]>([]);
  const [activity, setActivity] = useState<PepActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [staffUsers, setStaffUsers] = useState<PepUser[]>([]);
  const [delegating, setDelegating] = useState(false);

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (res.ok) {
      setTask(await res.json());
    } else {
      toast.error('Task not found');
      router.push('/tasks');
    }
  }, [taskId, router]);

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/comments`);
    if (res.ok) setComments(await res.json());
  }, [taskId]);

  const fetchActivity = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/activity`);
    if (res.ok) setActivity(await res.json());
  }, [taskId]);

  useEffect(() => {
    Promise.all([fetchTask(), fetchComments(), fetchActivity()]).then(() =>
      setLoading(false)
    );
    // Fetch staff users for delegation dropdown (admin+ only)
    if (isAdmin(user.role)) {
      fetch('/api/users')
        .then((r) => r.json())
        .then((users: PepUser[]) =>
          setStaffUsers(users.filter((u) => u.role === 'staff' && u.is_active))
        );
    }
  }, [fetchTask, fetchComments, fetchActivity, user.role]);

  async function updateStatus(newStatus: TaskStatus) {
    setUpdating(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });

    if (res.ok) {
      toast.success(`Task marked as ${newStatus.replace('_', ' ')}`);
      await Promise.all([fetchTask(), fetchActivity()]);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to update task');
    }
    setUpdating(false);
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;

    setPosting(true);
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newComment }),
    });

    if (res.ok) {
      setNewComment('');
      await Promise.all([fetchComments(), fetchActivity()]);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to post comment');
    }
    setPosting(false);
  }

  async function handleDelegate(delegateId: string) {
    setDelegating(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delegated_to: delegateId }),
    });
    if (res.ok) {
      toast.success('Task delegated');
      await Promise.all([fetchTask(), fetchActivity()]);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to delegate');
    }
    setDelegating(false);
  }

  async function handleUndelegate() {
    setDelegating(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delegated_to: null }),
    });
    if (res.ok) {
      toast.success('Delegation removed');
      await Promise.all([fetchTask(), fetchActivity()]);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to remove delegation');
    }
    setDelegating(false);
  }

  function getAvailableActions(): {
    label: string;
    status: TaskStatus;
    variant: 'default' | 'outline' | 'destructive';
  }[] {
    if (!task) return [];
    const actions: {
      label: string;
      status: TaskStatus;
      variant: 'default' | 'outline' | 'destructive';
    }[] = [];

    switch (task.status) {
      case 'open':
        actions.push({
          label: 'Start Working',
          status: 'in_progress',
          variant: 'default',
        });
        break;
      case 'in_progress':
        actions.push({
          label: 'Mark Complete',
          status: 'completed',
          variant: 'default',
        });
        actions.push({ label: 'Reopen', status: 'open', variant: 'outline' });
        break;
      case 'completed':
        if (canVerifyTasks(user.role)) {
          actions.push({
            label: 'Verify',
            status: 'verified',
            variant: 'default',
          });
        }
        if (isAdmin(user.role)) {
          actions.push({
            label: 'Reopen',
            status: 'in_progress',
            variant: 'outline',
          });
        }
        break;
    }

    return actions;
  }

  function isTaskOverdue(): boolean {
    if (!task?.due_date) return false;
    if (task.status === 'completed' || task.status === 'verified') return false;
    return checkOverdue(task.due_date);
  }

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Loading task...</div>;
  }

  if (!task) return null;

  const actions = getAvailableActions();

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/tasks')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{task.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className={STATUS_COLORS[task.status]}>
              {STATUS_LABELS[task.status]}
            </Badge>
            <Badge
              variant="secondary"
              className={PRIORITY_COLORS[task.priority]}
            >
              {task.priority}
            </Badge>
            {isTaskOverdue() && (
              <Badge className="bg-[#D4705A] text-white">Overdue</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Status Actions */}
      {actions.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {actions.map((action) => (
            <Button
              key={action.status}
              variant={action.variant}
              onClick={() => updateStatus(action.status)}
              disabled={updating}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}

      {/* Delegation Controls */}
      {task && canDelegate(user.role, user.id, task.assigned_to) && staffUsers.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {task.delegated_to ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndelegate}
                disabled={delegating}
              >
                Remove Delegation
              </Button>
              <Select
                onValueChange={handleDelegate}
                disabled={delegating}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Re-delegate to..." />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers
                    .filter((u) => u.id !== task.delegated_to)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email.split('@')[0]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <Select
              onValueChange={handleDelegate}
              disabled={delegating}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Delegate to..." />
              </SelectTrigger>
              <SelectContent>
                {staffUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.email.split('@')[0]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Task Details */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {task.description && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                Description
              </h3>
              <p className="text-foreground whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4" />
              <span>Assigned to: </span>
              <span className="font-medium text-foreground">
                {task.assignee
                  ? task.assignee.name || task.assignee.email.split('@')[0]
                  : 'Unassigned'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4" />
              <span>Assigned by: </span>
              <span className="font-medium text-foreground">
                {task.assigner
                  ? task.assigner.name || task.assigner.email.split('@')[0]
                  : 'Unknown'}
              </span>
            </div>

            {task.delegate && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <UserPlus className="w-4 h-4" />
                <span>Delegated to: </span>
                <span className="font-medium text-foreground">
                  {task.delegate.name || task.delegate.email.split('@')[0]}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="w-4 h-4" />
              <span>Due: </span>
              <span
                className={`font-medium ${isTaskOverdue() ? 'text-[#D4705A]' : 'text-foreground'}`}
              >
                {task.due_date
                  ? format(new Date(task.due_date), 'MMM d, yyyy')
                  : 'No due date'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <Flag className="w-4 h-4" />
              <span>Priority: </span>
              <span className="font-medium text-foreground capitalize">
                {task.priority}
              </span>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Created: </span>
              <span className="font-medium text-foreground">
                {format(new Date(task.created_at), 'MMM d, yyyy h:mm a')}
              </span>
            </div>

            {task.completed_at && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Completed: </span>
                <span className="font-medium text-foreground">
                  {format(new Date(task.completed_at), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comments & Activity Tabs */}
      <Tabs defaultValue="comments">
        <TabsList>
          <TabsTrigger value="comments">
            Comments ({comments.length})
          </TabsTrigger>
          <TabsTrigger value="activity">
            Activity ({activity.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comments" className="mt-4 space-y-4">
          {/* Post comment form */}
          <form onSubmit={postComment} className="space-y-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment or update..."
              rows={3}
            />
            <Button type="submit" size="sm" disabled={posting || !newComment.trim()}>
              <Send className="w-4 h-4 mr-2" />
              {posting ? 'Posting...' : 'Post Comment'}
            </Button>
          </form>

          {/* Comment thread */}
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No comments yet. Be the first to post an update.
            </p>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="bg-card border rounded p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {comment.author?.name ||
                        comment.author?.email.split('@')[0] ||
                        'Unknown'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(
                        new Date(comment.created_at),
                        'MMM d, yyyy h:mm a'
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {activity.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 text-sm"
                    >
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-[#5BB8D6] shrink-0" />
                      <div>
                        <span className="font-medium">
                          {log.user?.name || 'Someone'}
                        </span>{' '}
                        <span className="text-muted-foreground">
                          {formatActivityAction(log)}
                        </span>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {format(
                            new Date(log.created_at),
                            'MMM d, yyyy h:mm a'
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
