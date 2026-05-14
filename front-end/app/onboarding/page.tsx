import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { CalendarCheck, Check, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMe } from '@/lib/session';
import type { WeeklyDayAvailability } from '@/lib/api';
import { OnboardingFlow } from './OnboardingFlow';

export const metadata: Metadata = { title: 'הגדרה ראשונית' };

const SERVER_API =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fetchWeekly(): Promise<WeeklyDayAvailability[]> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const res = await fetch(`${SERVER_API}/me/weekly-availability`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { daysAvailability: WeeklyDayAvailability[] };
  return body.daysAvailability;
}

export default async function OnboardingPage() {
  const me = await getMe();
  if (!me) redirect('/signin?next=/onboarding');

  // Already onboarded? Skip straight to groups.
  if (me.user.onboarded) redirect('/groups');

  const weekly = await fetchWeekly();
  const hasGoogleSync = me.user.hasGoogleSync;

  return (
    <section className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
      <header className="space-y-2 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">ברוך בואך, {me.user.name.split(' ')[0]}!</h1>
        <p className="text-sm text-muted-foreground">
          רגע אחד של הגדרה ונסיים — כדי שמציאת זמן עם הקבוצה תעבוד טוב.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              {hasGoogleSync ? <Check className="size-4" /> : <CalendarCheck className="size-4" />}
            </div>
            <div className="space-y-1">
              <CardTitle className="text-base">
                {hasGoogleSync ? 'סנכרון עם Google Calendar פעיל' : 'סנכרון עם Google Calendar'}
              </CardTitle>
              <CardDescription>
                {hasGoogleSync
                  ? 'אנחנו קוראים את זמני ה"עסוק" שלך מהיומן הראשי כדי לא להציע פגישות שמתנגשות. שום שינוי לא נכתב חזרה ליומן.'
                  : 'לא הענקת לנו גישה לקרוא את היומן. אפשר להמשיך, אבל "מציאת זמן" לא תכיר את האירועים הקיימים שלך.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">שעות שבועיות זמינות</CardTitle>
          <CardDescription>
            הפעל את הימים שבהם אתה זמין לפגישות, וקבע את טווחי השעות. כך אנחנו יודעים מתי בכלל
            להציע אותך — בלי קשר למה שביומן.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingFlow initialWeekly={weekly} />
        </CardContent>
      </Card>
    </section>
  );
}
