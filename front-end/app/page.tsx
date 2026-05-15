import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Calendar, KeySquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getMe } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001';

export default async function Home() {
  const me = await getMe();
  if (me) redirect(me.user.onboarded ? '/groups' : '/onboarding');

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Calendar className="size-6" />
          </div>
          <CardTitle className="text-2xl">יומן משותף</CardTitle>
          <CardDescription>מצאו זמן פגישה שמתאים לכולם.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild variant="outline" size="lg" className="w-full">
            <a href={`${API}/auth/google`}>
              <GoogleG />
              התחברות עם Google
            </a>
          </Button>
          <Button asChild size="lg" className="w-full">
            <Link href={`/signin?next=${encodeURIComponent('/groups/join')}`}>
              <KeySquare className="size-4" />
              הצטרפות עם קוד
            </Link>
          </Button>
        </CardContent>
        <CardFooter>
          <p className="text-center text-xs leading-5 text-muted-foreground">
            להצטרפות צריך להתחבר תחילה — נשמור עבורך את הכוונה ונחזיר אותך מיד אחרי הכניסה.
          </p>
        </CardFooter>
      </Card>
    </section>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.1z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.4 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2C40.9 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
