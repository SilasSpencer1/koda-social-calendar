'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { FriendEntry } from '@/lib/schemas/event';
import { X, UserPlus, Search } from 'lucide-react';

interface GuestPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function GuestPicker({ selectedIds, onChange }: GuestPickerProps) {
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [searchResults, setSearchResults] = useState<
    { id: string; name: string; username?: string | null }[]
  >([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load accepted friends on mount
  useEffect(() => {
    async function loadFriends() {
      try {
        const res = await fetch('/api/friends');
        if (res.ok) {
          const data = await res.json();
          setFriends(data.accepted || []);
        }
      } catch {
        // Silently handle - friends just won't show
      }
    }
    loadFriends();
  }, []);

  // Search when query changes
  const searchFriends = useCallback(
    (q: string) => {
      if (!q.trim()) {
        // Show all friends when no query, excluding already selected
        setSearchResults(
          friends
            .filter((f) => !selectedIds.includes(f.user.id))
            .map((f) => ({
              id: f.user.id,
              name: f.user.name,
              username: f.user.username,
            }))
        );
        return;
      }

      const lower = q.toLowerCase();
      const filtered = friends
        .filter((f) => {
          if (selectedIds.includes(f.user.id)) return false;
          return (
            f.user.name.toLowerCase().includes(lower) ||
            f.user.username?.toLowerCase().includes(lower)
          );
        })
        .map((f) => ({
          id: f.user.id,
          name: f.user.name,
          username: f.user.username,
        }));

      setSearchResults(filtered);
    },
    [friends, selectedIds]
  );

  useEffect(() => {
    if (isOpen) {
      searchFriends(query);
    }
  }, [query, isOpen, searchFriends]);

  // Also search via API for wider results
  useEffect(() => {
    if (!query.trim() || query.length < 2) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}`
        );
        if (res.ok) {
          const data = await res.json();
          const apiResults = (data.results || [])
            .filter(
              (r: { id: string; relationshipStatus: string }) =>
                r.relationshipStatus === 'friends' &&
                !selectedIds.includes(r.id)
            )
            .map((r: { id: string; name: string; username?: string }) => ({
              id: r.id,
              name: r.name,
              username: r.username,
            }));

          // Merge with local results (deduplicate)
          setSearchResults((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            const merged = [...prev];
            for (const r of apiResults) {
              if (!ids.has(r.id)) merged.push(r);
            }
            return merged;
          });
        }
      } catch {
        // Silently handle
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selectedIds]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addGuest = (id: string) => {
    if (!selectedIds.includes(id)) {
      onChange([...selectedIds, id]);
    }
    setQuery('');
    inputRef.current?.focus();
  };

  const removeGuest = (id: string) => {
    onChange(selectedIds.filter((sid) => sid !== id));
  };

  const selectedFriends = friends.filter((f) =>
    selectedIds.includes(f.user.id)
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Selected guests as chips */}
      {selectedFriends.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedFriends.map((f) => (
            <Badge
              key={f.user.id}
              variant="secondary"
              className="pl-2 pr-1 py-1 gap-1 text-xs font-medium"
            >
              {f.user.name}
              <button
                type="button"
                onClick={() => removeGuest(f.user.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-slate-300/50 transition-colors"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Add guests..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-lg border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-slate-400">Searching...</div>
          )}

          {searchResults.length === 0 && !loading && (
            <div className="px-3 py-4 text-center">
              <UserPlus className="size-5 mx-auto text-slate-300 mb-1" />
              <p className="text-xs text-slate-400">
                {query
                  ? 'No friends found'
                  : friends.length === 0
                    ? 'Add friends first to invite them'
                    : 'All friends already invited'}
              </p>
            </div>
          )}

          {searchResults.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => addGuest(r.id)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 transition-colors"
            >
              <div className="size-7 rounded-full bg-gradient-to-br from-blue-400 to-violet-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {r.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {r.name}
                </div>
                {r.username && (
                  <div className="text-xs text-slate-400 truncate">
                    @{r.username}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
