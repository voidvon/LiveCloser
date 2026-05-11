'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { cn } from '@/lib/shadcn/utils';

export type TreeViewItem<T = unknown> = {
  id: string;
  name: string;
  children?: TreeViewItem<T>[];
  disabled?: boolean;
  className?: string;
  data?: T;
};

export type TreeViewRenderItemParams<T = unknown> = {
  item: TreeViewItem<T>;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  toggle: () => void;
  select: () => void;
};

type TreeViewProps<T = unknown> = React.HTMLAttributes<HTMLDivElement> & {
  data: TreeViewItem<T>[] | TreeViewItem<T>;
  selectedItemId?: string | null;
  defaultExpandedItemIds?: string[];
  expandAll?: boolean;
  onSelectChange?: (item: TreeViewItem<T> | undefined) => void;
  renderItem?: (params: TreeViewRenderItemParams<T>) => React.ReactNode;
};

export function TreeView<T = unknown>({
  className,
  data,
  selectedItemId,
  defaultExpandedItemIds = [],
  expandAll = false,
  onSelectChange,
  renderItem,
  ...props
}: TreeViewProps<T>) {
  const items = useMemo(() => (Array.isArray(data) ? data : [data]), [data]);
  const itemMap = useMemo(() => buildItemMap(items), [items]);
  const itemIds = useMemo(() => new Set(itemMap.keys()), [itemMap]);
  const allExpandableIds = useMemo(() => collectExpandableIds(items), [items]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(expandAll ? allExpandableIds : defaultExpandedItemIds)
  );

  useEffect(() => {
    setExpandedIds((current) => {
      if (expandAll) {
        return new Set(allExpandableIds);
      }

      const next = new Set<string>();
      for (const id of current) {
        if (itemIds.has(id)) {
          next.add(id);
        }
      }
      for (const id of defaultExpandedItemIds) {
        if (itemIds.has(id)) {
          next.add(id);
        }
      }
      return next;
    });
  }, [allExpandableIds, defaultExpandedItemIds, expandAll, itemIds]);

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }
    const ancestorIds = collectAncestorIds(items, selectedItemId);
    if (ancestorIds.length === 0) {
      return;
    }
    setExpandedIds((current) => {
      const next = new Set(current);
      let changed = false;
      for (const id of ancestorIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [items, selectedItemId]);

  return (
    <div className={cn('space-y-2', className)} {...props}>
      {items.map((item) => (
        <TreeViewNode
          key={item.id}
          item={item}
          itemMap={itemMap}
          expandedIds={expandedIds}
          selectedItemId={selectedItemId ?? null}
          level={0}
          onExpandedChange={(itemId, open) => {
            setExpandedIds((current) => {
              const next = new Set(current);
              if (open) {
                next.add(itemId);
              } else {
                next.delete(itemId);
              }
              return next;
            });
          }}
          onSelectChange={onSelectChange}
          renderItem={renderItem}
        />
      ))}
    </div>
  );
}

type TreeViewNodeProps<T> = {
  item: TreeViewItem<T>;
  itemMap: Map<string, TreeViewItem<T>>;
  expandedIds: Set<string>;
  selectedItemId: string | null;
  level: number;
  onExpandedChange: (itemId: string, open: boolean) => void;
  onSelectChange?: (item: TreeViewItem<T> | undefined) => void;
  renderItem?: (params: TreeViewRenderItemParams<T>) => React.ReactNode;
};

function TreeViewNode<T>({
  item,
  itemMap,
  expandedIds,
  selectedItemId,
  level,
  onExpandedChange,
  onSelectChange,
  renderItem,
}: TreeViewNodeProps<T>) {
  const children = item.children ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = hasChildren && expandedIds.has(item.id);
  const isSelected = selectedItemId === item.id;

  const toggle = () => {
    if (!hasChildren || item.disabled) {
      return;
    }
    onExpandedChange(item.id, !isExpanded);
  };

  const select = () => {
    if (item.disabled) {
      return;
    }
    onSelectChange?.(itemMap.get(item.id));
  };

  return (
    <Collapsible.Root
      open={isExpanded}
      onOpenChange={(open) => onExpandedChange(item.id, open)}
      disabled={!hasChildren || item.disabled}
    >
      <div className={cn(level > 0 && 'border-border/60 ml-4 border-l pl-3')}>
        {renderItem ? (
          renderItem({
            item,
            level,
            hasChildren,
            isExpanded,
            isSelected,
            toggle,
            select,
          })
        ) : (
          <DefaultTreeViewItem
            item={item}
            hasChildren={hasChildren}
            isExpanded={isExpanded}
            isSelected={isSelected}
            onToggle={toggle}
            onSelect={select}
          />
        )}

        {hasChildren ? (
          <Collapsible.Content className="space-y-2 pt-2">
            {children.map((child) => (
              <TreeViewNode
                key={child.id}
                item={child}
                itemMap={itemMap}
                expandedIds={expandedIds}
                selectedItemId={selectedItemId}
                level={level + 1}
                onExpandedChange={onExpandedChange}
                onSelectChange={onSelectChange}
                renderItem={renderItem}
              />
            ))}
          </Collapsible.Content>
        ) : null}
      </div>
    </Collapsible.Root>
  );
}

function DefaultTreeViewItem<T>({
  item,
  hasChildren,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
}: {
  item: TreeViewItem<T>;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition-colors',
        isSelected
          ? 'border-primary/25 bg-primary/10'
          : 'bg-background/70 hover:border-primary/15 hover:bg-background border-transparent',
        item.disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center transition-transform',
            isExpanded && 'rotate-90'
          )}
          aria-label={isExpanded ? '收起分类' : '展开分类'}
          disabled={item.disabled}
        >
          <ChevronRight className="size-4" />
        </button>
      ) : (
        <span className="inline-flex size-4 shrink-0" aria-hidden="true" />
      )}
      <button
        type="button"
        onClick={onSelect}
        className={cn('min-w-0 flex-1 truncate text-left', item.className)}
        disabled={item.disabled}
      >
        {item.name}
      </button>
    </div>
  );
}

function buildItemMap<T>(items: TreeViewItem<T>[]): Map<string, TreeViewItem<T>> {
  const itemMap = new Map<string, TreeViewItem<T>>();

  function visit(item: TreeViewItem<T>) {
    itemMap.set(item.id, item);
    for (const child of item.children ?? []) {
      visit(child);
    }
  }

  for (const item of items) {
    visit(item);
  }

  return itemMap;
}

function collectExpandableIds<T>(items: TreeViewItem<T>[]): string[] {
  const ids: string[] = [];

  function visit(item: TreeViewItem<T>) {
    if ((item.children?.length ?? 0) > 0) {
      ids.push(item.id);
    }
    for (const child of item.children ?? []) {
      visit(child);
    }
  }

  for (const item of items) {
    visit(item);
  }

  return ids;
}

function collectAncestorIds<T>(items: TreeViewItem<T>[], targetId: string): string[] {
  function visit(item: TreeViewItem<T>, ancestors: string[]): string[] | null {
    if (item.id === targetId) {
      return ancestors;
    }
    for (const child of item.children ?? []) {
      const result = visit(child, [...ancestors, item.id]);
      if (result) {
        return result;
      }
    }
    return null;
  }

  for (const item of items) {
    const result = visit(item, []);
    if (result) {
      return result;
    }
  }

  return [];
}
