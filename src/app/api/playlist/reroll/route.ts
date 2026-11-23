import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rerollSingleTrackWithGemini } from "@/lib/gemini-curator";
import {
  enrichPlaylistTracks,
  loadUserTrackContext,
} from "@/lib/track-enrichment";
import type { GeneratedPlaylist } from "@/types/playlist";

const RerollSchema = z.object({
  playlist: z.object({
    title: z.string().min(1),
    description: z.string(),
    curatorSummary: z.string(),
    mode: z.enum(["gemini", "demo-fallback"]),
    tracks: z.array(z.any()).min(1),
  }),
  trackId: z.string().min(1),
  hint: z.string().max(300).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RerollSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "트랙 교체 요청 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const currentPlaylist = parsed.data.playlist as GeneratedPlaylist;
    const targetTrack = currentPlaylist.tracks.find(
      (t) => t.id === parsed.data.trackId
    );
    if (!targetTrack) {
      return NextResponse.json(
        { error: "교체할 트랙을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const { knownTracks, userKnownKeys, ytAuth } = await loadUserTrackContext();

    const replacement = await rerollSingleTrackWithGemini({
      currentPlaylist,
      targetTrack,
      hint: parsed.data.hint,
      knownTracks,
      userKnownKeys,
    });

    const [enriched] = await enrichPlaylistTracks(
      [replacement],
      ytAuth,
      knownTracks
    );

    return NextResponse.json({ track: enriched });
  } catch (err) {
    console.error("[POST /api/playlist/reroll] Error:", err);
    const message =
      err instanceof Error ? err.message : "트랙 교체 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
