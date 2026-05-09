import * as React from 'react';
import { cn } from '@/lib/shadcn/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-border/60 bg-background/60 placeholder:text-muted-foreground focus-visible:border-primary/30 focus-visible:ring-ring/40 flex min-h-24 w-full rounded-2xl border px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
