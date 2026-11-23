import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extendPlaylistWithGemini } from "@/lib/gemini-curator";
import {
  enrichPlaylistTracks,
  loadUserTrackContext,
} from "@/lib/track-enrichment";
import type { GeneratedPlaylist } from "@/types/playlist";

const ExtendSchema = z.object({
  playlist: z.object({
    title: z.string().min(1),
    description: z.string(),
    curatorSummary: z.string(),
    mode: z.enum(["gemini", "demo-fallback"]),
    tracks: z.array(z.any()).min(1),
  }),
  addCount: z.number().int().min(1).max(10).optional().default(5),
  instruction: z.string().max(300).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ExtendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "트랙 추가 요청 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const currentPlaylist = parsed.data.playlist as GeneratedPlaylist;
    const { knownTracks, userKnownKeys, ytAuth } = await loadUserTrackContext();

    const addedTracks = await extendPlaylistWithGemini({
      currentPlaylist,
      addCount: parsed.data.addCount,
      instruction: parsed.data.instruction,
      knownTracks,
      userKnownKeys,
    });

    const enriched = await enrichPlaylistTracks(
      addedTracks,
      ytAuth,
      knownTracks
    );

    return NextResponse.json({ tracks: enriched });
  } catch (err) {
    console.error("[POST /api/playlist/extend] Error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "플레이리스트 확장 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
