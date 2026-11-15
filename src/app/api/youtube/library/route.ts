import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getValidYouTubeSession } from "@/lib/oauth";
import {
  fetchYouTubePlaylistTracks,
  listUserYouTubePlaylists,
} from "@/lib/youtube";

const FetchTracksSchema = z.object({
  sources: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
      })
    )
    .min(1)
    .max(10),
});

export async function GET() {
  const session = await getValidYouTubeSession();
  if (!session) {
    return NextResponse.json(
      { error: "YouTube 계정이 연결되어 있지 않습니다." },
      { status: 401 }
    );
  }

  try {
    const playlists = await listUserYouTubePlaylists(session.accessToken);
    return NextResponse.json({ playlists });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "YouTube 라이브러리 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getValidYouTubeSession();
  if (!session) {
    return NextResponse.json(
      { error: "YouTube 계정이 연결되어 있지 않습니다." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const parsed = FetchTracksSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "선택한 플레이리스트 정보가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const result = await fetchYouTubePlaylistTracks({
      accessToken: session.accessToken,
      sources: parsed.data.sources,
      maxTotalTracks: 150,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "플레이리스트 트랙 추출 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
