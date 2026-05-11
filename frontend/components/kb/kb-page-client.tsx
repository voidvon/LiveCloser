'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCcw, Save, Search, Settings2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

type SearchResult = {
  content: string;
  metadata: Record<string, string>;
  distance: number;
};

type LoadState = 'idle' | 'loading' | 'error';

type KbConfigForm = {
  embedding_profile_id: string;
  chunk_size: string;
  chunk_overlap: string;
  retrieval_top_k: string;
};

const DEFAULT_KB_FORM = {
  name: '',
  description: '',
};

const DEFAULT_KB_CONFIG_FORM: KbConfigForm = {
  embedding_profile_id: '',
  chunk_size: '800',
  chunk_overlap: '120',
  retrieval_top_k: '5',
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

function toKbConfigForm(kb: KnowledgeBase | null): KbConfigForm {
  if (!kb) return DEFAULT_KB_CONFIG_FORM;
  return {
    embedding_profile_id: kb.embedding_profile_id ?? '',
    chunk_size: String(kb.chunk_size),
    chunk_overlap: String(kb.chunk_overlap),
    retrieval_top_k: String(kb.retrieval_top_k),
  };
}

function isKbConfigEqual(left: KbConfigForm, right: KbConfigForm) {
  return (
    left.embedding_profile_id === right.embedding_profile_id &&
    left.chunk_size === right.chunk_size &&
    left.chunk_overlap === right.chunk_overlap &&
    left.retrieval_top_k === right.retrieval_top_k
  );
}

export function KbPageClient() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [files, setFiles] = useState<KbFile[]>([]);
  const [jobs, setJobs] = useState<KbJob[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [creatingKb, setCreatingKb] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [retryingFileId, setRetryingFileId] = useState<string | null>(null);
  const [savingKbConfig, setSavingKbConfig] = useState(false);
  const [kbForm, setKbForm] = useState(DEFAULT_KB_FORM);
  const [kbConfigForm, setKbConfigForm] = useState<KbConfigForm>(DEFAULT_KB_CONFIG_FORM);
  const [categoryName, setCategoryName] = useState('');
  const [uploadCategoryId, setUploadCategoryId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    void loadKnowledgeBases();
  }, []);

  useEffect(() => {
    if (!selectedKbId) return;
    void loadKnowledgeBaseDetails(selectedKbId);
  }, [selectedKbId]);

  const selectedKb = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKbId) ?? null,
    [knowledgeBases, selectedKbId]
  );
  const selectedProfile = useMemo(
    () => embeddingProfiles.find((item) => item.id === kbConfigForm.embedding_profile_id) ?? null,
    [embeddingProfiles, kbConfigForm.embedding_profile_id]
  );
  const kbConfigSnapshot = useMemo(() => toKbConfigForm(selectedKb), [selectedKb]);
  const kbConfigDirty = !isKbConfigEqual(kbConfigForm, kbConfigSnapshot);

  useEffect(() => {
    setKbConfigForm(kbConfigSnapshot);
  }, [kbConfigSnapshot]);

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
      setSelectedKbId((current) => current ?? nextKnowledgeBases[0]?.id ?? null);
      setState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载知识库列表失败');
      setState('error');
    }
  }

  async function loadKnowledgeBaseDetails(kbId: string) {
    try {
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
    }
  }

  async function handleCreateKnowledgeBase() {
    if (!kbForm.name.trim()) {
      setError('知识库名称不能为空');
      return;
    }

    try {
      setCreatingKb(true);
      setError(null);
      const record = await sendJson<KnowledgeBase>('/api/kb/knowledge-bases', 'POST', {
        name: kbForm.name.trim(),
        description: kbForm.description.trim(),
        embedding_provider: 'openai_compatible',
        embedding_model: '',
        embedding_base_url: '',
        embedding_api_key_env: '',
        chunk_size: 800,
        chunk_overlap: 120,
        retrieval_top_k: 5,
      });
      setKnowledgeBases((current) => [record, ...current]);
      setSelectedKbId(record.id);
      setKbForm(DEFAULT_KB_FORM);
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

  async function handleSearch() {
    if (!selectedKbId) {
      setError('请先选择知识库');
      return;
    }
    if (!searchQuery.trim()) {
      setError('请输入检索关键词');
      return;
    }

    try {
      setSearching(true);
      setError(null);
      const params = new URLSearchParams({ q: searchQuery.trim() });
      const results = await getJson<SearchResult[]>(
        `/api/kb/knowledge-bases/${selectedKbId}/search?${params.toString()}`
      );
      setSearchResults(results);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '知识库检索失败');
    } finally {
      setSearching(false);
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

  async function handleSaveKbConfig() {
    if (!selectedKb) {
      setError('请先选择知识库');
      return;
    }

    const chunkSize = Number.parseInt(kbConfigForm.chunk_size, 10);
    const chunkOverlap = Number.parseInt(kbConfigForm.chunk_overlap, 10);
    const retrievalTopK = Number.parseInt(kbConfigForm.retrieval_top_k, 10);

    if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
      setError('切块大小必须是正整数');
      return;
    }
    if (!Number.isFinite(chunkOverlap) || chunkOverlap < 0) {
      setError('切块重叠必须是大于等于 0 的整数');
      return;
    }
    if (!Number.isFinite(retrievalTopK) || retrievalTopK <= 0) {
      setError('召回数量必须是正整数');
      return;
    }

    try {
      setSavingKbConfig(true);
      setError(null);
      const record = await sendJson<KnowledgeBase>(
        `/api/kb/knowledge-bases/${selectedKb.id}`,
        'PATCH',
        {
          name: selectedKb.name,
          description: selectedKb.description,
          embedding_profile_id: kbConfigForm.embedding_profile_id || null,
          embedding_provider: selectedKb.embedding_provider,
          embedding_model: selectedKb.embedding_model,
          embedding_base_url: selectedKb.embedding_base_url,
          embedding_api_key_env: selectedKb.embedding_api_key_env,
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
          retrieval_top_k: retrievalTopK,
        }
      );
      setKnowledgeBases((current) =>
        current.map((item) => (item.id === record.id ? record : item))
      );
      setKbConfigForm(toKbConfigForm(record));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存知识库配置失败');
    } finally {
      setSavingKbConfig(false);
    }
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.12),_transparent_28%),linear-gradient(180deg,_transparent,_rgba(15,23,42,0.03))]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">知识库</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">多知识库检索工作区</h1>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6 md:text-base">
              在这里创建相互隔离的知识库，按分类管理文件、选择本库使用的 Embedding
              模型，并跟踪索引任务状态。
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => void loadKnowledgeBases()}
            >
              <RefreshCcw className="mr-2 size-4" />
              刷新
            </Button>
          </div>
        </div>

        {error ? (
          <Surface
            className="mb-6 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            variant="muted"
            radius="lg"
          >
            {error}
          </Surface>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <Surface padding="md">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">知识库列表</h2>
                <p className="text-muted-foreground text-sm">按业务场景隔离向量空间。</p>
              </div>
              <span className="font-mono text-xs">{knowledgeBases.length}</span>
            </div>

            <Surface className="mb-4 border-dashed" variant="muted" radius="lg" padding="md">
              <h3 className="mb-3 font-medium">新建知识库</h3>
              <div className="space-y-3">
                <Input
                  value={kbForm.name}
                  onChange={(e) => setKbForm((current) => ({ ...current, name: e.target.value }))}
                  placeholder="知识库名称"
                />
                <Textarea
                  value={kbForm.description}
                  onChange={(e) =>
                    setKbForm((current) => ({ ...current, description: e.target.value }))
                  }
                  placeholder="描述这个知识库的用途"
                  className="min-h-20"
                />
                <p className="text-muted-foreground text-xs leading-5">
                  新建后可在右侧为该知识库选择一个全局 Embedding 模型；模型本身在
                  <span className="font-mono"> /settings </span>
                  维护。
                </p>
                <Button
                  className="w-full rounded-full"
                  onClick={() => void handleCreateKnowledgeBase()}
                  disabled={creatingKb}
                >
                  <Plus className="mr-2 size-4" />
                  {creatingKb ? '创建中...' : '新建知识库'}
                </Button>
              </div>
            </Surface>

            <div className="space-y-3">
              {state === 'loading' ? <KbGhost lines={4} /> : null}
              {state !== 'loading' && knowledgeBases.length === 0 ? (
                <EmptyBlock
                  title="还没有知识库"
                  description="请先创建第一个知识库，再到右侧为它选择一个全局 Embedding 模型。"
                />
              ) : null}
              {knowledgeBases.map((kb) => {
                const active = kb.id === selectedKbId;
                const profile =
                  embeddingProfiles.find((item) => item.id === kb.embedding_profile_id) ?? null;
                return (
                  <InteractiveCard
                    key={kb.id}
                    onClick={() => setSelectedKbId(kb.id)}
                    role="button"
                    tabIndex={0}
                    variant={active ? 'selected' : 'default'}
                    radius="lg"
                    padding="lg"
                    className="cursor-pointer"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedKbId(kb.id);
                      }
                    }}
                  >
                    <p className="font-medium">{kb.name}</p>
                    <p
                      className={`mt-2 text-sm leading-5 ${active ? 'text-foreground/75' : 'text-muted-foreground'}`}
                    >
                      {kb.description || '暂无描述。'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] tracking-[0.2em] uppercase">
                      <span>{profile?.provider ?? kb.embedding_provider}</span>
                      <span>{profile?.name || kb.embedding_model || '未绑定模型'}</span>
                    </div>
                  </InteractiveCard>
                );
              })}
            </div>
          </Surface>

          <Surface padding="md">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{selectedKb?.name ?? '文件'}</h2>
                <p className="text-muted-foreground text-sm">
                  上传原始文件，并在向量化前为它们指定分类。
                </p>
              </div>
              {selectedKbId ? (
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => void loadKnowledgeBaseDetails(selectedKbId)}
                >
                  <RefreshCcw className="mr-2 size-4" />
                  刷新明细
                </Button>
              ) : null}
            </div>

            {!selectedKb ? (
              <EmptyBlock
                title="请选择一个知识库"
                description="先从左侧选择知识库，再查看文件、分类和索引任务。"
              />
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                  <Surface className="border-dashed" variant="muted" radius="lg" padding="md">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-medium">分类</h3>
                    </div>
                    <div className="mb-3 flex gap-2">
                      <Input
                        value={categoryName}
                        onChange={(e) => setCategoryName(e.target.value)}
                        placeholder="输入分类名称"
                        className="min-w-0 flex-1"
                      />
                      <Button
                        variant="outline"
                        className="rounded-full"
                        size="sm"
                        onClick={() => void handleCreateCategory()}
                        disabled={creatingCategory}
                      >
                        <Plus className="mr-2 size-4" />
                        {creatingCategory ? '创建中...' : '新建分类'}
                      </Button>
                    </div>
                    {categories.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        还没有分类。新增分类前，文件会保持未分类状态。
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
                    <h3 className="mb-3 font-medium">上传文件</h3>
                    <div className="space-y-3">
                      <FieldSelect
                        value={uploadCategoryId}
                        onValueChange={setUploadCategoryId}
                        placeholder="未分类"
                        options={categories.map((category) => ({
                          value: category.id,
                          label: category.name,
                        }))}
                      />
                      <input
                        type="file"
                        onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                        className="border-border/60 bg-background/60 hover:border-primary/20 focus:border-primary/30 block w-full rounded-2xl border px-3 py-2 text-sm transition-colors outline-none"
                      />
                      <Button
                        className="w-full rounded-full"
                        onClick={() => void handleUploadFile()}
                        disabled={uploading}
                      >
                        <Upload className="mr-2 size-4" />
                        {uploading ? '上传中...' : '上传并触发索引'}
                      </Button>
                    </div>
                  </Surface>
                </div>

                <Surface className="overflow-hidden" radius="lg">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-background/44">
                      <tr>
                        <th className="px-4 py-3 font-medium">文件</th>
                        <th className="px-4 py-3 font-medium">类型</th>
                        <th className="px-4 py-3 font-medium">大小</th>
                        <th className="px-4 py-3 font-medium">状态</th>
                        <th className="px-4 py-3 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-muted-foreground px-4 py-6">
                            还没有上传任何文件。
                          </td>
                        </tr>
                      ) : (
                        files.map((file) => (
                          <tr key={file.id} className="border-border/60 border-t">
                            <td className="px-4 py-3">{file.original_name}</td>
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
                                  onClick={() => void handleRetryFile(file.id)}
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
                </Surface>
              </div>
            )}
          </Surface>

          <section className="space-y-4">
            <Surface padding="md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">知识库配置</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    为当前知识库选择 Embedding 模型，并维护本库的切块与召回参数。
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href="/settings">
                    <Settings2 className="mr-2 size-4" />
                    管理模型
                  </Link>
                </Button>
              </div>

              {!selectedKb ? (
                <p className="text-muted-foreground mt-4 text-sm">选择一个知识库后再配置。</p>
              ) : (
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Embedding 模型</span>
                    <FieldSelect
                      value={kbConfigForm.embedding_profile_id}
                      onValueChange={(value) =>
                        setKbConfigForm((current) => ({
                          ...current,
                          embedding_profile_id: value,
                        }))
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

                  {selectedProfile ? (
                    <InteractiveCard variant="default" radius="lg" padding="md">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">当前模型</span>
                        <span className="font-mono text-xs">{selectedProfile.name}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">模型 ID</span>
                        <span className="font-mono text-xs">
                          {selectedProfile.model || '未配置'}
                        </span>
                      </div>
                    </InteractiveCard>
                  ) : null}

                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      value={kbConfigForm.chunk_size}
                      onChange={(e) =>
                        setKbConfigForm((current) => ({
                          ...current,
                          chunk_size: e.target.value,
                        }))
                      }
                      placeholder="切块大小"
                      inputMode="numeric"
                    />
                    <Input
                      value={kbConfigForm.chunk_overlap}
                      onChange={(e) =>
                        setKbConfigForm((current) => ({
                          ...current,
                          chunk_overlap: e.target.value,
                        }))
                      }
                      placeholder="重叠"
                      inputMode="numeric"
                    />
                    <Input
                      value={kbConfigForm.retrieval_top_k}
                      onChange={(e) =>
                        setKbConfigForm((current) => ({
                          ...current,
                          retrieval_top_k: e.target.value,
                        }))
                      }
                      placeholder="Top K"
                      inputMode="numeric"
                    />
                  </div>

                  <Button
                    className="w-full rounded-full"
                    onClick={() => void handleSaveKbConfig()}
                    disabled={savingKbConfig || !kbConfigDirty}
                  >
                    <Save className="mr-2 size-4" />
                    {savingKbConfig ? '保存中...' : '保存知识库配置'}
                  </Button>
                </div>
              )}
            </Surface>

            <Surface padding="md">
              <h2 className="text-lg font-semibold">知识检索调试</h2>
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="输入一个问题，测试当前知识库的召回结果"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => void handleSearch()}
                    disabled={searching}
                  >
                    <Search className="mr-2 size-4" />
                    {searching ? '检索中...' : '检索'}
                  </Button>
                </div>

                {searchResults.length === 0 ? (
                  <p className="text-muted-foreground text-sm">还没有检索结果。</p>
                ) : (
                  <div className="space-y-3">
                    {searchResults.map((result, index) => (
                      <InteractiveCard
                        key={`${result.metadata?.file_id ?? 'file'}-${index}`}
                        variant="default"
                        radius="lg"
                        padding="md"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{result.metadata?.title ?? '片段'}</p>
                          <span className="font-mono text-[11px]">
                            距离 {Number(result.distance).toFixed(4)}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-2 text-sm leading-6">
                          {result.content}
                        </p>
                      </InteractiveCard>
                    ))}
                  </div>
                )}
              </div>
            </Surface>

            <Surface padding="md">
              <h2 className="text-lg font-semibold">索引任务</h2>
              <div className="mt-4 space-y-3">
                {jobs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">还没有任务。</p>
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
                      {job.error_message ? (
                        <p className="mt-2 text-xs leading-5 text-red-600 dark:text-red-300">
                          错误：{job.error_message}
                        </p>
                      ) : null}
                    </InteractiveCard>
                  ))
                )}
              </div>
            </Surface>
          </section>
        </div>
      </div>
    </div>
  );
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <Surface className="border-dashed px-4 py-8 text-center" variant="muted" radius="lg">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-6">{description}</p>
    </Surface>
  );
}

function KbGhost({ lines }: { lines: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, index) => (
        <Surface key={index} className="h-24 animate-pulse" variant="muted" radius="lg" />
      ))}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
