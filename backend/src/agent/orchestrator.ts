import {
  GoogleGenAI,
  Type,
  type Content,
  type Part,
  type Tool,
  type GenerateContentConfig,
} from "@google/genai";
import type { Message } from "../types";
import type { Response } from "express";
import { buildToolRegistry } from "./tools";
import { createHttpClient } from "./mcp";
import { SYSTEM_PROMPT } from "./prompt";

// ─── Types ────────────────────────────────────────────────────────────────────
const elasticMCP = await createHttpClient(
  "elastic-agent-builder",
  `${process.env.KIBANA_URL!}/api/agent_builder/mcp`,
  {
    Authorization: `ApiKey ${process.env.ELASTIC_API_KEY!}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
);

const registry = await buildToolRegistry(elasticMCP);

export type AgentContext = {
  userId: string;
  caseId: string;
  file: Express.Multer.File | null;
};

export type SSEEvent =
  | { type: "thinking"; text: string }
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
      status: "done" | "error";
    }
  | { type: "ask_user"; id: string; question: string; options: string[] }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

function send(res: Response, event: SSEEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export class Orchestrator {
  constructor(private ai: GoogleGenAI) {}

  // Convert chat history into Gemini Content format
  private buildContents(messages: Message[]): Content[] {
    return messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));
  }

  /**
   * Main agentic loop.
   *
   * Streams SSE events to `res`:
   *   thinking     → model reasoning tokens
   *   tool_call    → model requested a tool
   *   tool_result  → tool finished executing
   *   text         → final reply tokens
   *   done         → stream finished
   *   error        → something went wrong
   */
  async runAgentStream(
    context: AgentContext,
    messages: Message[],
    res: Response,
  ): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const file = context.file;

    const fileInstruction = file
      ? `User has uploaded a file: ${file.originalname}`
      : "";

    const contents: Content[] = this.buildContents(messages);
    const config: GenerateContentConfig = {
      tools: registry.schemas,
      thinkingConfig: { includeThoughts: true },
      systemInstruction: [SYSTEM_PROMPT, fileInstruction]
        .filter(Boolean)
        .join("\n\n"),
    };

    try {
      while (true) {
        console.log(contents);
        const stream = await this.ai.models.generateContentStream({
          model: "gemini-3.1-pro-preview",
          contents,
          config,
        });

        const modelParts: Part[] = [];

        const pendingToolCalls: Array<{
          id: string; // client-side UUID for SSE tracking
          name: string;
          input: Record<string, unknown>;
        }> = [];

        for await (const chunk of stream) {
          for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
            if (part.thought && part.text) {
              send(res, { type: "thinking", text: part.text });
              modelParts.push(part);
            } else if (part.text) {
              send(res, { type: "text", text: part.text });
              modelParts.push(part);
            } else if (part.functionCall) {
              const id = crypto.randomUUID();
              const name = part.functionCall.name!;
              const input = (part.functionCall.args ?? {}) as Record<
                string,
                unknown
              >;

              pendingToolCalls.push({ id, name, input });
              modelParts.push(part); // ← full part, thoughtSignature preserved

              send(res, { type: "tool_call", id, name, input });
            }
          }
        }

        if (pendingToolCalls.length === 0) break;

        contents.push({ role: "model", parts: modelParts });
        const askCall = pendingToolCalls.find((tc) => tc.name === "ask_user");

        if (askCall) {
          // Commit model turn with thoughtSignature intact
          contents.push({ role: "model", parts: modelParts });

          send(res, {
            type: "ask_user",
            id: askCall.id,
            question: askCall.input.question as string,
            options: askCall.input.options as string[],
          });

          send(res, { type: "done" });
          break;
        }
        const toolResults = await Promise.all(
          pendingToolCalls.map(async (tc) => {
            console.log(`calling tool ${tc.name}`);
            try {
              const result = await registry.execute(tc.name, tc.input, context);
              send(res, {
                type: "tool_result",
                id: tc.id,
                name: tc.name,
                result,
                status: "done",
              });
              return { name: tc.name, result };
            } catch (err) {
              const result = JSON.stringify({ error: String(err) });
              send(res, {
                type: "tool_result",
                id: tc.id,
                name: tc.name,
                result,
                status: "error",
              });
              return { name: tc.name, result };
            }
          }),
        );

        contents.push({
          role: "user",
          parts: toolResults.map((tr) => ({
            functionResponse: {
              name: tr.name,
              response: { output: tr.result },
            },
          })),
        });
      }

      send(res, { type: "done" });
    } catch (err) {
      console.error("Agent error:", err);
      send(res, { type: "error", message: String(err) });
    } finally {
      res.end();
    }
  }
}
