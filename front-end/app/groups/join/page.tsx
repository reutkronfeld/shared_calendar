// /groups/join — paste a code, join.
// Maps to the bottom-left sketch.

import Link from 'next/link';
import { JoinForm } from './JoinForm';

export default function JoinGroupPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <Link
        href="/groups"
        className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← back
      </Link>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Join a group</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Paste the group code you got from the organizer.
      </p>
      <JoinForm />
    </main>
  );
}
