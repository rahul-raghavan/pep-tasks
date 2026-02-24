import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/auth';
import { getCenterUserIds } from '@/lib/centers';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

// Shared access check (same pattern as comments route)
async function checkTaskAccess(
  db: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  userRole: string,
  taskId: string
): Promise<{ allowed: boolean; error?: string; status?: number }> {
  const { data: task } = await db
    .from('pep_tasks')
    .select('assigned_to, assigned_by, delegated_to')
    .eq('id', taskId)
    .single();

  if (!task) return { allowed: false, error: 'Task not found', status: 404 };

  // Staff: only assigned_to or delegated_to
  if (userRole === 'staff') {
    if (task.assigned_to !== userId && task.delegated_to !== userId) {
      return { allowed: false, error: 'Forbidden', status: 403 };
    }
  }

  // Admin: hierarchy + center check
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

// GET /api/tasks/[id]/attachments — list attachments
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();

  const access = await checkTaskAccess(db, user.id, user.role, id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status || 403 });
  }

  const { data, error } = await db
    .from('pep_attachments')
    .select('id, task_id, uploaded_by, file_name, file_size, mime_type, storage_path, created_at, uploader:pep_users!pep_attachments_uploaded_by_fkey(id, name, email)')
    .eq('task_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error fetching attachments:', error);
    return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 });
  }

  const attachments = (data || []).map((a: Record<string, unknown>) => ({
    ...a,
    uploader: Array.isArray(a.uploader) ? a.uploader[0] : a.uploader,
  }));

  return NextResponse.json(attachments);
}

// POST /api/tasks/[id]/attachments — upload a file
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();

  const access = await checkTaskAccess(db, user.id, user.role, id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status || 403 });
  }

  // Check task isn't verified
  const { data: task } = await db
    .from('pep_tasks')
    .select('status')
    .eq('id', id)
    .single();

  if (task?.status === 'verified') {
    return NextResponse.json({ error: 'Cannot add attachments to verified tasks' }, { status: 400 });
  }

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File size exceeds 5 MB limit' }, { status: 400 });
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'File type not allowed. Accepted: images, PDF, Word, Excel, and text files.' },
      { status: 400 }
    );
  }

  // Generate unique storage path
  const fileId = crypto.randomUUID();
  const storagePath = `${id}/${fileId}-${file.name}`;

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await db.storage
    .from('pep-attachments')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }

  // Insert metadata row
  const { data: attachment, error: insertError } = await db
    .from('pep_attachments')
    .insert({
      task_id: id,
      uploaded_by: user.id,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: storagePath,
    })
    .select('*, uploader:pep_users!pep_attachments_uploaded_by_fkey(*)')
    .single();

  if (insertError) {
    console.error('Error inserting attachment:', insertError);
    // Clean up the uploaded file
    await db.storage.from('pep-attachments').remove([storagePath]);
    return NextResponse.json({ error: 'Failed to save attachment' }, { status: 500 });
  }

  // Log activity
  await db.from('pep_activity_log').insert({
    task_id: id,
    user_id: user.id,
    action: 'attachment_added',
    details: { file_name: file.name },
  });

  const result = {
    ...attachment,
    uploader: Array.isArray(attachment.uploader) ? attachment.uploader[0] : attachment.uploader,
  };

  return NextResponse.json(result, { status: 201 });
}
