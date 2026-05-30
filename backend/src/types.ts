import { ObjectId } from "mongodb";

export type Role = "user" | "assistant";

export type CaseStatus =
  | "OPEN"
  | "ANALYZING"
  | "DOCS_NEEDED"
  | "DRAFTING"
  | "SUBMITTED"
  | "CLOSED";

export type NoticeType =
  | "ASMT-10"
  | "DRC-01"
  | "DRC-03"
  | "GSTR-2A_MISMATCH"
  | "SCN"
  | "OTHER";

export type MimeType = "application/pdf" | "image/jpeg" | "image/png";

export type DraftStatus = "DRAFT" | "REVIEWED" | "FILED";

export interface TaxPeriod {
  quarter?: "Q1" | "Q2" | "Q3" | "Q4";
  financialYear: string; // e.g. "FY2024"
  month?: number; // 1–12 for monthly filers
}

export interface FileAnalysis {
  analyzedAt: Date;
  rawText: string; // extracted text from OCR / PDF parse
  noticeDetails?: Partial<NoticeDetails>;
  confidence: number; // 0–1
  warnings?: string[]; // e.g. ["Due date unclear", "GSTIN not found"]
}

export interface NoticeDetails {
  noticeType: NoticeType;
  arnNumber?: string; // e.g. "AR2402150001234"
  gstin?: string;
  demandAmount?: number; // in INR rupees
  taxPeriod?: TaxPeriod;
  sections?: string[]; // CGST Act sections e.g. ["Section 73", "Section 16(2)"]
  issuedAt?: Date;
  dueDate?: Date; // response deadline
}

export interface Message {
  _id: ObjectId;
  messageId: string;
  role: Role;
  content: string;
  createdAt: Date;
}

export interface File {
  _id: ObjectId;
  fileId: string;
  path: string;
  name: string;
  mimeType: MimeType;
  createdAt: Date;
  analysis?: FileAnalysis;
}

export interface DraftResponse {
  _id: ObjectId;
  draftId: string;
  content: string;
  generatedAt: Date;
  status: DraftStatus;
  filedAt?: Date;
  referenceNumber?: string;
}

export interface Case {
  _id: ObjectId;
  caseId: string;
  userId: string;
  messages: Message[];
  status: CaseStatus;
  files?: File[];
  noticeDetails?: NoticeDetails;
  drafts?: DraftResponse[];
  agentNotes?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  _id: ObjectId;
  userId: string;
  name: string;
  email: string;
  gstin?: string;
  cases?: Case[];
  createdAt: Date;
  updatedAt: Date;
}
