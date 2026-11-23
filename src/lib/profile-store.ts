import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getValidSpotifySession, getValidYouTubeSession } from "@/lib/oauth";
import type {
  CustomPreset,
  GeneratedPlaylist,
  KnownTrackItem,
  PlaylistHistoryEntry,
  StoredUserData,
  TasteProfile,
} from "@/types/playlist";

function getDataRoot(): string {
  return path.join(process.cwd(), ".data", "users");
}

const accountWriteChains = new Map<string, Promise<unknown>>();

function enqueueAccountMutation<T>(
  accountKey: string,
  fn: () => Promise<T>
): Promise<T> {
  const safeKey = sanitizeKey(accountKey);
  const prev = accountWriteChains.get(safeKey) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const settled = next.then(
    () => undefined,
    () => undefined
  );
  accountWriteChains.set(safeKey, settled);
  return next;
}

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
  return path.join(getDataRoot(), `${sanitizeKey(accountKey)}.json`);
}

function createEmptyUserData(accountKey: string): StoredUserData {
  return {
    accountKey,
    updatedAt: new Date().toISOString(),
    tasteProfile: null,
    lastPlaylist: null,
    playlistHistory: [],
    customPresets: [],
    manualKnownTracks: [],
    anilistUsername: null,
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
      customPresets: Array.isArray(parsed.customPresets)
        ? parsed.customPresets
        : [],
      manualKnownTracks: Array.isArray(parsed.manualKnownTracks)
        ? parsed.manualKnownTracks
        : [],
      anilistUsername:
        typeof parsed.anilistUsername === "string"
          ? parsed.anilistUsername
          : null,
    };
  } catch {
    return createEmptyUserData(key);
  }
}

async function writeUserData(data: StoredUserData): Promise<StoredUserData> {
  await fs.mkdir(getDataRoot(), { recursive: true });
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
  return enqueueAccountMutation(key, async () => {
    const current = await readUserData(key);
    return writeUserData({
      ...current,
      tasteProfile,
    });
  });
}

export async function saveUserLastPlaylist(
  playlist: GeneratedPlaylist | null,
  options?: { appendHistory?: boolean; accountKey?: string }
): Promise<StoredUserData> {
  const key = options?.accountKey ?? (await resolveUserAccountKey());
  return enqueueAccountMutation(key, async () => {
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
  });
}

export async function saveUserCustomPresets(
  customPresets: CustomPreset[],
  accountKey?: string
): Promise<StoredUserData> {
  const key = accountKey ?? (await resolveUserAccountKey());
  return enqueueAccountMutation(key, async () => {
    const current = await readUserData(key);
    return writeUserData({
      ...current,
      customPresets: customPresets.slice(0, 15),
    });
  });
}

export async function removeUserPlaylistHistoryEntry(
  entryId: string,
  accountKey?: string
): Promise<StoredUserData> {
  const key = accountKey ?? (await resolveUserAccountKey());
  return enqueueAccountMutation(key, async () => {
    const current = await readUserData(key);
    const nextHistory = current.playlistHistory.filter(
      (entry) => entry.id !== entryId
    );
    if (nextHistory.length === current.playlistHistory.length) {
      return current;
    }
    return writeUserData({
      ...current,
      playlistHistory: nextHistory,
    });
  });
}

export async function saveUserAniListUsername(
  anilistUsername: string | null,
  accountKey?: string
): Promise<StoredUserData> {
  const key = accountKey ?? (await resolveUserAccountKey());
  return enqueueAccountMutation(key, async () => {
    const current = await readUserData(key);
    return writeUserData({
      ...current,
      anilistUsername: anilistUsername?.trim() ? anilistUsername.trim() : null,
    });
  });
}

function normalizeKnownTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s\-_'"`~!@#$%^&*+=[\]{}();:,.<>?/\\|！？・〜～『』「」【】（）()]/g, "");
}

export async function toggleUserManualKnownTrack(
  track: KnownTrackItem,
  known: boolean,
  accountKey?: string
): Promise<StoredUserData> {
  const key = accountKey ?? (await resolveUserAccountKey());
  return enqueueAccountMutation(key, async () => {
    const current = await readUserData(key);
    const existing = current.manualKnownTracks ?? [];
    const targetNorm = normalizeKnownTitle(track.rawTitle);

    const matchesTrack = (item: KnownTrackItem) => {
      if (track.videoId && item.videoId && track.videoId === item.videoId) {
        return true;
      }
      return targetNorm.length >= 2 && normalizeKnownTitle(item.rawTitle) === targetNorm;
    };

    let nextList: KnownTrackItem[];
    if (known) {
      const filtered = existing.filter((item) => !matchesTrack(item));
      nextList = [track, ...filtered].slice(0, 500);
    } else {
      nextList = existing.filter((item) => !matchesTrack(item));
    }

    return writeUserData({
      ...current,
      manualKnownTracks: nextList,
    });
  });
}
