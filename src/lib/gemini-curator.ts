import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { buildTrackCacheKeys } from "@/lib/youtube-cache";
import type {
  ExcludedTrackRef,
  FamiliarityLevel,
  GeneratedPlaylist,
  KnownTrackItem,
  PlaylistGenerateRequest,
  PlaylistTrack,
  PopularityLevel,
} from "@/types/playlist";

const TrackSchema = z.object({
  title: z.string().min(1),
  titleRomaji: z.string().min(1),
  artist: z.string().min(1),
  artistRomaji: z.string().min(1),
  animeTitle: z.string().min(1),
  animeTitleJapanese: z.string().min(1),
  animeTitleRomaji: z.string().min(1),
  themeType: z.enum(["OP", "ED", "OST", "INSERT", "CHARACTER"]),
  themeLabel: z.string().min(1),
  year: z.number().int().nullable(),
  bpmVibe: z.string().min(1),
  reason: z.string().min(1),
  setlistSection: z.string().optional(),
});

const GeminiPlaylistSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  curatorSummary: z.string().min(1),
  tracks: z.array(TrackSchema).min(1),
});

const PLAYLIST_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description:
        "Catchy playlist title in Korean (optionally with an anime/music vibe).",
    },
    description: {
      type: "string",
      description:
        "Short playlist description in Korean suitable for YouTube / Spotify playlist description.",
    },
    curatorSummary: {
      type: "string",
      description:
        "2-3 sentences in Korean explaining the curation flow, mood arc, and why these anisongs fit together.",
    },
    tracks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Official song title in original script (Japanese kanji/kana or English as officially released).",
          },
          titleRomaji: {
            type: "string",
            description:
              "Romanized or English song title for reliable Spotify/YouTube matching.",
          },
          artist: {
            type: "string",
            description:
              "Official artist or band/seiyuu unit name in original script.",
          },
          artistRomaji: {
            type: "string",
            description: "Romanized artist name.",
          },
          animeTitle: {
            type: "string",
            description: "Anime title in Korean (as commonly known in Korea).",
          },
          animeTitleJapanese: {
            type: "string",
            description: "Official Japanese anime title.",
          },
          animeTitleRomaji: {
            type: "string",
            description: "Official Romaji/English anime title used on AniList.",
          },
          themeType: {
            type: "string",
            enum: ["OP", "ED", "OST", "INSERT", "CHARACTER"],
          },
          themeLabel: {
            type: "string",
            description:
              "Specific role like OP1, OP2, ED1, 삽입곡, 최종화 ED, 극중가, OST.",
          },
          year: {
            type: ["integer", "null"],
            description: "Release or anime broadcast year.",
          },
          bpmVibe: {
            type: "string",
            description:
              "Concise tempo & sonic vibe tag, e.g. '190 BPM · 질주 기타록' or '84 BPM · 몽환 피아노'.",
          },
          reason: {
            type: "string",
            description:
              "1-2 sentences in Korean explaining why this track fits the user's seeds, moods, and flow.",
          },
          setlistSection: {
            type: "string",
            description:
              "Short Korean setlist arc label such as '오프닝', '빌드업', '피크', '감정 전환', or '앵콜'.",
          },
        },
        required: [
          "title",
          "titleRomaji",
          "artist",
          "artistRomaji",
          "animeTitle",
          "animeTitleJapanese",
          "animeTitleRomaji",
          "themeType",
          "themeLabel",
          "year",
          "bpmVibe",
          "reason",
          "setlistSection",
        ],
      },
    },
  },
  required: ["title", "description", "curatorSummary", "tracks"],
};

function makePlatformSearchUrls(track: {
  title: string;
  artist: string;
  animeTitleJapanese: string;
  animeTitleRomaji: string;
}) {
  const ytQuery = encodeURIComponent(
    `${track.title} ${track.artist} ${track.animeTitleJapanese || track.animeTitleRomaji}`
  );
  const spQuery = encodeURIComponent(`${track.title} ${track.artist}`);
  return {
    youtubeUrl: `https://www.youtube.com/results?search_query=${ytQuery}`,
    youtubeMusicUrl: `https://music.youtube.com/search?q=${ytQuery}`,
    spotifyUrl: `https://open.spotify.com/search/${spQuery}`,
  };
}

