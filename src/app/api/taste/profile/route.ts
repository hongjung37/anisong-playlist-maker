import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveUserTasteProfile } from "@/lib/profile-store";
import { analyzeTasteDNA } from "@/lib/taste-profiler";
import type { TasteProfile } from "@/types/playlist";

const ProfileRequestSchema = z.object({
  tracks: z
    .array(
      z.object({
        rawTitle: z.string().min(1),
        channelTitle: z.string().optional(),
        videoId: z.string().optional(),
        sourceName: z.string(),
      })
    )
    .min(1)
    .max(600),
  sourceSignature: z.string().optional().default(""),
  selectedSources: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        count: z.number().int().nonnegative(),
      })
    )
    .optional()
    .default([]),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ProfileRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "분석할 트랙 목록 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const dna = await analyzeTasteDNA(parsed.data.tracks);

    const tasteProfile: TasteProfile = {
      version: 1,
      sourceSignature: parsed.data.sourceSignature,
      updatedAt: new Date().toISOString(),
      selectedSources: parsed.data.selectedSources,
      dna,
      knownTracks: parsed.data.tracks,
    };

    const saved = await saveUserTasteProfile(tasteProfile);

    return NextResponse.json({
      dna,
      tasteProfile: saved.tasteProfile,
      accountKey: saved.accountKey,
    });
  } catch (err) {
    console.error("[POST /api/taste/profile] Error:", err);
    const message =
      err instanceof Error ? err.message : "취향 DNA 분석 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
