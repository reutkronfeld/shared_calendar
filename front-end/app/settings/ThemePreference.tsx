'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

const OPTIONS = [
  { value: 'light', label: 'בהיר', icon: Sun },
  { value: 'dark', label: 'כהה', icon: Moon },
  { value: 'system', label: 'מערכת', icon: Monitor },
] as const;

export function ThemePreference() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = mounted && (theme ?? 'system') === o.value;
        return (
          <Button
            key={o.value}
            type="button"
            variant={active ? 'default' : 'outline'}
            onClick={() => setTheme(o.value)}
          >
            <Icon className="size-4" />
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}
