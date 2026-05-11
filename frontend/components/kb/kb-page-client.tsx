'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, RefreshCcw, Settings2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldSelect } from '@/components/ui/field-select';
import { Input } from '@/components/ui/input';
import { InteractiveCard } from '@/components/ui/interactive-card';
import { Surface } from '@/components/ui/surface';
import { Textarea } from '@/components/ui/textarea';
import { TreeView, type TreeViewItem } from '@/components/ui/tree-view';
import { cn } from '@/lib/shadcn/utils';

type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  embedding_profile_id: string | null;
  embedding_provider: string;
  embedding_model: string;
  embedding_base_url: string;
  embedding_api_key_env: string;
  chunk_size: number;
  chunk_overlap: number;
  retrieval_top_k: number;
  created_at: string;
  updated_at: string;
};

type EmbeddingProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string;
  api_key_env: string;
  created_at: string;
  updated_at: string;
};

type Category = {
  id: string;
  kb_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type CategoryTreeNode = Category & {
  children: CategoryTreeNode[];
};

type KbFile = {
  id: string;
  kb_id: string;
  category_id: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
  updated_at: string;
  last_embedded_at: string | null;
};

type KbJob = {
  id: string;
  kb_id: string;
  file_id: string | null;
  job_type: string;
  status: string;
  error_message: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type LoadState = 'idle' | 'loading' | 'error';

type CreateKbForm = {
  name: string;
  description: string;
  embedding_profile_id: string;
};

const DEFAULT_CREATE_KB_FORM: CreateKbForm = {
  name: '',
  description: '',
  embedding_profile_id: '',
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

export function KbPageClient({ selectedKbId = null }: { selectedKbId?: string | null } = {}) {
  const router = useRouter();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [files, setFiles] = useState<KbFile[]>([]);
  const [jobs, setJobs] = useState<KbJob[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createKbModalOpen, setCreateKbModalOpen] = useState(false);
  const [jobsModalOpen, setJobsModalOpen] = useState(false);
  const [creatingKb, setCreatingKb] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [retryingFileId, setRetryingFileId] = useState<string | null>(null);
  const [createKbForm, setCreateKbForm] = useState<CreateKbForm>(DEFAULT_CREATE_KB_FORM);
  const [categoryName, setCategoryName] = useState('');
  const isDetailRoute = Boolean(selectedKbId);

  useEffect(() => {
    void loadKnowledgeBases();
  }, []);

  useEffect(() => {
    if (!selectedKbId) {
      setSelectedCategoryId(null);
      setCategories([]);
      setFiles([]);
      setJobs([]);
      setJobsModalOpen(false);
      return;
    }
    void loadKnowledgeBaseDetails(selectedKbId);
  }, [selectedKbId]);

  const selectedKb = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKbId) ?? null,
    [knowledgeBases, selectedKbId]
  );
  const selectedProfile = useMemo(
    () =>
      selectedKb
        ? (embeddingProfiles.find((item) => item.id === selectedKb.embedding_profile_id) ?? null)
        : null,
    [embeddingProfiles, selectedKb]
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const categoryPathById = useMemo(() => buildCategoryPathMap(categories), [categories]);
  const directFileCountByCategoryId = useMemo(() => {
    const map = new Map<string, number>();
    for (const file of files) {
      if (!file.category_id) continue;
      map.set(file.category_id, (map.get(file.category_id) ?? 0) + 1);
    }
    return map;
  }, [files]);
  const subtreeFileCountByCategoryId = useMemo(
    () => buildSubtreeFileCountMap(categoryTree, directFileCountByCategoryId),
    [categoryTree, directFileCountByCategoryId]
  );
  const treeItems = useMemo<TreeViewItem<Category>[]>(
    () => buildTreeViewItems(categoryTree, subtreeFileCountByCategoryId),
    [categoryTree, subtreeFileCountByCategoryId]
  );
  const defaultExpandedIds = useMemo(() => {
    if (!selectedCategoryId) {
      return collectExpandableNodeIds(categoryTree);
    }
    return collectAncestorCategoryIds(categories, selectedCategoryId);
  }, [categories, categoryTree, selectedCategoryId]);
  const visibleCategoryIds = useMemo(
    () =>
      selectedCategoryId
        ? new Set(collectDescendantCategoryIds(categoryTree, selectedCategoryId))
        : null,
    [categoryTree, selectedCategoryId]
  );
  const selectedCategory = useMemo(
    () => (selectedCategoryId ? (categoryMap.get(selectedCategoryId) ?? null) : null),
    [categoryMap, selectedCategoryId]
  );
  const selectedCategoryPath = useMemo(
    () =>
      selectedCategoryId
        ? (categoryPathById.get(selectedCategoryId) ?? selectedCategory?.name ?? '')
        : '',
    [categoryPathById, selectedCategory, selectedCategoryId]
  );
  const visibleFiles = useMemo(() => {
    if (!visibleCategoryIds) {
      return files;
    }
    return files.filter((file) => file.category_id && visibleCategoryIds.has(file.category_id));
  }, [files, visibleCategoryIds]);

  function openCreateKbModal() {
    setCreateKbForm({
      ...DEFAULT_CREATE_KB_FORM,
      embedding_profile_id: embeddingProfiles[0]?.id ?? '',
    });
    setCreateKbModalOpen(true);
  }

  function closeCreateKbModal() {
    setCreateKbModalOpen(false);
    setCreateKbForm(DEFAULT_CREATE_KB_FORM);
  }

  async function loadKnowledgeBases() {
    try {
      setState('loading');
      setError(null);
      const [nextKnowledgeBases, nextProfiles] = await Promise.all([
        getJson<KnowledgeBase[]>('/api/kb/knowledge-bases'),
        getJson<EmbeddingProfile[]>('/api/kb/embedding-profiles'),
      ]);
      setKnowledgeBases(nextKnowledgeBases);
      setEmbeddingProfiles(nextProfiles);
      setState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载知识库列表失败');
      setState('error');
    }
  }

  async function loadKnowledgeBaseDetails(kbId: string) {
    try {
      setDetailsLoading(true);
      setError(null);
      const [nextCategories, nextFiles, nextJobs] = await Promise.all([
        getJson<Category[]>(`/api/kb/knowledge-bases/${kbId}/categories`),
        getJson<KbFile[]>(`/api/kb/knowledge-bases/${kbId}/files`),
        getJson<KbJob[]>(`/api/kb/knowledge-bases/${kbId}/jobs`),
      ]);
      setCategories(nextCategories);
      setFiles(nextFiles);
      setJobs(nextJobs);
      setSelectedCategoryId((current) =>
        current && nextCategories.some((item) => item.id === current) ? current : null
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载知识库数据失败');
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleCreateKnowledgeBase() {
    if (!createKbForm.embedding_profile_id) {
      setError('请选择一个 Embedding 模型');
      return;
    }
    if (!createKbForm.name.trim()) {
      setError('知识库名称不能为空');
      return;
    }

    try {
      setCreatingKb(true);
      setError(null);
      const record = await sendJson<KnowledgeBase>('/api/kb/knowledge-bases', 'POST', {
        name: createKbForm.name.trim(),
        description: createKbForm.description.trim(),
        embedding_profile_id: createKbForm.embedding_profile_id,
        embedding_provider: 'openai_compatible',
        embedding_model: '',
        embedding_base_url: '',
        embedding_api_key_env: '',
        chunk_size: 800,
        chunk_overlap: 120,
        retrieval_top_k: 5,
      });
      setKnowledgeBases((current) => [record, ...current]);
      closeCreateKbModal();
      setSelectedCategoryId(null);
      router.push(`/kb/${record.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建知识库失败');
    } finally {
      setCreatingKb(false);
    }
  }

  async function handleCreateCategory() {
    if (!selectedKbId) {
      setError('请先选择知识库');
      return;
    }
    if (!categoryName.trim()) {
      setError('分类名称不能为空');
      return;
    }

    try {
      setCreatingCategory(true);
      setError(null);
      const siblingCount = categories.filter(
        (category) => (category.parent_id ?? null) === (selectedCategoryId ?? null)
      ).length;
      const record = await sendJson<Category>(
        `/api/kb/knowledge-bases/${selectedKbId}/categories`,
        'POST',
        {
          name: categoryName.trim(),
          parent_id: selectedCategoryId,
          sort_order: siblingCount,
        }
      );
      setCategoryName('');
      setSelectedCategoryId(record.id);
      await loadKnowledgeBaseDetails(selectedKbId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建分类失败');
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleUploadFile(file: File) {
    if (!selectedKbId) {
      setError('请先选择知识库');
      return;
    }
    if (!selectedCategoryId) {
      setError('请先在左侧选择一个分类');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category_id', selectedCategoryId);
      const response = await fetch(`/api/kb/knowledge-bases/${selectedKbId}/files`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await loadKnowledgeBaseDetails(selectedKbId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '上传文件失败');
    } finally {
      setUploading(false);
    }
  }

  async function handleRetryFile(fileId: string) {
    if (!selectedKbId) {
      setError('请先选择知识库');
      return;
    }

    try {
      setRetryingFileId(fileId);
      setError(null);
      const response = await fetch(
        `/api/kb/knowledge-bases/${selectedKbId}/files/${fileId}/embed`,
        {
          method: 'POST',
        }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await loadKnowledgeBaseDetails(selectedKbId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '重试索引失败');
    } finally {
      setRetryingFileId(null);
    }
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.12),_transparent_28%),linear-gradient(180deg,_transparent,_rgba(15,23,42,0.03))]">
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

        {isDetailRoute ? (
          selectedKb ? (
          <KnowledgeBaseDetailView
            categories={categories}
            categoryName={categoryName}
            categoryPathById={categoryPathById}
            defaultExpandedIds={defaultExpandedIds}
            creatingCategory={creatingCategory}
            detailsLoading={detailsLoading}
            files={visibleFiles}
            fileCountByCategoryId={subtreeFileCountByCategoryId}
            jobs={jobs}
            jobsModalOpen={jobsModalOpen}
            retryingFileId={retryingFileId}
            selectedCategory={selectedCategory}
            selectedCategoryId={selectedCategoryId}
            selectedCategoryPath={selectedCategoryPath}
            selectedKb={selectedKb}
            selectedProfile={selectedProfile}
            treeItems={treeItems}
            totalFileCount={files.length}
            uploading={uploading}
            onBack={() => router.push('/kb')}
            onCategoryNameChange={setCategoryName}
            onCategorySelect={setSelectedCategoryId}
            onCreateCategory={() => void handleCreateCategory()}
            onJobsModalChange={setJobsModalOpen}
            onRefresh={() => void loadKnowledgeBaseDetails(selectedKb.id)}
            onRetryFile={(fileId) => void handleRetryFile(fileId)}
            onUploadFile={(file) => void handleUploadFile(file)}
          />
          ) : (
            <KnowledgeBaseDetailFallback
              loading={state === 'loading'}
              onBack={() => router.push('/kb')}
            />
          )
        ) : (
          <KnowledgeBaseListView
            embeddingProfiles={embeddingProfiles}
            knowledgeBases={knowledgeBases}
            onCreateKbClick={openCreateKbModal}
            onRefresh={() => void loadKnowledgeBases()}
            onSelectKb={(kbId) => router.push(`/kb/${kbId}`)}
            state={state}
          />
        )}
      </div>

      <Dialog
        open={createKbModalOpen}
        onOpenChange={(open) => {
          if (open) {
            setCreateKbModalOpen(true);
            return;
          }
          closeCreateKbModal();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增知识库</DialogTitle>
            <DialogDescription>
              知识库只选择要使用的全局 Embedding 模型；模型本身在设置页统一维护，开始生成 Embedding
              后不再切换。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Embedding 模型</span>
              <FieldSelect
                value={createKbForm.embedding_profile_id}
                onValueChange={(value) =>
                  setCreateKbForm((current) => ({ ...current, embedding_profile_id: value }))
                }
                placeholder={
                  embeddingProfiles.length === 0 ? '请先到 /settings 新建模型' : '选择模型'
                }
                options={embeddingProfiles.map((profile) => ({
                  value: profile.id,
                  label: `${profile.name}${profile.model ? ` · ${profile.model}` : ''}`,
                }))}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">知识库名称</span>
              <Input
                value={createKbForm.name}
                onChange={(event) =>
                  setCreateKbForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="例如：售前 FAQ、产品资料库"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">知识库描述</span>
              <Textarea
                value={createKbForm.description}
                onChange={(event) =>
                  setCreateKbForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="描述这个知识库承载的资料范围"
                className="min-h-28"
              />
            </label>

            {embeddingProfiles.length === 0 ? (
              <Surface className="px-4 py-3 text-sm" variant="muted" radius="lg">
                当前还没有可用模型。先去 <span className="font-mono">/settings</span> 新建 Embedding
                模型，再回来创建知识库。
              </Surface>
            ) : null}

            <DialogFooter className="items-center justify-between sm:flex-row sm:justify-between">
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/settings">
                  <Settings2 className="mr-2 size-4" />
                  管理模型
                </Link>
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={closeCreateKbModal}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={() => void handleCreateKnowledgeBase()}
                  disabled={creatingKb || embeddingProfiles.length === 0}
                >
                  <Plus className="mr-2 size-4" />
                  {creatingKb ? '创建中...' : '创建知识库'}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KnowledgeBaseDetailFallback({
  loading,
  onBack,
}: {
  loading: boolean;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <Button variant="ghost" className="w-fit rounded-full px-0" onClick={onBack}>
        <ArrowLeft className="mr-2 size-4" />
        返回知识库列表
      </Button>

      {loading ? (
        <KbGhost lines={1} />
      ) : (
        <EmptyBlock
          title="知识库不存在"
          description="当前链接对应的知识库不存在，或者已经被删除。"
        />
      )}
    </div>
  );
}

function KnowledgeBaseListView({
  embeddingProfiles,
  knowledgeBases,
  onCreateKbClick,
  onRefresh,
  onSelectKb,
  state,
}: {
  embeddingProfiles: EmbeddingProfile[];
  knowledgeBases: KnowledgeBase[];
  onCreateKbClick: () => void;
  onRefresh: () => void;
  onSelectKb: (kbId: string) => void;
  state: LoadState;
}) {
  return (
    <>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">知识库</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">知识库列表</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6 md:text-base">
            先选择一个知识库进入详情页，再管理分类树、资料文档和索引任务。
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={onCreateKbClick}
            aria-label="新增知识库"
          >
            <Plus className="size-4" />
          </Button>
          <Button variant="outline" className="rounded-full" onClick={onRefresh}>
            <RefreshCcw className="mr-2 size-4" />
            刷新
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {state === 'loading' ? <KbGhost lines={1} /> : null}
        {state !== 'loading' && knowledgeBases.length === 0 ? (
          <EmptyBlock
            title="还没有知识库"
            description="点击左上角的 +，先创建一个知识库并指定它使用的 Embedding 模型。"
          />
        ) : null}
        {knowledgeBases.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {knowledgeBases.map((kb) => {
              const profile =
                embeddingProfiles.find((item) => item.id === kb.embedding_profile_id) ?? null;
              return (
                <InteractiveCard
                  key={kb.id}
                  onClick={() => onSelectKb(kb.id)}
                  role="button"
                  tabIndex={0}
                  variant="default"
                  radius="lg"
                  padding="lg"
                  className="cursor-pointer"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectKb(kb.id);
                    }
                  }}
                >
                  <div className="min-w-0">
                    <p className="text-lg font-medium">{kb.name}</p>
                    <p className="text-muted-foreground mt-2 text-sm leading-6">
                      {kb.description || '暂无描述。'}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] tracking-[0.2em] uppercase">
                    <span className="border-primary/18 bg-primary/10 rounded-full border px-3 py-1">
                      {profile?.provider ?? kb.embedding_provider}
                    </span>
                    <span className="border-border/70 rounded-full border px-3 py-1">
                      {profile?.name || kb.embedding_model || '未绑定模型'}
                    </span>
                  </div>
                </InteractiveCard>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
}

function KnowledgeBaseDetailView({
  categories,
  categoryName,
  categoryPathById,
  defaultExpandedIds,
  creatingCategory,
  detailsLoading,
  files,
  fileCountByCategoryId,
  jobs,
  jobsModalOpen,
  retryingFileId,
  selectedCategory,
  selectedCategoryId,
  selectedCategoryPath,
  selectedKb,
  selectedProfile,
  treeItems,
  totalFileCount,
  uploading,
  onBack,
  onCategoryNameChange,
  onCategorySelect,
  onCreateCategory,
  onJobsModalChange,
  onRefresh,
  onRetryFile,
  onUploadFile,
}: {
  categories: Category[];
  categoryName: string;
  categoryPathById: Map<string, string>;
  defaultExpandedIds: string[];
  creatingCategory: boolean;
  detailsLoading: boolean;
  files: KbFile[];
  fileCountByCategoryId: Map<string, number>;
  jobs: KbJob[];
  jobsModalOpen: boolean;
  retryingFileId: string | null;
  selectedCategory: Category | null;
  selectedCategoryId: string | null;
  selectedCategoryPath: string;
  selectedKb: KnowledgeBase;
  selectedProfile: EmbeddingProfile | null;
  treeItems: TreeViewItem<Category>[];
  totalFileCount: number;
  uploading: boolean;
  onBack: () => void;
  onCategoryNameChange: (value: string) => void;
  onCategorySelect: (categoryId: string | null) => void;
  onCreateCategory: () => void;
  onJobsModalChange: (open: boolean) => void;
  onRefresh: () => void;
  onRetryFile: (fileId: string) => void;
  onUploadFile: (file: File) => void;
}) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const modelLabel = selectedProfile?.name || selectedKb.embedding_model || '未绑定模型';
  const createLabel = selectedCategory ? '新增子分类' : '新增一级分类';
  const createHint = selectedCategory
    ? `将在「${selectedCategoryPath}」下创建子分类`
    : '当前创建的是一级分类';
  const fileScopeTitle = selectedCategory ? selectedCategory.name : '全部资料';

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="w-fit rounded-full px-0" onClick={onBack}>
            <ArrowLeft className="mr-2 size-4" />
            返回知识库列表
          </Button>
        </div>

        <div>
          <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">知识库详情</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{selectedKb.name}</h1>
            <span className="border-primary/18 bg-primary/10 text-foreground rounded-full border px-3 py-1 text-xs font-medium">
              {modelLabel}
            </span>
          </div>
          <p className="text-muted-foreground mt-2 text-sm leading-6 md:text-base">
            {selectedKb.description || '这个知识库还没有补充描述。'}
          </p>
        </div>
      </div>

      <section className="space-y-4">
        {detailsLoading ? (
          <span className="text-muted-foreground text-sm">正在刷新资料...</span>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Surface className="border-dashed" variant="muted" radius="lg" padding="md">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">分类树</h3>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {selectedCategory ? `当前：${selectedCategoryPath}` : '当前：全部资料'}
                  </p>
                </div>
                <span className="text-muted-foreground text-xs">{categories.length} 个</span>
              </div>

              <div className="mb-4 space-y-2">
                <Input
                  value={categoryName}
                  onChange={(event) => onCategoryNameChange(event.target.value)}
                  placeholder={selectedCategory ? '输入子分类名称' : '输入一级分类名称'}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">{createHint}</p>
                  <Button
                    variant="outline"
                    className="rounded-full"
                    size="sm"
                    onClick={onCreateCategory}
                    disabled={creatingCategory}
                  >
                    <Plus className="mr-2 size-4" />
                    {creatingCategory ? '创建中...' : createLabel}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => onCategorySelect(null)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition-colors',
                    selectedCategoryId === null
                      ? 'border-primary/25 bg-primary/10'
                      : 'bg-background/70 hover:border-primary/15 hover:bg-background border-transparent'
                  )}
                >
                  <span className="font-medium">全部资料</span>
                  <span className="text-muted-foreground text-xs">{totalFileCount}</span>
                </button>

                {treeItems.length === 0 ? (
                  <p className="text-muted-foreground px-1 pt-2 text-sm">
                    还没有分类，先新增一个一级分类再上传资料。
                  </p>
                ) : (
                  <TreeView
                    data={treeItems}
                    selectedItemId={selectedCategoryId}
                    defaultExpandedItemIds={defaultExpandedIds}
                    onSelectChange={(item) => onCategorySelect(item?.id ?? null)}
                    renderItem={({ item, hasChildren, isExpanded, isSelected, select, toggle }) => (
                      <div
                        className={cn(
                          'flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition-colors',
                          isSelected
                            ? 'border-primary/25 bg-primary/10'
                            : 'bg-background/70 hover:border-primary/15 hover:bg-background border-transparent'
                        )}
                      >
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={toggle}
                            className={cn(
                              'text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center transition-transform',
                              isExpanded && 'rotate-90'
                            )}
                            aria-label={isExpanded ? '收起分类' : '展开分类'}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-4"
                              aria-hidden="true"
                            >
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          </button>
                        ) : (
                          <span className="inline-flex size-4 shrink-0" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          onClick={select}
                          className={cn('min-w-0 flex-1 truncate text-left', item.className)}
                        >
                          {item.name}
                        </button>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {fileCountByCategoryId.get(item.id) ?? 0}
                        </span>
                      </div>
                    )}
                  />
                )}
              </div>
          </Surface>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-start gap-2">
              <Button
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-2 size-4" />
                {uploading ? '上传中...' : '上传文档'}
              </Button>
              <Button variant="outline" className="rounded-full" onClick={onRefresh}>
                <RefreshCcw className="mr-2 size-4" />
                刷新
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => onJobsModalChange(true)}
              >
                任务列表
                <span className="border-border/70 bg-background/80 ml-2 rounded-full border px-2 py-0.5 text-xs">
                  {jobs.length}
                </span>
              </Button>
            </div>
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = '';
                if (!file) {
                  return;
                }
                onUploadFile(file);
              }}
            />

            <Surface className="overflow-hidden" padding="none">
                <div className="border-border/60 flex items-center justify-between border-b px-4 py-4">
                  <div>
                    <h2 className="text-lg font-semibold">{fileScopeTitle}</h2>
                  </div>
                  <span className="text-muted-foreground text-sm">{files.length} 个文件</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-background/44">
                      <tr>
                        <th className="px-4 py-3 font-medium">文件</th>
                        <th className="px-4 py-3 font-medium">分类路径</th>
                        <th className="px-4 py-3 font-medium">类型</th>
                        <th className="px-4 py-3 font-medium">大小</th>
                        <th className="px-4 py-3 font-medium">状态</th>
                        <th className="px-4 py-3 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-muted-foreground px-4 py-6">
                            {selectedCategory
                              ? '当前分类下还没有资料文档。'
                              : '当前知识库还没有上传任何资料。'}
                          </td>
                        </tr>
                      ) : (
                        files.map((file) => (
                          <tr key={file.id} className="border-border/60 border-t">
                            <td className="px-4 py-3">{file.original_name}</td>
                            <td className="px-4 py-3">
                              {file.category_id
                                ? (categoryPathById.get(file.category_id) ?? '-')
                                : '未分类'}
                            </td>
                            <td className="px-4 py-3">{file.mime_type || '-'}</td>
                            <td className="px-4 py-3">{formatBytes(file.size_bytes)}</td>
                            <td className="px-4 py-3">
                              <span className="border-primary/18 bg-primary/10 rounded-full border px-2.5 py-1 text-xs uppercase">
                                {file.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {file.status === 'failed' ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full"
                                  onClick={() => onRetryFile(file.id)}
                                  disabled={retryingFileId === file.id}
                                >
                                  {retryingFileId === file.id ? '重试中...' : '重试索引'}
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
            </Surface>
            </div>
          </div>
      </section>

      <Dialog open={jobsModalOpen} onOpenChange={onJobsModalChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>索引任务</DialogTitle>
            <DialogDescription>
              当前知识库的文件索引、重试与错误状态都在这里集中查看。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {jobs.length === 0 ? (
              <EmptyBlock title="还没有任务" description="上传资料后，这里会出现对应的索引任务。" />
            ) : (
              jobs.map((job) => (
                <InteractiveCard key={job.id} variant="default" radius="lg" padding="md">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{job.job_type}</p>
                    <span className="border-primary/18 bg-primary/10 rounded-full border px-2.5 py-1 text-[11px] tracking-[0.18em] uppercase">
                      {job.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs leading-5">
                    创建时间：{new Date(job.created_at).toLocaleString()}
                  </p>
                  {job.started_at ? (
                    <p className="text-muted-foreground mt-1 text-xs leading-5">
                      开始时间：{new Date(job.started_at).toLocaleString()}
                    </p>
                  ) : null}
                  {job.finished_at ? (
                    <p className="text-muted-foreground mt-1 text-xs leading-5">
                      结束时间：{new Date(job.finished_at).toLocaleString()}
                    </p>
                  ) : null}
                  {job.error_message ? (
                    <p className="mt-2 text-xs leading-5 text-red-600 dark:text-red-300">
                      错误：{job.error_message}
                    </p>
                  ) : null}
                </InteractiveCard>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <Surface className="border-dashed px-4 py-8 text-center" variant="muted" radius="lg">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground mt-2 text-sm leading-6">{description}</p>
    </Surface>
  );
}

function KbGhost({ lines }: { lines: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: lines }).map((_, index) => (
        <Surface key={index} className="animate-pulse px-5 py-4" variant="muted" radius="lg">
          <div className="bg-foreground/8 h-6 w-2/3 rounded-full" />
          <div className="mt-3 space-y-2">
            <div className="bg-foreground/7 h-4 w-full rounded-full" />
            <div className="bg-foreground/7 h-4 w-5/6 rounded-full" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="bg-foreground/8 h-6 w-24 rounded-full" />
            <div className="bg-foreground/8 h-6 w-32 rounded-full" />
          </div>
        </Surface>
      ))}
    </div>
  );
}

function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const nodeMap = new Map<string, CategoryTreeNode>();
  for (const category of categories) {
    nodeMap.set(category.id, { ...category, children: [] });
  }

  const roots: CategoryTreeNode[] = [];
  for (const category of categories) {
    const node = nodeMap.get(category.id);
    if (!node) continue;
    if (category.parent_id && nodeMap.has(category.parent_id)) {
      nodeMap.get(category.parent_id)?.children.push(node);
      continue;
    }
    roots.push(node);
  }

  return roots;
}

function buildCategoryPathMap(categories: Category[]): Map<string, string> {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const pathMap = new Map<string, string>();

  function resolvePath(categoryId: string): string {
    const cached = pathMap.get(categoryId);
    if (cached) {
      return cached;
    }

    const category = categoryMap.get(categoryId);
    if (!category) {
      return '';
    }

    const path = category.parent_id
      ? [resolvePath(category.parent_id), category.name].filter(Boolean).join(' / ')
      : category.name;
    pathMap.set(categoryId, path);
    return path;
  }

  for (const category of categories) {
    resolvePath(category.id);
  }

  return pathMap;
}

function buildSubtreeFileCountMap(
  nodes: CategoryTreeNode[],
  directFileCountByCategoryId: Map<string, number>
): Map<string, number> {
  const countMap = new Map<string, number>();

  function visit(node: CategoryTreeNode): number {
    let total = directFileCountByCategoryId.get(node.id) ?? 0;
    for (const child of node.children) {
      total += visit(child);
    }
    countMap.set(node.id, total);
    return total;
  }

  for (const node of nodes) {
    visit(node);
  }

  return countMap;
}

function collectDescendantCategoryIds(nodes: CategoryTreeNode[], categoryId: string): string[] {
  const ids: string[] = [];

  function visit(node: CategoryTreeNode, include: boolean) {
    const matched = include || node.id === categoryId;
    if (matched) {
      ids.push(node.id);
    }
    for (const child of node.children) {
      visit(child, matched);
    }
  }

  for (const node of nodes) {
    visit(node, false);
  }

  return ids;
}

function collectExpandableNodeIds(nodes: CategoryTreeNode[]): string[] {
  const ids: string[] = [];

  function visit(node: CategoryTreeNode) {
    if (node.children.length > 0) {
      ids.push(node.id);
    }
    for (const child of node.children) {
      visit(child);
    }
  }

  for (const node of nodes) {
    visit(node);
  }

  return ids;
}

function collectAncestorCategoryIds(categories: Category[], categoryId: string): string[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const ids = new Set<string>();

  let current = categoryMap.get(categoryId) ?? null;
  while (current?.parent_id) {
    ids.add(current.parent_id);
    current = categoryMap.get(current.parent_id) ?? null;
  }

  return Array.from(ids);
}

function buildTreeViewItems(
  nodes: CategoryTreeNode[],
  fileCountByCategoryId: Map<string, number>
): TreeViewItem<Category>[] {
  void fileCountByCategoryId;
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    data: node,
    children: buildTreeViewItems(node.children, fileCountByCategoryId),
  }));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
