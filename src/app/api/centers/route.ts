import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

// GET /api/centers — list active centers
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('pep_centers')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch centers' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// POST /api/centers — create a center (super_admin only)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can create centers' }, { status: 403 });
  }

  const body = await request.json();
  const { name } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Center name is required' }, { status: 400 });
  }

  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('pep_centers')
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'A center with this name already exists' }, { status: 409 });
  }

  if (error) {
    console.error('Error creating center:', error);
    return NextResponse.json({ error: 'Failed to create center' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
