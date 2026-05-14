'use client';

import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
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

type EditableKbFileDetail = {
  file: KbFile;
  content: string;
};

type ChatModelProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
  is_default: number;
  created_at: string;
  updated_at: string;
};

type RewriteChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  candidate_content?: string | null;
  streaming?: boolean;
};

type DiffLine = {
  kind: 'same' | 'added' | 'removed';
  content: string;
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

const CANDIDATE_DELIMITER = '\n<<<CANDIDATE_CONTENT>>>\n';

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

function createLocalMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extractSelectedTextFromTextarea(event: SyntheticEvent<HTMLTextAreaElement>) {
  const target = event.currentTarget;
  const start = target.selectionStart ?? 0;
  const end = target.selectionEnd ?? 0;
  if (start >= end) {
    return null;
  }
  return target.value.slice(start, end);
}

function buildLineDiffPreview(baseText: string, nextText: string, maxLines = 40): DiffLine[] {
  const baseLines = baseText.split('\n');
  const nextLines = nextText.split('\n');
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < baseLines.length || j < nextLines.length) {
    if (result.length >= maxLines) {
      break;
    }
    if (i < baseLines.length && j < nextLines.length && baseLines[i] === nextLines[j]) {
      result.push({ kind: 'same', content: baseLines[i] });
      i += 1;
      j += 1;
      continue;
    }
    if (i + 1 < baseLines.length && j < nextLines.length && baseLines[i + 1] === nextLines[j]) {
      result.push({ kind: 'removed', content: baseLines[i] });
      i += 1;
      continue;
    }
    if (i < baseLines.length && j + 1 < nextLines.length && baseLines[i] === nextLines[j + 1]) {
      result.push({ kind: 'added', content: nextLines[j] });
      j += 1;
      continue;
    }
    if (i < baseLines.length) {
      result.push({ kind: 'removed', content: baseLines[i] });
      i += 1;
    }
    if (result.length >= maxLines) {
      break;
    }
    if (j < nextLines.length) {
      result.push({ kind: 'added', content: nextLines[j] });
      j += 1;
    }
  }

  return result;
}

function parseRewriteOutput(rawText: string): { reply: string; candidateContent: string | null } {
  const delimiterIndex = rawText.indexOf(CANDIDATE_DELIMITER);
  if (delimiterIndex === -1) {
    const reply = rawText.trim();
    return { reply, candidateContent: null };
  }

  const reply = rawText.slice(0, delimiterIndex).trim();
  const candidateContent = rawText.slice(delimiterIndex + CANDIDATE_DELIMITER.length).trim();
  return {
    reply,
    candidateContent: candidateContent || null,
  };
}

function buildRewriteRequestPrompt({
  fileName,
  content,
  instruction,
  selectedText,
}: {
  fileName: string;
  content: string;
  instruction: string;
  selectedText: string | null;
}) {
  return [
    `当前文件名：${fileName}`,
    `当前选中文本：${selectedText || '无'}`,
    '当前完整文档内容如下：',
    content,
    '',
    '用户指令：',
    instruction,
    '',
    '请严格按以下格式输出，不要添加额外前后缀：',
    '第一部分：给用户看的简短说明。',
    `第二部分从这一行开始：${CANDIDATE_DELIMITER.trim()}`,
    '第三部分：如果需要重写/润色/整理，请在该分隔符后输出完整候选正文；',
    '如果不需要生成候选正文，可以留空，但不要删除分隔符。',
  ].join('\n');
}

