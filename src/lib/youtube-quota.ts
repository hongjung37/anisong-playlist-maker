import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { YouTubeQuotaStatus } from "@/types/playlist";

const DATA_DIR = path.join(process.cwd(), ".data");
const QUOTA_PATH = path.join(DATA_DIR, "youtube-quota.json");

export const YOUTUBE_DAILY_QUOTA_LIMIT = 10_000;

interface StoredQuotaRecord {
  ptDate: string;
  usedUnits: number;
  exhausted: boolean;
  searchCalls: number;
  writeCalls: number;
  readCalls: number;
  cacheHits: number;
  updatedAt: string;
}

function getPacificDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getNextResetKstLabel(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offsetStr =
    parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  const match = offsetStr.match(/GMT([+-]\d+)/);
  const ptOffsetHours = match ? Number(match[1]) : -8;
  // KST is UTC+9; PT midnight is (9 - ptOffsetHours) in KST
  const resetKstHour = (9 - ptOffsetHours + 24) % 24;
  const currentKstHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hour12: false,
    }).format(date)
  );
  const dayWord = currentKstHour < resetKstHour ? "오늘" : "내일";
  return `${dayWord} ${String(resetKstHour).padStart(2, "0")}:00 KST 초기화`;
}

function createEmptyRecord(ptDate: string): StoredQuotaRecord {
  return {
    ptDate,
    usedUnits: 0,
    exhausted: false,
    searchCalls: 0,
    writeCalls: 0,
    readCalls: 0,
    cacheHits: 0,
    updatedAt: new Date().toISOString(),
  };
}

function toQuotaStatus(rec: StoredQuotaRecord): YouTubeQuotaStatus {
  const remaining = rec.exhausted
    ? 0
    : Math.max(0, YOUTUBE_DAILY_QUOTA_LIMIT - rec.usedUnits);
  return {
    ptDate: rec.ptDate,
    dailyLimit: YOUTUBE_DAILY_QUOTA_LIMIT,
    usedUnits: rec.usedUnits,
    remainingUnits: remaining,
    exhausted: rec.exhausted || rec.usedUnits >= YOUTUBE_DAILY_QUOTA_LIMIT,
    searchCalls: rec.searchCalls,
    writeCalls: rec.writeCalls,
    readCalls: rec.readCalls,
    cacheHits: rec.cacheHits,
    updatedAt: rec.updatedAt,
    nextResetKstLabel: getNextResetKstLabel(),
  };
}

async function readQuotaRecord(): Promise<StoredQuotaRecord> {
  const todayPt = getPacificDateKey();
  try {
    const raw = await fs.readFile(QUOTA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredQuotaRecord>;
    if (parsed.ptDate === todayPt) {
      return {
        ptDate: todayPt,
        usedUnits: Math.max(0, Number(parsed.usedUnits) || 0),
        exhausted: Boolean(parsed.exhausted),
        searchCalls: Math.max(0, Number(parsed.searchCalls) || 0),
        writeCalls: Math.max(0, Number(parsed.writeCalls) || 0),
        readCalls: Math.max(0, Number(parsed.readCalls) || 0),
        cacheHits: Math.max(0, Number(parsed.cacheHits) || 0),
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    // Missing or unreadable file -> initialize fresh for today
  }
  return createEmptyRecord(todayPt);
}

async function writeQuotaRecord(rec: StoredQuotaRecord): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${QUOTA_PATH}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rec, null, 2), "utf8");
  await fs.rename(tmp, QUOTA_PATH);
}

// Serialize concurrent writes from parallel YouTube fetches
let writeChain: Promise<unknown> = Promise.resolve();

function enqueueMutation<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function getYouTubeQuotaStatus(): Promise<YouTubeQuotaStatus> {
  const rec = await readQuotaRecord();
  return toQuotaStatus(rec);
}

export async function recordYouTubeQuotaUsage(delta: {
  units: number;
  category: "search" | "write" | "read";
}): Promise<void> {
  if (delta.units <= 0) return;
  await enqueueMutation(async () => {
    const rec = await readQuotaRecord();
    rec.usedUnits += delta.units;
    if (delta.category === "search") rec.searchCalls += 1;
    else if (delta.category === "write") rec.writeCalls += 1;
    else rec.readCalls += 1;
    if (rec.usedUnits >= YOUTUBE_DAILY_QUOTA_LIMIT) {
      rec.exhausted = true;
    }
    rec.updatedAt = new Date().toISOString();
    await writeQuotaRecord(rec);
  }).catch(() => undefined);
}

export async function recordYouTubeCacheHit(count = 1): Promise<void> {
  if (count <= 0) return;
  await enqueueMutation(async () => {
    const rec = await readQuotaRecord();
    rec.cacheHits += count;
    rec.updatedAt = new Date().toISOString();
    await writeQuotaRecord(rec);
  }).catch(() => undefined);
}

export async function markYouTubeQuotaExhausted(): Promise<void> {
  await enqueueMutation(async () => {
    const rec = await readQuotaRecord();
    rec.exhausted = true;
    rec.usedUnits = Math.max(rec.usedUnits, YOUTUBE_DAILY_QUOTA_LIMIT);
    rec.updatedAt = new Date().toISOString();
    await writeQuotaRecord(rec);
  }).catch(() => undefined);
}

export async function setManualYouTubeQuotaUsed(
  usedUnits: number
): Promise<YouTubeQuotaStatus> {
  return enqueueMutation(async () => {
    const rec = await readQuotaRecord();
    const clamped = Math.max(0, Math.min(YOUTUBE_DAILY_QUOTA_LIMIT, Math.round(usedUnits)));
    rec.usedUnits = clamped;
    rec.exhausted = clamped >= YOUTUBE_DAILY_QUOTA_LIMIT;
    rec.updatedAt = new Date().toISOString();
    await writeQuotaRecord(rec);
    return toQuotaStatus(rec);
  });
}
