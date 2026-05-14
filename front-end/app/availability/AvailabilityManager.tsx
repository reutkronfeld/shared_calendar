'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { api, type AvailabilityOverride } from '@/lib/api';
import { cn } from '@/lib/utils';
import { overrideFormSchema, type OverrideFormInput } from '@/schemas/availability-override';

interface Props {
  initial: AvailabilityOverride[];
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3) return undefined;
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!);
}

export function AvailabilityManager({ initial }: Props) {
  const [overrides, setOverrides] = useState(initial);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [isSubmitting, startSubmit] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isValid },
  } = useForm<OverrideFormInput>({
    resolver: zodResolver(overrideFormSchema),
    mode: 'onChange',
    defaultValues: {
      date: toISODate(new Date()),
      startTime: '09:00',
      endTime: '10:00',
      type: 'busy',
      note: '',
    },
  });

  const date = watch('date');
  const type = watch('type');
  const parsedDate = parseLocalDate(date);

  function onSubmit(values: OverrideFormInput) {
    const start = new Date(`${values.date}T${values.startTime}:00`);
    const end = new Date(`${values.date}T${values.endTime}:00`);
    startSubmit(async () => {
      try {
        const created = await api.createOverride({
          start: start.toISOString(),
          end: end.toISOString(),
          type: values.type,
          note: values.note || undefined,
        });
        setOverrides((prev) => [...prev, created].sort((a, b) => a.start.localeCompare(b.start)));
        toast.success('הוסף');
        reset({
          date: values.date,
          startTime: values.startTime,
          endTime: values.endTime,
          type: values.type,
          note: '',
        });
        router.refresh();
      } catch {
        toast.error('הוספת ההגדרה נכשלה');
      }
    });
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      await api.deleteOverride(id);
      setOverrides((prev) => prev.filter((o) => o.id !== id));
      toast.success('נמחק');
      router.refresh();
    } catch {
      toast.error('המחיקה נכשלה');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">הוספת טווח חדש</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>תאריך</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('w-full justify-start font-normal', !parsedDate && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="size-4" />
                    {parsedDate ? format(parsedDate, 'PPP', { locale: he }) : 'בחר תאריך'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={parsedDate}
                    onSelect={(d) => {
                      if (d) setValue('date', toISODate(d), { shouldValidate: true });
                      setDatePickerOpen(false);
                    }}
                    locale={he}
                  />
                </PopoverContent>
              </Popover>
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ov-start">משעה</Label>
              <Input id="ov-start" type="time" step={300} dir="ltr" className="font-mono" {...register('startTime')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-end">עד שעה</Label>
              <Input id="ov-end" type="time" step={300} dir="ltr" className="font-mono" {...register('endTime')} />
              {errors.endTime && <p className="text-xs text-destructive">{errors.endTime.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>סוג</Label>
              <Select value={type} onValueChange={(v) => setValue('type', v as 'busy' | 'free', { shouldValidate: true })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="busy">עסוק (חוסם פגישות)</SelectItem>
                  <SelectItem value="free">פנוי (מבטל אירוע ביומן)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-note">הערה (אופציונלי)</Label>
              <Input id="ov-note" placeholder="חופשה, מילואים…" {...register('note')} />
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={!isValid || isSubmitting}>
                <Plus className="size-4" />
                {isSubmitting ? 'מוסיף…' : 'הוסף'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">הטווחים שלי ({overrides.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין עדיין טווחים מותאמים.</p>
          ) : (
            <ul className="space-y-2">
              {overrides.map((o, i) => (
                <li key={o.id}>
                  {i > 0 && <Separator className="mb-2" />}
                  <div className="flex items-center justify-between gap-3 py-1">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={o.type === 'busy' ? 'destructive' : 'default'}>
                          {o.type === 'busy' ? 'עסוק' : 'פנוי'}
                        </Badge>
                        <span className="text-sm">{formatRange(o.start, o.end)}</span>
                      </div>
                      {o.note && <p className="mt-1 text-xs text-muted-foreground">{o.note}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(o.id)}
                      disabled={deletingId === o.id}
                      aria-label="הסר"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function formatRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const day = new Intl.DateTimeFormat('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(start);
  const startTime = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(start);
  const endTime = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(end);
  return `${day}, ${startTime}–${endTime}`;
}
