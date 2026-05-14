'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAV_ITEMS, isNavItemActive } from '@/components/app/nav-config';
import { cn } from '@/lib/shadcn/utils';

interface BottomTabBarProps {
  className?: string;
}

export function BottomTabBar({ className }: BottomTabBarProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        'border-border/80 bg-background/94 fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-xl',
        className
      )}
      aria-label="主导航"
    >
      <div className="grid h-[calc(72px+env(safe-area-inset-bottom))] grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)]">
        {APP_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-2xl transition-colors',
                  active ? 'bg-primary/12 text-primary' : 'bg-transparent'
                )}
              >
                <Icon className="size-[18px]" />
              </span>
              <span className="truncate font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
