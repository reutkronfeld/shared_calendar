'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { createGroupSchema, type CreateGroupInput } from '@/schemas/groups';

export function CreateGroupButton() {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<CreateGroupInput>({
    resolver: zodResolver(createGroupSchema),
    mode: 'onChange',
    defaultValues: { name: '' },
  });

  function onSubmit(values: CreateGroupInput) {
    setSubmitError(null);
    startTransition(async () => {
      try {
        const group = await api.createGroup(values.name);
        router.push(`/groups/${group.id}`);
        router.refresh();
      } catch {
        setSubmitError('לא הצלחנו ליצור את הקבוצה. נסו שוב.');
      }
    });
  }

  function cancel() {
    setOpen(false);
    setSubmitError(null);
    reset();
  }

  if (!open) {
    return (
      <Button size="lg" className="h-14" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        קבוצה חדשה
      </Button>
    );
  }

  return (
    <Card className="sm:col-span-2">
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">שם הקבוצה</Label>
            <Input
              id="group-name"
              autoFocus
              placeholder="סנכרון שיווק"
              aria-invalid={errors.name ? 'true' : 'false'}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending || !isValid}>
              {isPending ? 'יוצר…' : 'יצירה'}
            </Button>
            <Button type="button" variant="ghost" onClick={cancel}>
              ביטול
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
