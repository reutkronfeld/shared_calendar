'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { api, type WeeklyDayAvailability } from '@/lib/api';

const DAYS = [
  { number: 0, label: 'ראשון', short: 'א׳' },
  { number: 1, label: 'שני', short: 'ב׳' },
  { number: 2, label: 'שלישי', short: 'ג׳' },
  { number: 3, label: 'רביעי', short: 'ד׳' },
  { number: 4, label: 'חמישי', short: 'ה׳' },
  { number: 5, label: 'שישי', short: 'ו׳' },
  { number: 6, label: 'שבת', short: 'ש׳' },
];

const DEFAULT_RANGE = { startMinute: 9 * 60, endMinute: 17 * 60 };

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    out.push(formatMinutes(m));
  }
  out.push('24:00');
  return out;
})();

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function parseTime(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function ensureSevenDays(input: WeeklyDayAvailability[]): WeeklyDayAvailability[] {
  const byDay = new Map(input.map((d) => [d.day, d]));
  return DAYS.map((d) => byDay.get(d.number) ?? { day: d.number, enabled: false, timeRanges: [] });
}

function daysEqual(a: WeeklyDayAvailability[], b: WeeklyDayAvailability[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.day !== b[i]!.day) return false;
    if (a[i]!.enabled !== b[i]!.enabled) return false;
    if (a[i]!.timeRanges.length !== b[i]!.timeRanges.length) return false;
    for (let j = 0; j < a[i]!.timeRanges.length; j += 1) {
      const ra = a[i]!.timeRanges[j]!;
      const rb = b[i]!.timeRanges[j]!;
      if (ra.startMinute !== rb.startMinute) return false;
      if (ra.endMinute !== rb.endMinute) return false;
    }
  }
  return true;
}

interface Props {
  initial: WeeklyDayAvailability[];
  onSaved?: (saved: WeeklyDayAvailability[]) => void;
  saveLabel?: string;
}