async function streamRewriteFromModel({
  profile,
  history,
  fileName,
  content,
  instruction,
  selectedText,
  signal,
  onChunk,
}: {
  profile: ChatModelProfile;
  history: RewriteChatMessage[];
  fileName: string;
  content: string;
  instruction: string;
  selectedText: string | null;
  signal: AbortSignal;
  onChunk: (chunk: string) => void;
}) {
  const modelBaseUrl = profile.base_url.trim().replace(/\/$/, '');
  if (!modelBaseUrl) {
    throw new Error('当前默认会话模型缺少 base URL');
  }
  if (!profile.api_key.trim()) {
    throw new Error('当前默认会话模型缺少 API Key');
  }
  if (!profile.model.trim()) {
    throw new Error('当前默认会话模型缺少模型名称');
  }

  const messages = [
    {
      role: 'system',
      content:
        '你是一个文档整理与改写助手。你只能基于当前给出的文档内容和对话上下文回答，不得编造外部事实。',
    },
    ...history
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({
        role: item.role,
        content: item.content,
      })),
    {
      role: 'user',
      content: buildRewriteRequestPrompt({
        fileName,
        content,
        instruction,
        selectedText,
      }),
    },
  ];

  const payload: Record<string, unknown> = {
    model: profile.model,
    messages,
    stream: true,
    temperature: 0.3,
  };

  const normalizedBaseUrl = modelBaseUrl.toLowerCase();
  const normalizedModel = profile.model.trim().toLowerCase();
  if (
    normalizedBaseUrl.includes('api.deepseek.com') &&
    ['deepseek-v4-flash', 'deepseek-v4-pro'].includes(normalizedModel)
  ) {
    payload.thinking = { type: 'disabled' };
  }

  const response = await fetch(`${modelBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.api_key}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (!response.body) {
    throw new Error('模型没有返回可读取的流');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes('\n')) {
      const lineEnd = buffer.indexOf('\n');
      const rawLine = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 1);
      const line = rawLine.trim();
      if (!line.startsWith('data:')) {
        continue;
      }
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const choices =
        typeof parsed === 'object' && parsed !== null && 'choices' in parsed
          ? (
              parsed as {
                choices?: Array<{ delta?: { content?: string | Array<{ text?: string }> } }>;
              }
            ).choices
          : undefined;
      const delta = choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) {
        fullText += delta;
        onChunk(delta);
        continue;
      }
      if (Array.isArray(delta)) {
        const text = delta
          .map((item) => (item && typeof item === 'object' && 'text' in item ? item.text : ''))
          .filter((item): item is string => typeof item === 'string' && item.length > 0)
          .join('');
        if (text) {
          fullText += text;
          onChunk(text);
        }
      }
    }
  }

  return fullText;
}

export function KbPageClient({ selectedKbId = null }: { selectedKbId?: string | null } = {}) {
  const router = useRouter();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [chatModelProfiles, setChatModelProfiles] = useState<ChatModelProfile[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [files, setFiles] = useState<KbFile[]>([]);
  const [jobs, setJobs] = useState<KbJob[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createKbModalOpen, setCreateKbModalOpen] = useState(false);
  const [creatingKb, setCreatingKb] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [updatingCategoryFileId, setUpdatingCategoryFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<KbFile | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [editingFileName, setEditingFileName] = useState('');
  const [editingFileContent, setEditingFileContent] = useState('');
  const [initialEditingFileName, setInitialEditingFileName] = useState('');
  const [initialEditingFileContent, setInitialEditingFileContent] = useState('');
  const [editingSelectedText, setEditingSelectedText] = useState<string | null>(null);
  const [rewriteMessages, setRewriteMessages] = useState<RewriteChatMessage[]>([]);
  const [rewriteInput, setRewriteInput] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [copiedCandidateMessageId, setCopiedCandidateMessageId] = useState<string | null>(null);
  const [createKbForm, setCreateKbForm] = useState<CreateKbForm>(DEFAULT_CREATE_KB_FORM);
  const rewriteAbortRef = useRef<AbortController | null>(null);
  const isDetailRoute = Boolean(selectedKbId);

  useEffect(() => {
    void loadKnowledgeBases();
    void loadChatModelProfiles();
  }, []);

  useEffect(() => {
    if (!selectedKbId) {
      setSelectedCategoryId(null);
      setCategories([]);
      setFiles([]);
      setJobs([]);
      closeFileEditor();
      return;
    }
    void loadKnowledgeBaseDetails(selectedKbId);
  }, [selectedKbId]);

  useEffect(() => {
    return () => {
      rewriteAbortRef.current?.abort();
    };
  }, []);

  const selectedKb = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKbId) ?? null,
    [knowledgeBases, selectedKbId]
  );
  const activeChatModelProfile = useMemo(
    () => chatModelProfiles.find((item) => item.is_default === 1) ?? chatModelProfiles[0] ?? null,
    [chatModelProfiles]
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

  function closeFileEditor() {
    rewriteAbortRef.current?.abort();
    rewriteAbortRef.current = null;
    setEditorOpen(false);
    setEditingFile(null);
    setEditorLoading(false);
    setSavingFile(false);
    setEditingFileName('');
    setEditingFileContent('');
    setInitialEditingFileName('');
    setInitialEditingFileContent('');
    setEditingSelectedText(null);
    setRewriteMessages([]);
    setRewriteInput('');
    setRewriting(false);
    setRewriteError(null);
    setCopiedCandidateMessageId(null);
  }

  async function loadChatModelProfiles() {
    try {
      const nextProfiles = await getJson<ChatModelProfile[]>('/api/kb/chat-model-profiles');
      setChatModelProfiles(nextProfiles);
    } catch {
      setChatModelProfiles([]);
    }
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

  async function handleCreateCategory(parentId: string | null, name: string) {
    if (!selectedKbId) {
      setError('请先选择知识库');
      return;
    }
    if (!name.trim()) {
      setError('分类名称不能为空');
      return;
    }

    try {
      setCreatingCategory(true);
      setError(null);
      const siblingCount = categories.filter(
        (category) => (category.parent_id ?? null) === (parentId ?? null)
      ).length;
      const record = await sendJson<Category>(
        `/api/kb/knowledge-bases/${selectedKbId}/categories`,
        'POST',
        {
          name: name.trim(),
          parent_id: parentId,
          sort_order: siblingCount,
        }
      );
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

  async function handleOpenFileEditor(file: KbFile) {
    if (!selectedKbId || !isEditableTextFile(file.original_name)) {
      return;
    }

    try {
      setEditorOpen(true);
      setEditorLoading(true);
      setError(null);
      setRewriteError(null);
      setEditingFile(file);
      const detail = await getJson<EditableKbFileDetail>(
        `/api/kb/knowledge-bases/${selectedKbId}/files/${file.id}`
      );
      setEditingFile(detail.file);
      setEditingFileName(detail.file.original_name);
      setEditingFileContent(detail.content);
      setInitialEditingFileName(detail.file.original_name);
      setInitialEditingFileContent(detail.content);
      setEditingSelectedText(null);
    } catch (err: unknown) {
      closeFileEditor();
      setError(err instanceof Error ? err.message : '加载文档内容失败');
    } finally {
      setEditorLoading(false);
    }
  }

  async function handleSaveFile() {
    if (!selectedKbId || !editingFile) {
      return;
    }

    try {
      setSavingFile(true);
      setError(null);
      await sendJson<{ file: KbFile; job: KbJob | null }>(
        `/api/kb/knowledge-bases/${selectedKbId}/files/${editingFile.id}`,
        'PATCH',
        {
          original_name: editingFileName,
          content: editingFileContent,
        }
      );
      await loadKnowledgeBaseDetails(selectedKbId);
      closeFileEditor();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存文档失败');
    } finally {
      setSavingFile(false);
    }
  }

  async function handleSubmitRewrite(instruction: string) {
    if (!selectedKbId || !editingFile) {
      return;
    }
    if (!activeChatModelProfile) {
      setRewriteError('当前没有可用的默认会话模型');
      return;
    }
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) {
      setRewriteError('请输入整理或改写指令');
      return;
    }

    const nextUserMessage: RewriteChatMessage = {
      id: createLocalMessageId(),
      role: 'user',
      content: trimmedInstruction,
    };
    const assistantMessageId = createLocalMessageId();
    const controller = new AbortController();

    try {
      rewriteAbortRef.current?.abort();
      rewriteAbortRef.current = controller;
      setRewriting(true);
      setRewriteError(null);
      setCopiedCandidateMessageId(null);
      setRewriteMessages((current) => [
        ...current,
        nextUserMessage,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          candidate_content: null,
          streaming: true,
        },
      ]);
      setRewriteInput('');

      const finalText = await streamRewriteFromModel({
        profile: activeChatModelProfile,
        history: rewriteMessages,
        fileName: editingFileName.trim() || editingFile.original_name,
        content: editingFileContent,
        instruction: trimmedInstruction,
        selectedText: editingSelectedText,
        signal: controller.signal,
        onChunk: (chunk) => {
          setRewriteMessages((current) =>
            current.map((item) =>
              item.id === assistantMessageId
                ? {
                    ...item,
                    content: item.content + chunk,
                  }
                : item
            )
          );
        },
      });

      const parsed = parseRewriteOutput(finalText);
      setRewriteMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: parsed.reply,
                candidate_content: parsed.candidateContent,
                streaming: false,
              }
            : item
        )
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setRewriteError(
        err instanceof TypeError
          ? '直连模型失败，通常是网络不可达或模型服务未放开浏览器 CORS。'
          : err instanceof Error
            ? err.message
            : '文档辅助对话失败'
      );
      setRewriteMessages((current) =>
        current.filter((item) => item.id !== nextUserMessage.id && item.id !== assistantMessageId)
      );
      setRewriteInput(trimmedInstruction);
    } finally {
      rewriteAbortRef.current = null;
      setRewriting(false);
    }
  }

  async function handleCopyCandidate(candidateContent: string, messageId: string) {
    try {
      await navigator.clipboard.writeText(candidateContent);
      setCopiedCandidateMessageId(messageId);
    } catch {
      setRewriteError('复制失败，请检查浏览器权限');
    }
  }

  function handleApplyCandidate(candidateContent: string) {
    if (
      editingFileContent !== initialEditingFileContent &&
      !window.confirm('当前正文已有未保存修改，确定用 AI 结果覆盖全文吗？')
    ) {
      return;
    }
    setEditingFileContent(candidateContent);
  }

  async function handleUpdateFileCategory(file: KbFile, nextCategoryId: string) {
    if (!selectedKbId) {
      setError('请先选择知识库');
      return;
    }

    const normalizedCategoryId = nextCategoryId || null;
    if ((file.category_id ?? null) === normalizedCategoryId) {
      return;
    }

    try {
      setUpdatingCategoryFileId(file.id);
      setError(null);
      await sendJson<{ file: KbFile; job: KbJob | null }>(
        `/api/kb/knowledge-bases/${selectedKbId}/files/${file.id}`,
        'PATCH',
        {
          category_id: normalizedCategoryId,
        }
      );
      await loadKnowledgeBaseDetails(selectedKbId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新分类失败');
    } finally {
      setUpdatingCategoryFileId(null);
    }
  }

  async function handleDeleteFile(file: KbFile) {
    if (!selectedKbId) {
      setError('请先选择知识库');
      return;
    }

    try {
      setDeletingFileId(file.id);
      setError(null);
      const response = await fetch(`/api/kb/knowledge-bases/${selectedKbId}/files/${file.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await loadKnowledgeBaseDetails(selectedKbId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除文档失败');
    } finally {
      setDeletingFileId(null);
    }
  }

  const fileNameChanged = editingFileName.trim() !== initialEditingFileName;
  const fileContentChanged = editingFileContent !== initialEditingFileContent;
  const hasValidEditingFileName = editingFileName.trim().length > 0;
  const canSaveFile = Boolean(
    editingFile &&
    !editorLoading &&
    hasValidEditingFileName &&
    (fileNameChanged || fileContentChanged)
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
              onRefresh={() => void loadKnowledgeBaseDetails(selectedKb.id)}
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
                    onSelect={(event) =>
                      setEditingSelectedText(extractSelectedTextFromTextarea(event))
                    }
                    onMouseUp={(event) =>
                      setEditingSelectedText(extractSelectedTextFromTextarea(event))
                    }
                    onKeyUp={(event) =>
                      setEditingSelectedText(extractSelectedTextFromTextarea(event))
                    }
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
                onInputChange={(value) => {
                  setRewriteInput(value);
                  if (rewriteError) {
                    setRewriteError(null);
                  }
                }}
                onSubmit={(instruction) => void handleSubmitRewrite(instruction)}
                onApplyCandidate={handleApplyCandidate}
                onCopyCandidate={(candidateContent, messageId) =>
                  void handleCopyCandidate(candidateContent, messageId)
                }
                onClearSelection={() => setEditingSelectedText(null)}
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

function DocumentRewriteChatPanel({
  currentContent,
  messages,
  input,
  rewriting,
  error,
  copiedCandidateMessageId,
  selectedText,
  onInputChange,
  onSubmit,
  onApplyCandidate,
  onCopyCandidate,
  onClearSelection,
}: {
  currentContent: string;
  messages: RewriteChatMessage[];
  input: string;
  rewriting: boolean;
  error: string | null;
  copiedCandidateMessageId: string | null;
  selectedText: string | null;
  onInputChange: (value: string) => void;
  onSubmit: (instruction: string) => void;
  onApplyCandidate: (candidateContent: string) => void;
  onCopyCandidate: (candidateContent: string, messageId: string) => void;
  onClearSelection: () => void;
}) {
  return (
    <Surface
      className="flex min-h-[320px] min-w-0 shrink-0 flex-col overflow-hidden border lg:w-[380px]"
      padding="none"
      radius="lg"
      variant="muted"
    >
      <div className="border-border/60 border-b px-4 py-3">
        <p className="text-sm font-semibold">文档辅助对话</p>
      </div>

      {selectedText ? (
        <div className="px-4 pb-3">
          <div className="border-primary/20 bg-primary/5 flex items-start justify-between gap-3 rounded-2xl border px-3 py-2 text-xs">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">已选中文本</p>
              <p className="text-muted-foreground max-h-20 overflow-hidden leading-5 break-words whitespace-pre-wrap">
                {selectedText}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full px-2"
              onClick={onClearSelection}
            >
              清除
            </Button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="text-muted-foreground rounded-2xl border border-dashed px-4 py-4 text-sm leading-6">
            在这里直接让 AI 总结、整理、润色或重写当前文档。生成的候选正文可以一键应用到左侧。
          </div>
        ) : (
          messages.map((message) => {
            const parsedStreaming =
              message.role === 'assistant' ? parseRewriteOutput(message.content) : null;
            const displayedReply =
              message.role === 'assistant'
                ? message.streaming
                  ? parsedStreaming?.reply || ''
                  : message.content
                : message.content;
            const displayedCandidate =
              message.role === 'assistant'
                ? (message.candidate_content ??
                  (message.streaming ? (parsedStreaming?.candidateContent ?? null) : null))
                : null;

            return (
              <div
                key={message.id}
                className={cn(
                  'space-y-3 rounded-2xl px-4 py-3 text-sm',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground ml-8'
                    : 'bg-background mr-4 border'
                )}
              >
                <p className="leading-6 whitespace-pre-wrap">
                  {displayedReply || (message.streaming ? '正在生成回答...' : '')}
                </p>
                {message.role === 'assistant' && message.streaming && !displayedCandidate ? (
                  <p className="text-muted-foreground text-xs">正在流式生成…</p>
                ) : null}
                {message.role === 'assistant' && displayedCandidate ? (
                  <div className="space-y-3 rounded-xl border border-dashed px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium">候选正文</span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full"
                          onClick={() => onApplyCandidate(displayedCandidate)}
                        >
                          应用为全文
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => onCopyCandidate(displayedCandidate, message.id)}
                        >
                          {copiedCandidateMessageId === message.id ? '已复制' : '复制结果'}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl bg-black/5 px-3 py-2 text-xs leading-5 dark:bg-white/5">
                      <p className="text-muted-foreground font-medium">差异预览</p>
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {buildLineDiffPreview(currentContent, displayedCandidate, 24).map(
                          (line, index) => (
                            <div
                              key={`${message.id}-${index}`}
                              className={cn(
                                'rounded px-2 py-1 font-mono break-words whitespace-pre-wrap',
                                line.kind === 'added' &&
                                  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                                line.kind === 'removed' &&
                                  'bg-red-500/10 text-red-700 line-through dark:text-red-300',
                                line.kind === 'same' && 'text-muted-foreground'
                              )}
                            >
                              <span className="mr-2 inline-block w-3 shrink-0 opacity-70">
                                {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
                              </span>
                              {line.content || ' '}
                            </div>
                          )
                        )}
                      </div>
                      <div className="text-muted-foreground pt-1 text-[11px]">
                        预览基于当前左侧正文，超过部分会截断。
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="border-border/60 space-y-3 border-t px-4 py-4">
        {error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}
        <Textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="例如：把这份文档改写成更适合销售同事阅读的 Markdown"
          className="min-h-28 text-sm"
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={rewriting}
            onClick={() => onInputChange('')}
          >
            清空输入
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={rewriting || !input.trim()}
            onClick={() => onSubmit(input)}
          >
            {rewriting ? '处理中...' : '发送'}
          </Button>
        </div>
      </div>
    </Surface>
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
