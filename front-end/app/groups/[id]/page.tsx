import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getMe } from '@/lib/session';
import type { GroupConstraints } from '@/lib/api';
import { InviteActions } from './InviteActions';
import { FindSlots } from './FindSlots';
import { ChatAssistant } from './ChatAssistant';
import { ConstraintsCard, DEFAULT_CONSTRAINTS } from './ConstraintsCard';
import { DangerZone } from './DangerZone';

const SERVER_API =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface GroupDetail {
  id: string;
  code: string;
  name: string;
  organizerId: string;
  constraints: GroupConstraints;
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const group = await fetchGroup(id);
  return { title: group?.name ?? 'קבוצה' };
}

export default async function GroupPage({ params }: PageProps) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect('/signin');

  const group = await fetchGroup(id);
  if (!group) notFound();

  const isOrganizer = group.organizerId === me.user.id;

  return (
    <section className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10">
      <Button asChild variant="link" size="sm" className="ps-0">
        <Link href="/groups">
          <ArrowRight className="size-4" />
          כל הקבוצות
        </Link>
      </Button>

      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground" dir="ltr">
          {group.code}
        </code>
      </header>

      <InviteActions groupId={group.id} groupName={group.name} code={group.code} isOrganizer={isOrganizer} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">חברי הקבוצה ({group.members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {group.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 rounded-md border p-3">
                {m.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {m.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{m.email}</div>
                </div>
                <Badge variant={m.role === 'organizer' ? 'default' : 'secondary'}>
                  {m.role === 'organizer' ? 'מארגן' : 'חבר'}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Tabs defaultValue="find-slots" dir="rtl">
        <TabsList>
          <TabsTrigger value="find-slots">מציאת זמן</TabsTrigger>
          <TabsTrigger value="assistant">עוזר חכם</TabsTrigger>
        </TabsList>
        <TabsContent value="find-slots">
          <FindSlots groupId={group.id} />
        </TabsContent>
        <TabsContent value="assistant">
          <ChatAssistant groupId={group.id} />
        </TabsContent>
      </Tabs>

      <ConstraintsCard
        groupId={group.id}
        initial={group.constraints ?? DEFAULT_CONSTRAINTS}
        canEdit={isOrganizer}
      />

      {isOrganizer && <DangerZone groupId={group.id} groupName={group.name} />}
    </section>
  );
}
