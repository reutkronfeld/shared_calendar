import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { getMe } from '@/lib/session';

export async function Navbar() {
  const me = await getMe();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href={me ? '/groups' : '/'} className="flex items-center gap-2 font-semibold">
          <Calendar className="size-5" />
          <span>יומן משותף</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {me ? <UserMenu name={me.user.name} email={me.user.email} picture={me.user.picture} /> : null}
        </div>
      </div>
    </header>
  );
}
