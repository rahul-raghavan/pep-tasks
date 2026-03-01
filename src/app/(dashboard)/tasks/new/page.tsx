'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { isAdmin } from '@/lib/permissions';
import { PepUser } from '@/types/database';
import { formatDisplayName } from '@/lib/format-name';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { getCached, setCache } from '@/lib/cache';

export default function NewTaskPage() {
  const { user } = useUserContext();
  const router = useRouter();
  const [users, setUsers] = useState<PepUser[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');

  useEffect(() => {
    if (!isAdmin(user.role)) {
      router.push('/tasks');
      return;
    }
    fetchUsers();
  }, [user.role, router]);

  async function fetchUsers() {
    const cached = getCached<PepUser[]>('users_list');
    if (cached) {
      setUsers(cached);
      return;
    }
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      setCache('users_list', data);
      setUsers(data);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!assignedTo) {
      toast.error('Please select someone to assign this task to');
      return;
    }

    setSubmitting(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description || null,
        assigned_to: assignedTo,
        due_date: dueDate || null,
        priority,
      }),
    });

    if (res.ok) {
      const task = await res.json();
      toast.success('Task created');
      router.push(`/tasks/${task.id}`);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to create task');
    }
    setSubmitting(false);
  }

  if (!isAdmin(user.role)) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/tasks')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl pep-heading">New Task</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more details..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Assign to *</Label>
                  <button
                    type="button"
                    className="text-xs text-[#3A8BA8] hover:underline"
                    onClick={() => setAssignedTo(user.id)}
                  >
                    Assign to me
                  </button>
                </div>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {formatDisplayName(u.name, u.email)}
                        <span className="text-muted-foreground ml-1 text-xs capitalize">
                          ({u.role.replace('_', ' ')})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={submitting} className="uppercase tracking-wider">
                {submitting ? 'Creating...' : 'Create Task'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/tasks')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
