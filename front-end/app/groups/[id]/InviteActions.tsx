'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Mail, MessageCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, type ApiError } from '@/lib/api';

interface Props {
  groupId: string;
  groupName: string;
  code: string;
  isOrganizer: boolean;
}

export function InviteActions({ groupId, groupName, code, isOrganizer }: Props) {
  const [origin, setOrigin] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const inviteLink = origin ? `${origin}/groups/join?code=${encodeURIComponent(code)}` : '';
  const inviteText = `שלום! 👋\nהוזמנת להצטרף לקבוצה "${groupName}" ביומן המשותף.\n${inviteLink}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(inviteText)}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(`הזמנה להצטרף לקבוצה "${groupName}"`)}&body=${encodeURIComponent(inviteText)}`;

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} הועתק ללוח`);
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  }

  function rotate() {
    startTransition(async () => {
      try {
        await api.rotateGroupCode(groupId);
        toast.success('הקוד הוחלף. הקודם כבר לא תקף.');
        setConfirmOpen(false);
        router.refresh();
      } catch (err) {
        if (err instanceof TypeError) {
          console.error('rotateGroupCode network error', err.message);
          toast.error(`לא ניתן להתחבר לשרת: ${err.message}`);
          return;
        }
        const e = err as ApiError;
        console.error('rotateGroupCode failed', {
          status: e?.status,
          body: e?.body,
          raw: err,
        });
        if (e?.status === 401) router.push('/signin');
        else if (e?.status === 403) toast.error('רק המארגן יכול להחליף את הקוד.');
        else if (e?.status === 404) toast.error('הקבוצה לא נמצאה.');
        else toast.error(`החלפת הקוד נכשלה (${e?.status ?? 'ללא סטטוס'})`);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">הזמנת חברים</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>קוד הקבוצה</Label>
          <div className="flex gap-2">
            <Input value={code} readOnly dir="ltr" className="font-mono" />
            <Button variant="outline" size="icon" onClick={() => copy(code, 'הקוד')} aria-label="העתקת קוד">
              <Copy className="size-4" />
            </Button>
            {isOrganizer && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setConfirmOpen(true)}
                aria-label="החלפת קוד"
                title="החלפת קוד"
              >
                <RefreshCw className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>קישור הזמנה</Label>
          <div className="flex gap-2">
            <Input value={inviteLink} readOnly dir="ltr" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="icon" onClick={() => copy(inviteLink, 'הקישור')} disabled={!inviteLink} aria-label="העתקת קישור">
              <Copy className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" />
              שיתוף בוואטסאפ
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={mailtoUrl}>
              <Mail className="size-4" />
              שליחה במייל
            </a>
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>החלפת קוד הקבוצה?</DialogTitle>
            <DialogDescription>
              הקוד הקיים יפסיק להיות תקף מיד. כל מי שיש לו את הקוד הישן או הקישור הישן לא יוכל להצטרף.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={isPending}>
                ביטול
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={rotate} disabled={isPending}>
              {isPending ? 'מחליף…' : 'החלפת קוד'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
