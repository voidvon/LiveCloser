'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCcw, Search, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Surface } from '@/components/ui/surface';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/shadcn/utils';

type Product = {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  sku: string;
  aliases: string;
  price: string;
  currency: string;
  status: string;
  summary: string;
  tags: string;
  attributes: string;
  created_at: string;
  updated_at: string;
};

type ProductFilters = {
  query: string;
  category: string;
  brand: string;
  status: string;
};

type ProductFormState = {
  name: string;
  category: string;
  brand: string;
  model: string;
  sku: string;
  aliases: string;
  price: string;
  currency: string;
  status: string;
  summary: string;
  tags: string;
  attributes: string;
};

const DEFAULT_FILTERS: ProductFilters = {
  query: '',
  category: '',
  brand: '',
  status: 'all',
};

const DEFAULT_FORM: ProductFormState = {
  name: '',
  category: '',
  brand: '',
  model: '',
  sku: '',
  aliases: '',
  price: '',
  currency: 'CNY',
  status: 'active',
  summary: '',
  tags: '',
  attributes: '',
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function sendJson<T>(url: string, method: 'POST' | 'PATCH', payload: object): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function deleteJson(url: string): Promise<void> {
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function buildProductsUrl(filters: ProductFilters) {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('query', filters.query.trim());
  if (filters.category.trim()) params.set('category', filters.category.trim());
  if (filters.brand.trim()) params.set('brand', filters.brand.trim());
  if (filters.status !== 'all') params.set('status', filters.status);
  params.set('limit', '300');
  return `/api/kb/products?${params.toString()}`;
}

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

export function ProductPageClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async (nextFilters: ProductFilters) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getJson<Product[]>(buildProductsUrl(nextFilters));
      setProducts(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载产品列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts(DEFAULT_FILTERS);
  }, [loadProducts]);

  const editingProduct = useMemo(
    () => products.find((item) => item.id === editingProductId) ?? null,
    [editingProductId, products]
  );

  const categoryCount = useMemo(() => {
    return new Set(products.map((item) => item.category).filter(Boolean)).size;
  }, [products]);

  function resetForm() {
    setEditingProductId(null);
    setForm(DEFAULT_FORM);
  }

  function openCreateDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(product: Product) {
    setEditingProductId(product.id);
    setForm({
      name: product.name,
      category: product.category,
      brand: product.brand,
      model: product.model,
      sku: product.sku,
      aliases: product.aliases,
      price: product.price,
      currency: product.currency || 'CNY',
      status: product.status || 'active',
      summary: product.summary,
      tags: product.tags,
      attributes: product.attributes,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    resetForm();
  }

  async function handleSave() {
    if (!form.name.trim() && !form.model.trim() && !form.sku.trim()) {
      setError('名称、型号、货号至少填写一项');
      return;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      sku: form.sku.trim(),
      aliases: form.aliases.trim(),
      price: form.price.trim(),
      currency: form.currency.trim() || 'CNY',
      status: form.status,
      summary: form.summary.trim(),
      tags: form.tags.trim(),
      attributes: form.attributes.trim(),
    };

    try {
      setSaving(true);
      setError(null);
      if (editingProductId) {
        await sendJson(`/api/kb/products/${editingProductId}`, 'PATCH', payload);
      } else {
        await sendJson('/api/kb/products', 'POST', payload);
      }
      closeDialog();
      await loadProducts(filters);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存产品失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: Product) {
    const label = product.model || product.sku || product.name || '未命名商品';
    if (!window.confirm(`确认删除商品“${label}”吗？删除后不可恢复。`)) {
      return;
    }

    try {
      setDeletingId(product.id);
      setError(null);
      await deleteJson(`/api/kb/products/${product.id}`);
      await loadProducts(filters);
      if (editingProductId === product.id) {
        closeDialog();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除产品失败');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_24%),linear-gradient(180deg,_transparent,_rgba(15,23,42,0.03))]">
      <div className="px-4 py-6 md:px-8 md:py-8">
        {error ? (
          <Surface
            className="mb-6 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            variant="muted"
            radius="lg"
          >
            {error}
          </Surface>
        ) : null}

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">产品目录</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">结构化商品库</h1>
            <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
              这里维护通用商品主数据：分类、品牌、型号、货号、价格、标签和扩展属性。智能体会优先查这里，再用知识库补充说明。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadProducts(filters)} disabled={loading}>
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
            <p className="text-muted-foreground text-sm">当前结果</p>
            <p className="mt-3 text-3xl font-semibold">{products.length}</p>
          </Surface>
          <Surface className="p-5" variant="elevated" radius="xl">
            <p className="text-muted-foreground text-sm">分类数</p>
            <p className="mt-3 text-3xl font-semibold">{categoryCount}</p>
          </Surface>
          <Surface className="p-5" variant="elevated" radius="xl">
            <p className="text-muted-foreground text-sm">启用商品</p>
            <p className="mt-3 text-3xl font-semibold">
              {products.filter((item) => item.status === 'active').length}
            </p>
          </Surface>
        </div>

        <Surface className="mb-6 p-4 md:p-5" variant="panel" radius="xl">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_180px_auto]">
            <Input
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="搜索型号、货号、品牌、分类、标签"
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
            <Button onClick={() => void loadProducts(filters)} disabled={loading}>
              <Search />
              查询
            </Button>
          </div>
        </Surface>

        <Surface className="overflow-hidden" variant="panel" radius="xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-sm">
              <thead className="bg-accent/40 text-left">
                <tr className="border-border/60 border-b">
                  <th className="px-4 py-3 font-medium">型号</th>
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">分类</th>
                  <th className="px-4 py-3 font-medium">品牌</th>
                  <th className="px-4 py-3 font-medium">货号</th>
                  <th className="px-4 py-3 font-medium">价格</th>
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
                  products.map((product) => (
                    <tr key={product.id} className="border-border/50 border-b last:border-b-0">
                      <td className="px-4 py-3 font-medium">
                        {product.model || product.sku || product.name || '-'}
                      </td>
                      <td className="max-w-[14rem] px-4 py-3">
                        <div className="truncate">{product.name || '-'}</div>
                        {product.aliases ? (
                          <div className="text-muted-foreground mt-1 truncate text-xs">
                            别名：{product.aliases}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{product.category || '-'}</td>
                      <td className="px-4 py-3">{product.brand || '-'}</td>
                      <td className="px-4 py-3">{product.sku || '-'}</td>
                      <td className="px-4 py-3">{product.price || '-'}</td>
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
                            onClick={() => openEditDialog(product)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="outline"
                            onClick={() => void handleDelete(product)}
                            disabled={deletingId === product.id}
                          >
                            <Trash2 className={cn(deletingId === product.id && 'animate-pulse')} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="text-muted-foreground px-4 py-10 text-center" colSpan={9}>
                      还没有商品数据。先新增几条商品主数据，智能体才能稳定回答型号、价格和目录类问题。
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
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editingProduct
                ? `编辑商品 ${editingProduct.model || editingProduct.sku || editingProduct.name}`
                : '新增商品'}
            </DialogTitle>
            <DialogDescription>
              推荐至少维护分类、品牌、型号、价格；行业特有信息统一写进扩展属性，不内置固定字段。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">型号</p>
              <Input
                value={form.model}
                onChange={(event) =>
                  setForm((current) => ({ ...current, model: event.target.value }))
                }
                placeholder="例如 iPhone 15 Pro / SKU-001"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">名称</p>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="商品名称"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">分类</p>
              <Input
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({ ...current, category: event.target.value }))
                }
                placeholder="例如 手机 / 课程 / SaaS 套餐"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">品牌</p>
              <Input
                value={form.brand}
                onChange={(event) =>
                  setForm((current) => ({ ...current, brand: event.target.value }))
                }
                placeholder="品牌或供应商"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">货号</p>
              <Input
                value={form.sku}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sku: event.target.value }))
                }
                placeholder="内部货号或 SKU"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">别名</p>
              <Input
                value={form.aliases}
                onChange={(event) =>
                  setForm((current) => ({ ...current, aliases: event.target.value }))
                }
                placeholder="简称、别称、英文名"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">价格</p>
              <Input
                value={form.price}
                onChange={(event) =>
                  setForm((current) => ({ ...current, price: event.target.value }))
                }
                placeholder="例如 1999 元 / 年"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">币种</p>
              <Input
                value={form.currency}
                onChange={(event) =>
                  setForm((current) => ({ ...current, currency: event.target.value }))
                }
                placeholder="例如 CNY"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">状态</p>
              <Select
                value={form.status}
                onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}
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
                value={form.summary}
                onChange={(event) =>
                  setForm((current) => ({ ...current, summary: event.target.value }))
                }
                rows={4}
                placeholder="商品卖点、用途或适合人群"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <p className="text-sm font-medium">标签</p>
              <Textarea
                value={form.tags}
                onChange={(event) =>
                  setForm((current) => ({ ...current, tags: event.target.value }))
                }
                rows={3}
                placeholder="多个标签用逗号分隔"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <p className="text-sm font-medium">扩展属性</p>
              <Textarea
                value={form.attributes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, attributes: event.target.value }))
                }
                rows={5}
                placeholder={
                  '任意行业字段都写这里，例如：\ncolor: black\nstorage: 256GB\nwarranty: 2 years'
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? '保存中...' : editingProduct ? '保存修改' : '创建商品'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
