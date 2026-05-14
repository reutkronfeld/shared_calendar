'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { api } from '@/lib/api';

interface Props {
  groupId: string;
  groupName: string;
}

export function DangerZone({ groupId, groupName }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setConfirmation('');
  }

  function confirmDelete() {
    startTransition(async () => {
      try {
        await api.deleteGroup(groupId);
        toast.success('הקבוצה נמחקה');
        router.push('/groups');
        router.refresh();
      } catch (err) {
        const apiErr = err as { status?: number; body?: { error?: string } };
        const code = apiErr?.body?.error;
        const message =
          code === 'not_organizer'
            ? 'רק מי שיצר את הקבוצה יכול למחוק אותה'
            : code === 'group_not_found'
              ? 'הקבוצה לא נמצאה'
              : `מחיקת הקבוצה נכשלה${code ? ` (${code})` : ''}`;
        toast.error(message);
        console.error('deleteGroup failed', apiErr);
      }
    });
  }

  const matches = confirmation.trim() === groupName.trim();

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base text-destructive">אזור מסוכן</CardTitle>
        <CardDescription>
          מחיקת הקבוצה תסיר את כל החברויות, האילוצים, ההיסטוריה — ולא ניתנת לביטול.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <Trash2 className="size-4" />
          מחיקת קבוצה
        </Button>
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת הקבוצה &quot;{groupName}&quot;?</DialogTitle>
            <DialogDescription>
              הפעולה לא ניתנת לביטול. לאישור, הקלידו את שם הקבוצה במדויק.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-name">שם הקבוצה</Label>
            <Input
              id="confirm-name"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={groupName}
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={isPending}>
                ביטול
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={!matches || isPending}>
              {isPending ? 'מוחק…' : 'מחיקה לתמיד'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
