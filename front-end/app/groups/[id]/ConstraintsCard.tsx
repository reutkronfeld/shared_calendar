'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { api, type GroupConstraints } from '@/lib/api';
import {
  WEEKDAYS_HE,
  constraintsSchema,
  minutesToHHMM,
  type ConstraintsFormInput,
  type ConstraintsFormOutput,
} from '@/schemas/constraints';

export const DEFAULT_CONSTRAINTS: GroupConstraints = {
  excludedWeekdays: [5, 6],
  noEarlierThan: 9 * 60,
  noLaterThan: 20 * 60,
  lunchBreak: { enabled: false, startMinute: 12 * 60, endMinute: 13 * 60 },
  bufferMinutes: 0,
  minNoticeHours: 2,
  excludedDates: [],
};

interface Props {
  groupId: string;
  initial: GroupConstraints;
  canEdit: boolean;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ConstraintsCard({ groupId, initial, canEdit }: Props) {
  const [isPending, startTransition] = useTransition();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<ConstraintsFormInput, unknown, ConstraintsFormOutput>({
    resolver: zodResolver(constraintsSchema),
    mode: 'onChange',
    defaultValues: {
      excludedWeekdays: initial.excludedWeekdays,
      noEarlierThan: minutesToHHMM(initial.noEarlierThan),
      noLaterThan: minutesToHHMM(initial.noLaterThan),
      lunchBreak: {
        enabled: initial.lunchBreak.enabled,
        startMinute: minutesToHHMM(initial.lunchBreak.startMinute),
        endMinute: minutesToHHMM(initial.lunchBreak.endMinute),
      },
      bufferMinutes: initial.bufferMinutes,
      minNoticeHours: initial.minNoticeHours,
      excludedDates: initial.excludedDates,
    },
  });

  const lunchEnabled = watch('lunchBreak.enabled');
  const excludedWeekdays = watch('excludedWeekdays') ?? [];
  const excludedDates = watch('excludedDates') ?? [];

  function toggleWeekday(day: number) {
    const current = new Set(excludedWeekdays);
    if (current.has(day)) current.delete(day);
    else current.add(day);
    setValue('excludedWeekdays', Array.from(current).sort(), { shouldDirty: true });
  }

  function addExcludedDate(d?: Date) {
    if (!d) return;
    const iso = toISODate(d);
    if (excludedDates.includes(iso)) return;
    setValue('excludedDates', [...excludedDates, iso].sort(), { shouldDirty: true });
  }
  function removeExcludedDate(iso: string) {
    setValue('excludedDates', excludedDates.filter((x) => x !== iso), { shouldDirty: true });
  }

  function onSubmit(values: ConstraintsFormOutput) {
    startTransition(async () => {
      try {
        await api.updateConstraints(groupId, values);
        toast.success('האילוצים נשמרו');
        router.refresh();
      } catch {
        toast.error('שמירת האילוצים נכשלה');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">אילוצים</CardTitle>
        <CardDescription>
          {canEdit
            ? 'הגדרות שמסננות אילו זמנים יוצעו לכל חברי הקבוצה.'
            : 'רק המארגן יכול לערוך את האילוצים.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={canEdit ? handleSubmit(onSubmit) : (e) => e.preventDefault()}
          className="space-y-5"
        >
          <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-70">
            <section className="space-y-2">
              <Label>ימי שבוע מוחרגים</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS_HE.map((d) => {
                  const active = excludedWeekdays.includes(d.value);
                  return (
                    <Button
                      key={d.value}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => toggleWeekday(d.value)}
                      disabled={!canEdit}
                    >
                      {d.label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">ימים מסומנים בכחול לא יוצעו לפגישה.</p>
            </section>

            <Separator />

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="noEarlierThan">לא לפני שעה</Label>
                <Input
                  id="noEarlierThan"
                  type="time"
                  step={300}
                  dir="ltr"
                  className="font-mono"
                  {...register('noEarlierThan')}
                />
                {errors.noEarlierThan && (
                  <p className="text-xs text-destructive">{errors.noEarlierThan.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="noLaterThan">לא אחרי שעה</Label>
                <Input
                  id="noLaterThan"
                  type="time"
                  step={300}
                  dir="ltr"
                  className="font-mono"
                  {...register('noLaterThan')}
                />
                {errors.noLaterThan && (
                  <p className="text-xs text-destructive">{errors.noLaterThan.message}</p>
                )}
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="lunch-enabled">הפסקת צהריים</Label>
                  <p className="text-xs text-muted-foreground">אל תציע פגישות בטווח השעות הזה.</p>
                </div>
                <Controller
                  control={control}
                  name="lunchBreak.enabled"
                  render={({ field }) => (
                    <Switch
                      id="lunch-enabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={!canEdit}
                    />
                  )}
                />
              </div>
              {lunchEnabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="lunch-start">משעה</Label>
                    <Input
                      id="lunch-start"
                      type="time"
                      step={300}
                      dir="ltr"
                      className="font-mono"
                      {...register('lunchBreak.startMinute')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lunch-end">עד שעה</Label>
                    <Input
                      id="lunch-end"
                      type="time"
                      step={300}
                      dir="ltr"
                      className="font-mono"
                      {...register('lunchBreak.endMinute')}
                    />
                    {errors.lunchBreak?.endMinute && (
                      <p className="text-xs text-destructive">{errors.lunchBreak.endMinute.message}</p>
                    )}
                  </div>
                </div>
              )}
            </section>

            <Separator />

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="buffer">Buffer בין פגישות (דקות)</Label>
                <Input id="buffer" type="number" min={0} max={240} {...register('bufferMinutes')} />
                <p className="text-xs text-muted-foreground">רווח לפני/אחרי כל אירוע ביומן.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notice">מינימום התראה מראש (שעות)</Label>
                <Input id="notice" type="number" min={0} max={24 * 14} {...register('minNoticeHours')} />
                <p className="text-xs text-muted-foreground">מונע הצעת זמנים בטווח הקרוב מדי.</p>
              </div>
            </section>

            <Separator />

            <section className="space-y-2">
              <Label>תאריכים מוחרגים</Label>
              <div className="flex flex-wrap gap-2">
                {excludedDates.length === 0 && (
                  <p className="text-xs text-muted-foreground">אין תאריכים מוחרגים.</p>
                )}
                {excludedDates.map((iso) => (
                  <Badge key={iso} variant="secondary" className="gap-1.5">
                    <span dir="ltr">{format(new Date(`${iso}T00:00:00`), 'd MMM yyyy', { locale: he })}</span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeExcludedDate(iso)}
                        className="rounded-sm opacity-70 transition hover:opacity-100"
                        aria-label={`הסר ${iso}`}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
              {canEdit && (
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <CalendarIcon className="size-4" />
                      הוסף תאריך
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      onSelect={(d) => {
                        addExcludedDate(d);
                        setDatePickerOpen(false);
                      }}
                      locale={he}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </section>
          </fieldset>

          {canEdit && (
            <div className="flex justify-end">
              <Button type="submit" disabled={!isDirty || isPending}>
                {isPending ? 'שומר…' : 'שמירת אילוצים'}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
