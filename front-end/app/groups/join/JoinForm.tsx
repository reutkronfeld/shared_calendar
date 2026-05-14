'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type ApiError } from '@/lib/api';
import { joinGroupSchema, type JoinGroupInput } from '@/schemas/groups';

interface Props {
  initialCode?: string;
}

export function JoinForm({ initialCode = '' }: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<JoinGroupInput>({
    resolver: zodResolver(joinGroupSchema),
    mode: 'onChange',
    defaultValues: { code: initialCode },
  });

  function onSubmit(values: JoinGroupInput) {
    setSubmitError(null);
    startTransition(async () => {
      try {
        const group = await api.joinGroup(values.code);
        router.push(`/groups/${group.id}`);
        router.refresh();
      } catch (err) {
        const e = err as ApiError;
        if (e.status === 404) toast.error('לא נמצאה קבוצה עם הקוד הזה.');
        else if (e.status === 401) router.push('/signin');
        else setSubmitError('ההצטרפות נכשלה. נסו שוב.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        autoFocus
        placeholder="happy-tiger-42"
        dir="ltr"
        className="font-mono text-base"
        aria-invalid={errors.code ? 'true' : 'false'}
        {...register('code')}
      />
      {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={isPending || !isValid} size="lg" className="w-full">
        {isPending ? 'מצטרף…' : 'הצטרפות'}
      </Button>
    </form>
  );
}
