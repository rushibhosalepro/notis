"use client";
import React, { useState } from "react";
import { Message, ToolCall } from "../types";
import { cn, SERVER_URL, userId } from "../lib/utils";
import ChatUI from "./ChatUI";

interface Props {
  caseId: string;
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

const ChatComponent = ({ caseId }: Props) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "user",
      content: "asdjh asdhhasdh asd ajsdh jhsdh jsdhj sd",
      id: "1",
    },
    {
      role: "user",
      content: "asdjh asdhhasdh asd ajsdh jhsdh jsdhj sd",
      id: "2",
    },
    {
      role: "assistant",
      content:
        "asdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sdasdjh asdhhasdh asd ajsdh jhsdh jsdhj sd",
      id: "4",
    },
  ]);
  const [loading, setLoading] = useState(false);

  function answerClarification(messageId: string, _option: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.clarification
          ? { ...m, clarification: { ...m.clarification, answered: true } }
          : m,
      ),
    );
  }

  async function chat(msg: string) {
    if (!msg.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: msg.trim(),
      id: crypto.randomUUID(),
    };
    const history = [...messages, userMessage];
    setMessages(history);
    setLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "",
        id: assistantId,
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
      const response = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, caseId, userId }),
      });

      if (!response.ok || !response.body)
        throw new Error(`HTTP ${response.status}`);

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
      console.error("Chat error:", error);
      updateAssistant((m) => ({
        ...m,
        content: m.content || "Sorry, something went wrong. Please try again.",
      }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="min-h-screen bg-[#0A0A0F] text-[#1a1a18] font-sans overflow-x-hidden">
      <div className="h-screen max-w-4xl mx-auto">
        <header className="h-12 flex items-center gap-2">
          <div
            className={cn(
              "w-full flex items-center justify-between transition-all duration-300",
            )}
          >
            <div className="flex items-center gap-2 text-white">
              <span className="text-xl font-semibold tracking-tight">
                N<span className="text-emerald-500">ō</span>tis
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 flex items-center max-h-[calc(100%-48px)] h-[calc(100%-48px)]  overflow-y-auto">
          <div className={cn("w-full h-full transition-all duration-300  p-2")}>
            <ChatUI
              loading={loading}
              messages={messages}
              onMessage={chat}
              onAnswerClarification={answerClarification}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default ChatComponent;
