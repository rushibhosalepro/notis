"use client";
import React, { useState } from "react";
import { Message, ToolCall } from "../types";
import { cn } from "../lib/utils";
import {
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Image,
  Loader2,
  Wrench,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Props {
  messages: Message[];
}

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
          <pre className="text-[12px] text-zinc-300 font-mono whitespace-pre-wrap wrap-break-word">
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
            <pre className="text-[12px] text-zinc-300 font-mono whitespace-pre-wrap wrap-break-word max-h-48 overflow-y-auto">
              {tool.result}
            </pre>
          </div>
        )}
      </div>
    </Collapsible>
  );
};

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

const ThinkingBlock: React.FC<{ thinking: string }> = ({ thinking }) => (
  <Collapsible
    icon={<Brain className="w-3.5 h-3.5" />}
    label="Reasoning"
    badge="thinking"
    badgeColor="bg-purple-900/60 text-purple-300"
    borderColor="border-purple-800/40"
  >
    <div className="px-4 py-3 text-[13px] text-zinc-400 leading-relaxed font-mono whitespace-pre-wrap max-h-72 overflow-y-auto">
      <Markdown>{thinking}</Markdown>
    </div>
  </Collapsible>
);

const ToolCallBlockWrapper = ({ toolCalls }: { toolCalls: ToolCall[] }) => (
  <Collapsible icon={<></>} label="tools" borderColor="border-amber-800/30">
    <div className="space-y-1 p-2">
      {toolCalls?.map((tool) => (
        <ToolCallBlock key={tool.id} tool={tool} />
      ))}
    </div>
  </Collapsible>
);

const isPdf = (file: File) => file.type === "application/pdf";
const isImage = (file: File) =>
  file.type === "image/png" ||
  file.type === "image/jpeg" ||
  file.type === "image/jpg";

const FilePreview: React.FC<{ file: File }> = ({ file }) => {
  const [previewUrl] = useState(() =>
    isImage(file) ? URL.createObjectURL(file) : null,
  );

  if (isPdf(file)) {
    return (
      <div className="flex items-center gap-3 bg-zinc-800/80 border border-zinc-700/50 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[260px]">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-red-950/60 border border-red-800/40 flex items-center justify-center">
          <FileText className="w-4 h-4 text-red-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-200 truncate">
            {file.name}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5 uppercase tracking-wide">
            PDF document
          </p>
        </div>
      </div>
    );
  }

  if (isImage(file) && previewUrl) {
    return (
      <div className="bg-zinc-800/80 border border-zinc-700/50 rounded-2xl rounded-tr-sm overflow-hidden max-w-[260px]">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={file.name}
            className="w-full max-h-40 object-cover"
          />
          <div className="absolute top-2 left-2">
            <span className="flex items-center gap-1 bg-zinc-900/70 backdrop-blur-sm text-zinc-300 text-[10px] px-2 py-0.5 rounded-full border border-zinc-700/50">
              <Image className="w-3 h-3" />
              {file.type === "image/png" ? "PNG" : "JPG"}
            </span>
          </div>
        </div>
        <div className="px-3 py-2 border-t border-zinc-700/40">
          <p className="text-[12px] text-zinc-300 truncate">{file.name}</p>
        </div>
      </div>
    );
  }

  // fallback
  return (
    <div className="flex items-center gap-3 bg-zinc-800/80 border border-zinc-700/50 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[260px]">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-zinc-700/60 border border-zinc-600/40 flex items-center justify-center">
        <FileText className="w-4 h-4 text-zinc-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-zinc-200 truncate">
          {file.name}
        </p>
        <p className="text-[11px] text-zinc-500 mt-0.5">Attached file</p>
      </div>
    </div>
  );
};

const ChatBox = ({ messages }: Props) => {
  return (
    <div className="space-y-6">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
            <Bot className="w-6 h-6 text-zinc-400" />
          </div>
          <p className="text-zinc-500 text-sm max-w-[215px]">
            Upload GST Notis to Get started or ask me anything about GST
          </p>
        </div>
      )}
      {messages.map((msg) => {
        const isUser = msg.role === "user";
        return (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            {!isUser && (
              <div className="shrink-0 w-7 h-7 mt-1 rounded-full bg-zinc-800 flex items-center justify-center">
                <Bot className="w-4 h-4 text-zinc-300" />
              </div>
            )}

            {isUser ? (
              <div className="flex flex-col items-end gap-2">
                {msg.file && <FilePreview file={msg.file} />}
                {msg.content && (
                  <div className="max-w-[75%] bg-zinc-800 text-zinc-100 px-4 py-2.5 rounded-3xl rounded-tr-md text-[15px] leading-relaxed">
                    <p className="whitespace-pre-wrap wrap-break-word">
                      {msg.content}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 min-w-0 text-zinc-200 text-[15px] leading-relaxed space-y-1">
                {msg.thinking && <ThinkingBlock thinking={msg.thinking} />}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <ToolCallBlockWrapper toolCalls={msg.toolCalls} />
                )}
                {msg.content && <AssistantMarkdown content={msg.content} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ChatBox;
