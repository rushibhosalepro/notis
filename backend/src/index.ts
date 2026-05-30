import express from "express";
import cors from "cors";
import { casesCol } from "./utils/db/mongo";
import type { Case, Message } from "./types";
import { ObjectId } from "mongodb";
import { Orchestrator } from "./agent/orchestrator";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import path from "path";
import fs from "fs";
import { ai } from "./agent/client";

const app = express();
app.use(cors());
app.use(express.json());

const orchestrator = new Orchestrator(ai);
const PORT = process.env.PORT || 3001;
const upload = multer({
  dest: path.join(process.cwd(), "tmp/uploads"),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10mb
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Invalid file type"));
  },
});
// ─── Start a new case ─────────────────────────────────────────────────────────

app.post("/api/cases/start", async (req, res) => {
  try {
    const { prompt, userId } = req.body;
    if (!prompt)
      return res.status(400).json({ ok: false, error: "prompt is required" });
    if (!userId)
      return res.status(400).json({ ok: false, error: "userId is required" });

    const now = new Date();
    const caseId = new ObjectId().toHexString();

    const firstMessage: Message = {
      _id: new ObjectId(),
      messageId: `msg-${new ObjectId().toHexString()}`,
      role: "user",
      content: prompt,
      createdAt: now,
    };

    const newCase: Case = {
      _id: new ObjectId(),
      caseId,
      userId,
      messages: [firstMessage],
      status: "OPEN",
      files: [],
      drafts: [],
      agentNotes: [],
      createdAt: now,
      updatedAt: now,
    };

    await (await casesCol()).insertOne(newCase);
    return res.status(201).json({ ok: true, caseId, case: newCase });
  } catch (err) {
    console.error("Failed to start case:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// ─── Streaming chat ───────────────────────────────────────────────────────────
// Sends Server-Sent Events. Each event is a JSON line:
//
//   { type: "thinking",     text: "…" }           ← reasoning token
//   { type: "tool_call",    id, name, input }      ← tool invoked
//   { type: "tool_result",  id, name, result, status } ← tool output
//   { type: "text",         text: "…" }            ← reply token
//   { type: "done" }                               ← stream finished
//   { type: "error",        message: "…" }         ← something failed

app.post("/api/chat", upload.single("file"), async (req, res) => {
  // formdata sends messages as string, JSON body already parsed by express
  const messages =
    typeof req.body.messages === "string"
      ? JSON.parse(req.body.messages)
      : req.body.messages;

  const userId = req.body.userId;
  const caseId = req.body.caseId;
  const file = req.file ?? null;

  if (!messages || !Array.isArray(messages)) {
    return res
      .status(400)
      .json({ ok: false, error: "messages array is required" });
  }

  try {
    await orchestrator.runAgentStream({ userId, caseId, file }, messages, res);
  } finally {
    // if (file?.path) {
    //   fs.unlink(file.path, (err) => {
    //     if (err) console.error("failed to delete temp file", err);
    //   });
    // }
  }
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.listen(Number(PORT), () => console.log(`Server running on port ${PORT}`));
