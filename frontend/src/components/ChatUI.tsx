import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import "highlight.js/styles/github-dark.css";
import {
  ArrowUp,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Paperclip,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Message, ToolCall } from "../types";

interface ChatUIProps {
  messages?: Message[];
  onMessage: (msg: string) => void;
  onAnswerClarification: (messageId: string, option: string) => void; // ← new
  loading?: boolean;
}

// ─── Collapsible block ────────────────────────────────────────────────────────

const Collapsible: React.FC<{
  icon: React.ReactNode;
  label: string;
  badge?: string;
  badgeColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  borderColor?: string;
}> = ({
  icon,
  label,
  badge,
  badgeColor = "bg-zinc-700 text-zinc-300",
  defaultOpen = false,
  children,
  borderColor = "border-zinc-700/60",
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-xl border overflow-hidden my-2", borderColor)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors"
      >
        <span className="text-zinc-400">{icon}</span>
        <span className="flex-1 text-[13px] font-medium text-zinc-300">
          {label}
        </span>
        {badge && (
          <span
            className={cn(
              "text-[11px] px-2 py-0.5 rounded-full font-medium",
              badgeColor,
            )}
          >
            {badge}
          </span>
        )}
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
        )}
      </button>
      {open && (
        <div className="border-t border-zinc-700/40 bg-zinc-900/50">
          {children}
        </div>
      )}
    </div>
  );
};

// ─── Reasoning block ──────────────────────────────────────────────────────────

const ThinkingBlock: React.FC<{ thinking: string }> = ({ thinking }) => (
  <Collapsible
    icon={<Brain className="w-3.5 h-3.5" />}
    label="Reasoning"
    badge="thinking"
    badgeColor="bg-purple-900/60 text-purple-300"
    borderColor="border-purple-800/40"
  >
    <div className="px-4 py-3 text-[13px] text-zinc-400 leading-relaxed font-mono whitespace-pre-wrap max-h-72 overflow-y-auto">
      {thinking}
    </div>
  </Collapsible>
);

// ─── Tool call blocks ─────────────────────────────────────────────────────────

const statusIcon = (status: ToolCall["status"]) => {
  switch (status) {
    case "done":
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case "running":
      return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
    case "error":
      return <CheckCircle2 className="w-3.5 h-3.5 text-red-400" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
  }
};

const statusBadge = (status: ToolCall["status"]) => {
  switch (status) {
    case "done":
      return { label: "done", cls: "bg-emerald-900/50 text-emerald-300" };
    case "running":
      return { label: "running…", cls: "bg-blue-900/50 text-blue-300" };
    case "error":
      return { label: "error", cls: "bg-red-900/50 text-red-300" };
    default:
      return { label: "pending", cls: "bg-zinc-700 text-zinc-400" };
  }
};

const ToolCallBlock: React.FC<{ tool: ToolCall }> = ({ tool }) => {
  const { label, cls } = statusBadge(tool.status);
  return (
    <Collapsible
      icon={<Wrench className="w-3.5 h-3.5" />}
      label={tool.name}
      badge={label}
      badgeColor={cls}
      borderColor="border-amber-800/30"
    >
      <div className="divide-y divide-zinc-700/40">
        <div className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
            Input
          </p>
          <pre className="text-[12px] text-zinc-300 font-mono whitespace-pre-wrap break-words">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
        </div>
        {tool.result !== undefined && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              {statusIcon(tool.status)}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Result
              </p>
            </div>
            <pre className="text-[12px] text-zinc-300 font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
              {tool.result}
            </pre>
          </div>
        )}
      </div>
    </Collapsible>
  );
};

const ToolCallBlockWrapper = ({ msg }: { msg: Message }) => (
  <Collapsible icon={<></>} label="tools" borderColor="border-amber-800/30">
    <div className="space-y-1 p-2">
      {msg.toolCalls?.map((tool) => (
        <ToolCallBlock key={tool.id} tool={tool} />
      ))}
    </div>
  </Collapsible>
);

// ─── Clarification block ──────────────────────────────────────────────────────

