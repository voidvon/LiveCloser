'use client';

import type { LucideIcon } from 'lucide-react';
import { BookOpen, Bot, MessageSquare, Settings2 } from 'lucide-react';

export type AppNavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    href: '/',
    label: '会话',
    description: '语音会话工作区',
    icon: MessageSquare,
  },
  {
    href: '/kb',
    label: '知识库',
    description: '库、文件与索引管理',
    icon: BookOpen,
  },
  {
    href: '/agents',
    label: '智能体',
    description: '提示词、模型与检索策略',
    icon: Bot,
  },
  {
    href: '/settings',
    label: '设置',
    description: 'Embedding 模型中心',
    icon: Settings2,
  },
];

export function isNavItemActive(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/' || pathname.startsWith('/conversations/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
