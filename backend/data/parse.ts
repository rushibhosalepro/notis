// import * as pdfParse from "pdf-parse";
import { GoogleGenAI } from "@google/genai";
import { readFileSync, writeFileSync } from "fs";
import path, { join } from "path";
import { extractText } from "unpdf";
const pdfParse = require("pdf-parse").default;
interface BaseDocument {
  id: string;
  type: string;
  content: string;
  keywords: string[];
  noticeTypes: string[];
  category: string;
  source: string;
}

interface CGSTSection extends BaseDocument {
  type: "cgst_act";
  sectionNumber: string;
  title: string;
  chapter: string;
}

interface AmendmentSection extends BaseDocument {
  type: "amendment";
  sectionNumber: string;
  title: string;
  chapter: string;
  amendmentType: "substituted" | "inserted" | "omitted";
  effectiveDate: string;
  originalContent?: string;
}

interface Circular extends BaseDocument {
  type: "circular";
  circularNumber: string;
  subject: string;
  issuedDate: string;
  relatedSections: string[];
}

interface SGSTSection extends BaseDocument {
  type: "sgst_act";
  sectionNumber: string;
  title: string;
  chapter: string;
  state: "MH" | "KA" | "DL";
  deviatesFromCGST: boolean;
  cgstEquivalent?: string;
}

type GSTDocument = CGSTSection | AmendmentSection | Circular | SGSTSection;

// ── Parser Config ──────────────────────────────────────────────────────────

interface ParserConfig {
  source: string;
  indexName: string;
  prompt: string;
  mapResult: (raw: any) => Omit<GSTDocument, "id">;
}

const CATEGORY_LIST =
  "levy_and_collection | input_tax_credit | registration | invoicing_and_records | returns | payment_and_refund | assessment | audit | inspection_search_seizure | demands_and_recovery | liability | advance_ruling | appeals | offences_and_penalties | transitional | miscellaneous";

const SECTION_FIELDS = `
- sectionNumber: e.g. "73"
- title: section heading
- content: full clean legal text, remove footnotes and amendment markers
- chapter: e.g. "CHAPTER XII ASSESSMENT"
- noticeTypes: GST notice types this relates to e.g. ["DRC-01", "SCN"] or []
- keywords: 5-10 key legal terms
- category: one of ${CATEGORY_LIST}`;

