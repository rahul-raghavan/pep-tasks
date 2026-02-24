import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/auth';
import { getCenterUserIds } from '@/lib/centers';

// Same task-level access check used by all task sub-routes
async function checkTaskAccess(
  db: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  userRole: string,
  taskId: string
): Promise<{ allowed: boolean; error?: string; status?: number }> {
  const { data: task } = await db
    .from('pep_tasks')
    .select('assigned_to, assigned_by, delegated_to, status')
    .eq('id', taskId)
    .single();

  if (!task) return { allowed: false, error: 'Task not found', status: 404 };

  if (userRole === 'staff') {
    if (task.assigned_to !== userId && task.delegated_to !== userId) {
      return { allowed: false, error: 'Forbidden', status: 403 };
    }
  }

  if (userRole === 'admin') {
    const roleIds = [task.assigned_to, task.assigned_by].filter(Boolean);
    if (roleIds.length > 0) {
      const { data: relatedUsers } = await db
        .from('pep_users')
        .select('id, role')
        .in('id', roleIds);
      if (relatedUsers?.some((u: { role: string }) => u.role === 'super_admin')) {
        return { allowed: false, error: 'Forbidden', status: 403 };
      }
    }
    if (task.assigned_to !== userId && task.assigned_by !== userId) {
      const centerUserIds = await getCenterUserIds(db, userId);
      if (!task.assigned_to || !centerUserIds.includes(task.assigned_to)) {
        return { allowed: false, error: 'Forbidden', status: 403 };
      }
    }
  }

  return { allowed: true };
}

// GET /api/tasks/[id]/attachments/[attachmentId] — generate signed download URL
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { id, attachmentId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();

  // Task-level access check
  const access = await checkTaskAccess(db, user.id, user.role, id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status || 403 });
  }

  const { data: attachment } = await db
    .from('pep_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('task_id', id)
    .single();

  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  // Generate a 1-hour signed URL
  const { data: signedUrl, error } = await db.storage
    .from('pep-attachments')
    .createSignedUrl(attachment.storage_path, 3600);

  if (error || !signedUrl) {
    console.error('Error creating signed URL:', error);
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  return NextResponse.json({ url: signedUrl.signedUrl });
}

// DELETE /api/tasks/[id]/attachments/[attachmentId] — delete an attachment
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { id, attachmentId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();

  // Task-level access check
  const access = await checkTaskAccess(db, user.id, user.role, id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status || 403 });
  }

  // Verified tasks: no mutations allowed
  const { data: task } = await db
    .from('pep_tasks')
    .select('status')
    .eq('id', id)
    .single();

  if (task?.status === 'verified') {
    return NextResponse.json({ error: 'Cannot delete attachments on verified tasks' }, { status: 400 });
  }

  const { data: attachment } = await db
    .from('pep_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('task_id', id)
    .single();

  if (!attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
  }

  // Only the uploader or admin+ can delete
  if (attachment.uploaded_by !== user.id && !isAdmin(user.role)) {
    return NextResponse.json({ error: 'Only the uploader or an admin can delete attachments' }, { status: 403 });
  }

  // Remove from storage
  const { error: storageError } = await db.storage
    .from('pep-attachments')
    .remove([attachment.storage_path]);

  if (storageError) {
    console.error('Error removing file from storage:', storageError);
  }

  // Delete metadata row
  const { error: deleteError } = await db
    .from('pep_attachments')
    .delete()
    .eq('id', attachmentId);

  if (deleteError) {
    console.error('Error deleting attachment record:', deleteError);
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
  }

  // Log activity
  await db.from('pep_activity_log').insert({
    task_id: id,
    user_id: user.id,
    action: 'attachment_deleted',
    details: { file_name: attachment.file_name },
  });

  return NextResponse.json({ success: true });
}
