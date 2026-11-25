import { describe, expect, it } from "vitest";
import { getVisibleTrackEntries, shuffleTracks } from "@/lib/playlist-utils";
import type { PlaylistTrack } from "@/types/playlist";

function makeTrack(id: string, inUserLibrary?: boolean): PlaylistTrack {
  return {
    id,
    title: `Song ${id}`,
    titleRomaji: `Song ${id}`,
    artist: "Artist",
    artistRomaji: "Artist",
    animeTitle: "Anime",
    animeTitleJapanese: "アニメ",
    animeTitleRomaji: "Anime",
    themeType: "OP",
    themeLabel: "OP1",
    year: 2024,
    bpmVibe: "High BPM",
    reason: "Reason",
    coverImage: null,
    youtubeVideoId: id,
    youtubeUrl: `https://youtube.com/watch?v=${id}`,
    youtubeMusicUrl: `https://music.youtube.com/watch?v=${id}`,
    spotifyUri: null,
    spotifyUrl: `https://open.spotify.com/search/${id}`,
    inUserLibrary,
  };
}

describe("shuffleTracks", () => {
  it("preserves all tracks and keeps pinnedTrackId first", () => {
    const tracks = [makeTrack("1"), makeTrack("2"), makeTrack("3"), makeTrack("4")];
    const shuffled = shuffleTracks(tracks, "3", () => 0.99);

    expect(shuffled).toHaveLength(4);
    expect(shuffled[0].id).toBe("3");
    expect(shuffled.map((t) => t.id).sort()).toEqual(["1", "2", "3", "4"]);
    expect(shuffled.slice(1).map((t) => t.id)).not.toEqual(["1", "2", "4"]);
  });

  it("still changes order even when random produces an identical permutation", () => {
    const tracks = [makeTrack("a"), makeTrack("b"), makeTrack("c")];
    const shuffled = shuffleTracks(tracks, null, () => 0.99);

    expect(shuffled.map((t) => t.id)).not.toEqual(["a", "b", "c"]);
    expect(shuffled.map((t) => t.id).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("getVisibleTrackEntries", () => {
  it("filters out known tracks while preserving original indices", () => {
    const tracks = [
      makeTrack("1", true),
      makeTrack("2", false),
      makeTrack("3", undefined),
      makeTrack("4", true),
    ];

    expect(getVisibleTrackEntries(tracks, false).map((e) => e.index)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(getVisibleTrackEntries(tracks, true)).toEqual([
      { track: tracks[1], index: 1 },
      { track: tracks[2], index: 2 },
    ]);
  });
});