const CONFIGS: Record<string, ParserConfig> = {
  cgst_2017: {
    source: "CGST_ACT_2017",
    indexName: "gst-cgst-2017",
    prompt: `You are a legal document parser for Indian GST law.
Extract ALL sections from the CGST Act 2017 text chunk.
Return ONLY a valid JSON array — no explanation, no markdown, no code blocks.

Each object must have:${SECTION_FIELDS}

Return [] if no complete sections found.`,
    mapResult: (raw) => ({
      type: "cgst_act",
      sectionNumber: raw.sectionNumber,
      title: raw.title,
      content: raw.content,
      chapter: raw.chapter,
      noticeTypes: raw.noticeTypes ?? [],
      keywords: raw.keywords ?? [],
      category: raw.category,
      source: "CGST_ACT_2017",
    }),
  },

  finance_act_2023: {
    source: "FINANCE_ACT_2023",
    indexName: "gst-amendments-2023",
    prompt: `You are a legal document parser for Indian GST amendments.
Extract ALL amendments from the Finance Act 2023 text chunk.
Return ONLY a valid JSON array — no explanation, no markdown, no code blocks.

Each object must have:
- sectionNumber: the CGST Act section being amended e.g. "16"
- title: section heading
- content: the new amended text
- originalContent: the old text if mentioned, otherwise omit
- amendmentType: "substituted" | "inserted" | "omitted"
- effectiveDate: date string if mentioned e.g. "2023-10-01", default "2023-04-01"
- chapter: chapter reference
- noticeTypes: related GST notice types or []
- keywords: 5-10 key legal terms
- category: one of ${CATEGORY_LIST}

Return [] if no complete amendments found.`,
    mapResult: (raw) => ({
      type: "amendment",
      sectionNumber: raw.sectionNumber,
      title: raw.title,
      content: raw.content,
      originalContent: raw.originalContent,
      amendmentType: raw.amendmentType ?? "substituted",
      effectiveDate: raw.effectiveDate ?? "2023-04-01",
      chapter: raw.chapter,
      noticeTypes: raw.noticeTypes ?? [],
      keywords: raw.keywords ?? [],
      category: raw.category,
      source: "FINANCE_ACT_2023",
    }),
  },

  finance_act_2026: {
    source: "FINANCE_ACT_2026",
    indexName: "gst-amendments-2026",
    prompt: `You are a legal document parser for Indian GST amendments.
Extract ALL amendments from the Finance Act 2026 text chunk.
Return ONLY a valid JSON array — no explanation, no markdown, no code blocks.

Each object must have:
- sectionNumber: the CGST Act section being amended e.g. "16"
- title: section heading
- content: the new amended text
- originalContent: the old text if mentioned, otherwise omit
- amendmentType: "substituted" | "inserted" | "omitted"
- effectiveDate: date string if mentioned e.g. "2026-04-01", default "2026-04-01"
- chapter: chapter reference
- noticeTypes: related GST notice types or []
- keywords: 5-10 key legal terms
- category: one of ${CATEGORY_LIST}

Return [] if no complete amendments found.`,
    mapResult: (raw) => ({
      type: "amendment",
      sectionNumber: raw.sectionNumber,
      title: raw.title,
      content: raw.content,
      originalContent: raw.originalContent,
      amendmentType: raw.amendmentType ?? "substituted",
      effectiveDate: raw.effectiveDate ?? "2026-04-01",
      chapter: raw.chapter,
      noticeTypes: raw.noticeTypes ?? [],
      keywords: raw.keywords ?? [],
      category: raw.category,
      source: "FINANCE_ACT_2026",
    }),
  },

  circular: {
    source: "CBIC_CIRCULAR",
    indexName: "gst-circulars",
    prompt: `You are a legal document parser for CBIC GST circulars.
Extract ALL circulars from the text chunk.
Return ONLY a valid JSON array — no explanation, no markdown, no code blocks.

Each object must have:
- circularNumber: e.g. "Circular No. 183/15/2022-GST"
- subject: the subject line of the circular
- content: full clean text of the circular
- issuedDate: date string e.g. "2022-12-27"
- relatedSections: CGST Act sections referenced e.g. ["Section 73", "Section 16(2)"]
- noticeTypes: GST notice types referenced e.g. ["DRC-01"] or []
- keywords: 5-10 key legal terms
- category: one of ${CATEGORY_LIST}

Return [] if no complete circulars found.`,
    mapResult: (raw) => ({
      type: "circular",
      circularNumber: raw.circularNumber,
      subject: raw.subject,
      content: raw.content,
      issuedDate: raw.issuedDate,
      relatedSections: raw.relatedSections ?? [],
      noticeTypes: raw.noticeTypes ?? [],
      keywords: raw.keywords ?? [],
      category: raw.category,
      source: "CBIC_CIRCULAR",
    }),
  },

  sgst_mh: {
    source: "SGST_ACT_MH",
    indexName: "gst-sgst-mh",
    prompt: `You are a legal document parser for the Maharashtra SGST Act.
Extract ALL sections from the text chunk.
Return ONLY a valid JSON array — no explanation, no markdown, no code blocks.

Each object must have:${SECTION_FIELDS}
- deviatesFromCGST: true if this section differs from the central CGST Act, false if identical
- cgstEquivalent: the equivalent CGST Act section number e.g. "73" (omit if no equivalent)

Return [] if no complete sections found.`,
    mapResult: (raw) => ({
      type: "sgst_act",
      sectionNumber: raw.sectionNumber,
      title: raw.title,
      content: raw.content,
      chapter: raw.chapter,
      state: "MH" as const,
      deviatesFromCGST: raw.deviatesFromCGST ?? false,
      cgstEquivalent: raw.cgstEquivalent,
      noticeTypes: raw.noticeTypes ?? [],
      keywords: raw.keywords ?? [],
      category: raw.category,
      source: "SGST_ACT_MH",
    }),
  },

  sgst_ka: {
    source: "SGST_ACT_KA",
    indexName: "gst-sgst-ka",
    prompt: `You are a legal document parser for the Karnataka SGST Act.
Extract ALL sections from the text chunk.
Return ONLY a valid JSON array — no explanation, no markdown, no code blocks.

Each object must have:${SECTION_FIELDS}
- deviatesFromCGST: true if this section differs from the central CGST Act, false if identical
- cgstEquivalent: the equivalent CGST Act section number e.g. "73" (omit if no equivalent)

Return [] if no complete sections found.`,
    mapResult: (raw) => ({
      type: "sgst_act",
      sectionNumber: raw.sectionNumber,
      title: raw.title,
      content: raw.content,
      chapter: raw.chapter,
      state: "KA" as const,
      deviatesFromCGST: raw.deviatesFromCGST ?? false,
      cgstEquivalent: raw.cgstEquivalent,
      noticeTypes: raw.noticeTypes ?? [],
      keywords: raw.keywords ?? [],
      category: raw.category,
      source: "SGST_ACT_KA",
    }),
  },

  sgst_dl: {
    source: "SGST_ACT_DL",
    indexName: "gst-sgst-dl",
    prompt: `You are a legal document parser for the Delhi SGST Act.
Extract ALL sections from the text chunk.
Return ONLY a valid JSON array — no explanation, no markdown, no code blocks.

Each object must have:${SECTION_FIELDS}
- deviatesFromCGST: true if this section differs from the central CGST Act, false if identical
- cgstEquivalent: the equivalent CGST Act section number e.g. "73" (omit if no equivalent)

Return [] if no complete sections found.`,
    mapResult: (raw) => ({
      type: "sgst_act",
      sectionNumber: raw.sectionNumber,
      title: raw.title,
      content: raw.content,
      chapter: raw.chapter,
      state: "DL" as const,
      deviatesFromCGST: raw.deviatesFromCGST ?? false,
      cgstEquivalent: raw.cgstEquivalent,
      noticeTypes: raw.noticeTypes ?? [],
      keywords: raw.keywords ?? [],
      category: raw.category,
      source: "SGST_ACT_DL",
    }),
  },
};

