import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateFallbackPlaylist } from "@/lib/gemini-curator";
import {
  addWatchedAnime,
  getRatingWeight,
  readWatchedAnime,
  removeWatchedAnime,
  saveWatchedAnimeList,
  sortWatchedAnime,
} from "@/lib/watched-anime-store";
import type { WatchedAnimeItem } from "@/types/playlist";

describe("watched-anime-store & curation mode", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "anitune-watched-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("assigns rating weights and sorts by rank, rating, and Korean title", () => {
    expect(getRatingWeight("⭐️인생작⭐️")).toBe(5);
    expect(getRatingWeight("명작⭐️")).toBe(4);
    expect(getRatingWeight("수작📍")).toBe(3);
    expect(getRatingWeight("킬링타임😀")).toBe(2);
    expect(getRatingWeight("쓰레기🗑")).toBe(0);
    expect(getRatingWeight("시간이아깝다⏰️")).toBe(0);
    expect(getRatingWeight(null)).toBe(1);

    const sample: WatchedAnimeItem[] = [
      {
        id: "1",
        title: "가나다",
        status: "완료",
        rating: "수작📍",
        genre: null,
        rank: null,
        note: null,
        source: "manual",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        title: "나비",
        status: "완료",
        rating: "⭐️인생작⭐️",
        genre: null,
        rank: null,
        note: null,
        source: "manual",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "3",
        title: "플라스틱메모리즈",
        status: "완료",
        rating: "⭐️인생작⭐️",
        genre: null,
        rank: 1,
        note: null,
        source: "notion",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const sorted = sortWatchedAnime(sample);
    expect(sorted.map((s) => s.id)).toEqual(["3", "2", "1"]);
  });

  it("reads, adds, deduplicates, and removes watched anime in local store", async () => {
    expect(await readWatchedAnime()).toEqual([]);

    await saveWatchedAnimeList([
      {
        id: "wa-1",
        title: "장송의 프리렌",
        status: "완료",
        rating: "명작⭐️",
        genre: "액션/판타지/이세계",
        rank: 4,
        note: null,
        source: "notion",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const afterAdd = await addWatchedAnime({
      title: "사이버펑크: 엣지 러너",
      rating: "⭐️인생작⭐️",
      rank: 2,
    });
    expect(afterAdd.map((x) => x.title)).toEqual([
      "사이버펑크: 엣지 러너",
      "장송의 프리렌",
    ]);

    // Adding same title updates rather than duplicating
    const afterUpdate = await addWatchedAnime({
      title: "장송의 프리렌",
      rating: "⭐️인생작⭐️",
    });
    expect(afterUpdate).toHaveLength(2);
    expect(
      afterUpdate.find((x) => x.title === "장송의 프리렌")?.rating
    ).toBe("⭐️인생작⭐️");

    const afterRemove = await removeWatchedAnime("wa-1");
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0].title).toBe("사이버펑크: 엣지 러너");
  });

  it("generateFallbackPlaylist applies prefer_watched and discover_unwatched modes", () => {
    const watchedAnime: WatchedAnimeItem[] = [
      {
        id: "w1",
        title: "장송의 프리렌",
        status: "완료",
        rating: "명작⭐️",
        genre: "액션/판타지/이세계",
        rank: 4,
        note: null,
        source: "notion",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const preferred = generateFallbackPlaylist(
      {
        seeds: [],
        moods: [],
        genres: [],
        themeTypes: ["OP", "ED", "OST"],
        era: "ALL",
        trackCount: 5,
        watchedAnimeMode: "prefer_watched",
      },
      { watchedAnime }
    );
    expect(preferred.tracks.some((t) => t.animeTitle === "장송의 프리렌")).toBe(
      true
    );

    const discovered = generateFallbackPlaylist(
      {
        seeds: [],
        moods: [],
        genres: [],
        themeTypes: ["OP", "ED", "OST"],
        era: "ALL",
        trackCount: 5,
        watchedAnimeMode: "discover_unwatched",
      },
      { watchedAnime }
    );
    expect(
      discovered.tracks.some((t) => t.animeTitle === "장송의 프리렌")
    ).toBe(false);
  });
});
