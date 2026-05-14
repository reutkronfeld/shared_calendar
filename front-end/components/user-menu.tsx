'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { CalendarClock, LogOut, Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';

interface Props {
  name: string;
  email: string;
  picture: string | null;
}

export function UserMenu({ name, email, picture }: Props) {
  const [isPending, startTransition] = useTransition();

  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function logout() {
    startTransition(async () => {
      try {
        // Route hits the Next.js API which clears the session cookie locally
        // AND forwards the call to the backend in the same request.
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      } catch {
        // ignore; we still want to navigate away
      }
      // Hard navigation forces a fresh request without any cached RSC
      // payload, so the Navbar's `getMe()` re-runs against the post-logout
      // cookie state.
      window.location.href = '/signin';
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="תפריט משתמש">
          <Avatar name={name} picture={picture} initials={initials} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground" dir="ltr">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="size-4" />
            הגדרות
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/groups" className="cursor-pointer">
            <User className="size-4" />
            הקבוצות שלי
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/availability" className="cursor-pointer">
            <CalendarClock className="size-4" />
            הזמינות שלי
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isPending} onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="size-4" />
          {isPending ? 'מתנתק…' : 'התנתקות'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({ name, picture, initials }: { name: string; picture: string | null; initials: string }) {
  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={picture}
        alt={name}
        referrerPolicy="no-referrer"
        className="size-8 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {initials || '?'}
    </span>
  );
}
