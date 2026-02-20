'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { isAdmin } from '@/lib/permissions';
import { PepUser, RecurrenceRule, RecurrenceType } from '@/types/database';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function NewRecurringTaskPage() {
  const { user } = useUserContext();
  const router = useRouter();
  const [users, setUsers] = useState<PepUser[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Task fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState('normal');

  // Recurrence fields
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('weekly');
  const [interval, setInterval] = useState(1);
  const [weeklyDays, setWeeklyDays] = useState<number[]>([1]); // Default: Monday
  const [monthlyDay, setMonthlyDay] = useState(1);
  const [monthlyPattern, setMonthlyPattern] = useState<'day_number' | 'last_day'>('day_number');
  const [lastDayName, setLastDayName] = useState('friday');

  // First run date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const [nextRunDate, setNextRunDate] = useState(tomorrowStr);

  useEffect(() => {
    if (!isAdmin(user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchUsers();
  }, [user.role, router]);

  async function fetchUsers() {
    const res = await fetch('/api/users');
    if (res.ok) setUsers(await res.json());
  }

  function toggleWeeklyDay(day: number) {
    setWeeklyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  function buildRecurrenceRule(): RecurrenceRule {
    switch (recurrenceType) {
      case 'daily':
        return { type: 'daily', interval };
      case 'weekly':
        return { type: 'weekly', interval, days: weeklyDays };
      case 'monthly':
        if (monthlyPattern === 'last_day') {
          return { type: 'monthly', interval, day: `last_${lastDayName}` };
        }
        return { type: 'monthly', interval, day: monthlyDay };
      default:
        return { type: 'weekly', interval: 1 };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (recurrenceType === 'weekly' && weeklyDays.length === 0) {
      toast.error('Select at least one day of the week');
      return;
    }

    setSubmitting(true);
    const res = await fetch('/api/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description || null,
        assigned_to: assignedTo && assignedTo !== 'unassigned' ? assignedTo : null,
        priority,
        recurrence_rule: buildRecurrenceRule(),
        next_run_date: nextRunDate,
      }),
    });

    if (res.ok) {
      toast.success('Recurring task created');
      router.push('/recurring');
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to create');
    }
    setSubmitting(false);
  }

  if (!isAdmin(user.role)) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/recurring')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl pep-heading">New Recurring Task</h1>
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
                placeholder="e.g., Weekly Standup Notes"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What should be done each time?"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Assign to</Label>
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
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email.split('@')[0]}
                        <span className="text-muted-foreground ml-1 text-xs capitalize">
                          ({u.role.replace('_', ' ')})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
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
            </div>

            {/* Recurrence Settings */}
            <div className="border rounded-lg p-4 space-y-4">
              <Label className="text-base font-medium">Recurrence Pattern</Label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Repeat</Label>
                  <Select value={recurrenceType} onValueChange={(v) => setRecurrenceType(v as RecurrenceType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="interval">Every</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="interval"
                      type="number"
                      min={1}
                      max={30}
                      value={interval}
                      onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">
                      {recurrenceType === 'daily' ? 'day(s)' : recurrenceType === 'weekly' ? 'week(s)' : 'month(s)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Weekly: day-of-week checkboxes */}
              {recurrenceType === 'weekly' && (
                <div className="space-y-2">
                  <Label>On days</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAY_LABELS.map((label, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleWeeklyDay(idx)}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                          weeklyDays.includes(idx)
                            ? 'bg-[#3A8BA8] text-white border-[#3A8BA8]'
                            : 'bg-background border-input hover:bg-muted'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly: day number or last-day pattern */}
              {recurrenceType === 'monthly' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="monthlyPattern"
                        checked={monthlyPattern === 'day_number'}
                        onChange={() => setMonthlyPattern('day_number')}
                      />
                      On day
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={monthlyDay}
                      onChange={(e) => setMonthlyDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                      className="w-20"
                      disabled={monthlyPattern !== 'day_number'}
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="monthlyPattern"
                        checked={monthlyPattern === 'last_day'}
                        onChange={() => setMonthlyPattern('last_day')}
                      />
                      Last
                    </label>
                    <Select
                      value={lastDayName}
                      onValueChange={setLastDayName}
                      disabled={monthlyPattern !== 'last_day'}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monday">Monday</SelectItem>
                        <SelectItem value="tuesday">Tuesday</SelectItem>
                        <SelectItem value="wednesday">Wednesday</SelectItem>
                        <SelectItem value="thursday">Thursday</SelectItem>
                        <SelectItem value="friday">Friday</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">of the month</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="first_run">First run date</Label>
                <Input
                  id="first_run"
                  type="date"
                  value={nextRunDate}
                  onChange={(e) => setNextRunDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={submitting} className="uppercase tracking-wider">
                {submitting ? 'Creating...' : 'Create Recurring Task'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/recurring')}
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
