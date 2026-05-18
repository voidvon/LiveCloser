'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Pencil, Plus, RefreshCcw, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Surface } from '@/components/ui/surface';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_PRODUCT_FILTERS, type ProductFilters, useProducts } from '@/hooks/useProducts';
import { cn } from '@/lib/shadcn/utils';
import type { ProductCatalog, ProductCatalogPayload } from '@/types';

type VariantCondition = {
  dimension: string;
  value: string;
};

type VariantRow = {
  sku: string;
  variant_name: string;
  status: string;
  price_yuan: string;
  conditions: VariantCondition[];
};

type ProductFormState = {
  product: ProductCatalogPayload['product'];
  variants: VariantRow[];
};

const DEFAULT_PRODUCT = {
  name: '',
  category: '',
  brand: '',
  model: '',
  aliases: '',
  status: 'active',
  summary: '',
  tags: '',
  attributes: '',
};

const EMPTY_CONDITION: VariantCondition = {
  dimension: '',
  value: '',
};

const DEFAULT_VARIANT: VariantRow = {
  sku: '',
  variant_name: '',
  status: 'active',
  price_yuan: '',
  conditions: [{ ...EMPTY_CONDITION }],
};

const DEFAULT_FORM: ProductFormState = {
  product: DEFAULT_PRODUCT,
  variants: [{ ...DEFAULT_VARIANT }],
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(minor: number | null | undefined, currency = 'CNY') {
  if (minor == null) {
    return '-';
  }
  return `${currency} ${(minor / 100).toFixed(2)}`;
}

function formatPriceRange(
  minPriceMinor: number | null,
  maxPriceMinor: number | null,
  currency: string
) {
  if (minPriceMinor == null && maxPriceMinor == null) {
    return '-';
  }
  if (minPriceMinor === maxPriceMinor) {
    return formatMoney(minPriceMinor, currency);
  }
  return `${formatMoney(minPriceMinor, currency)} ~ ${formatMoney(maxPriceMinor, currency)}`;
}

function formatMinorToYuanInput(minor: number | null | undefined) {
  if (minor == null) {
    return '';
  }
  const amount = minor / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function parseYuanToMinor(value: string) {
  const amount = Number(value.trim());
  if (!Number.isFinite(amount)) {
    return null;
  }
  return Math.round(amount * 100);
}

function normalizeLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function buildDimensionKey(label: string) {
  return normalizeLabel(label);
}

function buildFallbackSku(base: string, index: number) {
  const cleaned = base
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\u4E00-\u9FFF]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${cleaned || 'ITEM'}-${index + 1}`;
}

function normalizeCatalogToForm(catalog: ProductCatalog): ProductFormState {
  const dimensions = catalog.dimensions.map((dimension) => ({
    key: dimension.key,
    label: dimension.label,
  }));

  return {
    product: {
      name: catalog.product.name,
      category: catalog.product.category,
      brand: catalog.product.brand,
      model: catalog.product.model,
      aliases: catalog.product.aliases,
      status: catalog.product.status,
      summary: catalog.product.summary,
      tags: catalog.product.tags,
      attributes: catalog.product.attributes,
    },
    variants:
      catalog.variants.map((variant) => {
        const standardPrice = (variant.prices || []).find(
          (price) => price.price_book_code === 'standard'
        );
        const amountMinor =
          standardPrice?.amount_minor ??
          standardPrice?.min_amount_minor ??
          standardPrice?.max_amount_minor ??
          null;
        const conditions = dimensions.map((dimension) => {
          const spec = (variant.specs || []).find(
            (item) => item.dimension_key === dimension.key
          );
          return {
            dimension: dimension.label,
            value: spec?.value_display || spec?.value_text || spec?.option_key || '',
          };
        });

        return {
          sku: variant.sku,
          variant_name: variant.variant_name,
          status: variant.status,
          price_yuan: formatMinorToYuanInput(amountMinor),
          conditions: conditions.length ? conditions : [{ ...EMPTY_CONDITION }],
        };
      }) || [{ ...DEFAULT_VARIANT }],
  };
}

function collectDimensionLabels(variants: VariantRow[]) {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const variant of variants) {
    for (const condition of variant.conditions) {
      const label = normalizeLabel(condition.dimension);
      if (!label || seen.has(label)) {
        continue;
      }
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

function collectValueSuggestions(variants: VariantRow[]) {
  const valuesByDimension = new Map<string, string[]>();
  const seenByDimension = new Map<string, Set<string>>();

  for (const variant of variants) {
    for (const condition of variant.conditions) {
      const dimension = normalizeLabel(condition.dimension);
      const value = normalizeLabel(condition.value);
      if (!dimension || !value) {
        continue;
      }
      const seen = seenByDimension.get(dimension) ?? new Set<string>();
      const values = valuesByDimension.get(dimension) ?? [];
      if (!seen.has(value)) {
        seen.add(value);
        values.push(value);
      }
      seenByDimension.set(dimension, seen);
      valuesByDimension.set(dimension, values);
    }
  }

  return valuesByDimension;
}

function buildVariantName(conditions: VariantCondition[]) {
  return conditions
    .map((condition) => normalizeLabel(condition.value))
    .filter(Boolean)
    .join(' / ');
}

function buildPayload(form: ProductFormState): ProductCatalogPayload {
  const dimensionLabels = collectDimensionLabels(form.variants);
  const dimensions = dimensionLabels.map((label, index) => ({
    key: buildDimensionKey(label),
    label,
    value_type: 'text' as const,
    unit: '',
    is_required: true,
    sort_order: index,
    options: [],
  }));
  const keyByLabel = new Map(dimensions.map((dimension) => [dimension.label, dimension.key]));
  const skuBase = form.product.model.trim() || form.product.name.trim() || 'ITEM';

  const variants = form.variants.map((variant, index) => {
    const normalizedConditions = variant.conditions
      .map((condition) => ({
        dimension: normalizeLabel(condition.dimension),
        value: normalizeLabel(condition.value),
      }))
      .filter((condition) => condition.dimension && condition.value);

    const sku = variant.sku.trim() || buildFallbackSku(skuBase, index);
    const variantName = variant.variant_name.trim() || buildVariantName(normalizedConditions) || sku;

    return {
      sku,
      variant_name: variantName,
      status: variant.status,
      barcode: '',
      weight: null,
      lead_time_days: null,
      is_default: index === 0,
      specs: normalizedConditions.map((condition) => ({
        dimension_key: keyByLabel.get(condition.dimension) || buildDimensionKey(condition.dimension),
        value_text: condition.value,
        value_number: null,
        value_display: condition.value,
      })),
    };
  });

  return {
    product: {
      name: form.product.name.trim(),
      category: form.product.category.trim(),
      brand: form.product.brand.trim(),
      model: form.product.model.trim(),
      aliases: form.product.aliases.trim(),
      status: form.product.status,
      summary: form.product.summary.trim(),
      tags: form.product.tags.trim(),
      attributes: form.product.attributes.trim(),
    },
    dimensions,
    variants,
    prices: Object.fromEntries(
      variants.map((variant, index) => [
        variant.sku,
        [
          {
            price_book_code: 'standard',
            pricing_mode: 'fixed',
            amount_minor: parseYuanToMinor(form.variants[index]?.price_yuan || ''),
            min_amount_minor: null,
            max_amount_minor: null,
            min_qty: 1,
            effective_from: null,
            effective_to: null,
            tax_included: true,
            remarks: '',
          },
        ],
      ])
    ),
  };
}

function statusLabel(status: string) {
  switch (status) {
    case 'active':
      return '启用';
    case 'draft':
      return '草稿';
    case 'discontinued':
      return '停用';
    default:
      return status || '-';
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
    case 'draft':
      return 'bg-amber-500/12 text-amber-700 dark:text-amber-300';
    case 'discontinued':
      return 'bg-slate-500/12 text-slate-700 dark:text-slate-300';
    default:
      return 'bg-accent text-foreground';
  }
}

type InlineCreateSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  className?: string;
};

function InlineCreateSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: InlineCreateSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const normalizedQuery = normalizeLabel(query);
  const filteredOptions = options.filter((option) => {
    const normalizedOption = normalizeLabel(option);
    if (!normalizedQuery) {
      return true;
    }
    return normalizedOption.toLowerCase().includes(normalizedQuery.toLowerCase());
  });

  const canCreate =
    normalizedQuery.length > 0 &&
    !options.some((option) => normalizeLabel(option).toLowerCase() === normalizedQuery.toLowerCase());

  function applyValue(nextValue: string) {
    onChange(normalizeLabel(nextValue));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'border-border/60 bg-background/60 hover:border-primary/25 flex h-11 w-full items-center justify-between gap-2 rounded-2xl border px-3 text-left text-sm',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-3">
        <div className="space-y-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (normalizedQuery) {
                  applyValue(normalizedQuery);
                }
              }
            }}
            placeholder={placeholder}
          />
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {canCreate ? (
              <button
                type="button"
                className="hover:bg-accent flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm"
                onClick={() => applyValue(normalizedQuery)}
              >
                <Plus className="size-4" />
                <span>创建 “{normalizedQuery}”</span>
              </button>
            ) : null}
            {filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="hover:bg-accent flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm"
                onClick={() => applyValue(option)}
              >
                <span>{option}</span>
                {normalizeLabel(value) === normalizeLabel(option) ? (
                  <Check className="text-primary size-4 shrink-0" />
                ) : null}
              </button>
            ))}
            {!filteredOptions.length && !canCreate ? (
              <div className="text-muted-foreground px-3 py-2 text-sm">没有匹配项</div>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ProductPageClient() {
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_PRODUCT_FILTERS);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(DEFAULT_FORM);
  const { products, loading, error, refresh, getCatalog, create, update, remove, clearError } =
    useProducts();

  const categoryCount = useMemo(
    () => new Set(products.map((item) => item.category).filter(Boolean)).size,
    [products]
  );

  const activeVariantCount = useMemo(
    () => products.reduce((total, item) => total + item.active_variant_count, 0),
    [products]
  );

  const dimensionLabels = useMemo(() => collectDimensionLabels(form.variants), [form.variants]);
  const valueSuggestions = useMemo(() => collectValueSuggestions(form.variants), [form.variants]);

  function resetForm() {
    setForm(DEFAULT_FORM);
    setEditingProductId(null);
    setValidationError(null);
  }

  function openCreateDialog() {
    resetForm();
    setDialogOpen(true);
  }

  async function openEditDialog(productId: string) {
    try {
      setLoadingEditor(true);
      clearError();
      setValidationError(null);
      const catalog = await getCatalog(productId);
      setEditingProductId(productId);
      setForm(normalizeCatalogToForm(catalog));
      setDialogOpen(true);
    } catch {
    } finally {
      setLoadingEditor(false);
    }
  }

  function closeDialog() {
    setDialogOpen(false);
    resetForm();
  }

  function addVariant() {
    setForm((current) => ({
      ...current,
      variants: [...current.variants, { ...DEFAULT_VARIANT, conditions: [{ ...EMPTY_CONDITION }] }],
    }));
  }

  function addCondition(rowIndex: number) {
    setForm((current) => {
      const variants = [...current.variants];
      variants[rowIndex] = {
        ...variants[rowIndex],
        conditions: [...variants[rowIndex].conditions, { ...EMPTY_CONDITION }],
      };
      return { ...current, variants };
    });
  }

  function removeCondition(rowIndex: number, conditionIndex: number) {
    setForm((current) => {
      const variants = [...current.variants];
      const nextConditions = variants[rowIndex].conditions.filter((_, index) => index !== conditionIndex);
      variants[rowIndex] = {
        ...variants[rowIndex],
        conditions: nextConditions.length ? nextConditions : [{ ...EMPTY_CONDITION }],
      };
      return { ...current, variants };
    });
  }

  async function handleSave() {
    if (!form.product.name.trim() && !form.product.model.trim()) {
      setValidationError('名称、型号至少填写一项');
      return;
    }
    if (!form.variants.length) {
      setValidationError('至少保留一条规格价格记录');
      return;
    }

    const seenCombinationKeys = new Set<string>();
    for (const [rowIndex, variant] of form.variants.entries()) {
      if (!variant.price_yuan.trim()) {
        setValidationError(`第 ${rowIndex + 1} 行缺少价格`);
        return;
      }
      if (parseYuanToMinor(variant.price_yuan) == null) {
        setValidationError(`第 ${rowIndex + 1} 行的价格格式不正确`);
        return;
      }

      const normalizedConditions = variant.conditions
        .map((condition) => ({
          dimension: normalizeLabel(condition.dimension),
          value: normalizeLabel(condition.value),
        }))
        .filter((condition) => condition.dimension || condition.value);

      if (!normalizedConditions.length) {
        setValidationError(`第 ${rowIndex + 1} 行缺少规格组合`);
        return;
      }

      const seenDimensions = new Set<string>();
      for (const condition of normalizedConditions) {
        if (!condition.dimension || !condition.value) {
          setValidationError(`第 ${rowIndex + 1} 行存在未填完整的规格条件`);
          return;
        }
        if (seenDimensions.has(condition.dimension)) {
          setValidationError(`第 ${rowIndex + 1} 行的规格维度“${condition.dimension}”重复`);
          return;
        }
        seenDimensions.add(condition.dimension);
      }

      const combinationKey = normalizedConditions
        .map((condition) => `${condition.dimension}=${condition.value}`)
        .sort()
        .join('|');
      if (seenCombinationKeys.has(combinationKey)) {
        setValidationError('存在重复的规格组合');
        return;
      }
      seenCombinationKeys.add(combinationKey);
    }

    try {
      setSaving(true);
      setValidationError(null);
      clearError();
      const payload = buildPayload(form);
      if (editingProductId) {
        await update(editingProductId, payload);
      } else {
        await create(payload);
      }
      closeDialog();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(productId: string, label: string) {
    if (!window.confirm(`确认删除商品“${label}”吗？删除后不可恢复。`)) {
      return;
    }
    try {
      setDeletingId(productId);
      setValidationError(null);
      clearError();
      await remove(productId);
      if (editingProductId === productId) {
        closeDialog();
      }
    } catch {
    } finally {
      setDeletingId(null);
    }
  }

  const displayError = validationError ?? error;

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_24%),linear-gradient(180deg,_transparent,_rgba(15,23,42,0.03))]">
      <div className="px-4 py-6 md:px-8 md:py-8">
        {displayError ? (
          <Surface
            className="mb-6 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            variant="muted"
            radius="lg"
          >
            {displayError}
          </Surface>
        ) : null}

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">产品目录</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">结构化商品库</h1>
            <p className="text-muted-foreground mt-3 max-w-3xl text-sm leading-6">
              商品仍然按规格组合定价，但录入方式简化成一张表。第一列在单元格里连续添加规格维度和值，第二列直接填价格。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setValidationError(null);
                clearError();
                void refresh(filters).catch(() => undefined);
              }}
              disabled={loading}
            >
              <RefreshCcw className={cn(loading && 'animate-spin')} />
              刷新
            </Button>
            <Button onClick={openCreateDialog}>
              <Plus />
              新增商品
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Surface className="p-5" variant="elevated" radius="xl">
            <p className="text-muted-foreground text-sm">当前商品数</p>
            <p className="mt-3 text-3xl font-semibold">{products.length}</p>
          </Surface>
          <Surface className="p-5" variant="elevated" radius="xl">
            <p className="text-muted-foreground text-sm">分类数</p>
            <p className="mt-3 text-3xl font-semibold">{categoryCount}</p>
          </Surface>
          <Surface className="p-5" variant="elevated" radius="xl">
            <p className="text-muted-foreground text-sm">启用变体数</p>
            <p className="mt-3 text-3xl font-semibold">{activeVariantCount}</p>
          </Surface>
        </div>

        <Surface className="mb-6 p-4 md:p-5" variant="panel" radius="xl">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_180px_auto]">
            <Input
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="搜索商品、型号、规格值、SKU"
            />
            <Input
              value={filters.category}
              onChange={(event) =>
                setFilters((current) => ({ ...current, category: event.target.value }))
              }
              placeholder="分类"
            />
            <Input
              value={filters.brand}
              onChange={(event) =>
                setFilters((current) => ({ ...current, brand: event.target.value }))
              }
              placeholder="品牌"
            />
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            >
              <SelectTrigger className="w-full rounded-2xl">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">启用</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
                <SelectItem value="discontinued">停用</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setValidationError(null);
                clearError();
                void refresh(filters).catch(() => undefined);
              }}
              disabled={loading}
            >
              <Search />
              查询
            </Button>
          </div>
        </Surface>

        <Surface className="overflow-hidden" variant="panel" radius="xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-accent/40 text-left">
                <tr className="border-border/60 border-b">
                  <th className="px-4 py-3 font-medium">型号</th>
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">分类</th>
                  <th className="px-4 py-3 font-medium">品牌</th>
                  <th className="px-4 py-3 font-medium">变体</th>
                  <th className="px-4 py-3 font-medium">标准价范围</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">更新时间</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="text-muted-foreground px-4 py-10 text-center" colSpan={9}>
                      正在加载商品目录...
                    </td>
                  </tr>
                ) : products.length ? (
                  products.map((product) => {
                    const label = product.model || product.name || product.id;
                    return (
                      <tr key={product.id} className="border-border/50 border-b last:border-b-0">
                        <td className="px-4 py-3 font-medium">{product.model || '-'}</td>
                        <td className="max-w-[16rem] px-4 py-3">
                          <div className="truncate">{product.name || '-'}</div>
                        </td>
                        <td className="px-4 py-3">{product.category || '-'}</td>
                        <td className="px-4 py-3">{product.brand || '-'}</td>
                        <td className="px-4 py-3">
                          {product.active_variant_count}/{product.variant_count}
                        </td>
                        <td className="px-4 py-3">
                          {formatPriceRange(
                            product.min_price_minor,
                            product.max_price_minor,
                            product.currency
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                              statusBadgeClass(product.status)
                            )}
                          >
                            {statusLabel(product.status)}
                          </span>
                        </td>
                        <td className="text-muted-foreground px-4 py-3">
                          {formatDateTime(product.updated_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="icon-sm"
                              variant="outline"
                              onClick={() => void openEditDialog(product.id)}
                              disabled={loadingEditor}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              onClick={() => void handleDelete(product.id, label)}
                              disabled={deletingId === product.id}
                            >
                              <Trash2 className={cn(deletingId === product.id && 'animate-pulse')} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="text-muted-foreground px-4 py-10 text-center" colSpan={9}>
                      还没有商品数据。先创建商品，再逐行录入规格组合和价格。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Surface>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
      >
        <DialogContent className="max-h-[88vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProductId ? '编辑商品规格价格表' : '新增商品规格价格表'}</DialogTitle>
            <DialogDescription>
              每一行是一条报价规则。第一列可连续追加“维度名 + 维度值”，第二列填写价格。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <section className="space-y-4">
              <div>
                <h3 className="text-base font-semibold">基础信息</h3>
                <p className="text-muted-foreground text-sm">先定义商品主数据，再录入规格组合价格表。</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">商品名称</p>
                  <Input
                    value={form.product.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, name: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">型号</p>
                  <Input
                    value={form.product.model}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, model: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">分类</p>
                  <Input
                    value={form.product.category}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, category: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">品牌</p>
                  <Input
                    value={form.product.brand}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, brand: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">别名</p>
                  <Input
                    value={form.product.aliases}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, aliases: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">状态</p>
                  <Select
                    value={form.product.status}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, status: value },
                      }))
                    }
                  >
                    <SelectTrigger className="w-full rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">启用</SelectItem>
                      <SelectItem value="draft">草稿</SelectItem>
                      <SelectItem value="discontinued">停用</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm font-medium">简介</p>
                  <Textarea
                    rows={3}
                    value={form.product.summary}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, summary: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">标签</p>
                  <Textarea
                    rows={3}
                    value={form.product.tags}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, tags: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">扩展属性</p>
                  <Textarea
                    rows={3}
                    value={form.product.attributes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        product: { ...current.product, attributes: event.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">规格组合与价格</h3>
                  <p className="text-muted-foreground text-sm">
                    一行一条规则。第一列里用下拉建议或直接输入创建规格维度和值，再点 `+` 继续追加条件。
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={addVariant}>
                  <Plus />
                  新增一行
                </Button>
              </div>

              <Surface className="overflow-hidden" variant="panel" radius="xl">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="bg-accent/40 text-left">
                      <tr className="border-border/60 border-b">
                        <th className="px-4 py-3 font-medium">规格组合</th>
                        <th className="px-4 py-3 font-medium">价格（元）</th>
                        <th className="px-4 py-3 font-medium">状态</th>
                        <th className="px-4 py-3 text-right font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.variants.map((variant, rowIndex) => (
                        <tr
                          key={`${variant.sku || 'row'}-${rowIndex}`}
                          className="border-border/50 border-b last:border-b-0"
                        >
                          <td className="px-4 py-4 align-top">
                            <div className="space-y-3">
                              {variant.conditions.map((condition, conditionIndex) => {
                                const normalizedDimension = normalizeLabel(condition.dimension);
                                const valueOptions = valueSuggestions.get(normalizedDimension) || [];
                                return (
                                  <div
                                    key={`${rowIndex}-${conditionIndex}`}
                                    className="flex flex-wrap items-center gap-2"
                                  >
                                    <InlineCreateSelect
                                      value={condition.dimension}
                                      options={dimensionLabels}
                                      placeholder="维度名"
                                      className="w-[10rem]"
                                      onChange={(nextValue) =>
                                        setForm((current) => {
                                          const variants = [...current.variants];
                                          const conditions = [...variants[rowIndex].conditions];
                                          conditions[conditionIndex] = {
                                            ...conditions[conditionIndex],
                                            dimension: nextValue,
                                          };
                                          variants[rowIndex] = {
                                            ...variants[rowIndex],
                                            conditions,
                                          };
                                          return { ...current, variants };
                                        })
                                      }
                                    />
                                    <InlineCreateSelect
                                      value={condition.value}
                                      options={valueOptions}
                                      placeholder="维度值"
                                      className="w-[12rem]"
                                      onChange={(nextValue) =>
                                        setForm((current) => {
                                          const variants = [...current.variants];
                                          const conditions = [...variants[rowIndex].conditions];
                                          conditions[conditionIndex] = {
                                            ...conditions[conditionIndex],
                                            value: nextValue,
                                          };
                                          variants[rowIndex] = {
                                            ...variants[rowIndex],
                                            conditions,
                                          };
                                          return { ...current, variants };
                                        })
                                      }
                                    />
                                    {variant.conditions.length > 1 ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => removeCondition(rowIndex, conditionIndex)}
                                      >
                                        <X />
                                      </Button>
                                    ) : null}
                                    {conditionIndex === variant.conditions.length - 1 ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => addCondition(rowIndex)}
                                      >
                                        <Plus />
                                      </Button>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <Input
                              value={variant.price_yuan}
                              onChange={(event) =>
                                setForm((current) => {
                                  const variants = [...current.variants];
                                  variants[rowIndex] = {
                                    ...variants[rowIndex],
                                    price_yuan: event.target.value,
                                  };
                                  return { ...current, variants };
                                })
                              }
                              placeholder="例如 2000"
                            />
                          </td>
                          <td className="px-4 py-4 align-top">
                            <Select
                              value={variant.status}
                              onValueChange={(value) =>
                                setForm((current) => {
                                  const variants = [...current.variants];
                                  variants[rowIndex] = {
                                    ...variants[rowIndex],
                                    status: value,
                                  };
                                  return { ...current, variants };
                                })
                              }
                            >
                              <SelectTrigger className="w-[120px] rounded-2xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">启用</SelectItem>
                                <SelectItem value="draft">草稿</SelectItem>
                                <SelectItem value="discontinued">停用</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                onClick={() =>
                                  setForm((current) => ({
                                    ...current,
                                    variants:
                                      current.variants.length > 1
                                        ? current.variants.filter((_, index) => index !== rowIndex)
                                        : [{ ...DEFAULT_VARIANT, conditions: [{ ...EMPTY_CONDITION }] }],
                                  }))
                                }
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Surface>
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || loadingEditor}>
              {saving ? '保存中...' : editingProductId ? '保存修改' : '创建商品'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
