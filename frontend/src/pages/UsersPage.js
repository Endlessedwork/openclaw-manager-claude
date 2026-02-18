import React, { useState, useEffect, useCallback } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Users, Plus, Pencil, Trash2, Shield, Eye, Edit3 } from 'lucide-react';

const ROLE_CONFIG = {
  admin: { label: 'Admin', icon: Shield, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  editor: { label: 'Editor', icon: Edit3, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  viewer: { label: 'Viewer', icon: Eye, color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'viewer' });

  const fetchUsers = useCallback(async () => {
    try {
      const res = await getUsers();
      setUsers(res.data);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await createUser(form);
      toast.success('User created');
      setShowCreate(false);
      setForm({ username: '', password: '', name: '', role: 'viewer' });
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const updates = {};
      if (form.name) updates.name = form.name;
      if (form.role) updates.role = form.role;
      if (form.password) updates.password = form.password;
      await updateUser(editUser.id, updates);
      toast.success('User updated');
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update user');
    }
  };

  const handleDelete = async (id, username) => {
    if (!window.confirm(`Delete user ${username}?`)) return;
    try {
      await deleteUser(id);
      toast.success('User deleted');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete user');
    }
  };

  const handleToggleActive = async (u) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      toast.success(`User ${u.is_active ? 'disabled' : 'enabled'}`);
      fetchUsers();
    } catch (err) {
      toast.error('Failed to update user');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-orange-500" /> User Management
          </h1>
          <p className="text-sm text-zinc-500 mt-1">{users.length} users</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditUser(null); setForm({ username: '', password: '', name: '', role: 'viewer' }); }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium text-white transition-colors"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {(showCreate || editUser) && (
        <div className="bg-[#0c0c0e] border border-white/5 rounded-xl p-6">
          <h3 className="text-lg font-medium text-zinc-200 mb-4">
            {editUser ? 'Edit User' : 'Create User'}
          </h3>
          <form onSubmit={editUser ? handleUpdate : handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!editUser && (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
                <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required
                  className="w-full px-3 py-2 bg-[#09090b] border border-white/10 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-orange-500/50"
                  placeholder="johndoe" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Display Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required={!editUser}
                className="w-full px-3 py-2 bg-[#09090b] border border-white/10 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-orange-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Password {editUser && <span className="text-zinc-600">(leave empty to keep)</span>}
              </label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editUser}
                className="w-full px-3 py-2 bg-[#09090b] border border-white/10 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-orange-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 bg-[#09090b] border border-white/10 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-orange-500/50">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium text-white transition-colors">
                {editUser ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={() => { setShowCreate(false); setEditUser(null); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium text-zinc-300 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[#0c0c0e] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">User</th>
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Role</th>
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Last Login</th>
              <th className="text-right px-4 py-3 text-zinc-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const roleConfig = ROLE_CONFIG[u.role] || ROLE_CONFIG.viewer;
              const RoleIcon = roleConfig.icon;
              return (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="text-zinc-200 font-medium">{u.name}</div>
                    <div className="text-zinc-500 text-xs">@{u.username}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${roleConfig.color}`}>
                      <RoleIcon className="w-3 h-3" /> {roleConfig.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleActive(u)}
                      className={`text-xs px-2 py-1 rounded ${u.is_active ? 'text-green-400 bg-green-500/10' : 'text-zinc-500 bg-zinc-500/10'}`}>
                      {u.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditUser(u); setShowCreate(false); setForm({ name: u.name, role: u.role, password: '' }); }}
                        className="p-1.5 hover:bg-white/5 rounded text-zinc-500 hover:text-zinc-300">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => handleDelete(u.id, u.username)}
                          className="p-1.5 hover:bg-red-500/10 rounded text-zinc-500 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
