import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeySquare } from 'lucide-react';

export const metadata: Metadata = { title: 'הקבוצות שלי' };

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getMe } from '@/lib/session';
import { CreateGroupButton } from './CreateGroupButton';

export default async function GroupsPage() {
  const me = await getMe();
  if (!me) redirect('/signin');

  const first = me.user.name.split(' ')[0];

  return (
    <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">שלום {first} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">בחר קבוצה או צור חדשה.</p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">הקבוצות שלי</h2>
        {me.memberships.length === 0 ? (
          <Card className="flex items-center justify-center border-dashed p-8 text-center text-sm text-muted-foreground">
            עדיין אין קבוצות. צרו אחת או הצטרפו עם קוד.
          </Card>
        ) : (
          <ul className="space-y-2">
            {me.memberships.map((m) => (
              <li key={m.groupId}>
                <Link
                  href={`/groups/${m.groupId}`}
                  className="block transition hover:opacity-80"
                >
                  <Card className="flex flex-row items-center justify-between p-4">
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground" dir="ltr">
                        {m.code}
                      </div>
                    </div>
                    <Badge variant={m.role === 'organizer' ? 'default' : 'secondary'}>
                      {m.role === 'organizer' ? 'מארגן' : 'חבר'}
                    </Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <CreateGroupButton />
        <Button asChild variant="outline" size="lg" className="h-14">
          <Link href="/groups/join">
            <KeySquare className="size-4" />
            הצטרפות עם קוד
          </Link>
        </Button>
      </section>
    </section>
  );
}