// ── Files to process ───────────────────────────────────────────────────────

const FILES: Array<{ configKey: string; file: string }> = [
  { configKey: "cgst_2017", file: "cgst-act-2017.pdf" },
  { configKey: "finance_act_2023", file: "finance-act-2023.pdf" },
  { configKey: "finance_act_2026", file: "finance-act-2026.pdf" },
  {
    configKey: "circular",
    file: "circular-188-20-2022-GST.pdf",
  },
  {
    configKey: "circular",
    file: "circular-187-19-2022-GST.pdf",
  },
  { configKey: "sgst_mh", file: "sgst-mh.pdf" },
  { configKey: "sgst_ka", file: "sgst-ka.pdf" },
  { configKey: "sgst_dl", file: "sgst-dl.pdf" },
];

// ── Gemini client ──────────────────────────────────────────────────────────

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// ── PDF reader ─────────────────────────────────────────────────────────────

// async function readPDF(filePath: string): Promise<string> {
//   const buffer = readFileSync(filePath);
//   const data = await pdfParse(buffer);

//   if (data.text.trim().length < 500) {
//     throw new Error(
//       `PDF appears to be scanned/image-based, OCR needed: ${filePath}`,
//     );
//   }

//   console.log(
//     `   Pages: ${data.numpages} | Extracted: ${(data.text.length / 1024).toFixed(1)} KB`,
//   );
//   return data.text;
// }

async function readPDF(filePath: string): Promise<string> {
  const buffer = readFileSync(filePath);
  const uint8Array = new Uint8Array(buffer);

  const { text } = await extractText(uint8Array, { mergePages: true });

  if (text.trim().length < 500) {
    throw new Error(
      `PDF appears to be scanned/image-based, OCR needed: ${filePath}`,
    );
  }

  console.log(`   Extracted: ${(text.length / 1024).toFixed(1)} KB`);
  return text;
}
function chunkText(text: string, size = 8000, overlap = 500): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}

// ── ID generator ───────────────────────────────────────────────────────────

function generateId(doc: Omit<GSTDocument, "id">): string {
  const src = doc.source.toLowerCase();
  switch (doc.type) {
    case "cgst_act":
    case "amendment":
    case "sgst_act":
      return `${src}_${doc.sectionNumber.replace(/\s+/g, "_")}`;
    case "circular":
      return `${src}_${doc.circularNumber.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`;
  }
}

// ── Deduplicator (keep longest content per section) ────────────────────────

function deduplicate(docs: GSTDocument[]): GSTDocument[] {
  const seen = new Map<string, GSTDocument>();
  for (const doc of docs) {
    const existing = seen.get(doc.id);
    if (!existing || doc.content.length > existing.content.length) {
      seen.set(doc.id, doc);
    }
  }
  return Array.from(seen.values());
}

// ── Core parser ────────────────────────────────────────────────────────────

