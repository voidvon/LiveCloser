'use client';

import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { Textarea } from '@/components/ui/textarea';
import { type RewriteChatMessage, parseRewriteOutput } from '@/hooks/useKbFileEditor';
import { cn } from '@/lib/shadcn/utils';

type DiffLine = {
  kind: 'same' | 'added' | 'removed';
  content: string;
};

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

export function DocumentRewriteChatPanel({
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
