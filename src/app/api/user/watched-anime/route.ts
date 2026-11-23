import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  addWatchedAnime,
  readWatchedAnime,
  removeWatchedAnime,
} from "@/lib/watched-anime-store";

const AddWatchedSchema = z.object({
  title: z.string().trim().min(1).max(120),
  status: z.enum(["완료", "보는 중"]).optional().default("완료"),
  rating: z.string().max(40).nullable().optional(),
  genre: z.string().max(40).nullable().optional(),
  rank: z.number().int().min(1).max(9999).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    void request.nextUrl;
    const items = await readWatchedAnime();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[GET /api/user/watched-anime] Error:", err);
    return NextResponse.json(
      { error: "본 작품 목록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = AddWatchedSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "추가할 작품 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const items = await addWatchedAnime({
      ...parsed.data,
      source: "manual",
    });

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[POST /api/user/watched-anime] Error:", err);
    return NextResponse.json(
      { error: "본 작품을 저장하는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = (request.nextUrl.searchParams.get("id") ?? "").trim();
    if (!id) {
      return NextResponse.json(
        { error: "삭제할 작품 ID를 지정해 주세요." },
        { status: 400 }
      );
    }

    const items = await removeWatchedAnime(id);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[DELETE /api/user/watched-anime] Error:", err);
    return NextResponse.json(
      { error: "본 작품을 삭제하는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
