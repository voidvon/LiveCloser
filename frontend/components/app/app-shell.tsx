'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BottomTabBar } from '@/components/app/bottom-tab-bar';
import { APP_NAV_ITEMS, isNavItemActive } from '@/components/app/nav-config';
import { ThemeToggle } from '@/components/app/theme-toggle';
import { InteractiveCard } from '@/components/ui/interactive-card';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/shadcn/utils';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="bg-background text-foreground min-h-svh">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Surface
          className="border-sidebar-border/60 hidden rounded-none border-b px-5 py-6 lg:flex lg:flex-col lg:border-r lg:border-b-0"
          variant="sidebar"
        >
          <div>
            <div className="mb-8">
              <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">
                销售助手
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">工作台</h1>
              <p className="text-muted-foreground mt-2 max-w-xs text-sm leading-6">
                在这里管理实时会话，以及它依赖的知识库系统。
              </p>
            </div>

            <nav className="space-y-2">
              {APP_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isNavItemActive(pathname, item.href);

                return (
                  <Link key={item.href} href={item.href} className="block">
                    <InteractiveCard
                      variant={active ? 'selected' : 'default'}
                      className={cn(!active && 'border-transparent bg-transparent')}
                      padding="lg"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'mt-0.5 rounded-xl p-2',
                            active ? 'bg-primary/12 text-primary' : 'bg-background/45'
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium">{item.label}</p>
                          <p
                            className={cn(
                              'mt-1 text-sm leading-5',
                              active ? 'text-foreground/75' : 'text-muted-foreground'
                            )}
                          >
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </InteractiveCard>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-8 space-y-4">
            <Surface
              className="border-sidebar-border/60"
              variant="elevated"
              radius="lg"
              padding="md"
            >
              <p className="font-mono text-[11px] font-bold tracking-[0.22em] uppercase">知识栈</p>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                支持多知识库检索；模型在设置页统一维护，知识库页只负责选择使用哪个模型。
              </p>
            </Surface>

            <div className="max-w-max">
              <ThemeToggle />
            </div>
          </div>
        </Surface>

        <div className="min-w-0 pb-[var(--app-mobile-nav-offset)] lg:pb-0">{children}</div>
      </div>

      <div className="fixed top-[max(16px,env(safe-area-inset-top)+12px)] right-4 z-40 lg:hidden">
        <ThemeToggle className="w-auto shadow-[0_18px_40px_rgba(15,23,42,0.22)]" />
      </div>
      <BottomTabBar className="lg:hidden" />
    </div>
  );
}
