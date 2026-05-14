'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, type WeeklyDayAvailability } from '@/lib/api';
import { WeeklyHoursList } from '../availability/WeeklyHoursList';

interface Props {
  initialWeekly: WeeklyDayAvailability[];
}

export function OnboardingFlow({ initialWeekly }: Props) {
  const router = useRouter();
  const [isSkipping, startSkip] = useTransition();

  async function finishOnboarding() {
    try {
      await api.completeOnboarding();
    } catch (err) {
      console.error('completeOnboarding failed', err);
    }
    router.push('/groups');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <WeeklyHoursList
        initial={initialWeekly}
        saveLabel="שמירה וסיום"
        onSaved={() => finishOnboarding()}
      />
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          disabled={isSkipping}
          onClick={() =>
            startSkip(async () => {
              try {
                await api.completeOnboarding();
                router.push('/groups');
                router.refresh();
              } catch {
                toast.error('הדילוג נכשל. נסו שוב.');
              }
            })
          }
        >
          {isSkipping ? 'מדלג…' : 'דלג לעת עתה'}
          <ArrowLeft className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
