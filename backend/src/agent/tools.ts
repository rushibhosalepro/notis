import {
  Type,
  type Tool as GoogleToolSchema,
  type Schema,
} from "@google/genai";
import type { MCP } from "./mcp.js";
import type { AgentContext } from "./orchestrator.js";
import * as fs from "node:fs";
import { ai } from "./client.js";
import { executeMongoTool, mongoToolSchemas } from "../utils/db/mongoTools.js";

export interface ToolRegistry {
  schemas: GoogleToolSchema[];
  execute: (
    name: string,
    args: Record<string, unknown>,
    context: AgentContext,
  ) => Promise<string>;
}

// ── Manual tool schemas ────────────────────────────────────────────────────

export const manualToolSchema: GoogleToolSchema[] = [
  {
    functionDeclarations: [
      {
        name: "analyze_file",
        description:
          "Analyze an uploaded GST notice image or PDF and extract structured information",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: [],
        },
      },
      {
        name: "ask_user",
        description:
          "Ask the user a clarifying question with predefined options when critical information is missing. Only use when you cannot reasonably infer the answer. Ask ONE question at a time.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            question: {
              type: Type.STRING,
              description: "The clarifying question to show the user.",
            },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                "2-4 short answer options for the user to pick from.",
            },
          },
          required: ["question", "options"],
        },
      },
    ],
  },
];

// ── JSON Schema → Google GenAI Schema ─────────────────────────────────────

const mapJsonSchemaToGoogleSchema = (jsonSchema: any): Schema => {
  if (!jsonSchema) return { type: Type.OBJECT, properties: {} };

  const typeMap: Record<string, Type> = {
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
    object: Type.OBJECT,
  };

  const schema: Schema = {
    type: typeMap[jsonSchema.type] ?? Type.OBJECT,
  };

  if (jsonSchema.description) schema.description = jsonSchema.description;
  if (jsonSchema.enum) schema.enum = jsonSchema.enum;

  if (jsonSchema.properties) {
    schema.properties = Object.fromEntries(
      Object.entries(jsonSchema.properties).map(([key, value]) => [
        key,
        mapJsonSchemaToGoogleSchema(value),
      ]),
    );
  }

  if (jsonSchema.required) schema.required = jsonSchema.required;
  if (jsonSchema.items)
    schema.items = mapJsonSchemaToGoogleSchema(jsonSchema.items);

  return schema;
};

// ── Manual tool executors ──────────────────────────────────────────────────

const manualTools: Record<
  string,
  (args: any, ctx: AgentContext) => Promise<string>
> = {
  analyze_file: async (_args, context) => {
    try {
      const file = context.file;
      if (!file?.path) return JSON.stringify({ error: "no file provided" });

      const base64 = fs.readFileSync(file.path, { encoding: "base64" });
      const mimeType = file.mimetype as
        | "image/jpeg"
        | "image/png"
        | "application/pdf";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { inlineData: { mimeType, data: base64 } },
          {
            text: `You are a GST document analyzer. Extract all relevant information 
from this GST notice and return a JSON object with these fields if present:
noticeType, arnNumber, gstin, demandAmount, taxPeriod, reason, dueDate, issuedBy,state
Return ONLY valid JSON, no explanation.`,
          },
        ],
      });

      return (
        response.text ?? JSON.stringify({ error: "no response from model" })
      );
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  // ask_user is handled specially in the orchestrator — not executed here
  ask_user: async (args) => JSON.stringify(args),
};

// ── Build unified registry ─────────────────────────────────────────────────

export const buildToolRegistry = async (
  elasticMCP: MCP,
): Promise<ToolRegistry> => {
  // 1. Elastic MCP tools
  const elasticMCPTools = await elasticMCP.listTools();
  const elasticSchemas: GoogleToolSchema[] = [
    {
      functionDeclarations: elasticMCPTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: mapJsonSchemaToGoogleSchema(tool.inputSchema),
      })),
    },
  ];

  console.log(
    `[Registry] Elastic tools: ${elasticMCPTools.map((t) => t.name).join(", ")}`,
  );
  console.log(
    `[Registry] Mongo tools: update_case_status, save_draft_response, get_case`,
  );
  console.log(`[Registry] Manual tools: analyze_file, ask_user`);

  // 2. Merge all schemas
  const schemas = [...elasticSchemas, ...mongoToolSchemas, ...manualToolSchema];

  // 3. Single execute function — routes to correct handler
  const execute = async (
    name: string,
    args: Record<string, unknown>,
    context: AgentContext,
  ): Promise<string> => {
    // Manual tools (analyze_file, ask_user)
    if (name in manualTools) {
      console.log(`[Registry] → Manual: ${name}`);
      return manualTools[name](args, context) ?? "";
    }

    // MongoDB tools
    // tools.ts — pass context through to executeMongoTool

    const mongoNames = [
      "update_case_status",
      "save_draft_response",
      "get_case",
    ];
    if (mongoNames.includes(name)) {
      console.log(`[Registry] → MongoDB: ${name}`);
      return executeMongoTool(name, args, context); // ← context was already there, just forward it
    }

    // Elastic MCP tools (everything else)
    console.log(`[Registry] → Elastic: ${name}`);
    return elasticMCP.callTool(name, args);
  };

  return { schemas, execute };
};
