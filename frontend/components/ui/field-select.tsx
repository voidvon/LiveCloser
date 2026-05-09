'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/shadcn/utils';

const EMPTY_VALUE = '__field_select_empty__';

type FieldSelectOption = {
  value: string;
  label: string;
};

interface FieldSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: FieldSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

function FieldSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
}: FieldSelectProps) {
  return (
    <div className={className}>
      <Select
        value={value && value.length > 0 ? value : EMPTY_VALUE}
        onValueChange={(nextValue) => onValueChange?.(nextValue === EMPTY_VALUE ? '' : nextValue)}
        disabled={disabled}
      >
        <SelectTrigger
          className={cn(
            'border-border/60 bg-background/60 hover:border-primary/20 focus-visible:border-primary/30 h-11 w-full rounded-2xl px-4 shadow-none',
            triggerClassName
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={cn('rounded-2xl border-border/70 bg-popover/98', contentClassName)}>
          <SelectItem value={EMPTY_VALUE}>{placeholder ?? '未选择'}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export { FieldSelect };
