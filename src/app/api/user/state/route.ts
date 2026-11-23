import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  readUserData,
  resolveUserAccountKey,
  saveUserAniListUsername,
  saveUserCustomPresets,
  saveUserLastPlaylist,
  saveUserTasteProfile,
} from "@/lib/profile-store";
import type {
  CustomPreset,
  GeneratedPlaylist,
  TasteProfile,
} from "@/types/playlist";

const PutStateSchema = z.object({
  tasteProfile: z.any().optional(),
  lastPlaylist: z.any().optional(),
  customPresets: z.any().optional(),
  anilistUsername: z.string().nullable().optional(),
});

export async function GET() {
  try {
    const data = await readUserData();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/user/state] Error:", err);
    return NextResponse.json(
      { error: "저장된 사용자 데이터를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PutStateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "상태 저장 요청 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const accountKey = await resolveUserAccountKey();
    let updated = await readUserData(accountKey);

    if (parsed.data.tasteProfile !== undefined) {
      updated = await saveUserTasteProfile(
        parsed.data.tasteProfile as TasteProfile | null,
        accountKey
      );
    }

    if (parsed.data.lastPlaylist !== undefined) {
      updated = await saveUserLastPlaylist(
        parsed.data.lastPlaylist as GeneratedPlaylist | null,
        { appendHistory: false, accountKey }
      );
    }

    if (parsed.data.customPresets !== undefined) {
      updated = await saveUserCustomPresets(
        Array.isArray(parsed.data.customPresets)
          ? (parsed.data.customPresets as CustomPreset[])
          : [],
        accountKey
      );
    }

    if (parsed.data.anilistUsername !== undefined) {
      updated = await saveUserAniListUsername(
        parsed.data.anilistUsername,
        accountKey
      );
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PUT /api/user/state] Error:", err);
    return NextResponse.json(
      { error: "상태 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const target = request.nextUrl.searchParams.get("target");
    const accountKey = await resolveUserAccountKey();

    if (target === "tasteProfile") {
      const updated = await saveUserTasteProfile(null, accountKey);
      return NextResponse.json(updated);
    }

    if (target === "lastPlaylist") {
      const updated = await saveUserLastPlaylist(null, {
        appendHistory: false,
        accountKey,
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json(
      { error: "삭제 대상(target)을 지정해 주세요." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[DELETE /api/user/state] Error:", err);
    return NextResponse.json(
      { error: "데이터 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
