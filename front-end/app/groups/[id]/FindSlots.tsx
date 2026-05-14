'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { CalendarIcon, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { api, type FindSlotsResponse, type NearMissSuggestion } from '@/lib/api';
import {
  findSlotsFormSchema,
  type FindSlotsFormInput,
  type FindSlotsFormOutput,
} from '@/schemas/availability';

interface Props {
  groupId: string;
}

const DURATION_OPTIONS = [
  { value: '15', label: '15 דקות' },
  { value: '30', label: '30 דקות' },
  { value: '45', label: '45 דקות' },
  { value: '60', label: 'שעה' },
  { value: '90', label: 'שעה וחצי' },
  { value: '120', label: 'שעתיים' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function inDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function parseLocalDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function FindSlots({ groupId }: Props) {
  const [result, setResult] = useState<FindSlotsResponse | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoRanRef = useRef(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<FindSlotsFormInput, unknown, FindSlotsFormOutput>({
    resolver: zodResolver(findSlotsFormSchema),
    mode: 'onChange',
    defaultValues: {
      startDate: todayISO(),
      endDate: inDaysISO(7),
      durationMinutes: 30,
      meetingLocation: '',
    },
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const duration = watch('durationMinutes');

  function runSearch(values: FindSlotsFormOutput, opts: { silent?: boolean } = {}) {
    setResult(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem';
    const rangeStart = new Date(`${values.startDate}T00:00:00`);
    const rangeEnd = new Date(`${values.endDate}T23:59:59`);

    startTransition(async () => {
      try {
        const res = await api.findSlots(groupId, {
          rangeStart: rangeStart.toISOString(),
          rangeEnd: rangeEnd.toISOString(),
          durationMinutes: values.durationMinutes,
          timezone,
          meetingLocation: values.meetingLocation || undefined,
        });
        setResult(res);
        if (res.slots.length === 0 && !opts.silent) {
          toast.info('לא נמצאו זמנים פנויים בטווח שנבחר.');
        }
        if (values.meetingLocation && !res.meetingLocationResolved && !opts.silent) {
          toast.warning('לא הצלחנו לזהות את הכתובת — מתעלמים מזמן נסיעה.');
        }
      } catch {
        if (!opts.silent) toast.error('חיפוש הזמנים נכשל. נסו שוב.');
      }
    });
  }

  function onSubmit(values: FindSlotsFormOutput) {
    runSearch(values);
  }

  // Auto-run once on mount with defaults (next 7 days, 30 min) — no manual click needed.
  useEffect(() => {
    if (autoRanRef.current) return;
    autoRanRef.current = true;
    runSearch(
      { startDate: todayISO(), endDate: inDaysISO(7), durationMinutes: 30 },
      { silent: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">מציאת זמן פגישה משותף</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label>מתאריך</Label>
            <DatePickerField
              value={startDate}
              onChange={(d) => setValue('startDate', d ? toISODate(d) : '', { shouldValidate: true })}
              error={errors.startDate?.message}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-1">
            <Label>עד תאריך</Label>
            <DatePickerField
              value={endDate}
              onChange={(d) => setValue('endDate', d ? toISODate(d) : '', { shouldValidate: true })}
              error={errors.endDate?.message}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-1">
            <Label>משך הפגישה</Label>
            <Select
              dir="rtl"
              value={String(duration)}
              onValueChange={(v) => setValue('durationMinutes', Number(v) as FindSlotsFormInput['durationMinutes'], { shouldValidate: true })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="בחר משך" />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="meeting-location">מיקום הפגישה (אופציונלי)</Label>
            <div className="relative">
              <MapPin className="absolute inset-e-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="meeting-location"
                placeholder="לדוגמה: רוטשילד 22 תל אביב, או 'Zoom'"
                className="pe-9"
                {...register('meetingLocation')}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              אם נציין כתובת, נוסיף זמן נסיעה לבאפר של כל חבר.
            </p>
          </div>

          <div className="sm:col-span-3">
            <Button type="submit" disabled={!isValid || isPending}>
              {isPending ? 'מחפש זמנים…' : 'מצא זמנים פנויים'}
            </Button>
          </div>
        </form>

        {result && <Results result={result} />}
      </CardContent>
    </Card>
  );
}

function DatePickerField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (d: Date | undefined) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseLocalDate(value);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn('w-full justify-start font-normal', !parsed && 'text-muted-foreground')}
          >
            <CalendarIcon className="size-4" />
            {parsed ? format(parsed, 'PPP', { locale: he }) : 'בחר תאריך'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={parsed}
            onSelect={(d) => {
              onChange(d);
              setOpen(false);
            }}
            locale={he}
          />
        </PopoverContent>
      </Popover>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </>
  );
}

function Results({ result }: { result: FindSlotsResponse }) {
  return (
    <div className="mt-5">
      <Separator className="mb-4" />
      {result.missingAvailability.length > 0 && (
        <Alert className="mb-3">
          <AlertDescription>
            לא הצלחנו לקרוא את הזמינות של:{' '}
            {result.missingAvailability.map((m) => m.name).join(', ')}. ההצעות להלן מבוססות רק על שאר החברים.
          </AlertDescription>
        </Alert>
      )}

      {result.slots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          לא נמצאו זמנים פנויים בטווח. נסו להרחיב את התאריכים או לשנות אילוצים.
        </p>
      ) : (
        <>
          <h3 className="mb-2 text-sm font-medium">זמנים פנויים לכולם</h3>
          <ul className="space-y-2">
            {result.slots.map((s) => (
              <li
                key={s.start}
                className="rounded-md border bg-muted/40 px-4 py-3 text-sm"
              >
                {formatSlot(s.start, s.end)}
              </li>
            ))}
          </ul>
        </>
      )}

      {result.nearMisses && result.nearMisses.length > 0 && (
        <NearMisses items={result.nearMisses} />
      )}
    </div>
  );
}

function NearMisses({ items }: { items: NearMissSuggestion[] }) {
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-sm font-medium">
        זמנים שהיו עובדים — אם נזיז אירוע אחד
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        רק אירועים גמישים מוצעים להזזה — אירועים קריטיים (רופא, חתונה וכו') לעולם לא.
      </p>
      <ul className="space-y-2">
        {items.map((nm) => (
          <li
            key={nm.slotStart}
            className="rounded-md border border-dashed bg-card px-4 py-3 text-sm"
          >
            <div className="font-medium">{formatSlot(nm.slotStart, nm.slotEnd)}</div>
            <ul className="mt-2 space-y-1">
              {nm.movableBlockers.map((b) => (
                <li key={b.eventId} className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">{b.memberName}</Badge>
                  <span className="text-muted-foreground">צריך להזיז את</span>
                  <span className="font-medium">
                    {b.summary || 'אירוע ללא שם'}
                  </span>
                  <span className="text-muted-foreground" dir="ltr">
                    ({formatSlot(b.start, b.end)})
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatSlot(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const day = new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(start);
  const startTime = new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
  const endTime = new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(end);
  return `${day}, ${startTime}–${endTime}`;
}
