// /groups — the chooser screen.
// Maps to the top-right sketch: existing groups list + "create new" / "join with code".
// Server component fetches /me on the server.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '../../lib/session';
import { CreateGroupButton } from './CreateGroupButton';
import { LogoutButton } from './LogoutButton';

export default async function GroupsPage() {
  const me = await getMe();
  if (!me) redirect('/signin');

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Hi {me.user.name.split(' ')[0]} 👋</h1>
        <LogoutButton />
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Your groups
        </h2>
        {me.memberships.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No groups yet. Create one or join with a code.
          </div>
        ) : (
          <ul className="space-y-2">
            {me.memberships.map((m) => (
              <li key={m.groupId}>
                <Link
                  href={`/groups/${m.groupId}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div>
                    <div className="font-medium">{m.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-zinc-500">
                      code: {m.code}
                    </div>
                  </div>
                  <span className="text-xs uppercase tracking-wide text-zinc-400">
                    {m.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <CreateGroupButton />
        <Link
          href="/groups/join"
          className="flex h-14 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-medium transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          Join with code
        </Link>
      </section>
    </main>
  );
}
