import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { KnownTrackItem, TasteDNA } from "@/types/playlist";

const TasteDNASchema = z.object({
  summary: z.string().min(1),
  sonicTraits: z.array(z.string()).min(1).max(6),
  favoriteArtists: z.array(z.string()).max(8),
  eraPreference: z.string().min(1),
  recommendedSeeds: z.array(z.string()).max(6),
});

const TASTE_DNA_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "1-2 sentences in Korean summarizing the user's anime song / Japanese music taste DNA concisely.",
    },
    sonicTraits: {
      type: "array",
      items: { type: "string" },
      description:
        "3-5 concise Korean tags describing instrumentation, vocal tone, or mood patterns (e.g., '밴드 기타록', '고음 여성 보컬', '서정 피아노 전조').",
    },
    favoriteArtists: {
      type: "array",
      items: { type: "string" },
      description:
        "3-6 recurring anime song artists, bands, or composers detected in the library.",
    },
    eraPreference: {
      type: "string",
      description:
        "Concise Korean phrase describing dominant era (e.g. '2010년대 후반 ~ 2020년대 중심').",
    },
    recommendedSeeds: {
      type: "array",
      items: { type: "string" },
      description:
        "2-4 anime titles or artists inferred from their library that work great as setlist seeds.",
    },
  },
  required: [
    "summary",
    "sonicTraits",
    "favoriteArtists",
    "eraPreference",
    "recommendedSeeds",
  ],
};

function buildFallbackTasteDNA(tracks: KnownTrackItem[]): TasteDNA {
  const channelCounts = new Map<string, number>();
  for (const t of tracks) {
    const ch = t.channelTitle?.trim();
    if (!ch) continue;
    channelCounts.set(ch, (channelCounts.get(ch) ?? 0) + 1);
  }

  const topChannels = Array.from(channelCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  return {
    summary: `불러온 ${tracks.length}개 항목을 바탕으로 추출한 기본 취향 요약입니다. GEMINI_API_KEY가 연결되면 작품 계보·음향 질감까지 정밀 분석됩니다.`,
    sonicTraits: ["라이브러리 기반 선곡", "OP/ED 균형", "서사 중심 흐름"],
    favoriteArtists: topChannels,
    eraPreference: "라이브러리 전 시대 혼합",
    recommendedSeeds: topChannels.slice(0, 3),
  };
}

export async function analyzeTasteDNA(
  tracks: KnownTrackItem[]
): Promise<TasteDNA> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || tracks.length === 0) {
    return buildFallbackTasteDNA(tracks);
  }

  const ai = new GoogleGenAI({ apiKey });

  const compactTrackList = tracks
    .slice(0, 120)
    .map(
      (t, i) =>
        `${i + 1}. ${t.rawTitle}${t.channelTitle ? ` (채널: ${t.channelTitle})` : ""}`
    )
    .join("\n");

  const interaction = await ai.interactions.create({
    model: "gemini-3.8-flash",
    store: false,
    system_instruction: `당신은 일본 애니메이션 음악(애니송) 및 J-POP 전문 음악 프로파일러입니다.
사용자의 YouTube 플레이리스트/좋아요 목록에는 일반 유튜브 영상이나 비애니송 영상이 일부 섞여 있을 수 있습니다.
비음악/노이즈 영상은 무시하고, 애니송·보컬로이드·일본 밴드·게임/애니 OST 트랙들을 중심으로 사용자의 "애니송 취향 DNA"를 날카롭게 추출하세요.`,
    input: `다음은 사용자가 선택한 YouTube 라이브러리 목록입니다. 이 목록에서 음악 취향 패턴(사운드 질감, 보컬 톤, 선호 아티스트/작곡가 계보, 주력 연대, 추천 시드 작품)을 분석해 주세요.\n\n${compactTrackList}`,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: TASTE_DNA_JSON_SCHEMA,
    },
  });

  const text = interaction.output_text;
  if (!text) {
    return buildFallbackTasteDNA(tracks);
  }

  return TasteDNASchema.parse(JSON.parse(text));
}
