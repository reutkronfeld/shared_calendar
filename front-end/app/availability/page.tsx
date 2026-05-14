import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getMe } from '@/lib/session';
import type { AvailabilityOverride, WeeklyDayAvailability } from '@/lib/api';
import { AvailabilityManager } from './AvailabilityManager';
import { WeeklyHoursList } from './WeeklyHoursList';

export const metadata: Metadata = { title: 'הזמינות שלי' };

const SERVER_API =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function getCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
}

async function fetchWeekly(): Promise<WeeklyDayAvailability[]> {
  const cookieHeader = await getCookieHeader();
  const res = await fetch(`${SERVER_API}/me/weekly-availability`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { daysAvailability: WeeklyDayAvailability[] };
  return body.daysAvailability;
}

async function fetchOverrides(): Promise<AvailabilityOverride[]> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const res = await fetch(`${SERVER_API}/me/overrides`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return (await res.json()) as AvailabilityOverride[];
}

export default async function AvailabilityPage() {
  const me = await getMe();
  if (!me) redirect('/signin');

  const [overrides, weekly] = await Promise.all([fetchOverrides(), fetchWeekly()]);

  return (
    <section className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">הזמינות שלי</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          הגדירו פעם אחת שעות שבועיות קבועות, והוסיפו חריגות נקודתיות לפי צורך.
        </p>
      </header>

      <Tabs defaultValue="weekly" dir="rtl">
        <TabsList>
          <TabsTrigger value="weekly">שעות שבועיות</TabsTrigger>
          <TabsTrigger value="overrides">חריגות בתאריך</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">השעות הקבועות שלי</CardTitle>
              <CardDescription>
                כך תיראה ברירת המחדל לכל שבוע. הפעילו את הימים בהם אתם זמינים, וקבעו טווחי שעות.
                אפשר להעתיק טווח לימים נוספים בלחיצה אחת.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WeeklyHoursList initial={weekly} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overrides" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">איך זה עובד?</CardTitle>
              <CardDescription>
                כשמישהו מחפש זמן פגישה משותף בקבוצה, אנחנו ממזגים את הזמינות שלכם
                לפי הסדר הבא:
                <br />
                1. שולפים אירועים מ-Google Calendar שלכם (זמני &quot;עסוק&quot;).
                <br />
                2. מוסיפים אליהם טווחים שסימנתם כאן כ<strong>&quot;עסוק&quot;</strong>.
                <br />
                3. מורידים מתוך התוצאה טווחים שסימנתם כאן כ<strong>&quot;פנוי&quot;</strong>.
                <br />
                השינויים <em>לא</em> משנים את היומן עצמו, ולא נראים לחברים אחרים.
              </CardDescription>
            </CardHeader>
          </Card>

          <AvailabilityManager initial={overrides} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
