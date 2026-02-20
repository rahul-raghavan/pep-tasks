'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { isAdmin, canCreateUser } from '@/lib/permissions';
import { PepUser, UserRole } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { ROLE_COLORS } from '@/lib/constants/theme';

export default function UsersPage() {
  const { user } = useUserContext();
  const router = useRouter();
  const [users, setUsers] = useState<PepUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isAdmin(user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchUsers();
  }, [user.role, router]);

  async function fetchUsers() {
    setLoading(true);
    const res = await fetch('/api/users');
    if (res.ok) {
      setUsers(await res.json());
    }
    setLoading(false);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast.error('Email is required');
      return;
    }

    setCreating(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newEmail,
        name: newName || null,
        role: newRole,
      }),
    });

    if (res.ok) {
      toast.success('User added');
      setNewEmail('');
      setNewName('');
      setNewRole('staff');
      setShowForm(false);
      fetchUsers();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to create user');
    }
    setCreating(false);
  }

  async function toggleActive(targetUser: PepUser) {
    const res = await fetch(`/api/users/${targetUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !targetUser.is_active }),
    });

    if (res.ok) {
      toast.success(
        targetUser.is_active ? 'User deactivated' : 'User reactivated'
      );
      fetchUsers();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to update user');
    }
  }

  async function changeRole(targetUser: PepUser, newRole: UserRole) {
    const res = await fetch(`/api/users/${targetUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });

    if (res.ok) {
      toast.success('Role updated');
      fetchUsers();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to update role');
    }
  }

  if (!isAdmin(user.role)) return null;

  const availableRoles: UserRole[] =
    user.role === 'super_admin'
      ? ['super_admin', 'admin', 'staff']
      : ['admin', 'staff'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl pep-heading">Users</h1>
        <Button onClick={() => setShowForm(!showForm)} className="uppercase tracking-wider">
          <UserPlus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Add user form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add New User</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@pepschoolv2.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={newRole}
                  onValueChange={(v) => setNewRole(v as UserRole)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={creating} className="uppercase tracking-wider">
                  {creating ? 'Adding...' : 'Add User'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Users list */}
      {loading ? (
        <div className="animate-pulse text-muted-foreground">Loading users...</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className={`bg-card border rounded p-4 flex items-center justify-between gap-4 ${
                !u.is_active ? 'opacity-50' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {u.name || u.email.split('@')[0]}
                  </span>
                  <Badge
                    variant="secondary"
                    className={ROLE_COLORS[u.role]}
                  >
                    {u.role.replace('_', ' ')}
                  </Badge>
                  {!u.is_active && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                  {u.id === user.id && (
                    <Badge variant="outline" className="text-[#5BB8D6]">
                      You
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{u.email}</p>
              </div>

              {u.id !== user.id && (
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={u.role}
                    onValueChange={(v) => changeRole(u, v as UserRole)}
                    disabled={
                      !canCreateUser(user.role, u.role) &&
                      user.role !== 'super_admin'
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(u)}
                  >
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
