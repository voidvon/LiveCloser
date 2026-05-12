'use client';

import * as React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/shadcn/utils';

type TruncatedTooltipTextProps = {
  text: string;
  lines?: number;
  as?: 'span' | 'p' | 'div';
  className?: string;
  tooltipClassName?: string;
  tooltipVariant?: React.ComponentProps<typeof TooltipContent>['variant'];
  side?: React.ComponentProps<typeof TooltipContent>['side'];
  sideOffset?: number;
};

function TruncatedTooltipText({
  text,
  lines = 2,
  as = 'span',
  className,
  tooltipClassName,
  tooltipVariant = 'default',
  side = 'top',
  sideOffset = 8,
}: TruncatedTooltipTextProps) {
  const Comp = as;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Comp
            className={cn(
              '[display:-webkit-box] block overflow-hidden break-all whitespace-normal [-webkit-box-orient:vertical]',
              className
            )}
            style={{ WebkitLineClamp: lines }}
          >
            {text}
          </Comp>
        </TooltipTrigger>
        <TooltipContent
          variant={tooltipVariant}
          side={side}
          sideOffset={sideOffset}
          className={tooltipClassName}
        >
          <span className="inline-block max-w-[420px] align-top leading-5 break-all whitespace-normal">
            {text}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { TruncatedTooltipText };
