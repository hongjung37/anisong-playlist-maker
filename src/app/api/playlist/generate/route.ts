import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enrichTracksWithAniList } from "@/lib/anilist";
import { generatePlaylistWithGemini } from "@/lib/gemini-curator";
import { getValidYouTubeSession } from "@/lib/oauth";
import {
  readUserData,
  resolveUserAccountKey,
  saveUserLastPlaylist,
} from "@/lib/profile-store";
import { enrichTracksWithYouTube } from "@/lib/youtube";
import { getUserKnownTrackKeys } from "@/lib/youtube-cache";
import type {
  ExcludedTrackRef,
  GeneratedPlaylist,
  StoredUserData,
} from "@/types/playlist";

function collectExcludedRecentTracks(
  stored: StoredUserData,
  turns: number
): ExcludedTrackRef[] {
  if (turns <= 0) return [];

  const recentPlaylists =
    stored.playlistHistory.length > 0
      ? stored.playlistHistory.slice(0, turns).map((h) => h.playlist)
      : stored.lastPlaylist
        ? [stored.lastPlaylist]
        : [];

  const seen = new Set<string>();
  const excluded: ExcludedTrackRef[] = [];

  for (const pl of recentPlaylists) {
    for (const track of pl.tracks) {
      const key = `${track.title.trim().toLowerCase()}::${track.artist.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      excluded.push({
        title: track.title,
        titleRomaji: track.titleRomaji,
        artist: track.artist,
        artistRomaji: track.artistRomaji,
        animeTitle: track.animeTitle,
      });
    }
  }

  return excluded;
}

const RequestSchema = z.object({
  seeds: z.array(z.string()).default([]),
  moods: z.array(z.string()).default([]),
  genres: z.array(z.string()).default([]),
  themeTypes: z
    .array(z.enum(["OP", "ED", "OST", "INSERT", "CHARACTER"]))
    .default(["OP", "ED", "INSERT"]),
  era: z.enum(["ALL", "2020s", "2010s", "2000s", "classic"]).default("ALL"),
  trackCount: z.number().int().min(5).max(25).default(12),
  prompt: z.string().max(600).optional().default(""),
  includeHiddenGems: z.boolean().optional().default(true),
  popularityLevel: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  familiarityLevel: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ])
    .optional()
    .default(3),
  excludeRecentTurns: z.number().int().min(0).max(10).optional().default(0),
  tasteProfile: z
    .object({
      dna: z.object({
        summary: z.string(),
        sonicTraits: z.array(z.string()),
        favoriteArtists: z.array(z.string()),
        eraPreference: z.string(),
        recommendedSeeds: z.array(z.string()),
      }),
      knownTracks: z.array(
        z.object({
          rawTitle: z.string(),
          channelTitle: z.string().optional(),
          videoId: z.string().optional(),
          sourceName: z.string(),
        })
      ),
    })
    .nullable()
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "요청 형식이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const accountKey = await resolveUserAccountKey();
    let effectiveTaste = parsed.data.tasteProfile;
    const stored = await readUserData(accountKey);

    // Automatically fall back to server-persisted taste profile if client omitted it
    if (effectiveTaste === undefined && stored.tasteProfile) {
      effectiveTaste = {
        dna: stored.tasteProfile.dna,
        knownTracks: stored.tasteProfile.knownTracks,
      };
    }

    const excludedRecentTracks = collectExcludedRecentTracks(
      stored,
      parsed.data.excludeRecentTurns
    );

    const effectivePopularity =
      parsed.data.popularityLevel ?? (parsed.data.includeHiddenGems ? 3 : 2);

    const [userKnownKeys] = await Promise.all([getUserKnownTrackKeys()]);

    const playlist = await generatePlaylistWithGemini(
      {
        ...parsed.data,
        popularityLevel: effectivePopularity,
        tasteProfile: effectiveTaste ?? null,
      },
      { excludedRecentTracks, userKnownKeys }
    );

    const ytSession = await getValidYouTubeSession();
    const ytAuth = ytSession
      ? { accessToken: ytSession.accessToken }
      : process.env.YOUTUBE_API_KEY
        ? { apiKey: process.env.YOUTUBE_API_KEY }
        : {};

    const knownTracksForLookup =
      effectiveTaste?.knownTracks ?? stored.tasteProfile?.knownTracks ?? [];

    const [aniListEnriched, ytEnriched] = await Promise.all([
      enrichTracksWithAniList(playlist.tracks),
      enrichTracksWithYouTube(playlist.tracks, ytAuth, {
        knownTracks: knownTracksForLookup,
      }),
    ]);

    const mergedTracks = playlist.tracks.map((track, idx) => ({
      ...track,
      coverImage: aniListEnriched[idx]?.coverImage ?? track.coverImage,
      year: aniListEnriched[idx]?.year ?? track.year,
      youtubeVideoId: ytEnriched[idx]?.youtubeVideoId ?? track.youtubeVideoId,
      youtubeCandidateIds:
        ytEnriched[idx]?.youtubeCandidateIds ?? track.youtubeCandidateIds,
      youtubeUrl: ytEnriched[idx]?.youtubeUrl ?? track.youtubeUrl,
      youtubeMusicUrl: ytEnriched[idx]?.youtubeMusicUrl ?? track.youtubeMusicUrl,
    }));

    const finalPlaylist: GeneratedPlaylist = {
      ...playlist,
      tracks: mergedTracks,
    };

    const saved = await saveUserLastPlaylist(finalPlaylist, {
      appendHistory: true,
      accountKey,
    });

    return NextResponse.json({
      ...finalPlaylist,
      playlistHistory: saved.playlistHistory,
    });
  } catch (err) {
    console.error("[POST /api/playlist/generate] Error:", err);
    const message =
      err instanceof Error ? err.message : "플레이리스트 생성 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
