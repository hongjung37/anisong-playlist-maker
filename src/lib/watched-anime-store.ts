import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  WatchedAnimeItem,
  WatchedAnimeStatus,
} from "@/types/playlist";

interface WatchedAnimeFile {
  version: 1;
  updatedAt: string;
  items: WatchedAnimeItem[];
}

function getDataDir(): string {
  return path.join(process.cwd(), ".data");
}

function getStorePath(): string {
  return path.join(getDataDir(), "watched-anime.json");
}

let writeChain: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export function getRatingWeight(rating: string | null): number {
  if (!rating) return 1;
  if (rating.includes("인생작")) return 5;
  if (rating.includes("명작")) return 4;
  if (rating.includes("수작")) return 3;
  if (rating.includes("킬링타임")) return 2;
  if (rating.includes("시간이아깝다") || rating.includes("쓰레기")) return 0;
  return 1;
}

export function sortWatchedAnime(
  items: WatchedAnimeItem[]
): WatchedAnimeItem[] {
  return [...items].sort((a, b) => {
    const aHasRank = typeof a.rank === "number" && Number.isFinite(a.rank);
    const bHasRank = typeof b.rank === "number" && Number.isFinite(b.rank);
    if (aHasRank && bHasRank && a.rank !== b.rank) {
      return (a.rank as number) - (b.rank as number);
    }
    if (aHasRank !== bHasRank) {
      return aHasRank ? -1 : 1;
    }

    const weightDiff = getRatingWeight(b.rating) - getRatingWeight(a.rating);
    if (weightDiff !== 0) return weightDiff;

    return a.title.localeCompare(b.title, "ko");
  });
}

function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

async function readRawFile(): Promise<WatchedAnimeFile> {
  try {
    const raw = await fs.readFile(getStorePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<WatchedAnimeFile>;
    if (parsed && Array.isArray(parsed.items)) {
      return {
        version: 1,
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        items: sortWatchedAnime(parsed.items),
      };
    }
  } catch {
    // Missing or unreadable file -> return empty list
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: [],
  };
}

async function writeRawFile(items: WatchedAnimeItem[]): Promise<WatchedAnimeItem[]> {
  const sorted = sortWatchedAnime(items);
  await fs.mkdir(getDataDir(), { recursive: true });
  const storePath = getStorePath();
  const tmpPath = `${storePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const payload: WatchedAnimeFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: sorted,
  };
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmpPath, storePath);
  return sorted;
}

export async function readWatchedAnime(): Promise<WatchedAnimeItem[]> {
  const file = await readRawFile();
  return file.items;
}

export async function saveWatchedAnimeList(
  items: WatchedAnimeItem[]
): Promise<WatchedAnimeItem[]> {
  return enqueueWrite(async () => writeRawFile(items));
}

export async function addWatchedAnime(input: {
  title: string;
  status?: WatchedAnimeStatus;
  rating?: string | null;
  genre?: string | null;
  rank?: number | null;
  note?: string | null;
  source?: "notion" | "manual";
}): Promise<WatchedAnimeItem[]> {
  const cleanTitle = input.title.trim();
  if (!cleanTitle) {
    return readWatchedAnime();
  }

  return enqueueWrite(async () => {
    const current = (await readRawFile()).items;
    const targetKey = normalizeTitleKey(cleanTitle);
    const existing = current.find(
      (item) => normalizeTitleKey(item.title) === targetKey
    );

    const nextItem: WatchedAnimeItem = {
      id:
        existing?.id ??
        `wa-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
      title: cleanTitle,
      status: input.status ?? existing?.status ?? "완료",
      rating:
        input.rating !== undefined ? input.rating : (existing?.rating ?? null),
      genre:
        input.genre !== undefined ? input.genre : (existing?.genre ?? null),
      rank: input.rank !== undefined ? input.rank : (existing?.rank ?? null),
      note: input.note !== undefined ? input.note : (existing?.note ?? null),
      source: input.source ?? existing?.source ?? "manual",
      addedAt: existing?.addedAt ?? new Date().toISOString(),
    };

    const filtered = current.filter(
      (item) => normalizeTitleKey(item.title) !== targetKey
    );
    return writeRawFile([nextItem, ...filtered]);
  });
}

export async function removeWatchedAnime(
  id: string
): Promise<WatchedAnimeItem[]> {
  return enqueueWrite(async () => {
    const current = (await readRawFile()).items;
    const next = current.filter((item) => item.id !== id);
    if (next.length === current.length) return current;
    return writeRawFile(next);
  });
}
