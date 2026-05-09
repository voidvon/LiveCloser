import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/shadcn/utils';

const interactiveCardVariants = cva(
  'w-full border text-left transition-colors shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
  {
    variants: {
      variant: {
        default:
          'border-border/60 bg-background/32 text-foreground hover:border-primary/16 hover:bg-background/44',
        selected: 'border-primary/35 bg-primary/14 text-foreground',
        muted: 'border-border/50 bg-background/30 text-muted-foreground',
      },
      radius: {
        md: 'rounded-xl',
        lg: 'rounded-2xl',
      },
      padding: {
        sm: 'px-3 py-2',
        md: 'px-4 py-3',
        lg: 'px-5 py-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      radius: 'lg',
      padding: 'md',
    },
  }
);

function InteractiveCard({
  className,
  variant,
  radius,
  padding,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof interactiveCardVariants>) {
  return (
    <div
      data-slot="interactive-card"
      className={cn(interactiveCardVariants({ variant, radius, padding, className }))}
      {...props}
    />
  );
}

export { InteractiveCard, interactiveCardVariants };
