import { NextRequest, NextResponse } from "next/server";
import { fetchAniListUserList } from "@/lib/anilist";
import {
  resolveUserAccountKey,
  saveUserAniListUsername,
} from "@/lib/profile-store";

export async function GET(request: NextRequest) {
  const username = (request.nextUrl.searchParams.get("username") ?? "").trim();
  const statusParam = (
    request.nextUrl.searchParams.get("status") ?? "ALL"
  ).toUpperCase();

  if (username.length < 1 || username.length > 50) {
    return NextResponse.json(
      { error: "AniList 사용자 이름(1~50자)을 입력해 주세요." },
      { status: 400 }
    );
  }

  const statuses: Array<"CURRENT" | "COMPLETED" | "REPEATING" | "PAUSED"> =
    statusParam === "COMPLETED"
      ? ["COMPLETED"]
      : statusParam === "CURRENT"
        ? ["CURRENT", "REPEATING"]
        : ["CURRENT", "COMPLETED", "REPEATING", "PAUSED"];

  const result = await fetchAniListUserList(username, statuses);

  if (result.notFound) {
    return NextResponse.json(
      {
        error:
          result.error ??
          "AniList 사용자를 찾을 수 없거나 시청 목록이 비공개입니다.",
      },
      { status: 404 }
    );
  }

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  try {
    const accountKey = await resolveUserAccountKey();
    await saveUserAniListUsername(username, accountKey);
  } catch {
    // Non-fatal persistence failure
  }

  return NextResponse.json({
    username,
    items: result.items,
  });
}
