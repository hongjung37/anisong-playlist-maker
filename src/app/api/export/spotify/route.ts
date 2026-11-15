import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getValidSpotifySession } from "@/lib/oauth";
import { createSpotifyPlaylist } from "@/lib/spotify";
import type { PlaylistExportResponse, PlaylistTrack } from "@/types/playlist";

const ExportSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(300).optional().default(""),
  isPublic: z.boolean().default(false),
  tracks: z.array(z.any()).min(1).max(50),
});

export async function POST(request: NextRequest) {
  const session = await getValidSpotifySession();
  if (!session) {
    return NextResponse.json(
      { error: "Spotify 계정이 연결되어 있지 않습니다. 먼저 로그인해 주세요." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const parsed = ExportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "내보내기 요청 데이터가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const result = await createSpotifyPlaylist({
      accessToken: session.accessToken,
      title: parsed.data.title,
      description: parsed.data.description,
      isPublic: parsed.data.isPublic,
      tracks: parsed.data.tracks as PlaylistTrack[],
    });

    const addedCount = result.results.filter((r) => r.status === "added").length;
    const response: PlaylistExportResponse = {
      platform: "spotify",
      playlistId: result.playlistId,
      playlistUrl: result.spotifyUrl,
      addedCount,
      totalCount: result.results.length,
      results: result.results,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[POST /api/export/spotify] Error:", err);
    const message =
      err instanceof Error ? err.message : "Spotify 플레이리스트 내보내기에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
