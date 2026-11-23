import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getValidYouTubeSession } from "@/lib/oauth";
import { resolveUserAccountKey } from "@/lib/profile-store";
import { createYouTubePlaylist } from "@/lib/youtube";
import type { PlaylistExportResponse, PlaylistTrack } from "@/types/playlist";

const ExportSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(4900).optional().default(""),
  privacyStatus: z.enum(["private", "unlisted", "public"]).default("private"),
  tracks: z.array(z.any()).min(1).max(50),
});

export async function POST(request: NextRequest) {
  const session = await getValidYouTubeSession();
  if (!session) {
    return NextResponse.json(
      { error: "YouTube 계정이 연결되어 있지 않습니다. 먼저 로그인해 주세요." },
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

    const accountKey = await resolveUserAccountKey();
    const result = await createYouTubePlaylist({
      accessToken: session.accessToken,
      title: parsed.data.title,
      description: parsed.data.description,
      privacyStatus: parsed.data.privacyStatus,
      tracks: parsed.data.tracks as PlaylistTrack[],
      accountKey,
    });

    const addedCount = result.results.filter((r) => r.status === "added").length;
    const response: PlaylistExportResponse = {
      platform: "youtube",
      playlistId: result.playlistId,
      playlistUrl: result.youtubeMusicUrl,
      secondaryUrl: result.youtubeUrl,
      addedCount,
      totalCount: result.results.length,
      results: result.results,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[POST /api/export/youtube] Error:", err);
    const message =
      err instanceof Error ? err.message : "YouTube 플레이리스트 내보내기에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
