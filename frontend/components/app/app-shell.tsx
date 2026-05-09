'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, MessageSquare, Settings2 } from 'lucide-react';
import { cn } from '@/lib/shadcn/utils';

const NAV_ITEMS = [
  {
    href: '/',
    label: '会话',
    description: '语音会话工作区',
    icon: MessageSquare,
  },
  {
    href: '/kb',
    label: '知识库',
    description: '库、文件与向量配置',
    icon: BookOpen,
  },
  {
    href: '/settings',
    label: '设置',
    description: '运行时与集成配置',
    icon: Settings2,
  },
];

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="bg-background text-foreground min-h-svh">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-sidebar-border/60 border-b bg-accent/10 px-5 py-6 backdrop-blur-xl lg:border-r lg:border-b-0">
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
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'block rounded-2xl border px-4 py-4 transition-colors',
                    active
                      ? 'border-primary/35 bg-primary/14 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
                      : 'border-transparent bg-transparent hover:border-primary/16 hover:bg-background/40'
                  )}
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
                </Link>
              );
            })}
          </nav>

          <div className="border-sidebar-border/60 mt-8 rounded-3xl border bg-background/36 p-4">
            <p className="font-mono text-[11px] font-bold tracking-[0.22em] uppercase">
              知识栈
            </p>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              支持多知识库检索，并可为每个知识库单独配置 embedding 与文件分类。
            </p>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
