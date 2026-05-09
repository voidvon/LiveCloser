'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { MonitorIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/shadcn/utils';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = mounted ? theme : undefined;

  return (
    <div
      className={cn(
        'text-foreground border-border/70 bg-background/80 flex w-full flex-row justify-end divide-x divide-border/60 overflow-hidden rounded-full border shadow-[0_18px_40px_rgba(15,23,42,0.24)] backdrop-blur-xl',
        className
      )}
    >
      <span className="sr-only">Color scheme toggle</span>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={cn(
          'cursor-pointer p-1 pl-1.5 transition-colors',
          activeTheme === 'dark' ? 'bg-primary/14 text-primary' : 'hover:bg-accent/80'
        )}
      >
        <span className="sr-only">Enable dark color scheme</span>
        <MoonIcon
          suppressHydrationWarning
          size={16}
          weight="bold"
          className={cn(activeTheme !== 'dark' && 'opacity-45')}
        />
      </button>
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={cn(
          'cursor-pointer px-1.5 py-1 transition-colors',
          activeTheme === 'light' ? 'bg-primary/14 text-primary' : 'hover:bg-accent/80'
        )}
      >
        <span className="sr-only">Enable light color scheme</span>
        <SunIcon
          suppressHydrationWarning
          size={16}
          weight="bold"
          className={cn(activeTheme !== 'light' && 'opacity-45')}
        />
      </button>
      <button
        type="button"
        onClick={() => setTheme('system')}
        className={cn(
          'cursor-pointer p-1 pr-1.5 transition-colors',
          activeTheme === 'system' ? 'bg-primary/14 text-primary' : 'hover:bg-accent/80'
        )}
      >
        <span className="sr-only">Enable system color scheme</span>
        <MonitorIcon
          suppressHydrationWarning
          size={16}
          weight="bold"
          className={cn(activeTheme !== 'system' && 'opacity-45')}
        />
      </button>
    </div>
  );
}
