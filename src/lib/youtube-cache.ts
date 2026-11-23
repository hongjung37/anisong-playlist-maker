import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PlaylistTrack } from "@/types/playlist";

function getCacheDir(): string {
  return path.join(process.cwd(), ".data");
}

function getCachePath(): string {
  return path.join(getCacheDir(), "youtube-cache.json");
}

export interface YouTubeCacheEntry {
  videoId: string;
  candidateVideoIds: string[];
  title: string;
  artist: string;
  updatedAt: string;
  isUserKnown?: boolean;
  knownByAccounts?: string[];
}

interface YouTubeCacheFile {
  version: 1;
  entries: Record<string, YouTubeCacheEntry>;
}

export type CacheableTrack = Pick<
  PlaylistTrack,
  "title" | "artist"
> & {
  titleRomaji?: string;
  artistRomaji?: string;
};

export function normalizeCacheToken(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s\-_'"`~!@#$%^&*+=[\]{}();:,.<>?/\\|！？・〜～『』「」【】（）()]/g, "");
}

export function buildTrackCacheKeys(track: CacheableTrack): string[] {
  const titles = [track.title, track.titleRomaji ?? ""]
    .map(normalizeCacheToken)
    .filter((s) => s.length >= 2);
  const artists = [track.artist, track.artistRomaji ?? ""]
    .map(normalizeCacheToken)
    .filter((s) => s.length >= 2);

  const keys: string[] = [];
  for (const t of titles) {
    for (const a of artists) {
      const k = `${t}::${a}`;
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

let cacheWriteChain: Promise<unknown> = Promise.resolve();

function enqueueCacheMutation<T>(fn: () => Promise<T>): Promise<T> {
  const next = cacheWriteChain.then(fn, fn);
  cacheWriteChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function readCacheFile(): Promise<YouTubeCacheFile> {
  try {
    const raw = await fs.readFile(getCachePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<YouTubeCacheFile>;
    if (parsed && typeof parsed.entries === "object" && parsed.entries) {
      return {
        version: 1,
        entries: parsed.entries as Record<string, YouTubeCacheEntry>,
      };
    }
  } catch {
    // Cache file doesn't exist yet
  }
  return { version: 1, entries: {} };
}

async function writeCacheFile(cache: YouTubeCacheFile): Promise<void> {
  await fs.mkdir(getCacheDir(), { recursive: true });
  const cachePath = getCachePath();
  const tmpPath = `${cachePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(cache, null, 2), "utf8");
  await fs.rename(tmpPath, cachePath);
}

export async function lookupCachedYouTubeMatch(
  track: CacheableTrack,
  excludeVideoIds: string[] = []
): Promise<{
  videoId: string;
  title: string;
  candidateVideoIds: string[];
} | null> {
  const keys = buildTrackCacheKeys(track);
  if (keys.length === 0) return null;

  const cache = await readCacheFile();
  const excluded = new Set(excludeVideoIds);

  for (const key of keys) {
    const entry = cache.entries[key];
    if (!entry) continue;

    const pool = Array.from(
      new Set([entry.videoId, ...(entry.candidateVideoIds ?? [])])
    ).filter((id) => Boolean(id) && !excluded.has(id));

    if (pool.length > 0) {
      return {
        videoId: pool[0],
        title: entry.title || track.title,
        candidateVideoIds: pool,
      };
    }
  }

  return null;
}

export async function getUserKnownTrackKeys(
  accountKey?: string
): Promise<Set<string>> {
  const cache = await readCacheFile();
  const keys = new Set<string>();
  for (const [key, entry] of Object.entries(cache.entries)) {
    if (accountKey) {
      if (Array.isArray(entry.knownByAccounts)) {
        if (entry.knownByAccounts.includes(accountKey)) {
          keys.add(key);
        }
      } else if (entry.isUserKnown) {
        keys.add(key);
      }
    } else if (entry.isUserKnown || (entry.knownByAccounts?.length ?? 0) > 0) {
      keys.add(key);
    }
  }
  return keys;
}

export async function saveCachedYouTubeMatch(
  track: CacheableTrack,
  match: { videoId: string; candidateVideoIds?: string[]; title?: string },
  options?: { isUserKnown?: boolean; accountKey?: string }
): Promise<void> {
  await saveCachedYouTubeBatch(
    [{ track, match, isUserKnown: options?.isUserKnown }],
    { accountKey: options?.accountKey }
  );
}

export async function saveCachedYouTubeBatch(
  items: Array<{
    track: CacheableTrack;
    match: { videoId: string; candidateVideoIds?: string[]; title?: string };
    isUserKnown?: boolean;
  }>,
  options?: { preserveExistingPrimary?: boolean; accountKey?: string }
): Promise<number> {
  if (items.length === 0) return 0;

  return enqueueCacheMutation(async () => {
    const cache = await readCacheFile();
    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const { track, match, isUserKnown } of items) {
      const keys = buildTrackCacheKeys(track);
      if (keys.length === 0 || !match.videoId) continue;

      for (const key of keys) {
        const existing = cache.entries[key];
        const mergedIds =
          options?.preserveExistingPrimary && existing?.videoId
            ? Array.from(
                new Set([
                  existing.videoId,
                  ...(existing.candidateVideoIds ?? []),
                  match.videoId,
                  ...(match.candidateVideoIds ?? []),
                ])
              ).slice(0, 8)
            : Array.from(
                new Set([
                  match.videoId,
                  ...(match.candidateVideoIds ?? []),
                  ...(options?.preserveExistingPrimary
                    ? (existing?.candidateVideoIds ?? [])
                    : []),
                ])
              ).slice(0, 8);

        let nextKnownByAccounts = existing?.knownByAccounts
          ? [...existing.knownByAccounts]
          : undefined;
        let nextIsUserKnown = existing?.isUserKnown;

        if (typeof isUserKnown === "boolean") {
          if (options?.accountKey) {
            const set = new Set(nextKnownByAccounts ?? []);
            if (isUserKnown) {
              set.add(options.accountKey);
            } else {
              set.delete(options.accountKey);
            }
            nextKnownByAccounts = Array.from(set);
            nextIsUserKnown = nextKnownByAccounts.length > 0;
          } else {
            nextIsUserKnown = isUserKnown;
          }
        }

        const entry: YouTubeCacheEntry = {
          videoId: mergedIds[0],
          candidateVideoIds: mergedIds,
          title:
            options?.preserveExistingPrimary && existing?.title
              ? existing.title
              : match.title || track.title,
          artist:
            options?.preserveExistingPrimary && existing?.artist
              ? existing.artist
              : track.artist,
          updatedAt: now,
          isUserKnown: nextIsUserKnown,
          ...(nextKnownByAccounts !== undefined
            ? { knownByAccounts: nextKnownByAccounts }
            : {}),
        };
        cache.entries[key] = entry;
      }
      updatedCount += 1;
    }

    if (updatedCount > 0) {
      await writeCacheFile(cache);
    }
    return updatedCount;
  });
}

export async function markTrackKnownInCache(
  track: CacheableTrack,
  accountKey: string,
  known: boolean,
  videoId?: string
): Promise<void> {
  const keys = buildTrackCacheKeys(track);
  if (keys.length === 0) return;

  await enqueueCacheMutation(async () => {
    const cache = await readCacheFile();
    const now = new Date().toISOString();
    let changed = false;

    for (const key of keys) {
      const existing = cache.entries[key];
      if (!existing && (!known || !videoId)) continue;

      if (existing) {
        const set = new Set(existing.knownByAccounts ?? []);
        if (known) set.add(accountKey);
        else set.delete(accountKey);
        const nextKnownByAccounts = Array.from(set);
        cache.entries[key] = {
          ...existing,
          updatedAt: now,
          knownByAccounts: nextKnownByAccounts,
          isUserKnown: nextKnownByAccounts.length > 0,
        };
        changed = true;
      } else if (known && videoId) {
        cache.entries[key] = {
          videoId,
          candidateVideoIds: [videoId],
          title: track.title,
          artist: track.artist,
          updatedAt: now,
          isUserKnown: true,
          knownByAccounts: [accountKey],
        };
        changed = true;
      }
    }

    if (changed) {
      await writeCacheFile(cache);
    }
  });
}
