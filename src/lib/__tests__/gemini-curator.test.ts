import { afterEach, describe, expect, it } from "vitest";
import {
  buildPlaylistJsonSchema,
  generateFallbackPlaylist,
  hydrateTracks,
  isTrackExcluded,
  isTrackInKnownLibrary,
  normalizeForCompare,
} from "@/lib/gemini-curator";
import type { KnownTrackItem } from "@/types/playlist";

const originalGeminiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (originalGeminiKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = originalGeminiKey;
  }
});

describe("gemini-curator helpers & fallback curation", () => {
  it("normalizes titles by removing brackets, spaces, and punctuation", () => {
    expect(normalizeForCompare("【MAD】青春コンプレックス (TV Size)")).toBe(
      "青春コンプレックス"
    );
    expect(normalizeForCompare("KICK BACK [Official MV]!")).toBe("kickback");
  });

  it("matches excluded tracks while avoiding false positives on short titles with different artists", () => {
    const excluded = [
      {
        title: "青春コンプレックス",
        titleRomaji: "Seishun Complex",
        artist: "結束バンド",
        artistRomaji: "Kessoku Band",
      },
      {
        title: "晴る",
        titleRomaji: "Haru",
        artist: "ヨルシカ",
        artistRomaji: "Yorushika",
      },
    ];

    expect(
      isTrackExcluded(
        {
          title: "青春コンプレックス",
          titleRomaji: "Seishun Complex",
          artist: "結束バンド",
        },
        excluded
      )
    ).toBe(true);

    // Same short title ("Haru") by same artist -> excluded
    expect(
      isTrackExcluded(
        {
          title: "晴る",
          titleRomaji: "Haru",
          artist: "ヨルシカ",
        },
        excluded
      )
    ).toBe(true);

    // Same short title ("Haru") by a completely different artist -> not excluded
    expect(
      isTrackExcluded(
        {
          title: "晴る",
          titleRomaji: "Haru",
          artist: "Other Band",
          artistRomaji: "Other Band",
        },
        excluded
      )
    ).toBe(false);
  });

  it("detects tracks present in user known library", () => {
    const knownTracks: KnownTrackItem[] = [
      {
        rawTitle: "【公式】結束バンド「星座になれたら」",
        sourceName: "Liked",
      },
    ];

    expect(
      isTrackInKnownLibrary(
        {
          title: "星座になれたら",
          titleRomaji: "Seiza ni Naretara",
          artist: "結束バンド",
        },
        knownTracks
      )
    ).toBe(true);

    expect(
      isTrackInKnownLibrary(
        {
          title: "unravel",
          titleRomaji: "unravel",
          artist: "TK",
        },
        knownTracks
      )
    ).toBe(false);
  });

  it("hydrates and deduplicates tracks with library flags and platform URLs", () => {
    const raw = [
      {
        title: "KICK BACK",
        titleRomaji: "KICK BACK",
        artist: "米津玄師",
        artistRomaji: "Kenshi Yonezu",
        animeTitle: "체인소 맨",
        animeTitleJapanese: "チェンソーマン",
        animeTitleRomaji: "Chainsaw Man",
        themeType: "OP" as const,
        themeLabel: "OP",
        year: 2022,
        bpmVibe: "164 BPM · 록",
        reason: "이유",
        setlistSection: "피크",
      },
      {
        title: "KICK BACK",
        titleRomaji: "KICK BACK",
        artist: "米津玄師",
        artistRomaji: "Kenshi Yonezu",
        animeTitle: "체인소 맨",
        animeTitleJapanese: "チェンソーマン",
        animeTitleRomaji: "Chainsaw Man",
        themeType: "OP" as const,
        themeLabel: "OP",
        year: 2022,
        bpmVibe: "164 BPM · 록",
        reason: "중복",
        setlistSection: "피크",
      },
    ];

    const hydrated = hydrateTracks(raw, [], new Set(["kickback::米津玄師"]));
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].inUserLibrary).toBe(true);
    expect(hydrated[0].youtubeUrl).toContain("youtube.com/results");
    expect(hydrated[0].youtubeMusicUrl).toContain("music.youtube.com/search");
  });

  it("generateFallbackPlaylist respects exclusions and familiarity level 5", () => {
    const knownTracks: KnownTrackItem[] = [
      { rawTitle: "Zoltraak - Evan Call", sourceName: "My OST" },
      { rawTitle: "aLIEz - SawanoHiroyuki", sourceName: "My OST" },
    ];

    const level5 = generateFallbackPlaylist(
      {
        seeds: [],
        moods: [],
        genres: [],
        themeTypes: ["OP", "ED", "OST", "INSERT"],
        era: "ALL",
        trackCount: 5,
        familiarityLevel: 5,
        tasteProfile: {
          dna: {
            summary: "테스트",
            sonicTraits: ["오케스트라"],
            favoriteArtists: ["Evan Call"],
            eraPreference: "2020년대",
            recommendedSeeds: [],
          },
          knownTracks,
        },
      },
      {
        excludedRecentTracks: [
          {
            title: "青春コンプレックス",
            titleRomaji: "Seishun Complex",
            artist: "結束バンド",
            artistRomaji: "Kessoku Band",
          },
        ],
      }
    );

    expect(level5.mode).toBe("demo-fallback");
    expect(level5.tracks).toHaveLength(5);
    expect(level5.tracks.some((t) => t.title === "Zoltraak")).toBe(true);
    expect(level5.tracks.some((t) => t.title === "aLIEz")).toBe(true);
    expect(
      level5.tracks.some((t) => t.title === "青春コンプレックス")
    ).toBe(false);
  });

  it("isolates buildPlaylistJsonSchema by active scenes and vocaloidVocalMode", () => {
    const animeOnlySchema = buildPlaylistJsonSchema(["anime"]);
    expect(animeOnlySchema.properties.tracks.items.properties.scene.enum).toEqual([
      "anime",
    ]);
    expect(
      animeOnlySchema.properties.tracks.items.properties.themeType.enum
    ).toEqual(["OP", "ED", "OST", "INSERT", "CHARACTER"]);

    const vocaloidOriginal = buildPlaylistJsonSchema(
      ["vocaloid"],
      "original_only"
    );
    expect(
      vocaloidOriginal.properties.tracks.items.properties.themeType.enum
    ).toEqual(["VOCALOID"]);

    const vocaloidWithCovers = buildPlaylistJsonSchema(
      ["vocaloid"],
      "allow_covers"
    );
    expect(
      vocaloidWithCovers.properties.tracks.items.properties.themeType.enum
    ).toEqual(["VOCALOID", "UTAITE"]);
  });

  it("generateFallbackPlaylist supports rhythm_doujin, vocaloid modes, and crossover mixes", () => {
    const rhythmOnly = generateFallbackPlaylist({
      scenes: ["rhythm_doujin"],
      seeds: ["나나히라"],
      moods: [],
      genres: [],
      themeTypes: ["RHYTHM", "DOUJIN"],
      era: "ALL",
      trackCount: 5,
    });
    expect(rhythmOnly.scenes).toEqual(["rhythm_doujin"]);
    expect(rhythmOnly.tracks.length).toBeGreaterThan(0);
    expect(
      rhythmOnly.tracks.every((t) => t.scene === "rhythm_doujin")
    ).toBe(true);
    expect(
      rhythmOnly.tracks.some((t) => t.artist.includes("ななひら"))
    ).toBe(true);

    const vocaloidOriginalOnly = generateFallbackPlaylist({
      scenes: ["vocaloid"],
      vocaloidVocalMode: "original_only",
      seeds: [],
      moods: [],
      genres: [],
      themeTypes: ["VOCALOID", "UTAITE"],
      era: "ALL",
      trackCount: 6,
    });
    expect(
      vocaloidOriginalOnly.tracks.every(
        (t) => t.scene === "vocaloid" && t.themeType !== "UTAITE"
      )
    ).toBe(true);

    const crossover = generateFallbackPlaylist({
      scenes: ["anime", "rhythm_doujin"],
      seeds: ["나나히라"],
      moods: [],
      genres: [],
      themeTypes: ["OP", "DOUJIN", "RHYTHM"],
      era: "ALL",
      trackCount: 6,
    });
    expect(crossover.tracks.some((t) => t.scene === "anime")).toBe(true);
    expect(crossover.tracks.some((t) => t.scene === "rhythm_doujin")).toBe(
      true
    );
  });
});
