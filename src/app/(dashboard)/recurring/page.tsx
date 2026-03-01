'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { isAdmin } from '@/lib/permissions';
import { PepRecurringTask } from '@/types/database';
import { describeRecurrence } from '@/lib/recurrence';
import { formatDisplayName } from '@/lib/format-name';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PRIORITY_COLORS } from '@/lib/constants/theme';
import { Plus, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RecurringTasksPage() {
  const { user } = useUserContext();
  const router = useRouter();
  const [templates, setTemplates] = useState<PepRecurringTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin(user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchTemplates();
  }, [user.role, router]);

  async function fetchTemplates() {
    const res = await fetch('/api/recurring');
    if (res.ok) {
      setTemplates(await res.json());
    }
    setLoading(false);
  }

  async function toggleActive(id: string, currentlyActive: boolean) {
    const res = await fetch(`/api/recurring/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentlyActive }),
    });
    if (res.ok) {
      toast.success(currentlyActive ? 'Paused' : 'Activated');
      fetchTemplates();
    } else {
      toast.error('Failed to update');
    }
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/recurring/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Recurring task deleted');
      fetchTemplates();
    } else {
      toast.error('Failed to delete');
    }
  }

  if (!isAdmin(user.role)) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl pep-heading">Recurring Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Auto-generated tasks on a schedule
          </p>
        </div>
        <Button onClick={() => router.push('/recurring/new')} className="uppercase tracking-wider">
          <Plus className="w-4 h-4 mr-2" />
          New Recurring Task
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No recurring tasks yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create one to auto-generate tasks on a schedule
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id} className={!t.is_active ? 'opacity-60' : ''}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{t.title}</span>
                      <Badge variant="secondary" className={PRIORITY_COLORS[t.priority]}>
                        {t.priority}
                      </Badge>
                      {!t.is_active && (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          Paused
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {describeRecurrence(t.recurrence_rule)}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      {t.assignee && (
                        <span>Assigned to: {formatDisplayName(t.assignee.name, t.assignee.email)}</span>
                      )}
                      <span>Next run: {t.next_run_date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => router.push(`/recurring/${t.id}/edit`)}
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete recurring task?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently deactivate &ldquo;{t.title}&rdquo;. Tasks already created from this template will not be affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteTemplate(t.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(t.id, t.is_active)}
                    >
                      {t.is_active ? 'Pause' : 'Activate'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
