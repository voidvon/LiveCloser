import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/shadcn/utils';

const surfaceVariants = cva('border backdrop-blur-xl', {
  variants: {
    variant: {
      panel: 'border-border/70 bg-background',
      elevated: 'border-border/60 bg-background/36',
      sidebar: 'border-border/60 bg-accent/10',
      muted: 'border-border/50 bg-background/30',
      overlay: 'border-border/80 bg-background/96',
    },
    radius: {
      md: 'rounded-2xl',
      lg: 'rounded-3xl',
      xl: 'rounded-[28px]',
      full: 'rounded-full',
    },
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-5',
    },
  },
  defaultVariants: {
    variant: 'panel',
    radius: 'xl',
    padding: 'none',
  },
});

function Surface({
  className,
  variant,
  radius,
  padding,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof surfaceVariants>) {
  return (
    <div
      data-slot="surface"
      className={cn(surfaceVariants({ variant, radius, padding, className }))}
      {...props}
    />
  );
}

export { Surface, surfaceVariants };
