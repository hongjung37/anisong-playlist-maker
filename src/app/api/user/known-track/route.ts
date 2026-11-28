import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveUserAccountKey,
  toggleUserManualKnownTrack,
} from "@/lib/profile-store";
import { markTrackKnownInCache } from "@/lib/youtube-cache";
import type { KnownTrackItem } from "@/types/playlist";

const KnownTrackSchema = z.object({
  track: z.object({
    title: z.string().min(1),
    titleRomaji: z.string().optional(),
    artist: z.string().min(1),
    artistRomaji: z.string().optional(),
    animeTitle: z.string().optional(),
    youtubeVideoId: z.string().nullable().optional(),
    scene: z.enum(["anime", "vocaloid", "rhythm_doujin"]).optional(),
  }),
  known: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = KnownTrackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "아는 곡 등록 요청 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const { track, known } = parsed.data;
    const accountKey = await resolveUserAccountKey();
    const videoId = track.youtubeVideoId ?? undefined;

    const knownItem: KnownTrackItem = {
      rawTitle: `${track.title} - ${track.artist}`,
      channelTitle: track.artist,
      videoId,
      sourceName: "수동 등록",
      ...(track.scene ? { scene: track.scene } : {}),
    };

    const [updated] = await Promise.all([
      toggleUserManualKnownTrack(knownItem, known, accountKey),
      markTrackKnownInCache(track, accountKey, known, videoId),
    ]);

    return NextResponse.json({
      known,
      manualKnownTracksCount: updated.manualKnownTracks?.length ?? 0,
    });
  } catch (err) {
    console.error("[POST /api/user/known-track] Error:", err);
    return NextResponse.json(
      { error: "아는 곡 상태를 저장하는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
