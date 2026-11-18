import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getYouTubeQuotaStatus,
  setManualYouTubeQuotaUsed,
  YOUTUBE_DAILY_QUOTA_LIMIT,
} from "@/lib/youtube-quota";

export async function GET() {
  const status = await getYouTubeQuotaStatus();
  return NextResponse.json(status);
}

const PatchSchema = z.object({
  usedUnits: z.number().min(0).max(YOUTUBE_DAILY_QUOTA_LIMIT).optional(),
  remainingUnits: z.number().min(0).max(YOUTUBE_DAILY_QUOTA_LIMIT).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "유효한 유닛 값을 입력해 주세요 (0 ~ 10,000)." },
        { status: 400 }
      );
    }

    const used =
      parsed.data.usedUnits !== undefined
        ? parsed.data.usedUnits
        : parsed.data.remainingUnits !== undefined
          ? YOUTUBE_DAILY_QUOTA_LIMIT - parsed.data.remainingUnits
          : null;

    if (used === null) {
      return NextResponse.json(
        { error: "usedUnits 또는 remainingUnits가 필요합니다." },
        { status: 400 }
      );
    }

    const updated = await setManualYouTubeQuotaUsed(used);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "할당량 보정 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
