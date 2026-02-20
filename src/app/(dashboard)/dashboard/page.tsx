'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListTodo } from 'lucide-react';
import { ROLE_COLORS, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants/theme';
import { TimelineItem, TaskStatus } from '@/types/database';

interface DashboardStats {
  open: number;
  dueThisWeek: number;
  overdue: number;
  timeline: TimelineItem[];
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

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl pep-heading">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {user.name || user.email.split('@')[0]}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

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
