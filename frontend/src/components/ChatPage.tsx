"use client";
import { ArrowUp, LoaderCircle, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Message } from "../types";
import ChatBox from "./ChatBox";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Textarea } from "./ui/textarea";
import { SERVER_URL } from "../lib/utils";
import { useCaseStore } from "../stores/useCaseStore";

interface Props {
  userId: string;
  caseId: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  status?: "pending" | "running" | "done" | "error";
}

type SSEEvent =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      result: string;
      status: ToolCall["status"];
    }
  | { type: "ask_user"; id: string; question: string; options: string[] }
  | { type: "done" }
  | { type: "error"; message: string };

const ChatPage = ({ caseId, userId }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const { pending, clearPending } = useCaseStore();
  const hasAutoSent = useRef(false);

  useEffect(() => {
    if (hasAutoSent.current || !pending) return;
    const callInitialRequest = async () => {
      hasAutoSent.current = true;
      const { prompt, file } = pending;
      clearPending();
      await handleChat(prompt, file);
    };

    callInitialRequest();
  }, []);
  function clearImageSelection() {
    setFile(null);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }
  async function handleChat(
    overridePrompt?: string,
    overrideFile?: File | null,
  ) {
    const currentInput = overridePrompt ?? input;
    const currentFile = overrideFile !== undefined ? overrideFile : file;

    if (!currentInput.trim() && !currentFile) return;

    setLoading(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: currentInput,
      ...(currentFile ? { file: currentFile } : {}),
    };

    const history = [...messages, userMessage];

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    clearImageSelection();
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        thinking: undefined,
        toolCalls: [],
      },
    ]);

    const updateAssistant = (updater: (prev: Message) => Message) => {
      setMessages((msgs) =>
        msgs.map((m) => (m.id === assistantId ? updater(m) : m)),
      );
    };

    try {
      let response: Response;

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("userId", userId);
        formData.append("caseId", caseId);
        formData.append("messages", JSON.stringify(history));
        response = await fetch(`${SERVER_URL}/chat`, {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch(`${SERVER_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, caseId, userId }),
        });
      }

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: SSEEvent;
          try {
            event = JSON.parse(raw) as SSEEvent;
          } catch {
            continue;
          }

          switch (event.type) {
            case "thinking":
              updateAssistant((m) => ({
                ...m,
                thinking: (m.thinking ?? "") + event.text,
              }));
              break;

            case "text":
              updateAssistant((m) => ({
                ...m,
                content: m.content + event.text,
              }));
              break;

            case "tool_call":
              updateAssistant((m) => ({
                ...m,
                toolCalls: [
                  ...(m.toolCalls ?? []),
                  {
                    id: event.id,
                    name: event.name,
                    input: event.input,
                    status: "running" as const,
                  },
                ],
              }));
              break;

            case "tool_result":
              updateAssistant((m) => ({
                ...m,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.id === event.id
                    ? { ...tc, result: event.result, status: event.status }
                    : tc,
                ),
              }));
              break;

            case "ask_user":
              updateAssistant((m) => ({
                ...m,
                clarification: {
                  id: event.id,
                  question: event.question,
                  options: event.options,
                  answered: false,
                },
              }));
              break;

            case "error":
              updateAssistant((m) => ({
                ...m,
                content:
                  m.content || "Sorry, something went wrong. Please try again.",
              }));
              break;

            case "done":
              break;
          }
        }
      }
    } catch (error) {
      console.error("error in chat session", error);
      updateAssistant((m) => ({
        ...m,
        content: m.content || "Sorry, something went wrong. Please try again.",
      }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-black h-screen w-full text-white overflow-hidden relative">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 h-14">
        <div className="max-w-7xl w-full mx-auto h-full flex items-center px-4">
          <span className="text-xl font-semibold tracking-tight">
            N<span className="text-emerald-500">ō</span>tis
          </span>
        </div>
      </header>

      {/* Scrollable messages */}
      <div className="h-full overflow-y-auto pt-14 pb-44 scroll-smooth">
        <div className="max-w-3xl w-full mx-auto px-4 py-6">
          <ChatBox messages={messages} />
        </div>
      </div>

      {/* Input bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="max-w-2xl w-full mx-auto px-4 py-4">
          <Card className="w-full rounded-3xl border border-white/10 bg-[#111] p-0 shadow-2xl">
            <div className="flex flex-col gap-3 p-2">
              {file && (
                <div className="flex items-center gap-2 px-1">
                  <span className="flex items-center gap-1.5 bg-emerald-900/40 text-emerald-400 text-xs font-medium px-3 py-1 rounded-full border border-emerald-700/40">
                    <Paperclip className="h-3 w-3" />
                    {file.name}
                    <button
                      onClick={clearImageSelection}
                      className="ml-1 hover:text-white cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              )}

              <Textarea
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleChat();
                  }
                }}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask next question here..."
                className="min-h-2 max-h-[35vh] resize-none md:text-base border-none bg-transparent text-white placeholder:text-gray-500 focus-visible:ring-0"
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => fileRef.current?.click()}
                    className="rounded-full text-gray-400 hover:text-white cursor-pointer hover:bg-white/10 px-3"
                  >
                    <Paperclip className="h-4 w-4 mr-1" />
                    Upload Image
                  </Button>
                  <span className="text-xs text-gray-600">PDF, JPG, PNG</span>
                </div>

                <Button
                  onClick={() => handleChat()}
                  disabled={(!input.trim() && !file) || loading}
                  size="icon"
                  className="rounded-full text-gray-400 bg-gray-100/20 hover:bg-gray-100/10 cursor-pointer px-3 hover:text-white disabled:opacity-30"
                >
                  {loading ? (
                    <LoaderCircle className="w-5 h-5 animate-spin" />
                  ) : (
                    <ArrowUp className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
