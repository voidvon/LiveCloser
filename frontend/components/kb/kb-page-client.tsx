'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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

export function KbPageClient() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
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
  const [uploadCategoryId, setUploadCategoryId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    void loadKnowledgeBases();
  }, []);

  useEffect(() => {
    if (!selectedKbId) {
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
      setSelectedKbId((current) =>
        current && nextKnowledgeBases.some((item) => item.id === current) ? current : null
      );
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
      setSelectedKbId(record.id);
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
      await sendJson<Category>(`/api/kb/knowledge-bases/${selectedKbId}/categories`, 'POST', {
        name: categoryName.trim(),
        parent_id: null,
        sort_order: categories.length,
      });
      setCategoryName('');
      await loadKnowledgeBaseDetails(selectedKbId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建分类失败');
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleUploadFile() {
    if (!selectedKbId) {
      setError('请先选择知识库');
      return;
    }
    if (!uploadFile) {
      setError('请选择一个文件');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (uploadCategoryId) {
        formData.append('category_id', uploadCategoryId);
      }
      const response = await fetch(`/api/kb/knowledge-bases/${selectedKbId}/files`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setUploadFile(null);
      setUploadCategoryId('');
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

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

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

        {selectedKb ? (
          <KnowledgeBaseDetailView
            categories={categories}
            categoryMap={categoryMap}
            categoryName={categoryName}
            creatingCategory={creatingCategory}
            detailsLoading={detailsLoading}
            files={files}
            jobs={jobs}
            jobsModalOpen={jobsModalOpen}
            retryingFileId={retryingFileId}
            selectedKb={selectedKb}
            selectedProfile={selectedProfile}
            uploading={uploading}
            uploadCategoryId={uploadCategoryId}
            onBack={() => setSelectedKbId(null)}
            onCategoryNameChange={setCategoryName}
            onCreateCategory={() => void handleCreateCategory()}
            onJobsModalChange={setJobsModalOpen}
            onRefresh={() => void loadKnowledgeBaseDetails(selectedKb.id)}
            onRetryFile={(fileId) => void handleRetryFile(fileId)}
            onUpload={() => void handleUploadFile()}
            onUploadCategoryIdChange={setUploadCategoryId}
            onUploadFileChange={setUploadFile}
          />
        ) : (
          <KnowledgeBaseListView
            embeddingProfiles={embeddingProfiles}
            knowledgeBases={knowledgeBases}
            onCreateKbClick={openCreateKbModal}
            onRefresh={() => void loadKnowledgeBases()}
            onSelectKb={setSelectedKbId}
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
            先选择一个知识库进入详情页，再管理文件、分类、模型绑定和索引任务。
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
  categoryMap,
  categoryName,
  creatingCategory,
  detailsLoading,
  files,
  jobs,
  jobsModalOpen,
  retryingFileId,
  selectedKb,
  selectedProfile,
  uploading,
  uploadCategoryId,
  onBack,
  onCategoryNameChange,
  onCreateCategory,
  onJobsModalChange,
  onRefresh,
  onRetryFile,
  onUpload,
  onUploadCategoryIdChange,
  onUploadFileChange,
}: {
  categories: Category[];
  categoryMap: Map<string, Category>;
  categoryName: string;
  creatingCategory: boolean;
  detailsLoading: boolean;
  files: KbFile[];
  jobs: KbJob[];
  jobsModalOpen: boolean;
  retryingFileId: string | null;
  selectedKb: KnowledgeBase;
  selectedProfile: EmbeddingProfile | null;
  uploading: boolean;
  uploadCategoryId: string;
  onBack: () => void;
  onCategoryNameChange: (value: string) => void;
  onCreateCategory: () => void;
  onJobsModalChange: (open: boolean) => void;
  onRefresh: () => void;
  onRetryFile: (fileId: string) => void;
  onUpload: () => void;
  onUploadCategoryIdChange: (value: string) => void;
  onUploadFileChange: (file: File | null) => void;
}) {
  const modelLabel = selectedProfile?.name || selectedKb.embedding_model || '未绑定模型';

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="w-fit rounded-full px-0" onClick={onBack}>
            <ArrowLeft className="mr-2 size-4" />
            返回知识库列表
          </Button>

          <div className="flex gap-2">
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
        <Surface padding="md">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">知识库资料</h2>
              <p className="text-muted-foreground text-sm">
                分类文件、上传资料，并跟踪当前索引状态。
              </p>
            </div>
            {detailsLoading ? (
              <span className="text-muted-foreground text-sm">正在刷新资料...</span>
            ) : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <Surface className="border-dashed" variant="muted" radius="lg" padding="md">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium">分类</h3>
                <span className="text-muted-foreground text-xs">{categories.length} 个</span>
              </div>
              <div className="mb-3 flex gap-2">
                <Input
                  value={categoryName}
                  onChange={(event) => onCategoryNameChange(event.target.value)}
                  placeholder="输入分类名称"
                  className="min-w-0 flex-1"
                />
                <Button
                  variant="outline"
                  className="rounded-full"
                  size="sm"
                  onClick={onCreateCategory}
                  disabled={creatingCategory}
                >
                  <Plus className="mr-2 size-4" />
                  {creatingCategory ? '创建中...' : '新增'}
                </Button>
              </div>
              {categories.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  还没有分类。上传时可以先保持未分类。
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <span
                      key={category.id}
                      className="border-primary/18 bg-primary/10 rounded-full border px-3 py-1 text-sm"
                    >
                      {category.name}
                    </span>
                  ))}
                </div>
              )}
            </Surface>

            <Surface className="border-dashed" variant="muted" radius="lg" padding="md">
              <h3 className="mb-3 font-medium">上传资料</h3>
              <div className="space-y-3">
                <FieldSelect
                  value={uploadCategoryId}
                  onValueChange={onUploadCategoryIdChange}
                  placeholder="未分类"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                />
                <input
                  type="file"
                  onChange={(event) => onUploadFileChange(event.target.files?.[0] ?? null)}
                  className="border-border/60 bg-background/60 hover:border-primary/20 focus:border-primary/30 block w-full rounded-2xl border px-3 py-2 text-sm transition-colors outline-none"
                />
                <Button className="w-full rounded-full" onClick={onUpload} disabled={uploading}>
                  <Upload className="mr-2 size-4" />
                  {uploading ? '上传中...' : '上传并触发索引'}
                </Button>
              </div>
            </Surface>
          </div>
        </Surface>

        <Surface className="overflow-hidden" padding="none">
          <div className="border-border/60 flex items-center justify-between border-b px-4 py-4">
            <div>
              <h2 className="text-lg font-semibold">资料列表</h2>
              <p className="text-muted-foreground text-sm">当前知识库下的全部文件及处理状态。</p>
            </div>
            <span className="text-muted-foreground text-sm">{files.length} 个文件</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-background/44">
                <tr>
                  <th className="px-4 py-3 font-medium">文件</th>
                  <th className="px-4 py-3 font-medium">分类</th>
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
                      还没有上传任何资料。
                    </td>
                  </tr>
                ) : (
                  files.map((file) => (
                    <tr key={file.id} className="border-border/60 border-t">
                      <td className="px-4 py-3">{file.original_name}</td>
                      <td className="px-4 py-3">
                        {file.category_id
                          ? (categoryMap.get(file.category_id)?.name ?? '-')
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
