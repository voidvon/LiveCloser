'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/shadcn/utils';

type ConfirmPopoverProps = {
  children: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: React.ComponentProps<typeof Button>['variant'];
  confirming?: boolean;
  contentClassName?: string;
  align?: React.ComponentProps<typeof PopoverContent>['align'];
  onConfirm: () => Promise<void> | void;
};

function ConfirmPopover({
  children,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmVariant = 'destructive',
  confirming = false,
  contentClassName,
  align = 'center',
  onConfirm,
}: ConfirmPopoverProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className={cn('w-80 space-y-3', contentClassName)}>
        <div className="space-y-1">
          <p className="text-sm font-semibold">{title}</p>
          {description ? (
            <p className="text-muted-foreground text-sm leading-6">{description}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setOpen(false)}
            disabled={confirming}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="sm"
            className="rounded-full"
            onClick={async () => {
              setOpen(false);
              await onConfirm();
            }}
            disabled={confirming}
          >
            {confirming ? `${confirmLabel}中...` : confirmLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { ConfirmPopover };
