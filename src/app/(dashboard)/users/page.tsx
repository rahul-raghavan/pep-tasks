'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserContext } from '@/components/layout/DashboardLayout';
import { isAdmin, canCreateUser } from '@/lib/permissions';
import { PepUser, PepCenter, UserRole } from '@/types/database';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { UserPlus, ChevronDown, ChevronUp, Plus, X, Pencil } from 'lucide-react';
import { formatDisplayName } from '@/lib/format-name';
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

  // Centers
  const [centers, setCenters] = useState<PepCenter[]>([]);
  const [showCenters, setShowCenters] = useState(false);
  const [newCenterName, setNewCenterName] = useState('');
  const [addingCenter, setAddingCenter] = useState(false);
  const [newUserCenterIds, setNewUserCenterIds] = useState<string[]>([]);

  // Edit user dialog
  const [editingUser, setEditingUser] = useState<PepUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editCenterIds, setEditCenterIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!isAdmin(user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchUsers();
    fetchCenters();
  }, [user.role, router]);

  async function fetchUsers() {
    setLoading(true);
    const res = await fetch('/api/users');
    if (res.ok) {
      setUsers(await res.json());
    }
    setLoading(false);
  }

  async function fetchCenters() {
    const res = await fetch('/api/centers');
    if (res.ok) setCenters(await res.json());
  }

  async function addCenter(e: React.FormEvent) {
    e.preventDefault();
    if (!newCenterName.trim()) return;
    setAddingCenter(true);
    const res = await fetch('/api/centers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCenterName }),
    });
    if (res.ok) {
      toast.success('Center added');
      setNewCenterName('');
      fetchCenters();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to add center');
    }
    setAddingCenter(false);
  }

  async function toggleUserCenter(targetUser: PepUser, center: PepCenter) {
    const currentCenterIds = (targetUser.centers || []).map((c) => c.id);
    const hasCenter = currentCenterIds.includes(center.id);
    const newCenterIds = hasCenter
      ? currentCenterIds.filter((id) => id !== center.id)
      : [...currentCenterIds, center.id];

    const res = await fetch(`/api/users/${targetUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ center_ids: newCenterIds }),
    });

    if (res.ok) {
      toast.success(hasCenter ? 'Center removed' : 'Center assigned');
      fetchUsers();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to update centers');
    }
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
      const newUser = await res.json();

      // Assign centers to new user if any selected
      if (newUserCenterIds.length > 0 && user.role === 'super_admin') {
        await fetch(`/api/users/${newUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ center_ids: newUserCenterIds }),
        });
      }

      toast.success('User added');
      setNewEmail('');
      setNewName('');
      setNewRole('staff');
      setNewUserCenterIds([]);
      setShowForm(false);
      fetchUsers();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to create user');
    }
    setCreating(false);
  }

  function openEditDialog(targetUser: PepUser) {
    setEditingUser(targetUser);
    setEditName(targetUser.name || '');
    setEditCenterIds((targetUser.centers || []).map((c) => c.id));
  }

  async function saveEditUser() {
    if (!editingUser) return;
    setSavingEdit(true);

    const payload: Record<string, unknown> = {};
    const trimmedName = editName.trim() || null;
    if (trimmedName !== (editingUser.name || null)) {
      payload.name = trimmedName;
    }
    if (user.role === 'super_admin') {
      payload.center_ids = editCenterIds;
    }

    if (Object.keys(payload).length === 0) {
      setEditingUser(null);
      setSavingEdit(false);
      return;
    }

    const res = await fetch(`/api/users/${editingUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success('User updated');
      setEditingUser(null);
      fetchUsers();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to update user');
    }
    setSavingEdit(false);
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
              {/* Center assignment (super_admin only) */}
              {user.role === 'super_admin' && centers.length > 0 && (
                <div className="space-y-2">
                  <Label>Centers</Label>
                  <div className="flex flex-wrap gap-2">
                    {centers.map((c) => {
                      const selected = newUserCenterIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setNewUserCenterIds((prev) =>
                              selected
                                ? prev.filter((id) => id !== c.id)
                                : [...prev, c.id]
                            )
                          }
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            selected
                              ? 'bg-[#5BB8D6]/15 text-[#3A8BA8] border-[#5BB8D6]/50 font-medium'
                              : 'bg-transparent text-muted-foreground border-dashed hover:border-[#5BB8D6]/50'
                          }`}
                        >
                          {c.name}
                          {selected && <X className="w-3 h-3 ml-1 inline" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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

      {/* Centers Management (super_admin only) */}
      {user.role === 'super_admin' && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setShowCenters(!showCenters)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Centers</CardTitle>
              {showCenters ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {showCenters && (
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {centers.map((c) => (
                  <Badge key={c.id} variant="secondary">
                    {c.name}
                  </Badge>
                ))}
                {centers.length === 0 && (
                  <span className="text-sm text-muted-foreground">No centers yet</span>
                )}
              </div>
              <form onSubmit={addCenter} className="flex gap-2">
                <Input
                  value={newCenterName}
                  onChange={(e) => setNewCenterName(e.target.value)}
                  placeholder="New center name..."
                  className="w-48"
                />
                <Button type="submit" size="sm" disabled={addingCenter || !newCenterName.trim()}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </form>
            </CardContent>
          )}
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
                    {formatDisplayName(u.name, u.email)}
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
                {/* Center badges */}
                {centers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {user.role === 'super_admin' && u.id !== user.id ? (
                      // Super admin: clickable toggles
                      centers.map((c) => {
                        const hasCenter = (u.centers || []).some((uc) => uc.id === c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleUserCenter(u, c)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                              hasCenter
                                ? 'bg-[#5BB8D6]/15 text-[#3A8BA8] border-[#5BB8D6]/30'
                                : 'bg-transparent text-muted-foreground border-dashed hover:border-[#5BB8D6]/50'
                            }`}
                          >
                            {c.name}
                            {hasCenter && <X className="w-2.5 h-2.5 ml-1 inline" />}
                          </button>
                        );
                      })
                    ) : (
                      // Read-only badges
                      (u.centers || []).map((c) => (
                        <span
                          key={c.id}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-[#5BB8D6]/15 text-[#3A8BA8] border border-[#5BB8D6]/30"
                        >
                          {c.name}
                        </span>
                      ))
                    )}
                  </div>
                )}
              </div>

              {u.id !== user.id && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(u)}
                    title="Edit user"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
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

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update details for {editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            {user.role === 'super_admin' && centers.length > 0 && (
              <div className="space-y-2">
                <Label>Centers</Label>
                <div className="flex flex-wrap gap-2">
                  {centers.map((c) => {
                    const selected = editCenterIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setEditCenterIds((prev) =>
                            selected
                              ? prev.filter((id) => id !== c.id)
                              : [...prev, c.id]
                          )
                        }
                        className={`text-sm px-4 py-2 rounded-full border transition-colors ${
                          selected
                            ? 'bg-[#5BB8D6]/15 text-[#3A8BA8] border-[#5BB8D6]/50 font-medium'
                            : 'bg-transparent text-muted-foreground border-dashed hover:border-[#5BB8D6]/50'
                        }`}
                      >
                        {c.name}
                        {selected && <X className="w-3 h-3 ml-1.5 inline" />}
                      </button>
                    );
                  })}
                </div>
                {editCenterIds.length === 0 && (
                  <p className="text-xs text-muted-foreground">No centers selected. Click a center to assign it.</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={saveEditUser} disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
