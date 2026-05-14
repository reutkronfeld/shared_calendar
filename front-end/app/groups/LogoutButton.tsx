'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            await api.logout();
          } finally {
            router.push('/signin');
            router.refresh();
          }
        })
      }
      className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-50"
    >
      {isPending ? 'Logging out…' : 'Log out'}
    </button>
  );
}
