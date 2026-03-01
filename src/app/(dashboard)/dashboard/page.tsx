'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListTodo, MessageSquare, User, Users, RefreshCw } from 'lucide-react';
import { isAdmin } from '@/lib/permissions';
import { formatDisplayName } from '@/lib/format-name';
import { isOverdue as checkOverdue } from '@/lib/utils';
import { ROLE_COLORS, STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS } from '@/lib/constants/theme';
import { TimelineItem, TaskStatus, TaskPriority, DashboardComment } from '@/types/database';
import { format } from 'date-fns';

interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_to_name?: string | null;
  delegated_to?: string | null;
  delegated_to_name?: string | null;
}

interface DashboardStats {
  open: number;
  dueThisWeek: number;
  overdue: number;
  timeline: TimelineItem[];
  myTasks: TaskSummary[];
  assignedByMe: TaskSummary[];
  recentComments: DashboardComment[];
  pendingVerification?: number;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

export default function DashboardPage() {
  const { user } = useUserContext();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      setStats(data);
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Auto-refresh when user switches back to this tab
  useEffect(() => {
    const onFocus = () => fetchDashboard();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchDashboard]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl pep-heading">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {formatDisplayName(user.name, user.email)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fetchDashboard()}
          disabled={refreshing}
          title="Refresh dashboard"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${isAdmin(user.role) ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <Card
          className="cursor-pointer hover:shadow-sm transition-shadow"
          onClick={() => router.push('/tasks?status=open')}
        >
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {stats ? stats.open : '--'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Open Tasks</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-sm transition-shadow"
          onClick={() => router.push('/tasks?view=due_this_week')}
        >
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {stats ? stats.dueThisWeek : '--'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Due This Week</p>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-sm transition-shadow"
          onClick={() => router.push('/tasks?view=overdue')}
        >
          <CardContent className="pt-6">
            <div className={`text-2xl font-bold ${stats && stats.overdue > 0 ? 'text-[#D4705A]' : ''}`}>
              {stats ? stats.overdue : '--'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Overdue</p>
          </CardContent>
        </Card>
        {isAdmin(user.role) && (
          <Card
            className="cursor-pointer hover:shadow-sm transition-shadow"
            onClick={() => router.push('/tasks?status=completed')}
          >
            <CardContent className="pt-6">
              <div className={`text-2xl font-bold ${stats && (stats.pendingVerification ?? 0) > 0 ? 'text-[#E8A87C]' : ''}`}>
                {stats ? (stats.pendingVerification ?? '--') : '--'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Pending Verification</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Your Tasks / Assigned by You — big category boxes */}
      {stats && (
        <div className={`grid grid-cols-1 gap-4 ${isAdmin(user.role) ? 'md:grid-cols-2' : ''}`}>
          {/* Your Tasks */}
          <Card className="border-l-4 border-l-[#5BB8D6]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-[#5BB8D6]" />
                  <CardTitle className="text-lg">Your Tasks</CardTitle>
                </div>
                <Badge variant="secondary" className="bg-[#5BB8D6]/15 text-[#3A8BA8] text-base px-3">
                  {stats.myTasks.length}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Tasks assigned to you</p>
            </CardHeader>
            <CardContent>
              {stats.myTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No active tasks assigned to you</p>
              ) : (
                <div className="space-y-2">
                  {stats.myTasks.map((t) => {
                    const overdue = t.due_date && !['completed', 'verified'].includes(t.status) && checkOverdue(t.due_date);
                    return (
                      <div
                        key={t.id}
                        onClick={() => router.push(`/tasks/${t.id}`)}
                        className={`flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer hover:shadow-sm transition-shadow ${
                          overdue ? 'border-[#D4705A]/40 bg-[#D4705A]/5' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{t.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className={`${STATUS_COLORS[t.status]} text-[10px] px-1.5 py-0`}>
                              {STATUS_LABELS[t.status]}
                            </Badge>
                            <Badge variant="secondary" className={`${PRIORITY_COLORS[t.priority]} text-[10px] px-1.5 py-0`}>
                              {t.priority}
                            </Badge>
                          </div>
                        </div>
                        {t.due_date && (
                          <span className={`text-xs shrink-0 ${overdue ? 'text-[#D4705A] font-medium' : 'text-muted-foreground'}`}>
                            {format(new Date(t.due_date), 'MMM d')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assigned by You (admin+ only) */}
          {isAdmin(user.role) && (
            <Card className="border-l-4 border-l-[#7BC47F]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#7BC47F]" />
                    <CardTitle className="text-lg">Assigned by You</CardTitle>
                  </div>
                  <Badge variant="secondary" className="bg-[#7BC47F]/15 text-[#4A7A5A] text-base px-3">
                    {stats.assignedByMe.length}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Tasks you assigned to others</p>
              </CardHeader>
              <CardContent>
                {stats.assignedByMe.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No active tasks assigned by you</p>
                ) : (
                  <div className="space-y-2">
                    {stats.assignedByMe.map((t) => {
                      const overdue = t.due_date && !['completed', 'verified'].includes(t.status) && checkOverdue(t.due_date);
                      return (
                        <div
                          key={t.id}
                          onClick={() => router.push(`/tasks/${t.id}`)}
                          className={`flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer hover:shadow-sm transition-shadow ${
                            overdue ? 'border-[#D4705A]/40 bg-[#D4705A]/5' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{t.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className={`${STATUS_COLORS[t.status]} text-[10px] px-1.5 py-0`}>
                                {STATUS_LABELS[t.status]}
                              </Badge>
                              {t.assigned_to_name && (
                                <span className="text-[11px] text-muted-foreground">{t.assigned_to_name}</span>
                              )}
                              {t.delegated_to_name && (
                                <span className="text-[11px] text-[#9B8EC4]">(delegated to {t.delegated_to_name})</span>
                              )}
                            </div>
                          </div>
                          {t.due_date && (
                            <span className={`text-xs shrink-0 ${overdue ? 'text-[#D4705A] font-medium' : 'text-muted-foreground'}`}>
                              {format(new Date(t.due_date), 'MMM d')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Recent Comments */}
      {stats && stats.recentComments && stats.recentComments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#9B8EC4]" />
              <CardTitle className="text-lg">Recent Comments</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recentComments.map((comment) => (
                <div
                  key={comment.id}
                  className={`rounded-md border p-3 cursor-pointer hover:shadow-sm transition-shadow ${
                    comment.context === 'verification' ? 'border-l-4 border-l-[#9B8EC4]' : ''
                  }`}
                  onClick={() => router.push(`/tasks/${comment.task_id}`)}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium shrink-0">{comment.author_name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        on {comment.task_title}
                      </span>
                      {comment.context === 'verification' && (
                        <Badge variant="secondary" className="bg-[#9B8EC4]/15 text-[#7B6EA4] text-[10px] px-1.5 py-0 shrink-0">
                          verification
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {comment.body}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : stats.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent status changes</p>
          ) : (
            <div className="space-y-4">
              {stats.timeline.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 cursor-pointer hover:bg-muted/50 rounded-md p-2 -mx-2 transition-colors"
                  onClick={() => router.push(`/tasks/${item.task_id}`)}
                >
                  <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[#5BB8D6] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{item.actor_name}</span>
                      {item.action === 'created' ? (
                        <>
                          {' created '}
                          <span className="font-medium">{item.task_title}</span>
                          {item.assigned_to_name && (
                            <>
                              {' — assigned to '}
                              <span className="font-medium">
                                {item.assigned_to_id === user.id ? 'you' : item.assigned_to_name}
                              </span>
                            </>
                          )}
                          {item.due_date && (
                            <span className="text-muted-foreground">
                              {' · due '}{format(new Date(item.due_date), 'MMM d')}
                            </span>
                          )}
                        </>
                      ) : item.action === 'delegated' ? (
                        <>
                          {' delegated '}
                          <span className="font-medium">{item.task_title}</span>
                          {item.delegated_to_name && (
                            <>
                              {' to '}
                              <span className="font-medium">{item.delegated_to_name}</span>
                            </>
                          )}
                        </>
                      ) : item.action === 'undelegated' ? (
                        <>
                          {' removed delegation from '}
                          <span className="font-medium">{item.task_title}</span>
                        </>
                      ) : item.action === 'attachment_added' ? (
                        <>
                          {' attached a file to '}
                          <span className="font-medium">{item.task_title}</span>
                        </>
                      ) : item.action === 'verified' ? (
                        <>
                          {' verified '}
                          <span className="font-medium">{item.task_title}</span>
                        </>
                      ) : (
                        <>
                          {' moved '}
                          <span className="font-medium">{item.task_title}</span>
                          {item.from_status && item.to_status && (
                            <>
                              {' from '}
                              <Badge variant="secondary" className={`${STATUS_COLORS[item.from_status]} text-[10px] px-1.5 py-0`}>
                                {STATUS_LABELS[item.from_status]}
                              </Badge>
                              {' → '}
                              <Badge variant="secondary" className={`${STATUS_COLORS[item.to_status]} text-[10px] px-1.5 py-0`}>
                                {STATUS_LABELS[item.to_status]}
                              </Badge>
                            </>
                          )}
                        </>
                      )}
                      {isAdmin(user.role) && item.assigned_to_id === user.id && (
                        <span className="text-[10px] text-[#5BB8D6] ml-1">(your task)</span>
                      )}
                      {isAdmin(user.role) && item.assigned_by_id === user.id && item.assigned_to_id !== user.id && (
                        <span className="text-[10px] text-[#7BC47F] ml-1">(assigned by you)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatRelativeTime(item.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="text-sm font-medium">
              {user.name || 'Not set'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant="secondary" className={ROLE_COLORS[user.role]}>
              {user.role.replace('_', ' ')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={() => router.push('/tasks')}>
        <ListTodo className="w-4 h-4 mr-2" />
        View All Tasks
      </Button>
    </div>
  );
}
