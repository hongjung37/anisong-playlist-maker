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
import { readWatchedAnime } from "@/lib/watched-anime-store";
import type {
  ExcludedTrackRef,
  GeneratedPlaylist,
  GenerationProgressState,
  PlaylistHistoryEntry,
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
  watchedAnimeMode: z
    .enum(["ignore", "prefer_watched", "discover_unwatched"])
    .optional()
    .default("ignore"),
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

async function runGeneratePipeline(
  input: z.infer<typeof RequestSchema>,
  emitProgress?: (progress: GenerationProgressState) => void
): Promise<
  GeneratedPlaylist & { playlistHistory: PlaylistHistoryEntry[] }
> {
  emitProgress?.({
    stage: "preparing",
    message: "취향 프로파일과 중복 제외 목록을 준비 중입니다",
    detail: `요청 곡 수 ${input.trackCount}곡 · 시드 ${input.seeds.length}개`,
    percent: 12,
  });

  const accountKey = await resolveUserAccountKey();
  let effectiveTaste = input.tasteProfile;
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
    input.excludeRecentTurns
  );

  const effectivePopularity =
    input.popularityLevel ?? (input.includeHiddenGems ? 3 : 2);

  const [userKnownKeys, watchedAnime] = await Promise.all([
    getUserKnownTrackKeys(accountKey),
    input.watchedAnimeMode !== "ignore"
      ? readWatchedAnime()
      : Promise.resolve([]),
  ]);
  const manualKnownTracks = stored.manualKnownTracks ?? [];

  emitProgress?.({
    stage: "curating",
    message: "AI 큐레이터가 애니송 셋리를 선곡 중입니다",
    detail:
      excludedRecentTracks.length > 0
        ? `최근 생성 ${excludedRecentTracks.length}곡 중복 제외 적용`
        : "작품 맥락·사운드·셋리 아크 설계 중",
    percent: 32,
  });

  const playlist = await generatePlaylistWithGemini(
    {
      ...input,
      popularityLevel: effectivePopularity,
      tasteProfile: effectiveTaste ?? null,
    },
    {
      excludedRecentTracks,
      userKnownKeys,
      extraKnownTracks: manualKnownTracks,
      watchedAnime,
    }
  );

  emitProgress?.({
    stage: "enriching_anilist",
    message: `${playlist.tracks.length}곡 선곡 완료 · 작품 커버와 YouTube 영상을 매칭 중입니다`,
    detail: playlist.title,
    percent: 65,
  });

  const ytSession = await getValidYouTubeSession();
  const ytAuth = ytSession
    ? { accessToken: ytSession.accessToken }
    : process.env.YOUTUBE_API_KEY
      ? { apiKey: process.env.YOUTUBE_API_KEY }
      : {};

  const knownTracksForLookup = [
    ...(effectiveTaste?.knownTracks ?? stored.tasteProfile?.knownTracks ?? []),
    ...manualKnownTracks,
  ];

  const aniListPromise = enrichTracksWithAniList(playlist.tracks).then(
    (res) => {
      emitProgress?.({
        stage: "enriching_youtube",
        message: "AniList 작품 메타 매칭 완료 · YouTube 캐시/영상 확인 중입니다",
        detail: "재생 가능한 공식 음원 우선 매칭",
        percent: 82,
      });
      return res;
    }
  );
  const ytPromise = enrichTracksWithYouTube(playlist.tracks, ytAuth, {
    knownTracks: knownTracksForLookup,
  });

  const [aniListEnriched, ytEnriched] = await Promise.all([
    aniListPromise,
    ytPromise,
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

  emitProgress?.({
    stage: "saving",
    message: "셋리를 히스토리에 저장하는 중입니다",
    percent: 94,
  });

  const saved = await saveUserLastPlaylist(finalPlaylist, {
    appendHistory: true,
    accountKey,
  });

  return {
    ...finalPlaylist,
    playlistHistory: saved.playlistHistory,
  };
}

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

    const wantsStream =
      request.headers.get("accept")?.includes("application/x-ndjson") ||
      request.nextUrl.searchParams.get("stream") === "1";

    if (!wantsStream) {
      const result = await runGeneratePipeline(parsed.data);
      return NextResponse.json(result);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (payload: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        try {
          const result = await runGeneratePipeline(parsed.data, (progress) => {
            sendEvent({ type: "progress", progress });
          });
          sendEvent({
            type: "progress",
            progress: {
              stage: "done",
              message: "셋리 생성이 완료되었습니다",
              percent: 100,
            } satisfies GenerationProgressState,
          });
          sendEvent({ type: "result", data: result });
        } catch (err) {
          console.error("[POST /api/playlist/generate] Stream Error:", err);
          const message =
            err instanceof Error
              ? err.message
              : "플레이리스트 생성 중 오류가 발생했습니다.";
          sendEvent({ type: "error", error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    console.error("[POST /api/playlist/generate] Error:", err);
    const message =
      err instanceof Error ? err.message : "플레이리스트 생성 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
