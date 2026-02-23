'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { Camera } from 'lucide-react';

interface UserData {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  city: string | null;
  email: string;
}

export default function ProfileSettingsPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState('');

  // Load user data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) throw new Error();
        const data = await res.json();
        setUser(data.user);
        setName(data.user.name || '');
        setUsername(data.user.username || '');
        setCity(data.user.city || '');
        setAvatarUrl(data.user.avatarUrl);
      } catch {
        toast('Failed to load profile', 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toast]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Step 1: Upload file to Supabase Storage
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/uploads/avatar', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || 'Upload failed');
      }
      const { url } = await uploadRes.json();

      // Step 2: Save URL to user profile
      const saveRes = await fetch('/api/me/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: url }),
      });
      if (!saveRes.ok) throw new Error('Failed to save avatar');

      setAvatarUrl(url);
      toast('Avatar updated');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setUsernameError('');
    setSaving(true);
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          username: username || null,
          city: city || null,
        }),
      });

      if (res.status === 409) {
        const data = await res.json();
        if (data.field === 'username') {
          setUsernameError('This username is already taken');
        } else {
          toast(data.error || 'Conflict', 'error');
        }
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        toast(data.error || 'Failed to save', 'error');
        return;
      }

      const updated = await res.json();
      setUser((prev) => (prev ? { ...prev, ...updated } : prev));
      toast('Profile saved');
    } catch {
      toast('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-20 w-20 animate-pulse rounded-full bg-gray-200" />
        <div className="space-y-4">
          <div className="h-10 animate-pulse rounded bg-gray-200" />
          <div className="h-10 animate-pulse rounded bg-gray-200" />
          <div className="h-10 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your public profile information.
        </p>
      </div>

      {/* Avatar section */}
      <div className="flex items-center gap-6">
        <div className="relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="h-20 w-20 rounded-full border-2 border-gray-200 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-gray-200 bg-blue-100 text-2xl font-bold text-blue-700">
              {name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Change profile photo"
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <Camera className="h-4 w-4 text-gray-600" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleAvatarUpload}
            className="hidden"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">Profile photo</p>
          <p className="text-xs text-gray-500">
            {uploading ? 'Uploading...' : 'JPG, PNG, GIF or WebP. Max 5MB.'}
          </p>
        </div>
      </div>

      {/* Form fields */}
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
              @
            </span>
            <Input
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setUsernameError('');
              }}
              placeholder="username"
              className="pl-7"
              aria-invalid={!!usernameError}
            />
          </div>
          {usernameError && (
            <p className="text-sm text-red-600">{usernameError}</p>
          )}
          <p className="text-xs text-gray-500">
            Letters, numbers, and underscores only. Min 3 characters.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. San Francisco"
          />
          <p className="text-xs text-gray-500">
            Used for event discovery and suggestions.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className=""
        >
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
        {user?.email && (
          <span className="text-xs text-gray-400">{user.email}</span>
        )}
      </div>
    </div>
  );
}