async function parseDocument(
  text: string,
  config: ParserConfig,
  options = { chunkSize: 8000, overlap: 500, delayMs: 2000 },
): Promise<GSTDocument[]> {
  const chunks = chunkText(text, options.chunkSize, options.overlap);
  console.log(`   Chunks: ${chunks.length}`);

  const all: GSTDocument[] = [];

  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`   Chunk ${i + 1}/${chunks.length}... `);

    try {
      const response = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${config.prompt}\n\nTEXT CHUNK:\n${chunks[i]}`,
      });

      const raw = response.text ?? "";
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) {
        console.log("no JSON found, skipping");
        continue;
      }

      const parsed = JSON.parse(match[0]) as any[];
      const mapped: GSTDocument[] = parsed.map((item) => {
        const doc = config.mapResult(item) as Omit<GSTDocument, "id">;
        return { ...doc, id: generateId(doc) } as GSTDocument;
      });

      console.log(`${mapped.length} docs`);
      all.push(...mapped);
    } catch (err) {
      console.log(`error: ${err instanceof Error ? err.message : err}`);
    }

    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, options.delayMs));
    }
  }

  return all;
}

// ── Elastic indexer ────────────────────────────────────────────────────────

async function indexToElastic(
  docs: GSTDocument[],
  config: ParserConfig,
): Promise<void> {
  const elasticUrl = process.env.ELASTIC_URL;
  const elasticApiKey = process.env.ELASTIC_API_KEY;

  if (!elasticUrl || !elasticApiKey) {
    console.log("⚠️  ELASTIC_URL / ELASTIC_API_KEY not set — skipping");
    return;
  }

  console.log(`\n📤 Indexing ${docs.length} docs → ${config.indexName}`);

  // Delete and recreate index
  await fetch(`${elasticUrl}/${config.indexName}`, {
    method: "DELETE",
    headers: { Authorization: `ApiKey ${elasticApiKey}` },
  });

  await fetch(`${elasticUrl}/${config.indexName}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${elasticApiKey}`,
    },
    body: JSON.stringify({
      mappings: {
        properties: {
          id: { type: "keyword" },
          type: { type: "keyword" },
          source: { type: "keyword" },
          content: { type: "text", analyzer: "english" },
          keywords: { type: "keyword" },
          noticeTypes: { type: "keyword" },
          category: { type: "keyword" },
          // act + amendment + sgst
          sectionNumber: { type: "keyword" },
          title: { type: "text", analyzer: "english" },
          chapter: { type: "keyword" },
          // amendment only
          amendmentType: { type: "keyword" },
          effectiveDate: { type: "date" },
          originalContent: { type: "text", analyzer: "english" },
          // circular only
          circularNumber: { type: "keyword" },
          subject: { type: "text", analyzer: "english" },
          issuedDate: { type: "date" },
          relatedSections: { type: "keyword" },
          // sgst only
          state: { type: "keyword" },
          deviatesFromCGST: { type: "boolean" },
          cgstEquivalent: { type: "keyword" },
        },
      },
    }),
  });

  // Bulk index in batches of 100
  const BATCH = 100;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const body =
      batch
        .flatMap((d) => [
          JSON.stringify({ index: { _index: config.indexName, _id: d.id } }),
          JSON.stringify(d),
        ])
        .join("\n") + "\n";

    const res = await fetch(`${elasticUrl}/_bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        Authorization: `ApiKey ${elasticApiKey}`,
      },
      body,
    });

    const result = (await res.json()) as any;
    if (result.errors) {
      const failed = result.items
        .filter((item: any) => item.index?.error)
        .slice(0, 3);
      console.error("❌ Batch errors:", JSON.stringify(failed, null, 2));
    } else {
      process.stdout.write(`   Batch ${Math.floor(i / BATCH) + 1} ✓\n`);
    }
  }

  console.log(`✅ ${config.indexName} done`);
}

// ── Main ───────────────────────────────────────────────────────────────────

const docsPath = path.join(__dirname);

async function main() {
  for (const { configKey, file } of FILES) {
    const config = CONFIGS[configKey];
    const filePath = join(docsPath, file);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📖 ${file} [${config.source}]`);

    let text: string;
    try {
      text = await readPDF(filePath);
    } catch (err) {
      console.error(
        `❌ Skipping — ${err instanceof Error ? err.message : err}`,
      );
      continue;
    }

    const docs = await parseDocument(text, config);
    console.log(
      `\n   Raw: ${docs.length} | After dedup: ${deduplicate(docs).length}`,
    );

    const deduped = deduplicate(docs);

    // Save JSON backup before indexing
    const outFile = join(docsPath, `${configKey}-parsed.json`);
    writeFileSync(outFile, JSON.stringify(deduped, null, 2));
    console.log(`💾 ${outFile}`);

    await indexToElastic(deduped, config);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("🎉 All documents parsed and indexed");
}

main().catch(console.error);

async function uploadFromJson() {
  for (const { configKey } of FILES) {
    const config = CONFIGS[configKey];
    const filePath = join(docsPath, `${configKey}-parsed.json`);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📤 ${configKey}-parsed.json [${config.source}]`);

    let docs: GSTDocument[];
    try {
      const raw = readFileSync(filePath, "utf-8");
      docs = JSON.parse(raw) as GSTDocument[];
      console.log(`   Loaded: ${docs.length} docs`);
    } catch (err) {
      console.error(
        `❌ Skipping — ${err instanceof Error ? err.message : err}`,
      );
      continue;
    }

    await indexToElastic(docs, config);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("🎉 All JSON files uploaded to Elastic");
}
// uploadFromJson().catch(console.error); // ← just re-index from saved JSONs
