import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'הגדרות' };

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { getMe } from '@/lib/session';
import { ThemePreference } from './ThemePreference';

export default async function SettingsPage() {
  const me = await getMe();
  if (!me) redirect('/signin');

  return (
    <section className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">הגדרות</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          פרטי החשבון והעדפות התצוגה.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">פרופיל</CardTitle>
          <CardDescription>נמשך מחשבון Google שלך — לא ניתן לעריכה כאן.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {me.user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={me.user.picture}
                alt=""
                referrerPolicy="no-referrer"
                className="size-12 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                {me.user.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-medium">{me.user.name}</div>
              <div className="text-sm text-muted-foreground" dir="ltr">{me.user.email}</div>
            </div>
          </div>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">אזור זמן</Label>
              <Badge variant="secondary" dir="ltr">{me.user.defaultTimeZone}</Badge>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">קבוצות פעילות</Label>
              <Badge variant="secondary">{me.memberships.length}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">תצוגה</CardTitle>
          <CardDescription>בחר ערכת נושא בהירה, כהה או לפי הגדרת המערכת.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemePreference />
        </CardContent>
      </Card>
    </section>
  );
}
