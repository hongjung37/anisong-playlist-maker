import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getValidYouTubeSession } from "@/lib/oauth";
import { searchYouTubeTrack, YouTubeApiError } from "@/lib/youtube";

const ResolveSchema = z.object({
  tracks: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        titleRomaji: z.string().optional().default(""),
        artist: z.string().min(1),
        artistRomaji: z.string().optional().default(""),
        animeTitleJapanese: z.string().optional().default(""),
        animeTitleRomaji: z.string().optional().default(""),
        themeLabel: z.string().optional().default(""),
      })
    )
    .min(1)
    .max(5),
  excludeVideoIds: z.array(z.string()).optional().default([]),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ResolveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "영상 ID 조회 요청 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const ytSession = await getValidYouTubeSession();
    const auth = ytSession
      ? { accessToken: ytSession.accessToken }
      : process.env.YOUTUBE_API_KEY
        ? { apiKey: process.env.YOUTUBE_API_KEY }
        : null;

    if (!auth) {
      return NextResponse.json(
        {
          error:
            "웹 재생용 영상 매칭을 위해 YouTube 계정을 연결하거나 YOUTUBE_API_KEY를 설정해 주세요.",
          configured: false,
        },
        { status: 401 }
      );
    }

    const resolved: Record<
      string,
      {
        youtubeVideoId: string;
        youtubeCandidateIds: string[];
        youtubeUrl: string;
        youtubeMusicUrl: string;
      }
    > = {};

    await Promise.all(
      parsed.data.tracks.map(async (track) => {
        const match = await searchYouTubeTrack(track, auth, {
          embeddableOnly: true,
          excludeVideoIds: parsed.data.excludeVideoIds,
          maxStepCount: 4,
          throwOnError: true,
        });
        if (match) {
          resolved[track.id] = {
            youtubeVideoId: match.videoId,
            youtubeCandidateIds: match.candidateVideoIds,
            youtubeUrl: `https://www.youtube.com/watch?v=${match.videoId}`,
            youtubeMusicUrl: `https://music.youtube.com/watch?v=${match.videoId}`,
          };
        }
      })
    );

    return NextResponse.json({ resolved, configured: true });
  } catch (err) {
    console.error("[POST /api/youtube/resolve] Error:", err);
    if (err instanceof YouTubeApiError) {
      return NextResponse.json(
        { error: err.message, configured: err.status !== 401 },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: "영상 ID를 찾는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
