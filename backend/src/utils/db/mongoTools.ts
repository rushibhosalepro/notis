import { ObjectId } from "mongodb";
import { Type, type Tool as GoogleToolSchema } from "@google/genai";
import type { AgentContext } from "../../agent/orchestrator";
import type {
  CaseStatus,
  DraftResponse,
  Message,
  NoticeDetails,
} from "../../types";
import { casesCol } from "./mongo";

// ── Tool Functions ─────────────────────────────────────────────────────────

export async function updateCaseStatus(args: {
  caseId: string;
  status: CaseStatus;
  event: string;
  noticeDetails?: Partial<NoticeDetails>;
  agentNotes?: string[];
}): Promise<string> {
  const col = await casesCol();

  const update: Record<string, unknown> = {
    status: args.status,
    updatedAt: new Date(),
  };

  if (args.noticeDetails) {
    Object.entries(args.noticeDetails).forEach(([k, v]) => {
      update[`noticeDetails.${k}`] = v;
    });
  }

  const notesToPush = [
    `[${new Date().toISOString()}] ${args.event}`,
    ...(args.agentNotes ?? []),
  ];

  await col.updateOne(
    { caseId: args.caseId },
    {
      $set: update,
      $push: {
        agentNotes: { $each: notesToPush },
      } as any,
    },
  );

  console.log(`[MongoDB] Case ${args.caseId} → ${args.status}: ${args.event}`);
  return JSON.stringify({
    success: true,
    caseId: args.caseId,
    status: args.status,
  });
}

export async function saveDraftResponse(args: {
  caseId: string;
  content: string;
}): Promise<string> {
  const col = await casesCol();

  const draft: DraftResponse = {
    _id: new ObjectId(),
    draftId: `draft-${new ObjectId().toHexString()}`,
    content: args.content,
    generatedAt: new Date(),
    status: "DRAFT",
  };

  await col.updateOne(
    { caseId: args.caseId },
    {
      $push: { drafts: draft } as any,
      $set: { status: "DRAFTING", updatedAt: new Date() },
    },
  );

  console.log(`[MongoDB] Draft saved for case ${args.caseId}`);
  return JSON.stringify({ success: true, draftId: draft.draftId });
}

export async function getCase(args: { caseId: string }): Promise<string> {
  const col = await casesCol();
  const c = await col.findOne(
    { caseId: args.caseId },
    {
      projection: {
        caseId: 1,
        userId: 1,
        status: 1,
        noticeDetails: 1,
        agentNotes: 1,
        drafts: { $slice: -1 },
        createdAt: 1,
        updatedAt: 1,
      },
    },
  );

  if (!c) return JSON.stringify({ error: `Case ${args.caseId} not found` });
  return JSON.stringify(c);
}

export async function appendMessage(args: {
  caseId: string;
  role: "user" | "assistant";
  content: string;
}): Promise<string> {
  const col = await casesCol();

  const message: Message = {
    _id: new ObjectId(),
    messageId: `msg-${new ObjectId().toHexString()}`,
    role: args.role,
    content: args.content,
    createdAt: new Date(),
  };

  await col.updateOne(
    { caseId: args.caseId },
    {
      $push: { messages: message } as any,
      $set: { updatedAt: new Date() },
    },
  );

  return JSON.stringify({ success: true, messageId: message.messageId });
}

// ── Schemas ────────────────────────────────────────────────────────────────

export const mongoToolSchemas: GoogleToolSchema[] = [
  {
    functionDeclarations: [
      {
        name: "update_case_status",
        description:
          "Updates the status of the current case and logs a timeline event. " +
          "Valid transitions: ANALYZING → DOCS_NEEDED → DRAFTING → SUBMITTED → CLOSED. " +
          "Also use to persist extracted notice details (noticeType, demandAmount, arnNumber, etc.).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            status: {
              type: Type.STRING,
              enum: [
                "ANALYZING",
                "DOCS_NEEDED",
                "DRAFTING",
                "SUBMITTED",
                "CLOSED",
              ],
              description:
                "New status. Never use OPEN — that is set at case creation.",
            },
            event: {
              type: Type.STRING,
              description:
                "Short description of what happened, e.g. 'Extracted demand amount ₹84,320 from ASMT-10 notice'.",
            },
            noticeDetails: {
              type: Type.OBJECT,
              description:
                "Partial notice fields to merge — only include what you extracted.",
              properties: {
                noticeType: {
                  type: Type.STRING,
                  enum: [
                    "ASMT-10",
                    "DRC-01",
                    "DRC-03",
                    "GSTR-2A_MISMATCH",
                    "SCN",
                    "OTHER",
                  ],
                },
                arnNumber: { type: Type.STRING },
                demandAmount: { type: Type.NUMBER },
                gstin: { type: Type.STRING },
                sections: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                dueDate: {
                  type: Type.STRING,
                  description:
                    "ISO 8601 date string e.g. '2025-03-31T00:00:00.000Z'",
                },
              },
            },
            agentNotes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                "Internal notes not shown to the user. Each item is one observation, " +
                "e.g. ['ITC mismatch found', 'Section 73 likely applicable'].",
            },
          },
          required: ["status", "event"],
        },
      },

      {
        name: "save_draft_response",
        description:
          "Saves a completed draft response letter to the current case. " +
          "Only call when the full letter is ready — it will be shown to the user for review.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            content: {
              type: Type.STRING,
              description:
                "Full text of the official GST response letter including " +
                "reference number, subject line, body, and signature block.",
            },
          },
          required: ["content"],
        },
      },

      {
        name: "get_case",
        description:
          "Fetches the current case — status, notice details, agent notes, latest draft. " +
          "Use at the start of a new turn to recall prior state.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: [],
        },
      },
    ],
  },
];

// ── Executor ───────────────────────────────────────────────────────────────

export async function executeMongoTool(
  name: string,
  args: Record<string, unknown>,
  context: AgentContext,
): Promise<string> {
  switch (name) {
    case "update_case_status":
      return updateCaseStatus({
        caseId: context.caseId,
        ...(args as Omit<Parameters<typeof updateCaseStatus>[0], "caseId">),
      });

    case "save_draft_response":
      return saveDraftResponse({
        caseId: context.caseId,
        ...(args as Omit<Parameters<typeof saveDraftResponse>[0], "caseId">),
      });

    case "get_case":
      return getCase({ caseId: context.caseId });

    default:
      throw new Error(`Unknown MongoDB tool: ${name}`);
  }
}
