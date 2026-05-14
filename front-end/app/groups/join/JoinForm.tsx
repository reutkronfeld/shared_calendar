'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ApiError } from '../../../lib/api';

export function JoinForm() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        const group = await api.joinGroup(trimmed);
        router.push(`/groups/${group.id}`);
        router.refresh();
      } catch (err) {
        const e = err as ApiError;
        if (e.status === 404) setError('No group with that code.');
        else if (e.status === 401) router.push('/signin');
        else setError('Could not join. Please try again.');
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="happy-tiger-42"
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending || !code.trim()}
        className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? 'Joining…' : 'Join'}
      </button>
    </form>
  );
}
