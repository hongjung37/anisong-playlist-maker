import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTrackCacheKeys,
  getUserKnownTrackKeys,
  lookupCachedYouTubeMatch,
  markTrackKnownInCache,
  normalizeCacheToken,
  saveCachedYouTubeBatch,
} from "@/lib/youtube-cache";

describe("youtube-cache", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "anitune-cache-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("builds normalized cache keys for Japanese and Romaji pairs", () => {
    expect(normalizeCacheToken("青春コンプレックス!")).toBe("青春コンプレックス");
    const keys = buildTrackCacheKeys({
      title: "青春コンプレックス",
      titleRomaji: "Seishun Complex",
      artist: "結束バンド",
      artistRomaji: "Kessoku Band",
    });

    expect(keys).toContain("青春コンプレックス::結束バンド");
    expect(keys).toContain("seishuncomplex::kessokuband");
  });

  it("saves matches, resolves non-excluded candidates, and isolates knownByAccounts", async () => {
    const track = {
      title: "晴る",
      titleRomaji: "Haru",
      artist: "ヨルシカ",
      artistRomaji: "Yorushika",
    };

    await saveCachedYouTubeBatch(
      [
        {
          track,
          match: {
            videoId: "vid_1",
            candidateVideoIds: ["vid_1", "vid_2"],
            title: "晴る MV",
          },
          isUserKnown: true,
        },
      ],
      { accountKey: "yt_userA" }
    );

    const lookupAll = await lookupCachedYouTubeMatch(track);
    expect(lookupAll?.videoId).toBe("vid_1");

    const lookupFallback = await lookupCachedYouTubeMatch(track, ["vid_1"]);
    expect(lookupFallback?.videoId).toBe("vid_2");

    const keysA = await getUserKnownTrackKeys("yt_userA");
    const keysB = await getUserKnownTrackKeys("yt_userB");
    expect(keysA.has("晴る::ヨルシカ")).toBe(true);
    expect(keysB.has("晴る::ヨルシカ")).toBe(false);

    await markTrackKnownInCache(track, "yt_userB", true);
    const keysBAfterMark = await getUserKnownTrackKeys("yt_userB");
    expect(keysBAfterMark.has("晴る::ヨルシカ")).toBe(true);

    await markTrackKnownInCache(track, "yt_userA", false);
    const keysAAfterUnmark = await getUserKnownTrackKeys("yt_userA");
    expect(keysAAfterUnmark.has("晴る::ヨルシカ")).toBe(false);
    expect((await getUserKnownTrackKeys("yt_userB")).has("晴る::ヨルシカ")).toBe(
      true
    );
  });

  it("serializes concurrent batch writes without losing entries", async () => {
    await Promise.all([
      saveCachedYouTubeBatch([
        {
          track: { title: "Track One", artist: "Artist A" },
          match: { videoId: "id_1" },
        },
      ]),
      saveCachedYouTubeBatch([
        {
          track: { title: "Track Two", artist: "Artist B" },
          match: { videoId: "id_2" },
        },
      ]),
      saveCachedYouTubeBatch([
        {
          track: { title: "Track Three", artist: "Artist C" },
          match: { videoId: "id_3" },
        },
      ]),
    ]);

    expect((await lookupCachedYouTubeMatch({ title: "Track One", artist: "Artist A" }))?.videoId).toBe("id_1");
    expect((await lookupCachedYouTubeMatch({ title: "Track Two", artist: "Artist B" }))?.videoId).toBe("id_2");
    expect((await lookupCachedYouTubeMatch({ title: "Track Three", artist: "Artist C" }))?.videoId).toBe("id_3");
  });
});