function normalizeForCompare(str: string): string {
  return str
    .toLowerCase()
    .replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/[\s\-_'"`~!@#$%^&*+=[\]{};:,.<>?/\\|！？・〜～『』「」]/g, "");
}

function isTrackInKnownLibrary(
  track: { title: string; titleRomaji: string; artist: string },
  knownTracks: KnownTrackItem[]
): boolean {
  if (knownTracks.length === 0) return false;
  const titleTargets = [track.title, track.titleRomaji]
    .map(normalizeForCompare)
    .filter((s) => s.length >= 2);

  for (const known of knownTracks) {
    const rawNorm = normalizeForCompare(known.rawTitle);
    if (!rawNorm) continue;
    for (const target of titleTargets) {
      if (rawNorm.includes(target) || target.includes(rawNorm)) {
        return true;
      }
    }
  }
  return false;
}

function isTrackExcluded(
  track: {
    title: string;
    titleRomaji?: string;
    artist: string;
    artistRomaji?: string;
  },
  excludedTracks: ExcludedTrackRef[]
): boolean {
  if (excludedTracks.length === 0) return false;
  const trackTitles = [track.title, track.titleRomaji ?? ""]
    .map(normalizeForCompare)
    .filter((s) => s.length >= 2);
  const trackArtists = [track.artist, track.artistRomaji ?? ""]
    .map(normalizeForCompare)
    .filter((s) => s.length >= 2);

  for (const ex of excludedTracks) {
    const exTitles = [ex.title, ex.titleRomaji ?? ""]
      .map(normalizeForCompare)
      .filter((s) => s.length >= 2);

    let strongTitleMatch = false;
    let shortTitleMatch = false;

    for (const tt of trackTitles) {
      for (const et of exTitles) {
        if (tt === et) {
          if (tt.length >= 5) strongTitleMatch = true;
          else shortTitleMatch = true;
        } else if (
          tt.length >= 5 &&
          et.length >= 5 &&
          (tt.includes(et) || et.includes(tt))
        ) {
          strongTitleMatch = true;
        }
      }
    }

    if (strongTitleMatch) return true;
    if (!shortTitleMatch) continue;

    const exArtists = [ex.artist, ex.artistRomaji ?? ""]
      .map(normalizeForCompare)
      .filter((s) => s.length >= 2);
    const artistMatch = trackArtists.some((ta) =>
      exArtists.some((ea) => ta === ea || ta.includes(ea) || ea.includes(ta))
    );
    if (artistMatch) return true;
  }

  return false;
}

function describeFamiliarity(
  level: FamiliarityLevel | undefined,
  trackCount: number
): string {
  switch (level) {
    case 1:
      return `1단계 (전부 새로움 0%): 아래 사용자 기존 라이브러리(knownTracks)에 이미 포함된 곡은 절대 넣지 말고 100% 새로운 곡으로만 선곡하세요.`;
    case 2: {
      const target = Math.max(1, Math.round(trackCount * 0.25));
      return `2단계 (발굴 위주 ~25%): 전체 ${trackCount}곡 중 약 ${target}곡 정도만 사용자 라이브러리(knownTracks)에서 셋리의 오프닝/피크/앵콜 앵커로 선택하고, 나머지 약 ${trackCount - target}곡은 라이브러리에 없는 새로운 곡으로 채우세요.`;
    }
    case 4: {
      const target = Math.max(1, Math.round(trackCount * 0.75));
      return `4단계 (내 애청곡 재구성 ~75%): 전체 ${trackCount}곡 중 약 ${target}곡을 사용자 라이브러리(knownTracks) 속 검증된 곡들로 선별해 라이브 셋리 흐름으로 재배치하고, 나머지 약 ${trackCount - target}곡만 연결감 좋은 새 곡으로 보충하세요.`;
    }
    case 5:
      return `5단계 (내 애청곡 100% — 라이브러리 전용 셋리): 반드시 아래 사용자 기존 라이브러리(knownTracks)에 포함된 곡들만 사용해서 ${trackCount}곡 셋리를 구성하세요. 라이브러리에 없는 새로운 곡은 넣지 말고, 요청한 분위기·장르·흐름(오프닝/빌드업/피크/앵콜)에 가장 잘 맞게 배치하세요. (단, 라이브러리의 애니송 수가 ${trackCount}곡보다 부족할 때만 부족분만 결이 맞는 곡으로 채우세요.)`;
    case 3:
    default: {
      const target = Math.max(1, Math.round(trackCount * 0.5));
      return `3단계 (황금 밸런스 ~50%): 전체 ${trackCount}곡 중 약 ${target}곡은 사용자 라이브러리(knownTracks)에 있는 익숙한 애청곡에서 고르고, 나머지 약 ${trackCount - target}곡은 그와 결이 맞지만 라이브러리에 없는 신규 곡으로 교차 배치하세요.`;
    }
  }
}

function resolvePopularityLevel(input: PlaylistGenerateRequest): PopularityLevel {
  if (input.popularityLevel) return input.popularityLevel;
  return input.includeHiddenGems === false ? 2 : 3;
}

function describePopularity(level: PopularityLevel): string {
  switch (level) {
    case 1:
      return "1단계 (메이저·대표곡 위주): 각 작품과 애니송 씬을 대표하는 메가히트곡, 1쿨 메인 OP/ED 등 대중적 인지도가 가장 높은 곡 위주로 구성하세요.";
    case 2:
      return "2단계 (대중곡 + 명곡 밸런스): 널리 알려진 대표곡과 팬층에서 꾸준히 사랑받는 명곡을 절반씩 균형 있게 배합하세요.";
    case 3:
      return "3단계 (숨은 명곡·중견 트랙 중심): 뻔한 메가히트곡(예: 아이돌, 홍련화, 잔혹한 천사의 테제 등) 비중을 낮추고, 팬들이 극찬하는 2쿨/후반부 OP·ED나 극중 삽입곡·명품 OST를 절반 이상 포함하세요.";
    case 4:
      return "4단계 (마이너·코어 딥컷 중심): 누구나 아는 대표 메가히트곡은 배제하고, B-side 수록곡·특정 화수 극중 삽입곡·캐릭터송·비주류 명작/OVA 타이업 등 코어 팬이 꼽는 딥컷 위주로 선곡하세요. (단, 실존 여부와 정확한 공식 제목이 확실한 곡만 선택할 것)";
  }
}

function hydrateTracks(
  rawTracks: z.infer<typeof TrackSchema>[],
  knownTracks: KnownTrackItem[] = [],
  userKnownKeys: Set<string> = new Set()
): PlaylistTrack[] {
  const seen = new Set<string>();
  const result: PlaylistTrack[] = [];

  for (const item of rawTracks) {
    const dedupeKey = `${item.title.toLowerCase()}::${item.artist.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const inKnownList =
      knownTracks.length > 0 && isTrackInKnownLibrary(item, knownTracks);
    const inUserKnownCache =
      userKnownKeys.size > 0 &&
      buildTrackCacheKeys(item).some((k) => userKnownKeys.has(k));

    const urls = makePlatformSearchUrls(item);
    result.push({
      id: `trk-${result.length + 1}-${Buffer.from(dedupeKey)
        .toString("hex")
        .slice(0, 8)}`,
      ...item,
      inUserLibrary:
        knownTracks.length > 0 || userKnownKeys.size > 0
          ? inKnownList || inUserKnownCache
          : undefined,
      coverImage: null,
      youtubeVideoId: null,
      spotifyUri: null,
      ...urls,
    });
  }

  return result;
}

function describeEra(era: PlaylistGenerateRequest["era"]): string {
  switch (era) {
    case "2020s":
      return "2020년~현재 방영작 위주";
    case "2010s":
      return "2010년대(2010~2019) 방영작 위주";
    case "2000s":
      return "2000년대(2000~2009) 방영작 위주";
    case "classic":
      return "1990년대 및 그 이전 클래식 애니송 위주";
    default:
      return "연대 제한 없음 (전 시대 명곡 조화)";
  }
}

export async function generatePlaylistWithGemini(
  input: PlaylistGenerateRequest,
  options?: {
    excludedRecentTracks?: ExcludedTrackRef[];
    userKnownKeys?: Set<string>;
  }
): Promise<GeneratedPlaylist> {
  const excludedRecentTracks = options?.excludedRecentTracks ?? [];
  const userKnownKeys = options?.userKnownKeys ?? new Set<string>();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return generateFallbackPlaylist(input, options);
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `당신은 일본 애니메이션 음악(애니송, OP/ED, 극중 삽입곡, BGM/OST, 캐릭터송) 전문 큐레이터 'AniTune'입니다.
유튜브 뮤직이나 스포티파이의 일반 추천 알고리즘이 놓치는 '작품의 맥락, 밴드/작곡가 계보(예: 사와노 히로유키, 료/supercell, 키타니 타츠야, ZAQ, OxT, KANA-BOON, 요루시카, 미나미, 호시노 겐 등), 음향적 질감, 감정선'을 정확히 짚어내어 플레이리스트를 설계합니다.

반드시 지켜야 할 규칙:
1. 실제로 존재하는 정확한 애니메이션과 실제 타이업(OP/ED/삽입곡/OST/캐릭터송) 곡만 추천하세요. 존재하지 않는 곡이나 다른 작품의 곡을 섞어 지어내면 안 됩니다.
2. YouTube와 Spotify 검색 정확도를 높이기 위해 원어 곡명/아티스트명과 로마자(영어) 표기를 모두 정확히 채우세요.
3. 사용자가 선택한 테마 타입(OP, ED, OST, INSERT, CHARACTER), 연대, 분위기에 최대한 맞추세요.
4. 트랙 순서에도 신경 쓰세요 (오프닝으로 분위기를 열고, 중간에 감정 변주를 주며, 마지막 트랙으로 여운을 남기는 흐름).
5. 중복된 곡은 넣지 말고, 요청한 트랙 수에 정확히 맞추세요.
6. 인지도/대중성(메이저↔마이너 4단계) 지침을 반드시 반영하되, 마이너 단계일수록 존재하지 않는 곡이나 불확실한 제목을 지어내지 말고 실존과 공식 음원명이 확실한 곡만 고르세요.
7. 선호 장르/스타일(예: 전파송, 기타록, 심포닉 오케스트라, 유로비트, 보컬로이드계 등)이 지정되면 편곡 문법과 사운드 질감이 해당 장르에 정확히 부합하는 곡을 우선 선택하세요.
8. [최근 생성 플레이리스트 중복 제외 목록]이 주어지면 해당 곡들은 직전/최근 생성 셋리에 이미 들어간 곡이므로 이번 셋리에서 반드시 제외하세요.
9. 사용자 라이브러리(knownTracks)에 일반 J-POP·보컬로이드·유튜브 커버 등 애니메이션 타이업이 아닌 곡이 섞여 있더라도, 선곡 결과에는 반드시 실제 애니메이션 공식 타이업(OP/ED/OST/삽입곡/캐릭터송)인 곡만 포함하세요. 비애니송을 끼워 넣거나 타이업을 지어내지 마세요.`;

  const knownTracks = input.tasteProfile?.knownTracks ?? [];
  const tasteDna = input.tasteProfile?.dna ?? null;
  const familiarityLevel = input.familiarityLevel ?? 3;
  const popularityLevel = resolvePopularityLevel(input);
  const genres = input.genres ?? [];
  const requestedCount =
    excludedRecentTracks.length > 0
      ? Math.min(30, input.trackCount + 3)
      : input.trackCount;

  const excludedBlock =
    excludedRecentTracks.length > 0
      ? `\n[최근 생성 플레이리스트 중복 제외 목록 (총 ${excludedRecentTracks.length}곡 중 최대 120곡 표기 — 절대 중복 선곡 금지)]
- 아래 곡들은 취향/라이브러리 목록에 들어있더라도 최근 생성한 셋리에 이미 포함되었으므로 이번 셋리에는 절대 넣지 마세요.
${excludedRecentTracks
  .slice(0, 120)
  .map(
    (ex, i) =>
      `  ${i + 1}. ${ex.title}${ex.titleRomaji && ex.titleRomaji !== ex.title ? ` (${ex.titleRomaji})` : ""} - ${ex.artist}${ex.animeTitle ? ` [${ex.animeTitle}]` : ""}`
  )
  .join("\n")}\n`
      : "";

  const tasteContextBlock = tasteDna
    ? `\n[사용자 취향 DNA 프로파일]
- 요약: ${tasteDna.summary}
- 선호 음향/분위기 특징: ${tasteDna.sonicTraits.join(", ")}
- 자주 듣는 아티스트/계보: ${tasteDna.favoriteArtists.join(", ") || "특정 불가"}
- 주력 시대감: ${tasteDna.eraPreference}
- 아는 곡 비중 지침: ${describeFamiliarity(familiarityLevel, input.trackCount)}
- 사용자 라이브러리 곡 목록(참고 및 비중 조절용, 최대 100곡):
${knownTracks
  .slice(0, 100)
  .map(
    (k, i) =>
      `  ${i + 1}. ${k.rawTitle}${k.channelTitle ? ` (${k.channelTitle})` : ""}`
  )
  .join("\n")}\n`
    : "";

  const userPrompt = `다음 조건에 맞는 애니송 셋리(플레이리스트)를 ${requestedCount}곡으로 큐레이션해 주세요.${
    requestedCount > input.trackCount
      ? ` (중복 제외 후 최종 ${input.trackCount}곡 선별용 여유분 포함)`
      : ""
  }

- 시드(기준 작품 / 곡 / 아티스트): ${input.seeds.length > 0 ? input.seeds.join(", ") : "지정 없음 (취향 DNA와 분위기 중심으로 자유 선곡)"}
- 원하는 분위기/무드: ${input.moods.length > 0 ? input.moods.join(", ") : "밸런스 있는 애니송 명곡 흐름"}
- 선호 장르/스타일: ${genres.length > 0 ? genres.join(", ") : "장르 제한 없음 (작품과 무드에 맞게 자유 배합)"}
- 포함할 곡 유형(Theme Types): ${input.themeTypes.length > 0 ? input.themeTypes.join(", ") : "OP, ED, INSERT"}
- 시대/연대: ${describeEra(input.era)}
- 대중성/인지도 (메이저 ↔ 마이너): ${describePopularity(popularityLevel)}
- 추가 요청 사항: ${input.prompt?.trim() ? input.prompt.trim() : "없음"}
- 요청 곡 수: ${requestedCount}곡
${excludedBlock}${tasteContextBlock}`;

  const interaction = await ai.interactions.create({
    model: "gemini-3.8-flash",
    store: false,
    system_instruction: systemInstruction,
    input: userPrompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: PLAYLIST_JSON_SCHEMA,
    },
  });

  const text = interaction.output_text;
  if (!text) {
    throw new Error("Gemini API로부터 빈 응답을 받았습니다.");
  }

  const parsed = GeminiPlaylistSchema.parse(JSON.parse(text));
  let hydrated = hydrateTracks(parsed.tracks, knownTracks, userKnownKeys);

  // Deterministically exclude any track from recent generated playlists when enabled
  if (excludedRecentTracks.length > 0) {
    const nonExcluded = hydrated.filter(
      (t) => !isTrackExcluded(t, excludedRecentTracks)
    );
    if (nonExcluded.length > 0) {
      hydrated = nonExcluded;
    }
  }

  // Enforce strict 0% familiarity for level 1 and 100% library-only for level 5
  if (
    (knownTracks.length > 0 || userKnownKeys.size > 0) &&
    familiarityLevel === 1
  ) {
    const filtered = hydrated.filter((t) => !t.inUserLibrary);
    if (filtered.length >= Math.min(4, input.trackCount)) {
      hydrated = filtered;
    }
  } else if (
    knownTracks.length >= input.trackCount &&
    familiarityLevel === 5
  ) {
    const onlyLibrary = hydrated.filter((t) => t.inUserLibrary);
    if (onlyLibrary.length >= Math.min(4, input.trackCount)) {
      hydrated = onlyLibrary;
    }
  }

  return {
    title: parsed.title,
    description: parsed.description,
    curatorSummary: parsed.curatorSummary,
    mode: "gemini",
    tracks: hydrated.slice(0, input.trackCount),
  };
}

interface CuratedCatalogEntry extends z.infer<typeof TrackSchema> {
  tags: string[];
}

const FALLBACK_CATALOG: CuratedCatalogEntry[] = [
  {
    title: "青春コンプレックス",
    titleRomaji: "Seishun Complex",
    artist: "結束バンド",
    artistRomaji: "Kessoku Band",
    animeTitle: "봇치 더 록!",
    animeTitleJapanese: "ぼっち・ざ・ろっく！",
    animeTitleRomaji: "Bocchi the Rock!",
    themeType: "OP",
    themeLabel: "OP",
    year: 2022,
    bpmVibe: "188 BPM · 질주 기타록",
    reason: "날카로운 기타 리프와 청춘의 조급함이 완벽하게 맞물리는 모던 밴드 애니송의 기준점입니다.",
    tags: ["청춘 / 밴드", "질주감 / 열혈", "봇치", "밴드"],
  },
  {
    title: "星座になれたら",
    titleRomaji: "Seiza ni Naretara",
    artist: "結束バンド",
    artistRomaji: "Kessoku Band",
    animeTitle: "봇치 더 록!",
    animeTitleJapanese: "ぼっち・ざ・ろっく！",
    animeTitleRomaji: "Bocchi the Rock!",
    themeType: "INSERT",
    themeLabel: "12화 삽입곡",
    year: 2022,
    bpmVibe: "128 BPM · 베이스 그루브 & 록",
    reason: "무대 위 긴장감과 멤버 간 호흡이 베이스 라인으로 살아 숨 쉬는 극중 명곡입니다.",
    tags: ["청춘 / 밴드", "울컥 / 감동", "봇치", "밴드"],
  },
  {
    title: "雑踏、僕らの街",
    titleRomaji: "Zattou, Bokura no Machi",
    artist: "トゲナシトゲアリ",
    artistRomaji: "Togenashi Togeari",
    animeTitle: "걸즈 밴드 크라이",
    animeTitleJapanese: "ガールズバンドクライ",
    animeTitleRomaji: "Girls Band Cry",
    themeType: "OP",
    themeLabel: "OP",
    year: 2024,
    bpmVibe: "178 BPM · 이모셔널 피아노록",
    reason: "거친 보컬의 감정 폭발과 속도감 있는 피아노·기타 편곡이 청춘 밴드 감성을 극대화합니다.",
    tags: ["청춘 / 밴드", "질주감 / 열혈", "울컥 / 감동", "걸즈 밴드 크라이"],
  },
  {
    title: "空の箱",
    titleRomaji: "Sora no Hako",
    artist: "トゲナシトゲアリ",
    artistRomaji: "Togenashi Togeari",
    animeTitle: "걸즈 밴드 크라이",
    animeTitleJapanese: "ガールズバンドクライ",
    animeTitleRomaji: "Girls Band Cry",
    themeType: "INSERT",
    themeLabel: "삽입곡",
    year: 2024,
    bpmVibe: "152 BPM · 서정적 밴드 록",
    reason: "상처와 외로움을 정면으로 밀어붙이는 가사와 후렴의 해방감이 돋보입니다.",
    tags: ["청춘 / 밴드", "새벽 감성", "울컥 / 감동"],
  },
  {
    title: "迷星叫",
    titleRomaji: "Mayoiuta",
    artist: "MyGO!!!!!",
    artistRomaji: "MyGO!!!!!",
    animeTitle: "BanG Dream! It's MyGO!!!!!",
    animeTitleJapanese: "BanG Dream! It's MyGO!!!!!",
    animeTitleRomaji: "BanG Dream! It's MyGO!!!!!",
    themeType: "INSERT",
    themeLabel: "삽입곡",
    year: 2023,
    bpmVibe: "170 BPM · 멜로딕 이모록",
    reason: "불안정한 청춘의 외침을 묵직한 사운드로 담아낸 숨은 밴드 애니 명곡입니다.",
    tags: ["청춘 / 밴드", "다크 / 배틀", "울컥 / 감동"],
  },
  {
    title: "God knows...",
    titleRomaji: "God knows...",
    artist: "涼宮ハルヒ (CV.平野綾)",
    artistRomaji: "Haruhi Suzumiya (Aya Hirano)",
    animeTitle: "스즈미야 하루히의 우울",
    animeTitleJapanese: "涼宮ハルヒの憂鬱",
    animeTitleRomaji: "Suzumiya Haruhi no Yuuutsu",
    themeType: "INSERT",
    themeLabel: "12화 삽입곡",
    year: 2006,
    bpmVibe: "150 BPM · 클래식 밴드 록",
    reason: "학교 축제 라이브 씬을 대표하는 2000년대 애니송 밴드 씬의 영원한 클래식입니다.",
    tags: ["청춘 / 밴드", "질주감 / 열혈"],
  },
  {
    title: "Don't say \"lazy\"",
    titleRomaji: "Don't say \"lazy\"",
    artist: "桜高軽音部",
    artistRomaji: "Sakurakou Keionbu",
    animeTitle: "케이온!",
    animeTitleJapanese: "けいおん！",
    animeTitleRomaji: "K-ON!",
    themeType: "ED",
    themeLabel: "1기 ED",
    year: 2009,
    bpmVibe: "162 BPM · 스타일리시 걸즈록",
    reason: "본편의 훈훈함과 대비되는 세련된 록 사운드가 엔딩의 맛을 제대로 살립니다.",
    tags: ["청춘 / 밴드", "발랄 / 일상", "케이온"],
  },
  {
    title: "廻廻奇譚",
    titleRomaji: "Kaikai Kitan",
    artist: "Eve",
    artistRomaji: "Eve",
    animeTitle: "주술회전",
    animeTitleJapanese: "呪術廻戦",
    animeTitleRomaji: "Jujutsu Kaisen",
    themeType: "OP",
    themeLabel: "1기 OP1",
    year: 2020,
    bpmVibe: "185 BPM · 다크 모던 록",
    reason: "숨 가쁜 BPM과 그루비한 베이스가 배틀 액션의 긴장감을 단숨에 끌어올립니다.",
    tags: ["다크 / 배틀", "질주감 / 열혈", "주술회전"],
  },
  {
    title: "青のすみか",
    titleRomaji: "Ao no Sumika",
    artist: "キタニタツヤ",
    artistRomaji: "Tatsuya Kitani",
    animeTitle: "주술회전 2기",
    animeTitleJapanese: "呪術廻戦 懐玉・玉折",
    animeTitleRomaji: "Jujutsu Kaisen Season 2",
    themeType: "OP",
    themeLabel: "회옥·옥절 OP",
    year: 2023,
    bpmVibe: "162 BPM · 아련한 록",
    reason: "눈부신 청춘과 돌이킬 수 없는 상실감이 교차하는 감성적인 오프닝입니다.",
    tags: ["청춘 / 밴드", "울컥 / 감동", "질주감 / 열혈", "주술회전"],
  },
  {
    title: "SPECIALZ",
    titleRomaji: "SPECIALZ",
    artist: "King Gnu",
    artistRomaji: "King Gnu",
    animeTitle: "주술회전 시부야 사변",
    animeTitleJapanese: "呪術廻戦 渋谷事変",
    animeTitleRomaji: "Jujutsu Kaisen Shibuya Incident",
    themeType: "OP",
    themeLabel: "시부야 사변 OP",
    year: 2023,
    bpmVibe: "110 BPM · 다크 얼터너티브",
    reason: "묵직하고 불온한 저음 그루브가 혼돈의 밤 분위기를 완벽하게 구현합니다.",
    tags: ["다크 / 배틀", "새벽 감성", "주술회전"],
  },
  {
    title: "KICK BACK",
    titleRomaji: "KICK BACK",
    artist: "米津玄師",
    artistRomaji: "Kenshi Yonezu",
    animeTitle: "체인소 맨",
    animeTitleJapanese: "チェンソーマン",
    animeTitleRomaji: "Chainsaw Man",
    themeType: "OP",
    themeLabel: "OP",
    year: 2022,
    bpmVibe: "164 BPM · 광기 하이브리드 록",
    reason: "예측 불가능한 전조와 폭발적인 에너지가 도파민을 터뜨립니다.",
    tags: ["다크 / 배틀", "질주감 / 열혈", "체인소 맨"],
  },
  {
    title: "ちゅ、多様性。",
    titleRomaji: "Chu, Tayousei.",
    artist: "ano",
    artistRomaji: "ano",
    animeTitle: "체인소 맨",
    animeTitleJapanese: "チェンソーマン",
    animeTitleRomaji: "Chainsaw Man",
    themeType: "ED",
    themeLabel: "7화 ED",
    year: 2022,
    bpmVibe: "126 BPM · 레트로 팝 펑크",
    reason: "중독성 있는 멜로디와 시니컬한 분위기가 묘하게 어우러지는 숨은 ED입니다.",
    tags: ["발랄 / 일상", "시티팝 / 칠", "체인소 맨"],
  },
  {
    title: "メフィスト",
    titleRomaji: "Mephisto",
    artist: "女王蜂",
    artistRomaji: "QUEEN BEE",
    animeTitle: "최애의 아이",
    animeTitleJapanese: "【推しの子】",
    animeTitleRomaji: "Oshi no Ko",
    themeType: "ED",
    themeLabel: "1기 ED",
    year: 2023,
    bpmVibe: "130 BPM · 드라마틱 고딕 팝",
    reason: "화려함 뒤의 어두운 이면을 팔세토와 극적인 스트링으로 끌어당기는 엔딩 명곡입니다.",
    tags: ["다크 / 배틀", "새벽 감성", "울컥 / 감동", "최애의 아이"],
  },
  {
    title: "晴る",
    titleRomaji: "Haru",
    artist: "ヨルシカ",
    artistRomaji: "Yorushika",
    animeTitle: "장송의 프리렌",
    animeTitleJapanese: "葬送のフリーレン",
    animeTitleRomaji: "Sousou no Frieren",
    themeType: "OP",
    themeLabel: "2쿨 OP",
    year: 2024,
    bpmVibe: "134 BPM · 청량한 서정 록",
    reason: "긴 여정 끝에 구름이 걷히는 듯한 투명한 사운드가 여운을 남깁니다.",
    tags: ["몽환 / 이세계", "울컥 / 감동", "청춘 / 밴드", "프리렌"],
  },
  {
    title: "Anytime Anywhere",
    titleRomaji: "Anytime Anywhere",
    artist: "milet",
    artistRomaji: "milet",
    animeTitle: "장송의 프리렌",
    animeTitleJapanese: "葬送のフリーレン",
    animeTitleRomaji: "Sousou no Frieren",
    themeType: "ED",
    themeLabel: "ED",
    year: 2023,
    bpmVibe: "86 BPM · 웅장한 발라드",
    reason: "새벽 공기와 함께 듣기 좋은 깊이 있는 보컬과 서정적인 스트링 편곡이 일품입니다.",
    tags: ["새벽 감성", "울컥 / 감동", "몽환 / 이세계", "프리렌"],
  },
  {
    title: "Zoltraak",
    titleRomaji: "Zoltraak",
    artist: "Evan Call",
    artistRomaji: "Evan Call",
    animeTitle: "장송의 프리렌",
    animeTitleJapanese: "葬送のフリーレン",
    animeTitleRomaji: "Sousou no Frieren",
    themeType: "OST",
    themeLabel: "OST",
    year: 2023,
    bpmVibe: "145 BPM · 오케스트라 판타지",
    reason: "마법 전투 씬의 압도적인 스케일을 오케스트라와 코러스로 구현한 사운드트랙입니다.",
    tags: ["몽환 / 이세계", "다크 / 배틀", "프리렌"],
  },
  {
    title: "aLIEz",
    titleRomaji: "aLIEz",
    artist: "SawanoHiroyuki[nZk]:mizuki",
    artistRomaji: "SawanoHiroyuki[nZk]:mizuki",
    animeTitle: "알드노아. 제로",
    animeTitleJapanese: "アルドノア・ゼロ",
    animeTitleRomaji: "Aldnoah.Zero",
    themeType: "ED",
    themeLabel: "1기 ED2",
    year: 2014,
    bpmVibe: "142 BPM · 사와노 일렉트로 록",
    reason: "빌드업 후 터지는 드롭이 어떤 메카·이세계 전투 씬보다 강렬한 쾌감을 줍니다.",
    tags: ["다크 / 배틀", "질주감 / 열혈", "몽환 / 이세계"],
  },
  {
    title: "RE:I AM",
    titleRomaji: "RE:I AM",
    artist: "Aimer",
    artistRomaji: "Aimer",
    animeTitle: "기동전사 건담 UC",
    animeTitleJapanese: "機動戦士ガンダムUC",
    animeTitleRomaji: "Mobile Suit Gundam Unicorn",
    themeType: "ED",
    themeLabel: "EP6 ED",
    year: 2013,
    bpmVibe: "88 BPM · 허스키 감성 발라드",
    reason: "Aimer의 허스키한 보이스와 사와노 히로유키의 웅장한 편곡이 만난 새벽 감성 명곡입니다.",
    tags: ["새벽 감성", "울컥 / 감동", "다크 / 배틀"],
  },
  {
    title: "unravel",
    titleRomaji: "unravel",
    artist: "TK from 凛として時雨",
    artistRomaji: "TK from Ling tosite sigure",
    animeTitle: "도쿄 구울",
    animeTitleJapanese: "東京喰種トーキョーグール",
    animeTitleRomaji: "Tokyo Ghoul",
    themeType: "OP",
    themeLabel: "1기 OP",
    year: 2014,
    bpmVibe: "135 BPM · 고음 다크 록",
    reason: "속삭임에서 절규로 폭발하는 전개로 다크 판타지 플레이리스트에 빠질 수 없는 곡입니다.",
    tags: ["다크 / 배틀", "울컥 / 감동", "질주감 / 열혈"],
  },
  {
    title: "カワキヲアメク",
    titleRomaji: "Kawaki wo Ameku",
    artist: "美波",
    artistRomaji: "Minami",
    animeTitle: "도메스틱 그녀",
    animeTitleJapanese: "ドメスティックな彼女",
    animeTitleRomaji: "Domestic na Kanojo",
    themeType: "OP",
    themeLabel: "OP",
    year: 2019,
    bpmVibe: "148 BPM · 격정 피아노록",
    reason: "작품 인지도 이상으로 곡 자체의 퀄리티와 감정선이 압도적인 입소문 명곡입니다.",
    tags: ["울컥 / 감동", "새벽 감성", "청춘 / 밴드"],
  },
  {
    title: "君の知らない物語",
    titleRomaji: "Kimi no Shiranai Monogatari",
    artist: "supercell",
    artistRomaji: "supercell",
    animeTitle: "바케모노가타리",
    animeTitleJapanese: "化物語",
    animeTitleRomaji: "Bakemonogatari",
    themeType: "ED",
    themeLabel: "ED",
    year: 2009,
    bpmVibe: "165 BPM · 밤하늘 피아노록",
    reason: "여름밤 별을 보며 듣기 좋은, ryo(supercell) 감성이 응축된 불멸의 엔딩입니다.",
    tags: ["울컥 / 감동", "새벽 감성", "청춘 / 밴드"],
  },
  {
    title: "恋愛サーキュレーション",
    titleRomaji: "Renai Circulation",
    artist: "千石撫子 (CV.花澤香菜)",
    artistRomaji: "Nadeko Sengoku (Kana Hanazawa)",
    animeTitle: "바케모노가타리",
    animeTitleJapanese: "化物語",
    animeTitleRomaji: "Bakemonogatari",
    themeType: "CHARACTER",
    themeLabel: "OP4 / 캐릭터송",
    year: 2009,
    bpmVibe: "120 BPM · 시부야케이 팝",
    reason: "산뜻한 브라스와 성우 보컬의 매력이 돋보이는 대표적인 캐릭터송 OP입니다.",
    tags: ["발랄 / 일상", "시티팝 / 칠"],
  },
  {
    title: "LOST IN PARADISE",
    titleRomaji: "LOST IN PARADISE feat. AKLO",
    artist: "ALI",
    artistRomaji: "ALI",
    animeTitle: "주술회전",
    animeTitleJapanese: "呪術廻戦",
    animeTitleRomaji: "Jujutsu Kaisen",
    themeType: "ED",
    themeLabel: "1기 ED1",
    year: 2020,
    bpmVibe: "110 BPM · 펑크 그루브",
    reason: "세련된 펑크·힙합 리듬으로 분위기를 가볍고 스타일리시하게 환기해 줍니다.",
    tags: ["시티팝 / 칠", "발랄 / 일상", "주술회전"],
  },
  {
    title: "喜劇",
    titleRomaji: "Comedy",
    artist: "星野源",
    artistRomaji: "Gen Hoshino",
    animeTitle: "스파이 패밀리",
    animeTitleJapanese: "SPY×FAMILY",
    animeTitleRomaji: "SPY x FAMILY",
    themeType: "ED",
    themeLabel: "1쿨 ED",
    year: 2022,
    bpmVibe: "96 BPM · 네오 소울 / 칠",
    reason: "따뜻한 베이스와 그루브가 밤 산책이나 휴식 시간과 찰떡처럼 어울립니다.",
    tags: ["시티팝 / 칠", "새벽 감성", "발랄 / 일상"],
  },
  {
    title: "Cry Baby",
    titleRomaji: "Cry Baby",
    artist: "Official髭男dism",
    artistRomaji: "Official HIGE DANdism",
    animeTitle: "도쿄 리벤저스",
    animeTitleJapanese: "東京リベンジャーズ",
    animeTitleRomaji: "Tokyo Revengers",
    themeType: "OP",
    themeLabel: "1기 OP",
    year: 2021,
    bpmVibe: "160 BPM · 드라마틱 전조 록",
    reason: "격정적인 전조와 브라스·기타의 폭발력이 서사적 긴장감을 극대화하는 명곡입니다.",
    tags: ["다크 / 배틀", "질주감 / 열혈", "울컥 / 감동"],
  },
  {
    title: "ミックスナッツ",
    titleRomaji: "Mixed Nuts",
    artist: "Official髭男dism",
    artistRomaji: "Official HIGE DANdism",
    animeTitle: "스파이 패밀리",
    animeTitleJapanese: "SPY×FAMILY",
    animeTitleRomaji: "SPY x FAMILY",
    themeType: "OP",
    themeLabel: "1쿨 OP",
    year: 2022,
    bpmVibe: "150 BPM · 재즈 브라스 팝",
    reason: "화려한 재즈 브라스와 빠른 전개가 기분을 단번에 띄워주는 명랑 오프닝입니다.",
    tags: ["발랄 / 일상", "질주감 / 열혈", "시티팝 / 칠"],
  },
  {
    title: "STYX HELIX",
    titleRomaji: "STYX HELIX",
    artist: "MYTH & ROID",
    artistRomaji: "MYTH & ROID",
    animeTitle: "Re:제로부터 시작하는 이세계 생활",
    animeTitleJapanese: "Re:ゼロから始める異世界生活",
    animeTitleRomaji: "Re:Zero kara Hajimeru Isekai Seikatsu",
    themeType: "ED",
    themeLabel: "1기 ED1",
    year: 2016,
    bpmVibe: "130 BPM · 일렉트로 몽환",
    reason: "차갑고 신비로운 신스 사운드가 이세계 루프물의 몽환적인 서사를 완성합니다.",
    tags: ["몽환 / 이세계", "다크 / 배틀", "새벽 감성", "리제로"],
  },
  {
    title: "Redo",
    titleRomaji: "Redo",
    artist: "鈴木このみ",
    artistRomaji: "Konomi Suzuki",
    animeTitle: "Re:제로부터 시작하는 이세계 생활",
    animeTitleJapanese: "Re:ゼロから始める異世界生活",
    animeTitleRomaji: "Re:Zero kara Hajimeru Isekai Seikatsu",
    themeType: "OP",
    themeLabel: "1기 OP1",
    year: 2016,
    bpmVibe: "190 BPM · 질주 신스록",
    reason: "초고속 템포와 힘 있는 보컬이 이세계물 특유의 비장함과 질주감을 전달합니다.",
    tags: ["몽환 / 이세계", "질주감 / 열혈", "리제로"],
  },
  {
    title: "secret base ~君がくれたもの~ (10 years after Ver.)",
    titleRomaji: "secret base ~Kimi ga Kureta Mono~",
    artist: "本間芽衣子(茅野愛衣), 安城鳴子(戸松遥), 鶴見知利子(早見沙織)",
    artistRomaji: "Menma, Anaru, Tsuruko",
    animeTitle: "그날 본 꽃의 이름을 우리는 아직 모른다",
    animeTitleJapanese: "あの日見た花の名前を僕達はまだ知らない。",
    animeTitleRomaji: "Ano Hi Mita Hana no Namae wo Bokutachi wa Mada Shiranai.",
    themeType: "ED",
    themeLabel: "ED / 캐릭터송",
    year: 2011,
    bpmVibe: "100 BPM · 추억의 발라드",
    reason: "전주만 나와도 가슴이 먹먹해지는 2010년대 감동 애니메이션 엔딩의 정점입니다.",
    tags: ["울컥 / 감동", "새벽 감성", "CHARACTER"],
  },
  {
    title: "Tank!",
    titleRomaji: "Tank!",
    artist: "シートベルツ",
    artistRomaji: "SEATBELTS",
    animeTitle: "카우보이 비밥",
    animeTitleJapanese: "カウボーイビバップ",
    animeTitleRomaji: "Cowboy Bebop",
    themeType: "OP",
    themeLabel: "OP / 재즈 OST",
    year: 1998,
    bpmVibe: "140 BPM · 비밥 빅밴드 재즈",
    reason: "90년대 클래식 애니 OST의 전설이자 어떤 플레이리스트에도 세련된 에너지를 불어넣는 트랙입니다.",
    tags: ["시티팝 / 칠", "질주감 / 열혈", "OST"],
  },
  {
    title: "残酷な天使のテーゼ",
    titleRomaji: "Zankoku na Tenshi no Thesis",
    artist: "高橋洋子",
    artistRomaji: "Yoko Takahashi",
    animeTitle: "신세기 에반게리온",
    animeTitleJapanese: "新世紀エヴァンゲリオン",
    animeTitleRomaji: "Neon Genesis Evangelion",
    themeType: "OP",
    themeLabel: "OP",
    year: 1995,
    bpmVibe: "128 BPM · 90s 신스 팝록",
    reason: "세대를 초월해 사랑받는 90년대 애니송의 상징적인 오프닝 트랙입니다.",
    tags: ["질주감 / 열혈", "다크 / 배틀"],
  },
  {
    title: "Butter-Fly",
    titleRomaji: "Butter-Fly",
    artist: "和田光司",
    artistRomaji: "Koji Wada",
    animeTitle: "디지몬 어드벤처",
    animeTitleJapanese: "デジモンアドベンチャー",
    animeTitleRomaji: "Digimon Adventure",
    themeType: "OP",
    themeLabel: "OP",
    year: 1999,
    bpmVibe: "160 BPM · 90s 열혈 록",
    reason: "어린 시절의 모험심과 뜨거운 낭만을 한 번에 되살려주는 레전드 오프닝입니다.",
    tags: ["질주감 / 열혈", "울컥 / 감동", "청춘 / 밴드"],
  },
];

function matchEra(year: number | null, era: PlaylistGenerateRequest["era"]): boolean {
  if (!year || era === "ALL") return true;
  if (era === "2020s") return year >= 2020;
  if (era === "2010s") return year >= 2010 && year <= 2019;
  if (era === "2000s") return year >= 2000 && year <= 2009;
  return year < 2000;
}

export function generateFallbackPlaylist(
  input: PlaylistGenerateRequest,
  options?: { excludedRecentTracks?: ExcludedTrackRef[] }
): GeneratedPlaylist {
  const excludedRecentTracks = options?.excludedRecentTracks ?? [];
  const seedLower = input.seeds.map((s) => s.toLowerCase());
  const promptLower = (input.prompt ?? "").toLowerCase();
  const genres = input.genres ?? [];

  const knownTracks = input.tasteProfile?.knownTracks ?? [];
  const familiarityLevel = input.familiarityLevel ?? 3;
  const popularityLevel = resolvePopularityLevel(input);

  const scoredCandidates = FALLBACK_CATALOG.filter(
    (item) =>
      excludedRecentTracks.length === 0 ||
      !isTrackExcluded(item, excludedRecentTracks)
  );
  const pool =
    scoredCandidates.length >= Math.min(4, input.trackCount)
      ? scoredCandidates
      : FALLBACK_CATALOG;

  const scored = pool
    .map((item) => {
    let score = 0;

    if (input.themeTypes.includes(item.themeType)) score += 30;
    if (matchEra(item.year, input.era)) score += 25;

    for (const mood of input.moods) {
      if (item.tags.includes(mood)) score += 25;
    }

    const haystack = `${item.animeTitle} ${item.animeTitleRomaji} ${item.animeTitleJapanese} ${item.title} ${item.artist} ${item.bpmVibe} ${item.tags.join(" ")}`.toLowerCase();
    for (const genre of genres) {
      const tokens = genre
        .toLowerCase()
        .split(/[\s/·]+/)
        .filter((t) => t.length >= 2);
      if (tokens.some((tok) => haystack.includes(tok))) {
        score += 25;
      }
    }
    for (const seed of seedLower) {
      if (seed && haystack.includes(seed)) score += 50;
    }
    if (promptLower) {
      for (const token of promptLower.split(/\s+/)) {
        if (token.length >= 2 && haystack.includes(token)) score += 20;
      }
    }

    const isDeepCutType =
      item.themeType === "INSERT" ||
      item.themeType === "OST" ||
      item.themeType === "CHARACTER";
    if (popularityLevel === 1 && item.themeType === "OP") score += 15;
    if (popularityLevel >= 3 && isDeepCutType) {
      score += popularityLevel === 4 ? 24 : 12;
    }

    const inLib = knownTracks.length > 0 && isTrackInKnownLibrary(item, knownTracks);
    if (familiarityLevel === 1 && inLib) score -= 120;
    if (familiarityLevel === 4 && inLib) score += 40;
    if (familiarityLevel === 5) score += inLib ? 80 : -80;

    return { item, score };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, input.trackCount)
    .map(({ item }) => {
      const { tags: _tags, ...trackData } = item;
      void _tags;
      return trackData;
    });

  const moodSummary =
    input.moods.length > 0 ? input.moods.join(" · ") : "밸런스 애니송";
  const seedSummary =
    input.seeds.length > 0 ? `${input.seeds[0]} 기반 ` : "";

  return {
    title: `${seedSummary}${moodSummary} 애니송 플리`,
    description: `AniTune이 큐레이션한 ${moodSummary} 테마의 애니송 플레이리스트 (${scored.length}곡)`,
    curatorSummary:
      "현재 GEMINI_API_KEY가 설정되지 않아 샘플 카탈로그 모드로 생성되었습니다. .env.local에 GEMINI_API_KEY를 추가하면 취향 DNA와 4단계 비중을 반영한 실시간 AI 선곡이 동작합니다.",
    mode: "demo-fallback",
    tracks: hydrateTracks(scored, knownTracks),
  };
}
