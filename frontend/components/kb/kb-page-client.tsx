'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BrushCleaning,
  Plus,
  RefreshCcw,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import { DocumentRewriteChatPanel } from '@/components/kb/document-rewrite-chat-panel';
import { Button } from '@/components/ui/button';
import { ConfirmPopover } from '@/components/ui/confirm-popover';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SidebarSheetButton } from '@/components/ui/sidebar-sheet-button';
import { Surface } from '@/components/ui/surface';
import { Textarea } from '@/components/ui/textarea';
import { TreeView, type TreeViewItem } from '@/components/ui/tree-view';
import { TruncatedTooltipText } from '@/components/ui/truncated-tooltip-text';
import { useKbFileEditor } from '@/hooks/useKbFileEditor';
import { useKnowledgeBaseDetails } from '@/hooks/useKnowledgeBaseDetails';
import { type KnowledgeBaseListState, useKnowledgeBases } from '@/hooks/useKnowledgeBases';
import { cn } from '@/lib/shadcn/utils';
import type {
  Category,
  CategoryTreeNode,
  EmbeddingProfile,
  KbFile,
  KbJob,
  KnowledgeBase,
} from '@/types';

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

export function KbPageClient({ selectedKbId = null }: { selectedKbId?: string | null } = {}) {
  const router = useRouter();
  const [createKbModalOpen, setCreateKbModalOpen] = useState(false);
  const [createKbForm, setCreateKbForm] = useState<CreateKbForm>(DEFAULT_CREATE_KB_FORM);
  const [pageError, setPageError] = useState<string | null>(null);
  const isDetailRoute = Boolean(selectedKbId);
  const {
    knowledgeBases,
    embeddingProfiles,
    chatModelProfiles,
    state,
    creatingKb,
    error: knowledgeBasesError,
    refreshKnowledgeBases,
    createKnowledgeBase,
    clearError: clearKnowledgeBasesError,
  } = useKnowledgeBases();
  const {
    selectedCategoryId,
    setSelectedCategoryId,
    categories,
    files,
    jobs,
    detailsLoading,
    creatingCategory,
    uploading,
    updatingCategoryFileId,
    deletingFileId,
    error: detailsError,
    refreshDetails,
    createCategory,
    uploadFile,
    updateFileCategory,
    deleteFile,
    clearError: clearDetailsError,
  } = useKnowledgeBaseDetails(selectedKbId);

  const selectedKb = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKbId) ?? null,
    [knowledgeBases, selectedKbId]
  );
  const activeChatModelProfile = useMemo(
    () => chatModelProfiles.find((item) => item.is_default === 1) ?? chatModelProfiles[0] ?? null,
    [chatModelProfiles]
  );
  const {
    editorOpen,
    editorLoading,
    savingFile,
    editingFileName,
    editingFileContent,
    editingSelectedText,
    rewriteMessages,
    rewriteInput,
    rewriting,
    rewriteError,
    copiedCandidateMessageId,
    error: fileEditorError,
    fileContentChanged,
    canSaveFile,
    openFileEditor,
    closeFileEditor,
    saveFile,
    submitRewrite,
    copyCandidate,
    applyCandidate,
    clearSelectedText,
    clearError: clearFileEditorError,
    setEditingFileName,
    setEditingFileContent,
    handleEditorSelection,
    handleRewriteInputChange,
  } = useKbFileEditor({
    selectedKbId,
    activeChatModelProfile,
    onSaved: refreshDetails,
  });
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
  const visibleFiles = useMemo(() => {
    if (!visibleCategoryIds) {
      return files;
    }
    return files.filter((file) => file.category_id && visibleCategoryIds.has(file.category_id));
  }, [files, visibleCategoryIds]);
  const fileNameById = useMemo(
    () => new Map(files.map((file) => [file.id, file.original_name])),
    [files]
  );
  const error = pageError ?? fileEditorError ?? detailsError ?? knowledgeBasesError;

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

  async function handleCreateKnowledgeBase() {
    if (!createKbForm.embedding_profile_id) {
      setPageError('请选择一个 Embedding 模型');
      return;
    }
    if (!createKbForm.name.trim()) {
      setPageError('知识库名称不能为空');
      return;
    }

    try {
      setPageError(null);
      clearKnowledgeBasesError();
      const record = await createKnowledgeBase({
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
      closeCreateKbModal();
      router.push(`/kb/${record.id}`);
    } catch {}
  }

  async function handleCreateCategory(parentId: string | null, name: string) {
    if (!selectedKbId) {
      setPageError('请先选择知识库');
      return;
    }
    if (!name.trim()) {
      setPageError('分类名称不能为空');
      return;
    }

    try {
      setPageError(null);
      clearDetailsError();
      await createCategory(parentId, name);
    } catch {}
  }

  async function handleUploadFile(file: File) {
    if (!selectedKbId) {
      setPageError('请先选择知识库');
      return;
    }
    if (!selectedCategoryId) {
      setPageError('请先在左侧选择一个分类');
      return;
    }

    try {
      setPageError(null);
      clearDetailsError();
      await uploadFile(file);
    } catch {}
  }

  async function handleOpenFileEditor(file: KbFile) {
    if (!selectedKbId || !isEditableTextFile(file.original_name)) {
      return;
    }

    try {
      setPageError(null);
      clearFileEditorError();
      await openFileEditor(file);
    } catch {}
  }

  async function handleSaveFile() {
    try {
      setPageError(null);
      clearFileEditorError();
      await saveFile();
    } catch {}
  }

  async function handleUpdateFileCategory(file: KbFile, nextCategoryId: string) {
    if (!selectedKbId) {
      setPageError('请先选择知识库');
      return;
    }

    try {
      setPageError(null);
      clearDetailsError();
      await updateFileCategory(file, nextCategoryId);
    } catch {}
  }

  async function handleDeleteFile(file: KbFile) {
    if (!selectedKbId) {
      setPageError('请先选择知识库');
      return;
    }

    try {
      setPageError(null);
      clearDetailsError();
      await deleteFile(file);
    } catch {}
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
              categoryPathById={categoryPathById}
              defaultExpandedIds={defaultExpandedIds}
              creatingCategory={creatingCategory}
              detailsLoading={detailsLoading}
              files={visibleFiles}
              fileCountByCategoryId={subtreeFileCountByCategoryId}
              jobs={jobs}
              selectedCategory={selectedCategory}
              selectedCategoryId={selectedCategoryId}
              selectedKb={selectedKb}
              selectedProfile={selectedProfile}
              treeItems={treeItems}
              totalFileCount={files.length}
              fileNameById={fileNameById}
              deletingFileId={deletingFileId}
              updatingCategoryFileId={updatingCategoryFileId}
              uploading={uploading}
              onBack={() => router.push('/kb')}
              onCategorySelect={setSelectedCategoryId}
              onCreateCategory={(parentId, name) => void handleCreateCategory(parentId, name)}
              onDeleteFile={handleDeleteFile}
              onEditFile={(file) => void handleOpenFileEditor(file)}
              onRefresh={() => void refreshDetails(selectedKb.id)}
              onUpdateFileCategory={(file, categoryId) =>
                void handleUpdateFileCategory(file, categoryId)
              }
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
            onRefresh={() => void refreshKnowledgeBases()}
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

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (savingFile || rewriting) {
            return;
          }
          if (!open) {
            closeFileEditor();
          }
        }}
      >
        <DialogContent className="flex h-[90vh] w-[80vw] max-w-[1280px] flex-col overflow-hidden sm:max-w-[1280px]">
          <DialogHeader>
            <DialogTitle>编辑文档</DialogTitle>
          </DialogHeader>

          {editorLoading ? (
            <div className="text-muted-foreground flex-1 py-8 text-sm">正在加载文档内容...</div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
              <div className="flex min-h-0 min-w-0 flex-[1.65] flex-col gap-4 pr-1">
                <label className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-sm font-medium">文件名</span>
                  <Input
                    value={editingFileName}
                    onChange={(event) => setEditingFileName(event.target.value)}
                    placeholder="输入文件名"
                  />
                </label>

                <label className="min-h-0 flex-1">
                  <Textarea
                    value={editingFileContent}
                    onChange={(event) => setEditingFileContent(event.target.value)}
                    onSelect={handleEditorSelection}
                    onMouseUp={handleEditorSelection}
                    onKeyUp={handleEditorSelection}
                    className="h-full min-h-[calc(90vh-260px)] font-mono text-sm"
                    placeholder="输入文档内容"
                  />
                </label>
              </div>

              <DocumentRewriteChatPanel
                currentContent={editingFileContent}
                messages={rewriteMessages}
                input={rewriteInput}
                rewriting={rewriting}
                error={rewriteError}
                copiedCandidateMessageId={copiedCandidateMessageId}
                selectedText={editingSelectedText}
                onInputChange={handleRewriteInputChange}
                onSubmit={(instruction) => void submitRewrite(instruction)}
                onApplyCandidate={applyCandidate}
                onCopyCandidate={(candidateContent, messageId) =>
                  void copyCandidate(candidateContent, messageId)
                }
                onClearSelection={clearSelectedText}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={closeFileEditor}
              disabled={savingFile || rewriting}
            >
              取消
            </Button>
            <Button
              type="button"
              className="rounded-full"
              onClick={() => void handleSaveFile()}
              disabled={!canSaveFile || savingFile || rewriting}
            >
              {savingFile ? '保存中...' : fileContentChanged ? '保存并重建索引' : '保存'}
            </Button>
          </DialogFooter>
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
  state: KnowledgeBaseListState;
}) {
  return (
    <>
      <div className="mb-6 space-y-4">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">知识库</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">知识库列表</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6 md:text-base">
            先选择一个知识库进入详情页，再管理分类树、资料文档和索引任务。
          </p>
        </div>

        <div className="flex items-center gap-2">
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
  categoryPathById,
  defaultExpandedIds,
  creatingCategory,
  detailsLoading,
  files,
  fileCountByCategoryId,
  jobs,
  selectedCategory,
  selectedCategoryId,
  selectedKb,
  selectedProfile,
  treeItems,
  totalFileCount,
  fileNameById,
  deletingFileId,
  updatingCategoryFileId,
  uploading,
  onBack,
  onCategorySelect,
  onCreateCategory,
  onDeleteFile,
  onEditFile,
  onRefresh,
  onUpdateFileCategory,
  onUploadFile,
}: {
  categories: Category[];
  categoryPathById: Map<string, string>;
  defaultExpandedIds: string[];
  creatingCategory: boolean;
  detailsLoading: boolean;
  files: KbFile[];
  fileCountByCategoryId: Map<string, number>;
  jobs: KbJob[];
  selectedCategory: Category | null;
  selectedCategoryId: string | null;
  selectedKb: KnowledgeBase;
  selectedProfile: EmbeddingProfile | null;
  treeItems: TreeViewItem<Category>[];
  totalFileCount: number;
  fileNameById: Map<string, string>;
  deletingFileId: string | null;
  updatingCategoryFileId: string | null;
  uploading: boolean;
  onBack: () => void;
  onCategorySelect: (categoryId: string | null) => void;
  onCreateCategory: (parentId: string | null, name: string) => void;
  onDeleteFile: (file: KbFile) => Promise<void> | void;
  onEditFile: (file: KbFile) => void;
  onRefresh: () => void;
  onUpdateFileCategory: (file: KbFile, categoryId: string) => void;
  onUploadFile: (file: File) => void;
}) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const modelLabel = selectedProfile?.name || selectedKb.embedding_model || '未绑定模型';
  const fileScopeTitle = selectedCategory ? selectedCategory.name : '全部资料';
  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: categoryPathById.get(category.id) ?? category.name,
      })),
    [categories, categoryPathById]
  );
  const renderCategoryPanel = (mode: 'desktop' | 'drawer') => (
    <Surface
      className={cn(
        'border-dashed',
        mode === 'desktop' ? 'hidden xl:block' : 'h-full rounded-none border-0 shadow-none'
      )}
      variant="muted"
      radius="lg"
      padding="md"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium">分类树</h3>
        <span className="text-muted-foreground text-xs">{categories.length} 个</span>
      </div>

      <div className="space-y-2">
        <div
          className={cn(
            'group flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition-colors',
            selectedCategoryId === null
              ? 'border-primary/25 bg-primary/10'
              : 'bg-background/70 hover:border-primary/15 hover:bg-background border-transparent'
          )}
        >
          <button
            type="button"
            onClick={() => {
              onCategorySelect(null);
              setCategoryDrawerOpen(false);
            }}
            className="min-w-0 flex-1 text-left font-medium"
          >
            全部资料
          </button>
          <div className="ml-3 flex items-center gap-1.5">
            <span className="text-muted-foreground shrink-0 text-xs">{totalFileCount}</span>
            <AddCategoryPopoverButton
              creating={creatingCategory}
              label="新增一级分类"
              placeholder="输入一级分类名称"
              className="opacity-100 md:pointer-events-none md:opacity-0 md:transition-opacity md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 md:group-hover:pointer-events-auto md:group-hover:opacity-100"
              onCreate={(name) => onCreateCategory(null, name)}
            />
          </div>
        </div>

        {treeItems.length === 0 ? (
          <p className="text-muted-foreground px-1 pt-2 text-sm">
            还没有分类，先新增一个一级分类再上传资料。
          </p>
        ) : (
          <TreeView
            data={treeItems}
            selectedItemId={selectedCategoryId}
            defaultExpandedItemIds={defaultExpandedIds}
            onSelectChange={(item) => {
              onCategorySelect(item?.id ?? null);
              setCategoryDrawerOpen(false);
            }}
            renderItem={({ item, hasChildren, isExpanded, isSelected, select, toggle }) => (
              <div
                className={cn(
                  'group flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition-colors',
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
                  onClick={() => {
                    select();
                    setCategoryDrawerOpen(false);
                  }}
                  className={cn('min-w-0 flex-1 truncate text-left', item.className)}
                >
                  {item.name}
                </button>
                <div className="ml-2 flex items-center gap-1.5">
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {fileCountByCategoryId.get(item.id) ?? 0}
                  </span>
                  <AddCategoryPopoverButton
                    creating={creatingCategory}
                    label={`在 ${item.name} 下新增子分类`}
                    placeholder="输入子分类名称"
                    className="opacity-100 md:pointer-events-none md:opacity-0 md:transition-opacity md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 md:group-hover:pointer-events-auto md:group-hover:opacity-100"
                    onCreate={(name) => onCreateCategory(item.id, name)}
                  />
                </div>
              </div>
            )}
          />
        )}
      </div>
    </Surface>
  );

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
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          {renderCategoryPanel('desktop')}

          <Sheet open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
            <SheetContent side="left" className="p-0 xl:hidden">
              <SheetHeader>
                <SheetTitle>分类树</SheetTitle>
                <SheetDescription>按分类筛选资料，或直接新增分类。</SheetDescription>
              </SheetHeader>
              {renderCategoryPanel('drawer')}
            </SheetContent>
          </Sheet>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-start gap-2">
              <SidebarSheetButton
                label="分类"
                className="xl:hidden"
                onClick={() => setCategoryDrawerOpen(true)}
              />
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full"
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="mr-2 size-4" />
                {uploading ? '上传中...' : '上传文档'}
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={onRefresh}
                disabled={detailsLoading}
              >
                <RefreshCcw className="mr-2 size-4" />
                刷新
              </Button>
              <JobsPopoverButton
                kbId={selectedKb.id}
                jobs={jobs}
                fileNameById={fileNameById}
                onCleared={onRefresh}
              />
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

            <Surface className="relative overflow-hidden" padding="none">
              <div className="border-border/60 flex items-center justify-between border-b px-4 py-4">
                <div>
                  <h2 className="text-lg font-semibold">{fileScopeTitle}</h2>
                </div>
                <span className="text-muted-foreground text-sm">{files.length} 个文件</span>
              </div>

              <div
                className={cn(
                  'overflow-x-auto transition-opacity duration-200',
                  detailsLoading && 'pointer-events-none opacity-45 select-none'
                )}
              >
                <table className="w-full min-w-[640px] table-fixed text-left text-sm">
                  <colgroup>
                    <col />
                    <col />
                    <col />
                    <col className="w-[92px]" />
                    <col className="w-[80px]" />
                  </colgroup>
                  <thead className="bg-background/44">
                    <tr>
                      <th className="px-4 py-3 font-medium">文件</th>
                      <th className="px-4 py-3 font-medium">分类</th>
                      <th className="px-4 py-3 font-medium">大小</th>
                      <th className="w-[92px] px-4 py-3 font-medium">状态</th>
                      <th className="w-[80px] px-4 py-3 font-medium">操作</th>
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
                          <td className="px-4 py-3">
                            {isEditableTextFile(file.original_name) ? (
                              <button
                                type="button"
                                className="text-primary hover:text-primary/80 block max-w-[240px] cursor-pointer truncate text-left underline underline-offset-4"
                                onClick={() => onEditFile(file)}
                                title={file.original_name}
                              >
                                {file.original_name}
                              </button>
                            ) : (
                              <span
                                className="block max-w-[240px] truncate"
                                title={file.original_name}
                              >
                                {file.original_name}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <FieldSelect
                              value={file.category_id ?? ''}
                              onValueChange={(value) => onUpdateFileCategory(file, value)}
                              options={categoryOptions}
                              placeholder="未分类"
                              disabled={updatingCategoryFileId === file.id}
                              triggerClassName="h-9 min-w-[180px] max-w-[180px] rounded-xl border-dashed bg-transparent text-left"
                              contentClassName="max-h-80"
                            />
                          </td>
                          <td className="px-4 py-3">{formatBytes(file.size_bytes)}</td>
                          <td className="w-[92px] px-4 py-3">
                            <span className="border-primary/18 bg-primary/10 rounded-full border px-2.5 py-1 text-xs uppercase">
                              {formatKbStatus(file.status)}
                            </span>
                          </td>
                          <td className="w-[80px] px-4 py-3">
                            <DeleteFilePopoverButton
                              file={file}
                              deleting={deletingFileId === file.id}
                              onDelete={onDeleteFile}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {detailsLoading ? (
                <div
                  className="bg-background/18 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[1px]"
                  aria-hidden="true"
                >
                  <div className="border-primary/35 border-t-primary size-6 animate-spin rounded-full border-2" />
                </div>
              ) : null}
            </Surface>
          </div>
        </div>
      </section>
    </>
  );
}

function AddCategoryPopoverButton({
  creating,
  label,
  placeholder,
  className,
  onCreate,
}: {
  creating: boolean;
  label: string;
  placeholder: string;
  className?: string;
  onCreate: (name: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!creating) {
          setOpen(nextOpen);
        }
        if (!nextOpen && !creating) {
          setName('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn('rounded-full', className)}
          disabled={creating}
          aria-label={label}
          title={label}
        >
          <Plus className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{label}</p>
        </div>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={placeholder}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => {
              setOpen(false);
              setName('');
            }}
            disabled={creating}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={creating || !name.trim()}
            onClick={async () => {
              await onCreate(name);
              setOpen(false);
              setName('');
            }}
          >
            {creating ? '创建中...' : '新增'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function JobsPopoverButton({
  kbId,
  jobs,
  fileNameById,
  onCleared,
}: {
  kbId: string;
  jobs: KbJob[];
  fileNameById: Map<string, string>;
  onCleared: () => void;
}) {
  const [clearing, setClearing] = useState(false);

  async function handleClearFinishedJobs() {
    try {
      setClearing(true);
      const response = await fetch(`/api/kb/knowledge-bases/${kbId}/jobs`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      onCleared();
    } finally {
      setClearing(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="rounded-full">
          任务列表
          <span className="border-border/70 bg-background/80 ml-2 rounded-full border px-2 py-0.5 text-xs">
            {jobs.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,720px)] p-0">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">索引任务</p>
          <ConfirmPopover
            title="清理已结束任务？"
            description="只会清理已完成和失败的任务记录，进行中的任务会保留。"
            confirmLabel="确认清理"
            confirming={clearing}
            align="end"
            onConfirm={handleClearFinishedJobs}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              disabled={clearing}
              aria-label="清理已结束任务"
              title="清理已结束任务"
            >
              <BrushCleaning className="size-3.5" />
            </Button>
          </ConfirmPopover>
        </div>

        {jobs.length === 0 ? (
          <div className="text-muted-foreground px-4 py-6 text-sm">
            上传资料后，这里会出现对应的索引任务。
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[620px] table-fixed text-left text-xs">
              <thead className="bg-background/60">
                <tr>
                  <th className="px-4 py-2.5 font-medium">文件</th>
                  <th className="w-[86px] px-4 py-2.5 font-medium">状态</th>
                  <th className="px-4 py-2.5 font-medium">开始 / 结束</th>
                  <th className="px-4 py-2.5 font-medium">错误</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-border/50 border-t align-top">
                    <td className="px-4 py-3 font-medium">
                      {job.file_id
                        ? (fileNameById.get(job.file_id) ?? '未找到对应文件')
                        : '未关联文件'}
                    </td>
                    <td className="w-[86px] px-4 py-3">
                      <span className="border-primary/18 bg-primary/10 rounded-full border px-2 py-0.5 text-[11px] uppercase">
                        {formatKbStatus(job.status)}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      <span>{formatJobTimeRange(job.started_at, job.finished_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {job.error_message ? (
                        <TruncatedTooltipText
                          text={job.error_message}
                          as="p"
                          lines={2}
                          className="text-red-600 dark:text-red-300"
                          tooltipVariant="contrast"
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DeleteFilePopoverButton({
  file,
  deleting,
  onDelete,
}: {
  file: KbFile;
  deleting: boolean;
  onDelete: (file: KbFile) => Promise<void> | void;
}) {
  return (
    <ConfirmPopover
      title="确认删除文档？"
      description={`将删除“${file.original_name}”及对应索引数据，且不可恢复。`}
      confirmLabel="确认删除"
      confirming={deleting}
      align="end"
      onConfirm={() => onDelete(file)}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:text-destructive rounded-full"
        disabled={deleting}
        aria-label={`删除 ${file.original_name}`}
        title="删除文档"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </ConfirmPopover>
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

function formatKbStatus(status: string) {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'embedding':
      return '索引中';
    case 'ready':
      return '已就绪';
    case 'running':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return status;
  }
}

function formatJobTimeRange(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt && !finishedAt) {
    return '-';
  }

  return `${formatShortDateTime(startedAt)} ~ ${formatShortDateTime(finishedAt)}`;
}

function formatShortDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function isEditableTextFile(fileName: string): boolean {
  const normalized = fileName.toLowerCase();
  return (
    normalized.endsWith('.txt') || normalized.endsWith('.md') || normalized.endsWith('.markdown')
  );
}
