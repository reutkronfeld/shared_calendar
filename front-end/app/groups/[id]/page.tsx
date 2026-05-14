// /groups/[id] — minimal group landing for Phase 1.
// The slot finder + filters live here in Phase 2/3.
//
// NOTE: Next.js 16 — `params` is a Promise.

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getMe } from '../../../lib/session';

const SERVER_API = process.env.API_URL ?? 'http://localhost:4000';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface GroupDetail {
  id: string;
  code: string;
  name: string;
  organizerId: string;
  members: Array<{
    userId: string;
    name: string;
    email: string;
    picture: string | null;
    role: 'organizer' | 'member';
    joinedAt: string;
  }>;
}

async function fetchGroup(id: string): Promise<GroupDetail | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const res = await fetch(`${SERVER_API}/groups/${id}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`fetchGroup ${res.status}`);
  return (await res.json()) as GroupDetail;
}

export default async function GroupPage({ params }: PageProps) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect('/signin');

  const group = await fetchGroup(id);
  if (!group) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link
        href="/groups"
        className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← all groups
      </Link>

      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
        <code className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {group.code}
        </code>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Members ({group.members.length})
        </h2>
        <ul className="space-y-2">
          {group.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
            >
              {m.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.picture}
                  alt=""
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-800">
                  {m.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-xs text-zinc-500">{m.email}</div>
              </div>
              <span className="text-xs uppercase tracking-wide text-zinc-400">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Slot finder + filters arrive in Phase 2.
        <br />
        Share <code className="font-mono">{group.code}</code> to invite more members.
      </section>
    </main>
  );
}