const ClarificationBlock: React.FC<{
  question: string;
  options: string[];
  answered: boolean;
  onSelect: (option: string) => void;
}> = ({ question, options, answered, onSelect }) => (
  <div className="flex flex-col gap-2 mt-1">
    <p className="text-[15px] text-zinc-200">{question}</p>
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          disabled={answered}
          onClick={() => onSelect(opt)}
          className={cn(
            "px-4 py-1.5 rounded-full border text-[13px] font-medium transition-all",
            answered
              ? "border-zinc-700 text-zinc-600 cursor-not-allowed"
              : "border-zinc-500 text-zinc-200 hover:bg-zinc-700 hover:border-zinc-400 cursor-pointer",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  </div>
);

// ─── Prose wrapper ────────────────────────────────────────────────────────────

const AssistantMarkdown: React.FC<{ content: string }> = ({ content }) => (
  <div
    className={cn(
      "prose prose-invert max-w-none",
      "prose-p:leading-relaxed prose-p:my-2",
      "prose-headings:text-zinc-100 prose-headings:font-semibold",
      "prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline",
      "prose-code:text-pink-300 prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:font-mono",
      "prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700/60 prose-pre:rounded-xl prose-pre:text-[13px]",
      "prose-pre:my-3 prose-pre:overflow-x-auto",
      "prose-blockquote:border-l-zinc-600 prose-blockquote:text-zinc-400",
      "prose-li:my-0.5",
      "prose-strong:text-zinc-100 prose-strong:font-semibold",
      "prose-hr:border-zinc-700",
      "prose-table:text-[13px]",
      "prose-th:text-zinc-300 prose-td:text-zinc-400",
    )}
  >
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
      {content}
    </Markdown>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const ChatUI: React.FC<ChatUIProps> = ({
  messages = [],
  onMessage,
  onAnswerClarification,
  loading = false,
}) => {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height =
      Math.min(el.scrollHeight, window.innerHeight * 0.35) + "px";
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onMessage(trimmed);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0A0F] rounded-md">
      {/* ── Message list ── */}
      <div className="flex-1">
        <div className="max-w-4xl w-full bg-red-500 mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
                <Bot className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-zinc-500 text-sm">
                Ask anything about to get started.
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={i}
                className={cn(
                  "flex gap-3",
                  isUser ? "justify-end" : "justify-start",
                )}
              >
                {!isUser && (
                  <div className="flex-shrink-0 w-7 h-7 mt-1 rounded-full bg-zinc-800 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-zinc-300" />
                  </div>
                )}

                {isUser ? (
                  <div className="max-w-[75%] bg-zinc-800 text-zinc-100 px-4 py-2.5 rounded-3xl rounded-tr-md text-[15px] leading-relaxed">
                    <p className="whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0 text-zinc-200 text-[15px] leading-relaxed space-y-1">
                    {msg.thinking && <ThinkingBlock thinking={msg.thinking} />}

                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <ToolCallBlockWrapper msg={msg} />
                    )}

                    {msg.content && <AssistantMarkdown content={msg.content} />}

                    {msg.clarification && (
                      <ClarificationBlock
                        question={msg.clarification.question}
                        options={msg.clarification.options}
                        answered={msg.clarification.answered}
                        onSelect={(option) => {
                          // 1. Mark buttons as answered (state lives in ChatComponent)
                          onAnswerClarification(msg.id, option);
                          // 2. Send option as next user message
                          onMessage(option);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-7 h-7 mt-1 rounded-full bg-zinc-800 flex items-center justify-center">
                <Bot className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="flex items-center gap-1.5 py-2">
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input ── */}
      {/* <div className="bg-[#0A0A0F] px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-zinc-900 border border-zinc-700/60 rounded-2xl px-4 py-2.5 focus-within:border-zinc-500 transition-colors">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message…"
              rows={1}
              autoFocus
              className={cn(
                "flex-1 resize-none border-none bg-transparent p-0 shadow-none",
                "text-[15px] text-zinc-100 placeholder:text-zinc-500",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "leading-relaxed",
              )}
            />
            <div className="flex items-center w-full justify-between">
              <div className="flex items-center gap-2">
                <input
                  // ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  // onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full text-gray-400 hover:text-white cursor-pointer hover:bg-white/10 px-3"
                  // onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4 mr-1" />
                  File
                </Button>
                <span className="text-xs text-gray-600">PDF, JPG, PNG</span>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={!input.trim() || loading}
                size="icon"
                className={cn(
                  "flex-shrink- cursor-pointer 0 w-8 h-8 rounded-full transition-all mb-0.5",
                  input.trim() && !loading
                    ? "bg-white text-black hover:bg-zinc-200"
                    : "bg-zinc-700 text-zinc-500 cursor-not-allowed",
                )}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUp className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-center text-[11px] text-zinc-600 mt-2">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div> */}
    </div>
  );
};

export default ChatUI;
