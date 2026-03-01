'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { isAdmin, canDelegate, canCreatorEdit, getVerificationRequirements } from '@/lib/permissions';
import { isOverdue as checkOverdue } from '@/lib/utils';
import { PepTask, PepComment, PepActivityLog, PepAttachment, PepUser, PepVerification, TaskStatus, TaskPriority } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Clock, User, UserPlus, CalendarDays, Flag, Send, Pencil, Trash2, ShieldCheck, Paperclip, Download, FileText, Image, X, Star } from 'lucide-react';
import { format } from 'date-fns';
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS } from '@/lib/constants/theme';
import { formatDisplayName } from '@/lib/format-name';
import { getCached, setCache } from '@/lib/cache';

function formatActivityAction(log: PepActivityLog, isWorker: boolean): string {
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
    case 'attachment_added':
      return `attached ${(details.file_name as string) || 'a file'}`;
    case 'attachment_deleted':
      return `removed attachment ${(details.file_name as string) || ''}`;
    case 'verified': {
      const slot = details.slot as string;
      const slotLabel = slot === 'assigned_by' ? 'assigner' : 'delegator';
      if (isWorker) {
        return `submitted verification (as ${slotLabel})`;
      }
      const rating = details.rating as number;
      return `submitted verification (as ${slotLabel}, ${rating} star${rating !== 1 ? 's' : ''})`;
    }
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
  const [allUsers, setAllUsers] = useState<PepUser[]>([]);
  const [delegating, setDelegating] = useState(false);
  const [verifications, setVerifications] = useState<PepVerification[]>([]);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [verificationRating, setVerificationRating] = useState<number>(0);
  const [verificationComment, setVerificationComment] = useState('');

  // Attachments state
  const [attachments, setAttachments] = useState<PepAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  // Edit/Delete state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('normal');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (res.ok) {
      const data = await res.json();
      setVerifications(data.verifications || []);
      setTask(data);
    } else {
      const err = await res.json().catch(() => null);
      if (res.status === 403) {
        toast.error('You do not have permission to view this task');
      } else {
        toast.error(err?.error || 'Task not found');
      }
      router.push('/tasks');
    }
  }, [taskId, router]);

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/comments`);
    if (res.ok) {
      const data = await res.json();
      setComments(data.comments ?? data);
    }
  }, [taskId]);

  const fetchActivity = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/activity`);
    if (res.ok) {
      const data = await res.json();
      setActivity(data.logs ?? data);
    }
  }, [taskId]);

  const fetchAttachments = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/attachments`);
    if (res.ok) {
      const data = await res.json();
      setAttachments(data.attachments ?? data);
    }
  }, [taskId]);

  // Load task first (fast first render), then load secondary data
  useEffect(() => {
    fetchTask().then(() => setLoading(false));
  }, [fetchTask]);

  useEffect(() => {
    if (!loading && task) {
      fetchComments();
      fetchActivity();
      fetchAttachments();
      // Fetch users for delegation and edit dropdowns (admin+ only)
      if (isAdmin(user.role)) {
        const cached = getCached<PepUser[]>('users_list');
        if (cached) {
          setStaffUsers(cached.filter((u) => u.role === 'staff' && u.is_active));
          setAllUsers(cached.filter((u) => u.is_active));
        } else {
          fetch('/api/users')
            .then((r) => r.json())
            .then((users: PepUser[]) => {
              setCache('users_list', users);
              setStaffUsers(users.filter((u) => u.role === 'staff' && u.is_active));
              setAllUsers(users.filter((u) => u.is_active));
            });
        }
      }
    }
  }, [loading, task, fetchComments, fetchActivity, fetchAttachments, user.role]);

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

  async function handleVerify() {
    if (verificationRating === 0) {
      toast.error('Please select a star rating');
      return;
    }
    if (verificationRating <= 3 && !verificationComment.trim()) {
      toast.error('A comment is required for ratings of 3 stars or below');
      return;
    }

    setUpdating(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'verified',
        verification_rating: verificationRating,
        verification_comment: verificationComment || undefined,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result._fullyVerified) {
        toast.success('Task fully verified');
      } else {
        toast.success('Your verification has been recorded. Waiting for other verifiers.');
      }
      setShowVerifyDialog(false);
      setVerificationRating(0);
      setVerificationComment('');
      await Promise.all([fetchTask(), fetchComments(), fetchActivity()]);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to verify task');
    }
    setUpdating(false);
  }

  function openEditDialog() {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditAssignedTo(task.assigned_to || '');
    setEditDueDate(task.due_date || '');
    setEditPriority(task.priority);
    setShowEditDialog(true);
  }

  async function handleEdit() {
    if (!editTitle.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle,
        description: editDescription || null,
        assigned_to: editAssignedTo || null,
        due_date: editDueDate || null,
        priority: editPriority,
      }),
    });

    if (res.ok) {
      toast.success('Task updated');
      setShowEditDialog(false);
      await Promise.all([fetchTask(), fetchActivity()]);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to update task');
    }
    setSaving(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      toast.success('Task deleted');
      router.push('/tasks');
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to delete task');
    }
    setDeleting(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5 MB limit');
      e.target.value = '';
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/tasks/${taskId}/attachments`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      toast.success('File attached');
      await Promise.all([fetchAttachments(), fetchActivity()]);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to upload file');
    }
    setUploading(false);
    e.target.value = '';
  }

  async function handleDownload(attachment: PepAttachment) {
    const res = await fetch(`/api/tasks/${taskId}/attachments/${attachment.id}`);
    if (res.ok) {
      const { url } = await res.json();
      window.open(url, '_blank');
    } else {
      toast.error('Failed to get download link');
    }
  }

  async function handleDeleteAttachment(attachment: PepAttachment) {
    const res = await fetch(`/api/tasks/${taskId}/attachments/${attachment.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      toast.success('Attachment deleted');
      await Promise.all([fetchAttachments(), fetchActivity()]);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to delete attachment');
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getFileIcon(mimeType: string) {
    if (mimeType.startsWith('image/')) return <Image className="w-4 h-4 text-[#5BB8D6]" />;
    return <FileText className="w-4 h-4 text-[#D4705A]" />;
  }

  function canEditOrDelete(): boolean {
    if (!task) return false;
    if (!isAdmin(user.role)) return false;
    if (task.status === 'verified') return false;
    return canCreatorEdit(user.id, task.assigned_by, task.created_at);
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
      case 'completed': {
        const req = getVerificationRequirements(
          user.role,
          user.id,
          task.assigned_by,
          task.assigned_to,
          task.delegated_to,
          verifications
        );
        if (req.canVerify) {
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
  const isVerified = task.status === 'verified';
  const showEditDelete = canEditOrDelete();
  const isWorker =
    (task.delegated_to && task.delegated_to === user.id) ||
    (!task.delegated_to && task.assigned_to === user.id);

  // Build verification requirements for the progress section
  const verificationReqs = task.status === 'completed' || task.status === 'verified'
    ? getVerificationRequirements(
        user.role,
        user.id,
        task.assigned_by,
        task.assigned_to,
        task.delegated_to,
        verifications
      )
    : null;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Verified Banner */}
      {isVerified && (
        <div className="bg-[#9B8EC4]/10 border border-[#9B8EC4]/30 text-[#9B8EC4] rounded-lg px-4 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">
              Verified on {format(new Date(task.verified_at!), 'MMM d, yyyy h:mm a')}
            </span>
            {!isWorker && task.verification_rating && (
              <span className="flex items-center gap-0.5 ml-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${
                      star <= task.verification_rating!
                        ? 'fill-[#E8A87C] text-[#E8A87C]'
                        : 'text-[#9B8EC4]/30'
                    }`}
                  />
                ))}
              </span>
            )}
          </div>
          {verifications.length > 0 && (
            <div className="text-xs text-[#9B8EC4]/80 ml-7">
              Verified by {verifications.map((v) => v.verifier_name).join(' and ')}
            </div>
          )}
        </div>
      )}

      {/* Verification Progress (show on completed tasks for admins) */}
      {task.status === 'completed' && isAdmin(user.role) && verificationReqs && verificationReqs.slots.length > 0 && (
        <div className="bg-[#E8A87C]/10 border border-[#E8A87C]/30 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-[#E8A87C] mb-2">Verification Progress</p>
          <div className="space-y-1.5">
            {verificationReqs.slots.map((slot) => {
              const verification = verifications.find((v) => v.verifier_role === slot.role);
              return (
                <div key={slot.role} className="flex items-center gap-2 text-sm">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${slot.filled ? 'bg-[#7BC47F]' : 'bg-gray-300'}`} />
                  <span className="text-foreground">
                    {slot.label === 'assigner' ? 'Assigner' : 'Delegator'}
                  </span>
                  {slot.filled && verification ? (
                    <span className="text-muted-foreground">
                      — {verification.verifier_name}
                      {!isWorker && verification.rating != null && (
                        <span className="ml-1">({verification.rating} star{verification.rating !== 1 ? 's' : ''})</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">pending</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
        {showEditDelete && (
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={openEditDialog}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDeleteDialog(true)} className="text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Status Actions */}
      {!isVerified && actions.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {actions.map((action) => (
            <Button
              key={action.status}
              variant={action.variant}
              onClick={() =>
                action.status === 'verified'
                  ? setShowVerifyDialog(true)
                  : updateStatus(action.status)
              }
              disabled={updating}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}

      {/* Verify Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Task</DialogTitle>
            <DialogDescription>
              Rate the quality of this task before verifying.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Star Rating */}
            <div className="space-y-2">
              <Label>Rating *</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setVerificationRating(star)}
                    className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        star <= verificationRating
                          ? 'fill-[#E8A87C] text-[#E8A87C]'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
                {verificationRating > 0 && (
                  <span className="text-sm text-muted-foreground ml-2">
                    {verificationRating === 1 && 'Poor'}
                    {verificationRating === 2 && 'Below expectations'}
                    {verificationRating === 3 && 'Meets expectations'}
                    {verificationRating === 4 && 'Good'}
                    {verificationRating === 5 && 'Excellent'}
                  </span>
                )}
              </div>
            </div>
            {/* Comment */}
            <div className="space-y-2">
              <Label>
                Comment {verificationRating > 0 && verificationRating <= 3 ? '*' : '(optional)'}
              </Label>
              <Textarea
                value={verificationComment}
                onChange={(e) => setVerificationComment(e.target.value)}
                placeholder={
                  verificationRating > 0 && verificationRating <= 3
                    ? 'Please explain what could be improved...'
                    : 'Optional comment (e.g., looks good, or feedback)...'
                }
                rows={3}
              />
              {verificationRating > 0 && verificationRating <= 3 && !verificationComment.trim() && (
                <p className="text-xs text-[#D4705A]">
                  A comment is required for ratings of 3 stars or below
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerifyDialog(false)} disabled={updating}>
              Cancel
            </Button>
            <Button
              onClick={handleVerify}
              disabled={updating || verificationRating === 0 || (verificationRating <= 3 && !verificationComment.trim())}
            >
              {updating ? 'Verifying...' : 'Verify'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Update task details. You can edit this task within 24 hours of creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title *</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select value={editAssignedTo} onValueChange={setEditAssignedTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {formatDisplayName(u.name, u.email)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-due-date">Due Date</Label>
                <Input
                  id="edit-due-date"
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={editPriority} onValueChange={(v) => setEditPriority(v as TaskPriority)}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{task.title}&quot;? This action cannot be undone.
              All comments and activity will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delegation Controls */}
      {!isVerified && task && canDelegate(user.role, user.id, task.assigned_to) && staffUsers.length > 0 && (
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
                        {formatDisplayName(u.name, u.email)}
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
                    {formatDisplayName(u.name, u.email)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Task Details */}
      <Card className={isVerified ? 'opacity-60' : ''}>
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
                  ? formatDisplayName(task.assignee.name, task.assignee.email)
                  : 'Unassigned'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="w-4 h-4" />
              <span>Assigned by: </span>
              <span className="font-medium text-foreground">
                {task.assigner
                  ? formatDisplayName(task.assigner.name, task.assigner.email)
                  : 'Unknown'}
              </span>
            </div>

            {task.delegate && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <UserPlus className="w-4 h-4" />
                <span>Delegated to: </span>
                <span className="font-medium text-foreground">
                  {formatDisplayName(task.delegate.name, task.delegate.email)}
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

      {/* Attachments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Paperclip className="w-4 h-4" />
              Attachments ({attachments.length})
            </CardTitle>
            {!isVerified && (
              <label>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                <Button variant="outline" size="sm" asChild disabled={uploading}>
                  <span className="cursor-pointer">
                    <Paperclip className="w-3.5 h-3.5 mr-1.5" />
                    {uploading ? 'Uploading...' : 'Attach File'}
                  </span>
                </Button>
              </label>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attachments</p>
          ) : (
            <div className="space-y-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-3 text-sm py-2 border-b last:border-b-0"
                >
                  {getFileIcon(attachment.mime_type)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{attachment.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.file_size)}
                      {' \u00b7 '}
                      {formatDisplayName(attachment.uploader?.name, attachment.uploader?.email)}
                      {' \u00b7 '}
                      {format(new Date(attachment.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(attachment)}
                      className="h-7 w-7 p-0"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    {!isVerified && (attachment.uploaded_by === user.id || isAdmin(user.role)) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAttachment(attachment)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Delete"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
                  className={`bg-card border rounded p-4 ${
                    comment.context === 'verification'
                      ? 'border-l-4 border-l-[#9B8EC4] bg-[#9B8EC4]/5'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatDisplayName(comment.author?.name, comment.author?.email)}
                      </span>
                      {comment.context === 'verification' && (
                        <Badge variant="secondary" className="bg-[#9B8EC4]/15 text-[#9B8EC4] text-[10px] px-1.5 py-0">
                          Verification
                        </Badge>
                      )}
                    </div>
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
                          {formatDisplayName(log.user?.name, log.user?.email)}
                        </span>{' '}
                        <span className="text-muted-foreground">
                          {formatActivityAction(log, !!isWorker)}
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
