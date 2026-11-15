import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getValidSpotifySession, getValidYouTubeSession } from "@/lib/oauth";
import type {
  GeneratedPlaylist,
  PlaylistHistoryEntry,
  StoredUserData,
  TasteProfile,
} from "@/types/playlist";

const DATA_ROOT = path.join(process.cwd(), ".data", "users");

function sanitizeKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

export async function resolveUserAccountKey(): Promise<string> {
  const [ytSession, spSession] = await Promise.all([
    getValidYouTubeSession(),
    getValidSpotifySession(),
  ]);

  if (ytSession?.accountId) {
    return `yt_${sanitizeKey(ytSession.accountId)}`;
  }
  if (ytSession?.displayName) {
    const hash = crypto
      .createHash("sha256")
      .update(ytSession.displayName)
      .digest("hex")
      .slice(0, 12);
    return `yt_${hash}`;
  }
  if (spSession?.accountId) {
    return `sp_${sanitizeKey(spSession.accountId)}`;
  }
  return "local_default";
}

function getUserFilePath(accountKey: string): string {
  return path.join(DATA_ROOT, `${sanitizeKey(accountKey)}.json`);
}

function createEmptyUserData(accountKey: string): StoredUserData {
  return {
    accountKey,
    updatedAt: new Date().toISOString(),
    tasteProfile: null,
    lastPlaylist: null,
    playlistHistory: [],
  };
}

export async function readUserData(
  accountKey?: string
): Promise<StoredUserData> {
  const key = accountKey ?? (await resolveUserAccountKey());
  const filePath = getUserFilePath(key);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredUserData>;
    return {
      accountKey: key,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      tasteProfile: parsed.tasteProfile ?? null,
      lastPlaylist: parsed.lastPlaylist ?? null,
      playlistHistory: Array.isArray(parsed.playlistHistory)
        ? parsed.playlistHistory
        : [],
    };
  } catch {
    return createEmptyUserData(key);
  }
}

async function writeUserData(data: StoredUserData): Promise<StoredUserData> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  const filePath = getUserFilePath(data.accountKey);
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const next: StoredUserData = {
    ...data,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
  return next;
}

export async function saveUserTasteProfile(
  tasteProfile: TasteProfile | null,
  accountKey?: string
): Promise<StoredUserData> {
  const key = accountKey ?? (await resolveUserAccountKey());
  const current = await readUserData(key);
  return writeUserData({
    ...current,
    tasteProfile,
  });
}

export async function saveUserLastPlaylist(
  playlist: GeneratedPlaylist | null,
  options?: { appendHistory?: boolean; accountKey?: string }
): Promise<StoredUserData> {
  const key = options?.accountKey ?? (await resolveUserAccountKey());
  const current = await readUserData(key);

  let nextHistory = current.playlistHistory;
  if (playlist && options?.appendHistory) {
    const entry: PlaylistHistoryEntry = {
      id: `pl-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      createdAt: new Date().toISOString(),
      title: playlist.title,
      trackCount: playlist.tracks.length,
      mode: playlist.mode,
      playlist,
    };
    nextHistory = [entry, ...current.playlistHistory].slice(0, 10);
  }

  return writeUserData({
    ...current,
    lastPlaylist: playlist,
    playlistHistory: nextHistory,
  });
}
