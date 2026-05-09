import * as React from 'react';
import { cn } from '@/lib/shadcn/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-border/60 bg-background/60 placeholder:text-muted-foreground focus-visible:border-primary/30 focus-visible:ring-ring/40 flex h-10 w-full rounded-2xl border px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Input };
