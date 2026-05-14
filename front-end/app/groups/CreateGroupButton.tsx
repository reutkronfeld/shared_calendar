'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export function CreateGroupButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const group = await api.createGroup(name.trim());
        router.push(`/groups/${group.id}`);
        router.refresh();
      } catch {
        setError('Could not create group. Please try again.');
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 items-center justify-center rounded-xl bg-indigo-600 text-sm font-medium text-white transition hover:bg-indigo-700"
      >
        + New group
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="sm:col-span-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <label htmlFor="group-name" className="mb-2 block text-sm font-medium">
        Group name
      </label>
      <input
        id="group-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Marketing sync"
        className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? 'Creating…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setName('');
            setError(null);
          }}
          className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
