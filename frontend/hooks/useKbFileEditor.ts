'use client';

import { type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJson, patchJson } from '@/lib/api';
import type { ChatModelProfile, KbFile, KbJob } from '@/types';

type EditableKbFileDetail = {
  file: KbFile;
  content: string;
};

export type RewriteChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  candidate_content?: string | null;
  streaming?: boolean;
};

const CANDIDATE_DELIMITER = '\n<<<CANDIDATE_CONTENT>>>\n';

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

export function parseRewriteOutput(rawText: string): {
  reply: string;
  candidateContent: string | null;
} {
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useKbFileEditor({
  selectedKbId,
  activeChatModelProfile,
  onSaved,
}: {
  selectedKbId: string | null;
  activeChatModelProfile: ChatModelProfile | null;
  onSaved: (kbId: string) => Promise<unknown>;
}) {
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
  const [error, setError] = useState<string | null>(null);
  const rewriteAbortRef = useRef<AbortController | null>(null);

  const closeFileEditor = useCallback(() => {
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
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      rewriteAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!selectedKbId) {
      closeFileEditor();
    }
  }, [closeFileEditor, selectedKbId]);

  const openFileEditor = useCallback(
    async (file: KbFile) => {
      if (!selectedKbId) {
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
      } catch (error: unknown) {
        closeFileEditor();
        setError(getErrorMessage(error, '加载文档内容失败'));
      } finally {
        setEditorLoading(false);
      }
    },
    [closeFileEditor, selectedKbId]
  );

  const saveFile = useCallback(async () => {
    if (!selectedKbId || !editingFile) {
      return;
    }

    try {
      setSavingFile(true);
      setError(null);
      await patchJson<{ file: KbFile; job: KbJob | null }>(
        `/api/kb/knowledge-bases/${selectedKbId}/files/${editingFile.id}`,
        {
          original_name: editingFileName,
          content: editingFileContent,
        }
      );
      await onSaved(selectedKbId);
      closeFileEditor();
    } catch (error: unknown) {
      setError(getErrorMessage(error, '保存文档失败'));
    } finally {
      setSavingFile(false);
    }
  }, [closeFileEditor, editingFile, editingFileContent, editingFileName, onSaved, selectedKbId]);

  const submitRewrite = useCallback(
    async (instruction: string) => {
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
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setRewriteError(
          error instanceof TypeError
            ? '直连模型失败，通常是网络不可达或模型服务未放开浏览器 CORS。'
            : getErrorMessage(error, '文档辅助对话失败')
        );
        setRewriteMessages((current) =>
          current.filter((item) => item.id !== nextUserMessage.id && item.id !== assistantMessageId)
        );
        setRewriteInput(trimmedInstruction);
      } finally {
        rewriteAbortRef.current = null;
        setRewriting(false);
      }
    },
    [
      activeChatModelProfile,
      editingFile,
      editingFileContent,
      editingFileName,
      editingSelectedText,
      rewriteMessages,
      selectedKbId,
    ]
  );

  const copyCandidate = useCallback(async (candidateContent: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(candidateContent);
      setCopiedCandidateMessageId(messageId);
    } catch {
      setRewriteError('复制失败，请检查浏览器权限');
    }
  }, []);

  const applyCandidate = useCallback(
    (candidateContent: string) => {
      if (
        editingFileContent !== initialEditingFileContent &&
        !window.confirm('当前正文已有未保存修改，确定用 AI 结果覆盖全文吗？')
      ) {
        return;
      }
      setEditingFileContent(candidateContent);
    },
    [editingFileContent, initialEditingFileContent]
  );

  const handleEditorSelection = useCallback((event: SyntheticEvent<HTMLTextAreaElement>) => {
    setEditingSelectedText(extractSelectedTextFromTextarea(event));
  }, []);

  const clearSelectedText = useCallback(() => {
    setEditingSelectedText(null);
  }, []);

  const handleRewriteInputChange = useCallback((value: string) => {
    setRewriteInput(value);
    setRewriteError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const fileNameChanged = editingFileName.trim() !== initialEditingFileName;
  const fileContentChanged = editingFileContent !== initialEditingFileContent;
  const hasValidEditingFileName = editingFileName.trim().length > 0;
  const canSaveFile = useMemo(
    () =>
      Boolean(
        editingFile &&
        !editorLoading &&
        hasValidEditingFileName &&
        (fileNameChanged || fileContentChanged)
      ),
    [editingFile, editorLoading, fileContentChanged, fileNameChanged, hasValidEditingFileName]
  );

  return {
    editingFile,
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
    error,
    fileContentChanged,
    canSaveFile,
    openFileEditor,
    closeFileEditor,
    saveFile,
    submitRewrite,
    copyCandidate,
    applyCandidate,
    clearSelectedText,
    clearError,
    setEditorOpen,
    setEditingFileName,
    setEditingFileContent,
    handleEditorSelection,
    handleRewriteInputChange,
  };
}
