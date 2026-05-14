'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WeeklyDayAvailability } from '@/lib/api';
import { WeeklyHoursList } from '../availability/WeeklyHoursList';

interface Props {
  initialWeekly: WeeklyDayAvailability[];
}

export function OnboardingFlow({ initialWeekly }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <WeeklyHoursList
        initial={initialWeekly}
        saveLabel="שמירה וסיום"
        onSaved={() => {
          router.push('/groups');
          router.refresh();
        }}
      />
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => router.push('/groups')}>
          דלג לעת עתה
          <ArrowLeft className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