export function WeeklyHoursList({ initial, onSaved, saveLabel }: Props) {
  const initialNormalized = useMemo(() => ensureSevenDays(initial), [initial]);
  const [server, setServer] = useState<WeeklyDayAvailability[]>(initialNormalized);
  const [local, setLocal] = useState<WeeklyDayAvailability[]>(initialNormalized);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServer(initialNormalized);
     
    setLocal(initialNormalized);
  }, [initialNormalized]);

  const isDirty = !daysEqual(local, server);

  const handleToggle = (day: number, enabled: boolean) => {
    setLocal((prev) =>
      prev.map((d) =>
        d.day === day
          ? {
              ...d,
              enabled,
              timeRanges:
                enabled && d.timeRanges.length === 0 ? [{ ...DEFAULT_RANGE }] : d.timeRanges,
            }
          : d,
      ),
    );
  };

  const handleTimeChange = (
    day: number,
    rangeIdx: number,
    field: 'startMinute' | 'endMinute',
    value: string,
  ) => {
    const minute = parseTime(value);
    setLocal((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        const next = [...d.timeRanges];
        next[rangeIdx] = { ...next[rangeIdx]!, [field]: minute };
        return { ...d, timeRanges: next };
      }),
    );
  };

  const handleAddRange = (day: number) => {
    setLocal((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        const last = d.timeRanges[d.timeRanges.length - 1];
        const start = last ? Math.min(last.endMinute, 23 * 60) : 9 * 60;
        const end = Math.min(start + 60, 24 * 60);
        return { ...d, timeRanges: [...d.timeRanges, { startMinute: start, endMinute: end }] };
      }),
    );
  };

  const handleRemoveRange = (day: number, rangeIdx: number) => {
    setLocal((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        const next = d.timeRanges.filter((_, i) => i !== rangeIdx);
        return { ...d, timeRanges: next, enabled: next.length > 0 };
      }),
    );
  };

  const handleCopyTo = (sourceDay: number, targetDays: number[]) => {
    const source = local.find((d) => d.day === sourceDay);
    if (!source || targetDays.length === 0) return;
    setLocal((prev) =>
      prev.map((d) =>
        targetDays.includes(d.day)
          ? {
              ...d,
              enabled: source.enabled,
              timeRanges: source.timeRanges.map((r) => ({ ...r })),
            }
          : d,
      ),
    );
  };

  const handleSave = useCallback(async () => {
    const invalid = local
      .filter((d) => d.enabled)
      .flatMap((d) => d.timeRanges)
      .find((r) => r.endMinute <= r.startMinute);
    if (invalid) {
      toast.error('שעת התחלה חייבת להיות לפני שעת סיום');
      return;
    }
    setIsSaving(true);
    try {
      const res = await api.updateWeeklyAvailability(local);
      const normalized = ensureSevenDays(res.daysAvailability);
      setServer(normalized);
      setLocal(normalized);
      toast.success('השעות נשמרו');
      onSaved?.(normalized);
    } catch (err) {
      const apiErr = err as { status?: number; body?: { error?: string; day?: number; issues?: unknown } };
      console.error('updateWeeklyAvailability failed', apiErr, 'payload:', local);
      const code = apiErr?.body?.error;
      const day = apiErr?.body?.day;
      const message =
        apiErr?.status === 401
          ? 'נדרשת התחברות מחדש'
          : code === 'invalid_range'
            ? `טווח שעות לא תקין${day !== undefined ? ` (יום ${day})` : ''}`
            : code === 'invalid_body'
              ? 'נתונים לא תקינים — בדוק את השעות'
              : `שגיאה בשמירה${code ? ` (${code})` : apiErr?.status ? ` (${apiErr.status})` : ''}`;
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [local]);

  const handleReset = () => setLocal(server);

  return (
    <div className="space-y-3">
      {isDirty && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'שומר…' : (saveLabel ?? 'שמירה')}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset} disabled={isSaving}>
            ביטול
          </Button>
        </div>
      )}

      <div className="divide-y rounded-lg border">
        {DAYS.map((dayInfo) => {
          const dayData = local.find((d) => d.day === dayInfo.number)!;
          return (
            <div key={dayInfo.number} className="flex items-start gap-2 p-3">
              <div className="flex w-20 shrink-0 items-center gap-2 pt-1.5">
                <Switch
                  checked={dayData.enabled}
                  onCheckedChange={(c) => handleToggle(dayInfo.number, c)}
                  aria-label={dayInfo.label}
                />
                <span className="text-sm font-medium">{dayInfo.label}</span>
              </div>

              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                {dayData.enabled ? (
                  dayData.timeRanges.map((range, rangeIdx) => (
                    <div key={rangeIdx} className="flex items-center gap-1">
                      <Select
                        value={formatMinutes(range.startMinute)}
                        onValueChange={(v) =>
                          handleTimeChange(dayInfo.number, rangeIdx, 'startMinute', v)
                        }
                      >
                        <SelectTrigger className="h-8 w-[88px]" dir="ltr">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.slice(0, -1).map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">–</span>
                      <Select
                        value={formatMinutes(range.endMinute)}
                        onValueChange={(v) =>
                          handleTimeChange(dayInfo.number, rangeIdx, 'endMinute', v)
                        }
                      >
                        <SelectTrigger className="h-8 w-[88px]" dir="ltr">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.slice(1).map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveRange(dayInfo.number, rangeIdx)}
                        aria-label="הסר טווח"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <span className="pt-1.5 text-sm text-muted-foreground">לא זמין</span>
                )}
              </div>

              {dayData.enabled && (
                <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => handleAddRange(dayInfo.number)}
                    aria-label="הוסף טווח"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                  <CopyToDaysPopover
                    sourceDay={dayInfo.number}
                    onApply={(targets) => handleCopyTo(dayInfo.number, targets)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CopyToDaysPopover({
  sourceDay,
  onApply,
}: {
  sourceDay: number;
  onApply: (targets: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const others = DAYS.filter((d) => d.number !== sourceDay);
  const allSelected = others.every((d) => selected.includes(d.number));

  const toggle = (n: number) =>
    setSelected((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  const toggleAll = () => setSelected(allSelected ? [] : others.map((d) => d.number));

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setSelected([]);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="העתק לימים">
          <Copy className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3" align="end">
        <p className="mb-2 text-xs font-medium text-muted-foreground">העתק לימים</p>
        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="size-4 accent-primary"
            />
            <span className="text-sm">בחר הכל</span>
          </label>
          {others.map((d) => (
            <label key={d.number} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={selected.includes(d.number)}
                onChange={() => toggle(d.number)}
                className="size-4 accent-primary"
              />
              <span className="text-sm">{d.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            ביטול
          </Button>
          <Button
            size="sm"
            disabled={selected.length === 0}
            onClick={() => {
              onApply(selected);
              setOpen(false);
            }}
          >
            החל
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
