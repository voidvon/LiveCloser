'use client';

import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/shadcn/utils';

interface SidebarSheetButtonProps extends React.ComponentProps<typeof Button> {
  label: string;
}

export function SidebarSheetButton({
  label,
  className,
  variant = 'outline',
  size = 'sm',
  children,
  ...props
}: SidebarSheetButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={cn('bg-background/72 rounded-full backdrop-blur-sm', className)}
      {...props}
    >
      {children ?? <PanelLeft className="size-4" />}
      {label}
    </Button>
  );
}
