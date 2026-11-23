import { describe, expect, it } from "vitest";
import {
  buildTournamentContenders,
  buildTournamentWinnerRequest,
  buildTrackSpinoffRequest,
  DEFAULT_TOURNAMENT_POOL,
} from "@/lib/spinoff-tournament";
import type { PlaylistTrack, WatchedAnimeItem } from "@/types/playlist";

const SAMPLE_TRACK: PlaylistTrack = {
  id: "trk-1",
  title: "青春コンプレックス",
  titleRomaji: "Seishun Complex",
  artist: "結束バンド",
  artistRomaji: "Kessoku Band",
  animeTitle: "봇치 더 록!",
  animeTitleJapanese: "ぼっち・ざ・ろっく！",
  animeTitleRomaji: "Bocchi the Rock!",
  themeType: "OP",
  themeLabel: "OP",
  year: 2022,
  bpmVibe: "188 BPM · 질주 기타록",
  reason: "날카로운 기타 리프가 인상적인 곡입니다.",
  setlistSection: "오프닝",
  coverImage: null,
  youtubeVideoId: "abc123",
  youtubeUrl: "https://www.youtube.com/watch?v=abc123",
  youtubeMusicUrl: "https://music.youtube.com/watch?v=abc123",
  spotifyUri: null,
  spotifyUrl: "https://open.spotify.com/search/test",
};

function makeWatchedList(count: number): WatchedAnimeItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `wa-${idx + 1}`,
    title: `테스트 애니 ${idx + 1}`,
    status: "완료" as const,
    rating: idx % 2 === 0 ? "⭐️인생작⭐️" : "명작⭐️",
    genre: idx % 2 === 0 ? "액션/판타지/이세계" : "일상/치유",
    rank: idx + 1,
    note: null,
    source: "notion" as const,
    addedAt: "2026-01-01T00:00:00.000Z",
  }));
}

describe("spinoff & tournament helpers", () => {
  it("builds track spinoff requests for all three modes", () => {
    const lineage = buildTrackSpinoffRequest(SAMPLE_TRACK, "lineage");
    expect(lineage.seeds).toEqual(["結束バンド", "봇치 더 록!"]);
    expect(lineage.themeTypes).toEqual(["OP", "ED", "INSERT", "OST"]);
    expect(lineage.popularityLevel).toBe(3);
    expect(lineage.excludeRecentTurns).toBe(1);
    expect(lineage.prompt).toContain("계보");

    const sonic = buildTrackSpinoffRequest(SAMPLE_TRACK, "sonic_clone");
    expect(sonic.seeds).toEqual(["青春コンプレックス", "結束バンド"]);
    expect(sonic.themeTypes).toContain("OP");
    expect(sonic.prompt).toContain("188 BPM · 질주 기타록");

    const deep = buildTrackSpinoffRequest(SAMPLE_TRACK, "anime_deep_dive");
    expect(deep.seeds).toEqual(["봇치 더 록!"]);
    expect(deep.themeTypes).toEqual(["OP", "ED", "INSERT", "OST", "CHARACTER"]);
    expect(deep.popularityLevel).toBe(4);
    expect(deep.excludeRecentTurns).toBe(0);
    expect(deep.prompt).toContain("봇치 더 록!");
  });

  it("builds 8 unique tournament contenders from watched anime or curated pool", () => {
    const watchedList = makeWatchedList(10);
    const fromWatched = buildTournamentContenders(watchedList, "watched");
    expect(fromWatched).toHaveLength(8);
    expect(new Set(fromWatched.map((c) => c.id)).size).toBe(8);
    expect(fromWatched.every((c) => c.id.startsWith("watched-"))).toBe(true);

    // Falls back to curated pool when fewer than 8 eligible watched items exist
    const fallback = buildTournamentContenders(makeWatchedList(4), "watched");
    expect(fallback).toHaveLength(8);
    expect(new Set(fallback.map((c) => c.id)).size).toBe(8);
    expect(fallback.every((c) => c.id.startsWith("curated-"))).toBe(true);

    const curated = buildTournamentContenders(watchedList, "curated");
    expect(curated).toHaveLength(8);
    expect(curated.every((c) => c.id.startsWith("curated-"))).toBe(true);
  });

  it("combines champion, runner-up, and semifinalists into a playlist request", () => {
    const [champion, runnerUp, sf1, sf2] = DEFAULT_TOURNAMENT_POOL;
    const built = buildTournamentWinnerRequest({
      champion,
      runnerUp,
      semifinalists: [sf1, sf2],
      trackCount: 16,
    });

    expect(built.seeds).toEqual([
      champion.seedValue,
      runnerUp.seedValue,
      sf1.seedValue,
      sf2.seedValue,
    ]);
    expect(built.moods.length).toBeGreaterThan(0);
    expect(built.moods.length).toBeLessThanOrEqual(3);
    expect(built.genres.length).toBeGreaterThan(0);
    expect(built.genres.length).toBeLessThanOrEqual(2);
    expect(built.prompt).toContain(champion.title);
    expect(built.prompt).toContain(runnerUp.title);
    expect(built.request.trackCount).toBe(16);
    expect(built.request.seeds).toEqual(built.seeds);
  });
});
