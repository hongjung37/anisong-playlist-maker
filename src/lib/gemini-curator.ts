import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getRatingWeight } from "@/lib/watched-anime-store";
import { buildTrackCacheKeys } from "@/lib/youtube-cache";
import type {
  ExcludedTrackRef,
  FamiliarityLevel,
  GeneratedPlaylist,
  KnownTrackItem,
  PlaylistGenerateRequest,
  PlaylistTrack,
  PopularityLevel,
  SceneDomain,
  ThemeType,
  VocaloidVocalMode,
  WatchedAnimeItem,
  WatchedAnimeMode,
} from "@/types/playlist";

const VALID_SCENES: SceneDomain[] = ["anime", "vocaloid", "rhythm_doujin"];

const ANIME_THEME_TYPES: ThemeType[] = ["OP", "ED", "OST", "INSERT", "CHARACTER"];

export function normalizeScenes(scenes?: SceneDomain[]): SceneDomain[] {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return ["anime"];
  }
  const unique = Array.from(
    new Set(scenes.filter((s): s is SceneDomain => VALID_SCENES.includes(s)))
  );
  return unique.length > 0 ? unique : ["anime"];
}

export function getAllowedThemeTypes(
  scenes: SceneDomain[],
  vocaloidVocalMode: VocaloidVocalMode = "original_only"
): ThemeType[] {
  const normalized = normalizeScenes(scenes);
  const allowed: ThemeType[] = [];

  if (normalized.includes("anime")) {
    allowed.push(...ANIME_THEME_TYPES);
  }
  if (normalized.includes("vocaloid")) {
    allowed.push("VOCALOID");
    if (vocaloidVocalMode !== "original_only") {
      allowed.push("UTAITE");
    }
  }
  if (normalized.includes("rhythm_doujin")) {
    allowed.push("RHYTHM", "DOUJIN");
  }

  return Array.from(new Set(allowed));
}

export function inferSceneFromThemeType(themeType: ThemeType): SceneDomain {
  if (themeType === "VOCALOID" || themeType === "UTAITE") {
    return "vocaloid";
  }
  if (themeType === "RHYTHM" || themeType === "DOUJIN") {
    return "rhythm_doujin";
  }
  return "anime";
}

const TrackSchema = z.object({
  scene: z.enum(["anime", "vocaloid", "rhythm_doujin"]).optional(),
  title: z.string().min(1),
  titleRomaji: z.string().min(1),
  artist: z.string().min(1),
  artistRomaji: z.string().min(1),
  animeTitle: z.string().min(1),
  animeTitleJapanese: z.string().min(1),
  animeTitleRomaji: z.string().min(1),
  themeType: z.enum([
    "OP",
    "ED",
    "OST",
    "INSERT",
    "CHARACTER",
    "VOCALOID",
    "UTAITE",
    "RHYTHM",
    "DOUJIN",
  ]),
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

export function buildTrackJsonSchema(
  scenesInput?: SceneDomain[],
  vocaloidVocalMode: VocaloidVocalMode = "original_only"
) {
  const scenes = normalizeScenes(scenesInput);
  const isAnimeOnly = scenes.length === 1 && scenes[0] === "anime";
  const allowedThemes = getAllowedThemeTypes(scenes, vocaloidVocalMode);

  return {
    type: "object",
    properties: {
      scene: {
        type: "string",
        enum: scenes,
        description: isAnimeOnly
          ? "Scene domain ('anime')."
          : "Scene domain of this track ('anime', 'vocaloid', or 'rhythm_doujin').",
      },
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
        description: isAnimeOnly
          ? "Official artist or band/seiyuu unit name in original script."
          : "Official artist, producer (P) + vocal synth, or collaboration credit (e.g., 'かめりあ feat. ななひら', 'DECO*27 feat. 初音ミク') in original script.",
      },
      artistRomaji: {
        type: "string",
        description: "Romanized artist name.",
      },
      animeTitle: {
        type: "string",
        description: isAnimeOnly
          ? "Anime title in Korean (as commonly known in Korea)."
          : "Origin title in Korean: anime title for 'anime'; vocal synth/project name (e.g. '하츠네 미쿠', '프로젝트 세카이', '카후') for 'vocaloid'; rhythm game title or doujin circle/series (e.g. 'SOUND VOLTEX', 'maimai', 'BMS', 'Confetto', '동방 프로젝트') for 'rhythm_doujin'.",
      },
      animeTitleJapanese: {
        type: "string",
        description: isAnimeOnly
          ? "Official Japanese anime title."
          : "Origin title in official Japanese script (e.g. '葬送のフリーレン', '初音ミク', 'SOUND VOLTEX', '東方Project').",
      },
      animeTitleRomaji: {
        type: "string",
        description: isAnimeOnly
          ? "Official Romaji/English anime title used on AniList."
          : "Origin title in Romaji/English (e.g. 'Sousou no Frieren', 'Hatsune Miku', 'SOUND VOLTEX', 'Touhou Project').",
      },
      themeType: {
        type: "string",
        enum: allowedThemes,
      },
      themeLabel: {
        type: "string",
        description: isAnimeOnly
          ? "Specific role like OP1, OP2, ED1, 삽입곡, 최종화 ED, 극중가, OST."
          : "Specific role label, e.g. OP1, ED1, 삽입곡, 보카로 오리지널, 우타이테 커버, SDVX 수록, 전파 동인곡, 동방 어레인지.",
      },
      year: {
        type: ["integer", "null"],
        description: isAnimeOnly
          ? "Release or anime broadcast year."
          : "Release or anime broadcast year.",
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
      ...(isAnimeOnly ? [] : ["scene"]),
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
  };
}

export function buildPlaylistJsonSchema(
  scenesInput?: SceneDomain[],
  vocaloidVocalMode: VocaloidVocalMode = "original_only"
) {
  const scenes = normalizeScenes(scenesInput);
  const isAnimeOnly = scenes.length === 1 && scenes[0] === "anime";

  return {
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
        description: isAnimeOnly
          ? "2-3 sentences in Korean explaining the curation flow, mood arc, and why these anisongs fit together."
          : "2-3 sentences in Korean explaining the curation flow, mood arc, and how tracks across the selected scenes connect together.",
      },
      tracks: {
        type: "array",
        items: buildTrackJsonSchema(scenes, vocaloidVocalMode),
      },
    },
    required: ["title", "description", "curatorSummary", "tracks"],
  };
}

export function buildExtendJsonSchema(
  scenesInput?: SceneDomain[],
  vocaloidVocalMode: VocaloidVocalMode = "original_only"
) {
  return {
    type: "object",
    properties: {
      tracks: {
        type: "array",
        items: buildTrackJsonSchema(scenesInput, vocaloidVocalMode),
      },
    },
    required: ["tracks"],
  };
}

const GENERIC_ORIGIN_LABELS = new Set([
  "보컬로이드",
  "vocaloid",
  "우타이테",
  "utaite",
  "동인",
  "동인곡",
  "doujin",
  "리듬게임",
  "rhythm",
  "rhythmgame",
  "original",
  "오리지널",
]);

function isGenericOriginLabel(value?: string): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  return !normalized || GENERIC_ORIGIN_LABELS.has(normalized);
}

function makePlatformSearchUrls(track: {
  scene?: SceneDomain;
  title: string;
  artist: string;
  animeTitleJapanese: string;
  animeTitleRomaji: string;
}) {
  const originRaw = track.animeTitleJapanese || track.animeTitleRomaji;
  const includeOrigin =
    !track.scene ||
    track.scene === "anime" ||
    !isGenericOriginLabel(originRaw);
  const ytQuery = encodeURIComponent(
    `${track.title} ${track.artist}${includeOrigin && originRaw ? ` ${originRaw}` : ""}`
  );
  const spQuery = encodeURIComponent(`${track.title} ${track.artist}`);
  return {
    youtubeUrl: `https://www.youtube.com/results?search_query=${ytQuery}`,
    youtubeMusicUrl: `https://music.youtube.com/search?q=${ytQuery}`,
    spotifyUrl: `https://open.spotify.com/search/${spQuery}`,
  };
}

export function normalizeForCompare(str: string): string {
  return str
    .toLowerCase()
    .replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/[\s\-_'"`~!@#$%^&*+=[\]{};:,.<>?/\\|！？・〜～『』「」]/g, "");
}

export function isTrackInKnownLibrary(
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

export function isTrackExcluded(
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
  trackCount: number,
  scenes: SceneDomain[] = ["anime"]
): string {
  const isAnimeOnly = scenes.length === 1 && scenes[0] === "anime";
  const targetDomainLabel = isAnimeOnly ? "애니송" : "선택된 씬의 곡";

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
      return `5단계 (내 애청곡 100% — 라이브러리 전용 셋리): 반드시 아래 사용자 기존 라이브러리(knownTracks)에 포함된 곡들만 사용해서 ${trackCount}곡 셋리를 구성하세요. 라이브러리에 없는 새로운 곡은 넣지 말고, 요청한 분위기·장르·흐름(오프닝/빌드업/피크/앵콜)에 가장 잘 맞게 배치하세요. (단, 라이브러리의 ${targetDomainLabel} 수가 ${trackCount}곡보다 부족할 때만 부족분만 결이 맞는 곡으로 채우세요.)`;
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

function describePopularity(
  level: PopularityLevel,
  scenes: SceneDomain[] = ["anime"]
): string {
  const isAnimeOnly = scenes.length === 1 && scenes[0] === "anime";
  if (isAnimeOnly) {
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

  switch (level) {
    case 1:
      return "1단계 (메이저·대표곡 위주): 선택된 씬을 대표하는 메가히트곡, 전설적 대표곡, 대중적 인지도가 가장 높은 트랙 위주로 구성하세요.";
    case 2:
      return "2단계 (대중곡 + 명곡 밸런스): 널리 알려진 대표곡과 씬 팬층에서 꾸준히 사랑받는 명곡을 절반씩 균형 있게 배합하세요.";
    case 3:
      return "3단계 (숨은 명곡·중견 트랙 중심): 뻔한 입문 메가히트곡 비중을 낮추고, 팬들이 극찬하는 정규/후반부 타이업, 마니아 명반 수록곡, 인기 아케이드/BMS·중견 프로듀서 명곡을 절반 이상 포함하세요.";
    case 4:
      return "4단계 (마이너·코어 딥컷 중심): 누구나 아는 대표 히트곡은 배제하고, B-side·비주류 명작 타이업·프로듀서의 숨은 명곡·BMS 이벤트 출품곡·코미케/M3 동인 앨범·해금 보스곡 등 코어 팬이 꼽는 딥컷 위주로 선곡하세요. (단, 실존 여부와 공식 원어 제목·콜라보 표기가 확실한 곡만 선택할 것)";
  }
}

export function hydrateTracks(
  rawTracks: z.infer<typeof TrackSchema>[],
  knownTracks: KnownTrackItem[] = [],
  userKnownKeys: Set<string> = new Set(),
  idSeedOffset = 0
): PlaylistTrack[] {
  const seen = new Set<string>();
  const result: PlaylistTrack[] = [];

  for (const item of rawTracks) {
    const dedupeKey = `${item.title.toLowerCase()}::${item.artist.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const scene = item.scene ?? inferSceneFromThemeType(item.themeType);

    const inKnownList =
      knownTracks.length > 0 && isTrackInKnownLibrary(item, knownTracks);
    const inUserKnownCache =
      userKnownKeys.size > 0 &&
      buildTrackCacheKeys(item).some((k) => userKnownKeys.has(k));

    const urls = makePlatformSearchUrls({ ...item, scene });
    result.push({
      id: `trk-${idSeedOffset + result.length + 1}-${Buffer.from(dedupeKey)
        .toString("hex")
        .slice(0, 8)}`,
      ...item,
      scene,
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

function describeEra(
  era: PlaylistGenerateRequest["era"],
  scenes: SceneDomain[] = ["anime"]
): string {
  const isAnimeOnly = scenes.length === 1 && scenes[0] === "anime";
  const noun = isAnimeOnly ? "방영작" : "발표·수록곡";

  switch (era) {
    case "2020s":
      return `2020년~현재 ${noun} 위주`;
    case "2010s":
      return `2010년대(2010~2019) ${noun} 위주`;
    case "2000s":
      return `2000년대(2000~2009) ${noun} 위주`;
    case "classic":
      return isAnimeOnly
        ? "1990년대 및 그 이전 클래식 애니송 위주"
        : "1990년대 및 그 이전 클래식 트랙 위주";
    default:
      return "연대 제한 없음 (전 시대 명곡 조화)";
  }
}

export function mergeKnownTrackLists(
  primary: KnownTrackItem[],
  extra: KnownTrackItem[]
): KnownTrackItem[] {
  if (extra.length === 0) return primary;
  if (primary.length === 0) return extra;
  const seen = new Set<string>();
  const merged: KnownTrackItem[] = [];
  for (const item of [...primary, ...extra]) {
    const norm = normalizeForCompare(item.rawTitle);
    const key = item.videoId ? `id:${item.videoId}` : `t:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function buildWatchedAnimeContextBlock(
  mode: WatchedAnimeMode | undefined,
  watchedAnime: WatchedAnimeItem[]
): string {
  if (!mode || mode === "ignore" || watchedAnime.length === 0) {
    return "";
  }

  if (mode === "prefer_watched") {
    const positive = watchedAnime.filter(
      (item) => getRatingWeight(item.rating) > 0
    );
    const list = (positive.length > 0 ? positive : watchedAnime)
      .slice(0, 95)
      .map((item, i) => {
        const meta = [
          item.rank ? `#${item.rank}` : null,
          item.rating,
          item.genre,
        ]
          .filter(Boolean)
          .join(" · ");
        return `  ${i + 1}. ${item.title}${meta ? ` [${meta}]` : ""}`;
      })
      .join("\n");

    return `\n[사용자 시청 완료/시청 중 작품 보관함 — 본 작품 위주 선곡]
- 아래 목록은 사용자가 실제로 본 애니메이션입니다(평점·선호 순위 높은 작품이 상단에 정렬됨).
- 요청된 분위기·장르·연대와 어울리는 선에서 가능한 한 아래 본 작품들의 OP/ED/삽입곡/OST 위주로 우선 선곡하고, 특히 [⭐️인생작⭐️], [명작⭐️], 순위권 작품의 비중을 높여 주세요.
${list}\n`;
  }

  const topRef = watchedAnime
    .filter((item) => getRatingWeight(item.rating) >= 4)
    .slice(0, 20)
    .map((item) => item.title)
    .join(", ");

  const allExcluded = watchedAnime
    .slice(0, 120)
    .map((item, i) => `  ${i + 1}. ${item.title}`)
    .join("\n");

  return `\n[사용자 본 작품 보관함 — 아직 안 본 작품 위주 발굴]
${topRef ? `- 사용자가 특히 높게 평가한 취향 기준작(참고용): ${topRef}\n` : ""}- 아래 목록은 사용자가 이미 본 작품입니다. 이번 셋리에는 아래 작품들의 곡을 제외하고, 사용자가 아직 보지 않았을 만한 다른 애니메이션의 곡 위주로 선곡해 주세요:
${allExcluded}\n`;
}

function formatSceneNames(scenes: SceneDomain[]): string {
  const labels: Record<SceneDomain, string> = {
    anime: "애니송(OP/ED/삽입곡/OST/캐릭터송)",
    vocaloid: "보컬로이드(합성음성 오리지널·프로세카·우타이테)",
    rhythm_doujin: "리듬게임·동인 음악(SDVX/maimai/BMS·나나히라·동방 등)",
  };
  return scenes.map((s) => labels[s]).join(" + ");
}

function buildMultiSceneSystemInstruction(
  scenes: SceneDomain[],
  vocaloidVocalMode: VocaloidVocalMode
): string {
  const isAnimeOnly = scenes.length === 1 && scenes[0] === "anime";
  if (isAnimeOnly) {
    return `당신은 일본 애니메이션 음악(애니송, OP/ED, 극중 삽입곡, BGM/OST, 캐릭터송) 전문 큐레이터 'AniTune'입니다.
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
  }

  const sceneRules: string[] = [];

  if (scenes.includes("anime")) {
    sceneRules.push(
      `- [애니송 (scene: "anime")]: 실제로 존재하는 정확한 애니메이션과 공식 타이업(OP/ED/OST/INSERT/CHARACTER) 곡만 선곡하고, animeTitle* 필드에 작품명을 채우세요.`
    );
  }

  if (scenes.includes("vocaloid")) {
    const vocalRule =
      vocaloidVocalMode === "original_only"
        ? "반드시 보컬로이드·합성음성(初音ミク, 鏡音リン, IA, 可不 등) 원곡(VOCALOID)만 선택하고, 인간 보컬·우타이테 커버(UTAITE)는 절대 포함하지 마세요."
        : vocaloidVocalMode === "covers_focus"
          ? "우타이테·인간 보컬 커버(UTAITE) 버전을 중심으로 선곡하되 필요 시 대표 오리지널 곡을 곁들이세요."
          : "보컬로이드·합성음성 원곡(VOCALOID)을 중심으로 구성하되, 인지도 높은 명품 우타이테 커버(UTAITE)를 자연스럽게 섞어도 됩니다.";
    sceneRules.push(
      `- [보컬로이드 (scene: "vocaloid")]: 실존 프로듀서(P) 계보(예: ryo, wowaka, DECO*27, Orangestar, いよわ, ナユタン星人, jin, sasakure.UK 등)와 정확한 보컬 라이브러리/프로젝트명(예: 初音ミク, 可不, プロジェクトセカイ)을 animeTitle* 필드에 채우세요. ${vocalRule}`
    );
  }

  if (scenes.includes("rhythm_doujin")) {
    sceneRules.push(
      `- [리듬게임 · 동인 (scene: "rhythm_doujin")]: 나나히라(ななひら/Confetto), かめりあ(Camellia), t+pazolite, USAO, xi, LeaF, HARDCORE TANO*C, IOSYS, 森羅万象, Alstroemeria Records 등 실존 리듬게임(SDVX/maimai/CHUNITHM/BMS/Arcaea) 수록곡 및 동인·전파·동방 어레인지 곡을 선곡하세요. 마이너/딥컷일수록 존재하지 않는 제목을 절대 지어내지 말고, 공식 콜라보 표기(예: 'かめりあ feat. ななひら')와 실존 수록 기종·서클명을 animeTitle* 필드에 정확히 채우세요.`
    );
  }

  const crossoverRule =
    scenes.length > 1
      ? `\n10. [크로스오버 브리지 규칙]: 복수 씬(${formatSceneNames(scenes)})이 선택되었습니다. 모든 선택 씬을 균형 있게 배합하되, 단순히 각 씬의 유명곡을 나열하지 말고 **BPM 대역, 편곡 질감(기타 리프/신스/전파/하드코어), 보컬 톤, 작곡가·프로듀서 계보**를 다리 삼아 씬 전환이 매끄럽게 이어지는 셋리를 설계하세요.`
      : "";

  return `당신은 일본 서브컬처 음악(${formatSceneNames(scenes)}) 전문 큐레이터 'AniTune'입니다.
스트리밍 앱의 일반 추천 알고리즘이 놓치는 '작품·프로듀서(P)·동인 서클·리듬게임 수록 맥락, 작곡가 계보, 음향적 질감, 셋리 감정선'을 정확히 짚어내어 플레이리스트를 설계합니다.

반드시 지켜야 할 규칙:
1. 각 트랙의 \`scene\`은 반드시 허용된 씬(${scenes.join(", ")}) 중 하나로 정확히 지정하세요. 허용되지 않은 씬의 곡을 끼워 넣지 마세요.
${sceneRules.join("\n")}
2. YouTube와 Spotify 검색 정확도를 높이기 위해 원어 곡명/아티스트명과 로마자(영어) 표기를 모두 정확히 채우세요.
3. 사용자가 선택한 곡 유형(themeType), 연대, 분위기에 최대한 맞추세요.
4. 트랙 순서에도 신경 쓰세요 (오프닝으로 분위기를 열고, 중간에 에너지·감정 변주를 주며, 마지막 트랙으로 여운을 남기는 흐름).
5. 중복된 곡은 넣지 말고, 요청한 트랙 수에 정확히 맞추세요.
6. 인지도/대중성(메이저↔마이너 4단계) 지침을 반드시 반영하되, 마이너 단계일수록 불확실한 곡을 지어내지 말고 실존과 공식 음원명이 확실한 곡만 고르세요.
7. 선호 장르/스타일(예: 전파송, 기타록, 하이테크/유로비트, 보컬로이드계 등)이 지정되면 편곡 문법과 사운드 질감이 해당 장르에 정확히 부합하는 곡을 우선 선택하세요.
8. [최근 생성 플레이리스트 중복 제외 목록]이 주어지면 해당 곡들은 이번 셋리에서 반드시 제외하세요.
9. 사용자 라이브러리(knownTracks)에 선택된 씬과 무관한 일반 영상이나 다른 장르 곡이 섞여 있더라도, 반드시 허용된 씬(${scenes.join(", ")})에 속하는 실존 곡만 선곡하세요.${crossoverRule}`;
}

export async function generatePlaylistWithGemini(
  input: PlaylistGenerateRequest,
  options?: {
    excludedRecentTracks?: ExcludedTrackRef[];
    userKnownKeys?: Set<string>;
    extraKnownTracks?: KnownTrackItem[];
    watchedAnime?: WatchedAnimeItem[];
  }
): Promise<GeneratedPlaylist> {
  const scenes = normalizeScenes(input.scenes);
  const isAnimeOnly = scenes.length === 1 && scenes[0] === "anime";
  const vocaloidVocalMode = input.vocaloidVocalMode ?? "original_only";
  const allowedThemes = getAllowedThemeTypes(scenes, vocaloidVocalMode);
  const effectiveThemeTypes = input.themeTypes.filter((t) =>
    allowedThemes.includes(t)
  );
  const promptThemeTypes =
    effectiveThemeTypes.length > 0 ? effectiveThemeTypes : allowedThemes;

  const excludedRecentTracks = options?.excludedRecentTracks ?? [];
  const userKnownKeys = options?.userKnownKeys ?? new Set<string>();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return generateFallbackPlaylist(input, options);
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildMultiSceneSystemInstruction(
    scenes,
    vocaloidVocalMode
  );

  const allKnownTracks = mergeKnownTrackLists(
    input.tasteProfile?.knownTracks ?? [],
    options?.extraKnownTracks ?? []
  );
  // Keep untagged YouTube library tracks, but prevent manual non-anime tracks from crowding out anime-only slots (and vice versa)
  const knownTracksForPrompt = allKnownTracks.filter(
    (k) => !k.scene || scenes.includes(k.scene)
  );

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
- 아는 곡 비중 지침: ${describeFamiliarity(familiarityLevel, input.trackCount, scenes)}
- 사용자 라이브러리 곡 목록(참고 및 비중 조절용, 최대 100곡):
${knownTracksForPrompt
  .slice(0, 100)
  .map(
    (k, i) =>
      `  ${i + 1}. ${k.rawTitle}${k.channelTitle ? ` (${k.channelTitle})` : ""}`
  )
  .join("\n")}\n`
    : "";

  const rawWatchedBlock = scenes.includes("anime")
    ? buildWatchedAnimeContextBlock(
        input.watchedAnimeMode,
        options?.watchedAnime ?? []
      )
    : "";
  const watchedContextBlock =
    rawWatchedBlock && scenes.length > 1
      ? `${rawWatchedBlock}- 참고: 위 본 작품 조건은 'anime' 씬 트랙에만 적용하고, 다른 씬(${scenes.filter((s) => s !== "anime").join(", ")}) 트랙은 자유롭게 선곡하세요.\n`
      : rawWatchedBlock;

  const sceneScopeLine = isAnimeOnly
    ? ""
    : `- 포함할 음악 씬: ${formatSceneNames(scenes)}\n`;
  const vocalModeLine = scenes.includes("vocaloid")
    ? `- 보컬로이드 보컬 모드: ${
        vocaloidVocalMode === "original_only"
          ? "합성음성(보컬로이드) 원곡만"
          : vocaloidVocalMode === "covers_focus"
            ? "우타이테/인간 보컬 커버 중심"
            : "합성음성 원곡 + 우타이테 커버 병행"
      }\n`
    : "";

  const userPrompt = `다음 조건에 맞는 ${isAnimeOnly ? "애니송 " : ""}셋리(플레이리스트)를 ${requestedCount}곡으로 큐레이션해 주세요.${
    requestedCount > input.trackCount
      ? ` (중복 제외 후 최종 ${input.trackCount}곡 선별용 여유분 포함)`
      : ""
  }

${sceneScopeLine}${vocalModeLine}- 시드(기준 작품 / 아티스트 / 서클 / 기종 / 곡): ${input.seeds.length > 0 ? input.seeds.join(", ") : "지정 없음 (취향 DNA와 분위기 중심으로 자유 선곡)"}
- 원하는 분위기/무드: ${input.moods.length > 0 ? input.moods.join(", ") : isAnimeOnly ? "밸런스 있는 애니송 명곡 흐름" : "선택된 씬의 밸런스 있는 명곡 흐름"}
- 선호 장르/스타일: ${genres.length > 0 ? genres.join(", ") : "장르 제한 없음 (시드와 무드에 맞게 자유 배합)"}
- 포함할 곡 유형(Theme Types): ${promptThemeTypes.join(", ")}
- 시대/연대: ${describeEra(input.era, scenes)}
- 대중성/인지도 (메이저 ↔ 마이너): ${describePopularity(popularityLevel, scenes)}
- 추가 요청 사항: ${input.prompt?.trim() ? input.prompt.trim() : "없음"}
- 요청 곡 수: ${requestedCount}곡
${excludedBlock}${tasteContextBlock}${watchedContextBlock}`;

  const interaction = await ai.interactions.create({
    model: "gemini-3.8-flash",
    store: false,
    system_instruction: systemInstruction,
    input: userPrompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: buildPlaylistJsonSchema(scenes, vocaloidVocalMode),
    },
  });

  const text = interaction.output_text;
  if (!text) {
    throw new Error("Gemini API로부터 빈 응답을 받았습니다.");
  }

  const parsed = GeminiPlaylistSchema.parse(JSON.parse(text));
  let hydrated = hydrateTracks(parsed.tracks, allKnownTracks, userKnownKeys);

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
    (allKnownTracks.length > 0 || userKnownKeys.size > 0) &&
    familiarityLevel === 1
  ) {
    const filtered = hydrated.filter((t) => !t.inUserLibrary);
    if (filtered.length >= Math.min(4, input.trackCount)) {
      hydrated = filtered;
    }
  } else if (
    allKnownTracks.length >= input.trackCount &&
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
    scenes,
    tracks: hydrated.slice(0, input.trackCount),
  };
}

interface CuratedCatalogEntry extends z.infer<typeof TrackSchema> {
  tags: string[];
}

function getCatalogEntryScene(entry: CuratedCatalogEntry): SceneDomain {
  return entry.scene ?? inferSceneFromThemeType(entry.themeType);
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
  // --- Vocaloid & Utaite Catalog ---
  {
    scene: "vocaloid",
    title: "メルト",
    titleRomaji: "Melt",
    artist: "supercell feat. 初音ミク",
    artistRomaji: "supercell feat. Hatsune Miku",
    animeTitle: "하츠네 미쿠",
    animeTitleJapanese: "初音ミク",
    animeTitleRomaji: "Hatsune Miku",
    themeType: "VOCALOID",
    themeLabel: "보카로 오리지널",
    year: 2007,
    bpmVibe: "168 BPM · 클래식 보카로 록",
    reason: "ryo(supercell) 특유의 피아노·기타 록 문법으로 보카로 씬을 연 기념비적 명곡입니다.",
    tags: ["청춘 / 밴드", "울컥 / 감동", "질주감 / 열혈", "보컬로이드", "ryo"],
  },
  {
    scene: "vocaloid",
    title: "ローリンガール",
    titleRomaji: "Rolling Girl",
    artist: "wowaka feat. 初音ミク",
    artistRomaji: "wowaka feat. Hatsune Miku",
    animeTitle: "하츠네 미쿠",
    animeTitleJapanese: "初音ミク",
    animeTitleRomaji: "Hatsune Miku",
    themeType: "VOCALOID",
    themeLabel: "보카로 오리지널",
    year: 2010,
    bpmVibe: "195 BPM · 질주 피아노 기타록",
    reason: "숨 쉴 틈 없는 고속 피아노 리프와 기타가 청춘의 초조함을 극한까지 밀어붙입니다.",
    tags: ["질주감 / 열혈", "다크 / 비장함", "기타록 / 밴드", "wowaka", "보컬로이드"],
  },
  {
    scene: "vocaloid",
    title: "アスノヨゾラ哨戒班",
    titleRomaji: "Asu no Yozora Shoukaihan",
    artist: "Orangestar feat. IA",
    artistRomaji: "Orangestar feat. IA",
    animeTitle: "IA / 프로젝트 세카이",
    animeTitleJapanese: "IA / プロジェクトセカイ",
    animeTitleRomaji: "IA / Project SEKAI",
    themeType: "VOCALOID",
    themeLabel: "보카로 오리지널",
    year: 2014,
    bpmVibe: "185 BPM · 청량 상쾌 기타록",
    reason: "별빛 아래 질주하는 듯한 투명한 멜로디와 후렴의 카타르시스가 일품입니다.",
    tags: ["청량 / 여름", "질주감 / 열혈", "울컥 / 감동", "Orangestar", "프로젝트 세카이"],
  },
  {
    scene: "vocaloid",
    title: "ヴァンパイア",
    titleRomaji: "The Vampire",
    artist: "DECO*27 feat. 初音ミク",
    artistRomaji: "DECO*27 feat. Hatsune Miku",
    animeTitle: "하츠네 미쿠 / 프로젝트 세카이",
    animeTitleJapanese: "初音ミク / プロジェクトセカイ",
    animeTitleRomaji: "Hatsune Miku / Project SEKAI",
    themeType: "VOCALOID",
    themeLabel: "보카로 오리지널",
    year: 2021,
    bpmVibe: "164 BPM · 댄서블 일렉트로 록",
    reason: "중독성 있는 신스 베이스와 캐치한 훅으로 현대 보카로 팝 록을 대표하는 트랙입니다.",
    tags: ["발랄 / 일상", "질주감 / 열혈", "DECO*27", "프로젝트 세카이"],
  },
  {
    scene: "vocaloid",
    title: "きゅうくらりん",
    titleRomaji: "Kyu-kurarin",
    artist: "いよわ feat. 可不",
    artistRomaji: "Iyowa feat. KAFU",
    animeTitle: "카후(KAFU) / 프로젝트 세카이",
    animeTitleJapanese: "可不 / プロジェクトセカイ",
    animeTitleRomaji: "KAFU / Project SEKAI",
    themeType: "VOCALOID",
    themeLabel: "보카로 오리지널",
    year: 2021,
    bpmVibe: "220 BPM · 초고속 전파 아트팝",
    reason: "경쾌한 피아노·글로켄슈필 사운드 이면에 위태로운 감정선을 숨긴 이요와 대표작입니다.",
    tags: ["전파송 / 덴파", "새벽 감성", "이요와", "카후"],
  },
  {
    scene: "vocaloid",
    title: "エイリアンエイリアン",
    titleRomaji: "Alien Alien",
    artist: "ナユタン星人 feat. 初音ミク",
    artistRomaji: "Nayutalien feat. Hatsune Miku",
    animeTitle: "하츠네 미쿠",
    animeTitleJapanese: "初音ミク",
    animeTitleRomaji: "Hatsune Miku",
    themeType: "VOCALOID",
    themeLabel: "보카로 오리지널",
    year: 2016,
    bpmVibe: "152 BPM · 레트로 우주 신스팝",
    reason: "단순하면서도 중독성 강한 신스 리프로 셋리에 유쾌한 리듬감을 더해줍니다.",
    tags: ["발랄 / 일상", "전파송 / 덴파", "나유탄 성인", "보컬로이드"],
  },
  {
    scene: "vocaloid",
    title: "命に嫌われている。",
    titleRomaji: "Hated by Life Itself",
    artist: "まふまふ (원곡: カンザキイオリ)",
    artistRomaji: "Mafumafu (Orig. Iori Kanzaki)",
    animeTitle: "우타이테 커버",
    animeTitleJapanese: "歌ってみた",
    animeTitleRomaji: "Utaite Cover",
    themeType: "UTAITE",
    themeLabel: "우타이테 커버",
    year: 2018,
    bpmVibe: "148 BPM · 고음 격정 커버 록",
    reason: "칸자키 이오리의 절박한 원곡을 마후마후 특유의 초고음 보컬로 터뜨리는 대표 우타이테 커버입니다.",
    tags: ["울컥 / 감동", "다크 / 비장함", "우타이테", "마후마후"],
  },
  {
    scene: "vocaloid",
    title: "シャルル",
    titleRomaji: "Charles",
    artist: "須田景凪 (バルーン)",
    artistRomaji: "Keina Suda (balloon)",
    animeTitle: "보카로 셀프 커버",
    animeTitleJapanese: "バルーン / セルフカバー",
    animeTitleRomaji: "balloon Self-Cover",
    themeType: "UTAITE",
    themeLabel: "우타이테·셀프 커버",
    year: 2016,
    bpmVibe: "145 BPM · 새벽 기타팝",
    reason: "보카로 프로듀서 벌룬의 명곡을 인간 보컬 톤의 애절한 질감으로 즐길 수 있는 트랙입니다.",
    tags: ["새벽 감성", "울컥 / 감동", "우타이테"],
  },
  // --- Rhythm Game & Doujin (Nanahira / Confetto / TANO*C / BMS / Touhou) ---
  {
    scene: "rhythm_doujin",
    title: "ベースラインやってる？笑",
    titleRomaji: "Bassline Yatteru? w",
    artist: "かめりあ feat. ななひら",
    artistRomaji: "Camellia feat. Nanahira",
    animeTitle: "Confetto / 동인 전파",
    animeTitleJapanese: "Confetto",
    animeTitleRomaji: "Confetto",
    themeType: "DOUJIN",
    themeLabel: "전파 동인곡",
    year: 2016,
    bpmVibe: "175 BPM · 전파 일렉트로 베이스",
    reason: "나나히라의 독보적인 하이톤 전파 보컬과 카멜리아의 묵직한 베이스 드롭이 충돌하는 시그니처 트랙입니다.",
    tags: ["전파송 / 덴파", "발랄 / 일상", "나나히라", "Camellia", "Confetto"],
  },
  {
    scene: "rhythm_doujin",
    title: "You Make My Life 1UP",
    titleRomaji: "You Make My Life 1UP",
    artist: "かめりあ feat. ななひら",
    artistRomaji: "Camellia feat. Nanahira",
    animeTitle: "Confetto / 칩튠 전파",
    animeTitleJapanese: "Confetto",
    animeTitleRomaji: "Confetto",
    themeType: "DOUJIN",
    themeLabel: "전파 동인곡",
    year: 2018,
    bpmVibe: "180 BPM · 8bit 해피 전파",
    reason: "게임보이풍 칩튠 사운드와 나나히라 특유의 경쾌한 코러스가 셋리의 텐션을 한껏 끌어올립니다.",
    tags: ["전파송 / 덴파", "발랄 / 일상", "질주감 / 열혈", "나나히라", "Camellia"],
  },
  {
    scene: "rhythm_doujin",
    title: "Brain Power",
    titleRomaji: "Brain Power",
    artist: "NOMA",
    artistRomaji: "NOMA",
    animeTitle: "SOUND VOLTEX",
    animeTitleJapanese: "SOUND VOLTEX",
    animeTitleRomaji: "SOUND VOLTEX",
    themeType: "RHYTHM",
    themeLabel: "SDVX 수록",
    year: 2014,
    bpmVibe: "170 BPM · 하이테크 하드코어",
    reason: "사운드 볼텍스를 상징하는 폭발적인 신스 리드와 아드레날린 넘치는 하이테크 전개입니다.",
    tags: ["질주감 / 열혈", "긴박 / 배틀", "SOUND VOLTEX", "SDVX", "유로비트 / 하이테크"],
  },
  {
    scene: "rhythm_doujin",
    title: "Oshama Scramble!",
    titleRomaji: "Oshama Scramble!",
    artist: "t+pazolite",
    artistRomaji: "t+pazolite",
    animeTitle: "maimai",
    animeTitleJapanese: "maimai",
    animeTitleRomaji: "maimai",
    themeType: "RHYTHM",
    themeLabel: "maimai 수록",
    year: 2015,
    bpmVibe: "190 BPM · 스피드 해피하드코어",
    reason: "t+pazolite 특유의 장난기 가득한 샘플링과 미친 속도감이 어우러진 아케이드 대표곡입니다.",
    tags: ["발랄 / 일상", "질주감 / 열혈", "t+pazolite", "maimai", "HARDCORE TANO*C"],
  },
  {
    scene: "rhythm_doujin",
    title: "FREEDOM DiVE",
    titleRomaji: "FREEDOM DiVE",
    artist: "xi",
    artistRomaji: "xi",
    animeTitle: "BMS",
    animeTitleJapanese: "BMS",
    animeTitleRomaji: "BMS",
    themeType: "RHYTHM",
    themeLabel: "BMS 보스곡",
    year: 2011,
    bpmVibe: "222.22 BPM · 해피하드코어 피아노",
    reason: "화려한 피아노 아르페지오와 222 BPM의 질주감이 완벽히 결합된 리듬게임 씬의 영원한 보스곡입니다.",
    tags: ["질주감 / 열혈", "긴박 / 배틀", "심포닉 / 오케스트라", "BMS", "xi"],
  },
  {
    scene: "rhythm_doujin",
    title: "Cyaegha",
    titleRomaji: "Cyaegha",
    artist: "USAO",
    artistRomaji: "USAO",
    animeTitle: "Arcaea / HARDCORE TANO*C",
    animeTitleJapanese: "Arcaea / HARDCORE TANO*C",
    animeTitleRomaji: "Arcaea / HARDCORE TANO*C",
    themeType: "RHYTHM",
    themeLabel: "하드코어 보스곡",
    year: 2019,
    bpmVibe: "200 BPM · 다크 하드스텝",
    reason: "압도적인 킥과 일렉트로 드롭이 피크 섹션의 몰입감을 극대화합니다.",
    tags: ["긴박 / 배틀", "다크 / 비장함", "USAO", "HARDCORE TANO*C", "CHUNITHM"],
  },
  {
    scene: "rhythm_doujin",
    title: "Bad Apple!! feat. nomico",
    titleRomaji: "Bad Apple!! feat. nomico",
    artist: "Alstroemeria Records",
    artistRomaji: "Alstroemeria Records",
    animeTitle: "동방 프로젝트",
    animeTitleJapanese: "東方Project",
    animeTitleRomaji: "Touhou Project",
    themeType: "DOUJIN",
    themeLabel: "동방 어레인지",
    year: 2007,
    bpmVibe: "138 BPM · 유로비트 동방 보컬",
    reason: "동방 동인 음악을 넘어 서브컬처 유로비트·댄스 보컬의 상징으로 자리 잡은 트랙입니다.",
    tags: ["유로비트 / 하이테크", "다크 / 비장함", "동방", "동방 어레인지"],
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
  options?: {
    excludedRecentTracks?: ExcludedTrackRef[];
    userKnownKeys?: Set<string>;
    extraKnownTracks?: KnownTrackItem[];
    watchedAnime?: WatchedAnimeItem[];
  }
): GeneratedPlaylist {
  const scenes = normalizeScenes(input.scenes);
  const isAnimeOnly = scenes.length === 1 && scenes[0] === "anime";
  const vocaloidVocalMode = input.vocaloidVocalMode ?? "original_only";
  const excludedRecentTracks = options?.excludedRecentTracks ?? [];
  const userKnownKeys = options?.userKnownKeys ?? new Set<string>();
  const watchedAnime = options?.watchedAnime ?? [];
  const watchedMode = input.watchedAnimeMode ?? "ignore";
  const seedLower = input.seeds.map((s) => s.toLowerCase());
  const promptLower = (input.prompt ?? "").toLowerCase();
  const genres = input.genres ?? [];

  const knownTracks = mergeKnownTrackLists(
    input.tasteProfile?.knownTracks ?? [],
    options?.extraKnownTracks ?? []
  );
  const familiarityLevel = input.familiarityLevel ?? 3;
  const popularityLevel = resolvePopularityLevel(input);

  const sceneFilteredCatalog = FALLBACK_CATALOG.filter((item) => {
    const itemScene = getCatalogEntryScene(item);
    if (!scenes.includes(itemScene)) return false;
    if (
      itemScene === "vocaloid" &&
      vocaloidVocalMode === "original_only" &&
      item.themeType === "UTAITE"
    ) {
      return false;
    }
    return true;
  });

  const nonExcluded = sceneFilteredCatalog.filter(
    (item) =>
      excludedRecentTracks.length === 0 ||
      !isTrackExcluded(item, excludedRecentTracks)
  );
  const pool =
    nonExcluded.length >= Math.min(4, input.trackCount)
      ? nonExcluded
      : sceneFilteredCatalog;

  const scoredList = pool
    .map((item) => {
      let score = 0;

      if (input.themeTypes.includes(item.themeType)) score += 30;
      if (matchEra(item.year, input.era)) score += 25;

      for (const mood of input.moods) {
        if (item.tags.includes(mood)) score += 25;
      }

      if (
        getCatalogEntryScene(item) === "vocaloid" &&
        vocaloidVocalMode === "covers_focus" &&
        item.themeType === "UTAITE"
      ) {
        score += 35;
      }

      const haystack = `${item.animeTitle} ${item.animeTitleRomaji} ${item.animeTitleJapanese} ${item.title} ${item.titleRomaji} ${item.artist} ${item.artistRomaji} ${item.bpmVibe} ${item.tags.join(" ")}`.toLowerCase();
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
        item.themeType === "CHARACTER" ||
        item.themeType === "DOUJIN";
      if (popularityLevel === 1 && item.themeType === "OP") score += 15;
      if (popularityLevel >= 3 && isDeepCutType) {
        score += popularityLevel === 4 ? 24 : 12;
      }

      const inLib = knownTracks.length > 0 && isTrackInKnownLibrary(item, knownTracks);
      if (familiarityLevel === 1 && inLib) score -= 120;
      if (familiarityLevel === 4 && inLib) score += 40;
      if (familiarityLevel === 5) score += inLib ? 80 : -80;

      if (
        getCatalogEntryScene(item) === "anime" &&
        watchedMode !== "ignore" &&
        watchedAnime.length > 0
      ) {
        const animeTokens = [
          item.animeTitle,
          item.animeTitleRomaji,
          item.animeTitleJapanese,
        ]
          .map(normalizeForCompare)
          .filter((t) => t.length >= 2);
        const matchedWatched = watchedAnime.find((w) => {
          const wNorm = normalizeForCompare(w.title);
          if (wNorm.length < 2) return false;
          return animeTokens.some(
            (t) =>
              t === wNorm ||
              (wNorm.length >= 3 && (t.includes(wNorm) || wNorm.includes(t)))
          );
        });
        if (matchedWatched) {
          if (
            watchedMode === "prefer_watched" &&
            getRatingWeight(matchedWatched.rating) > 0
          ) {
            score += 45 + getRatingWeight(matchedWatched.rating) * 4;
          } else if (watchedMode === "discover_unwatched") {
            score -= 120;
          }
        }
      }

      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  let selectedEntries: CuratedCatalogEntry[];
  if (scenes.length > 1) {
    // Round-robin across selected scenes so crossover fallback includes all enabled scenes
    const buckets = new Map<SceneDomain, CuratedCatalogEntry[]>();
    for (const sc of scenes) buckets.set(sc, []);
    for (const { item } of scoredList) {
      const sc = getCatalogEntryScene(item);
      buckets.get(sc)?.push(item);
    }
    const picked: CuratedCatalogEntry[] = [];
    const pickedSet = new Set<CuratedCatalogEntry>();
    let round = 0;
    while (picked.length < input.trackCount) {
      let addedInRound = false;
      for (const sc of scenes) {
        const list = buckets.get(sc) ?? [];
        if (round < list.length) {
          const candidate = list[round];
          if (!pickedSet.has(candidate)) {
            picked.push(candidate);
            pickedSet.add(candidate);
            addedInRound = true;
            if (picked.length >= input.trackCount) break;
          }
        }
      }
      if (!addedInRound) break;
      round += 1;
    }
    selectedEntries = picked;
  } else {
    selectedEntries = scoredList.slice(0, input.trackCount).map((s) => s.item);
  }

  const scored = selectedEntries.map((item) => {
    const { tags: _tags, ...trackData } = item;
    void _tags;
    return trackData;
  });

  const sceneLabel = isAnimeOnly
    ? "애니송"
    : scenes
        .map((s) =>
          s === "anime"
            ? "애니송"
            : s === "vocaloid"
              ? "보카로"
              : "리듬·동인"
        )
        .join(" × ");
  const moodSummary =
    input.moods.length > 0 ? input.moods.join(" · ") : `밸런스 ${sceneLabel}`;
  const seedSummary =
    input.seeds.length > 0 ? `${input.seeds[0]} 기반 ` : "";

  return {
    title: `${seedSummary}${moodSummary} ${sceneLabel} 플리`,
    description: `AniTune이 큐레이션한 ${moodSummary} 테마의 ${sceneLabel} 플레이리스트 (${scored.length}곡)`,
    curatorSummary:
      "현재 GEMINI_API_KEY가 설정되지 않아 샘플 카탈로그 모드로 생성되었습니다. .env.local에 GEMINI_API_KEY를 추가하면 취향 DNA와 4단계 비중을 반영한 실시간 AI 선곡이 동작합니다.",
    mode: "demo-fallback",
    scenes,
    tracks: hydrateTracks(scored, knownTracks, userKnownKeys),
  };
}

function toExcludedTrackRefs(tracks: PlaylistTrack[]): ExcludedTrackRef[] {
  return tracks.map((t) => ({
    title: t.title,
    titleRomaji: t.titleRomaji,
    artist: t.artist,
    artistRomaji: t.artistRomaji,
    animeTitle: t.animeTitle,
    scene: t.scene,
  }));
}

function inferPlaylistScenes(playlist: GeneratedPlaylist): SceneDomain[] {
  if (playlist.scenes && playlist.scenes.length > 0) {
    return normalizeScenes(playlist.scenes);
  }
  const fromTracks = playlist.tracks
    .map((t) => t.scene ?? inferSceneFromThemeType(t.themeType))
    .filter(Boolean);
  return normalizeScenes(fromTracks);
}

export async function rerollSingleTrackWithGemini(params: {
  currentPlaylist: GeneratedPlaylist;
  targetTrack: PlaylistTrack;
  hint?: string;
  knownTracks?: KnownTrackItem[];
  userKnownKeys?: Set<string>;
}): Promise<PlaylistTrack> {
  const {
    currentPlaylist,
    targetTrack,
    hint,
    knownTracks = [],
    userKnownKeys = new Set<string>(),
  } = params;

  const playlistScenes = inferPlaylistScenes(currentPlaylist);
  const targetScene =
    targetTrack.scene ?? inferSceneFromThemeType(targetTrack.themeType);
  const rerollScenes = normalizeScenes(
    playlistScenes.includes(targetScene) ? [targetScene] : playlistScenes
  );
  const isAnimeOnly =
    rerollScenes.length === 1 && rerollScenes[0] === "anime";
  const vocalMode: VocaloidVocalMode =
    targetTrack.themeType === "UTAITE" ? "allow_covers" : "original_only";

  const existingRefs = toExcludedTrackRefs(currentPlaylist.tracks);
  const idOffset = Date.now() % 100000;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const scenePool = FALLBACK_CATALOG.filter((item) =>
      rerollScenes.includes(getCatalogEntryScene(item))
    );
    const activeCatalog = scenePool.length > 0 ? scenePool : FALLBACK_CATALOG;
    const candidates = activeCatalog.filter(
      (item) => !isTrackExcluded(item, existingRefs)
    );
    const pool = candidates.length > 0 ? candidates : activeCatalog;
    const sameType = pool.filter((c) => c.themeType === targetTrack.themeType);
    const chosenPool = sameType.length > 0 ? sameType : pool;
    const picked = chosenPool[Math.floor(Math.random() * chosenPool.length)];
    const { tags: _tags, ...rawTrack } = picked;
    void _tags;
    const [hydrated] = hydrateTracks(
      [
        {
          ...rawTrack,
          setlistSection: targetTrack.setlistSection ?? rawTrack.setlistSection,
        },
      ],
      knownTracks,
      userKnownKeys,
      idOffset
    );
    return hydrated;
  }

  const ai = new GoogleGenAI({ apiKey });
  const trackListSummary = currentPlaylist.tracks
    .map(
      (t, i) =>
        `${i + 1}. ${t.title} - ${t.artist} [${t.animeTitle} · ${t.themeLabel}]`
    )
    .join("\n");

  const sceneConstraint = isAnimeOnly
    ? "반드시 실제로 존재하는 애니메이션 공식 타이업 곡 1곡만 반환하세요."
    : `반드시 허용된 씬(${formatSceneNames(rerollScenes)})에 속하는 실존 곡 1곡만 반환하세요.`;

  const userPrompt = `현재 플레이리스트의 특정 트랙 1곡을 다른 어울리는 ${isAnimeOnly ? "애니송" : "트랙"}으로 교체하려고 합니다.

[현재 플레이리스트]
- 제목: ${currentPlaylist.title}
- 요약: ${currentPlaylist.curatorSummary}
- 전체 곡 목록 (아래 곡들은 절대 중복 선곡 금지):
${trackListSummary}

[교체할 대상 트랙]
- 곡명: ${targetTrack.title} (${targetTrack.titleRomaji}) - ${targetTrack.artist}
- 출처/작품: ${targetTrack.animeTitle} (${targetTrack.themeLabel})
- 섹션/분위기: ${targetTrack.setlistSection ?? "중간 흐름"} / ${targetTrack.bpmVibe}
- 교체 요청 메모: ${hint?.trim() ? hint.trim() : "기존 셋리 분위기와 섹션 흐름에 자연스럽게 어울리지만 신선한 다른 곡으로 교체"}

${sceneConstraint}`;

  const interaction = await ai.interactions.create({
    model: "gemini-3.8-flash",
    store: false,
    system_instruction: isAnimeOnly
      ? "당신은 일본 애니메이션 음악 전문 큐레이터 'AniTune'입니다. 기존 플레이리스트 목록과 중복되지 않으며 해당 섹션과 분위기에 딱 맞는 실존 애니송 1곡을 JSON 스키마로 정확히 제안하세요."
      : `당신은 일본 서브컬처 음악(${formatSceneNames(rerollScenes)}) 전문 큐레이터 'AniTune'입니다. 기존 플레이리스트 목록과 중복되지 않으며 해당 섹션과 사운드 결에 딱 맞는 실존 트랙 1곡을 JSON 스키마로 정확히 제안하세요.`,
    input: userPrompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: buildTrackJsonSchema(rerollScenes, vocalMode),
    },
  });

  const text = interaction.output_text;
  if (!text) {
    throw new Error("Gemini API로부터 교체 트랙 응답을 받지 못했습니다.");
  }

  const parsed = TrackSchema.parse(JSON.parse(text));
  const [hydrated] = hydrateTracks(
    [
      {
        ...parsed,
        setlistSection: parsed.setlistSection ?? targetTrack.setlistSection,
      },
    ],
    knownTracks,
    userKnownKeys,
    idOffset
  );
  return hydrated;
}

const ExtendResponseSchema = z.object({
  tracks: z.array(TrackSchema).min(1),
});

export async function extendPlaylistWithGemini(params: {
  currentPlaylist: GeneratedPlaylist;
  addCount: number;
  instruction?: string;
  knownTracks?: KnownTrackItem[];
  userKnownKeys?: Set<string>;
}): Promise<PlaylistTrack[]> {
  const {
    currentPlaylist,
    addCount,
    instruction,
    knownTracks = [],
    userKnownKeys = new Set<string>(),
  } = params;

  const scenes = inferPlaylistScenes(currentPlaylist);
  const isAnimeOnly = scenes.length === 1 && scenes[0] === "anime";
  const hasUtaite = currentPlaylist.tracks.some((t) => t.themeType === "UTAITE");
  const vocalMode: VocaloidVocalMode = hasUtaite
    ? "allow_covers"
    : "original_only";

  const existingRefs = toExcludedTrackRefs(currentPlaylist.tracks);
  const idOffset = Date.now() % 100000;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const scenePool = FALLBACK_CATALOG.filter((item) =>
      scenes.includes(getCatalogEntryScene(item))
    );
    const activeCatalog = scenePool.length > 0 ? scenePool : FALLBACK_CATALOG;
    const candidates = activeCatalog.filter(
      (item) => !isTrackExcluded(item, existingRefs)
    );
    const picked = (candidates.length > 0 ? candidates : activeCatalog)
      .slice(0, addCount)
      .map((item) => {
        const { tags: _tags, ...raw } = item;
        void _tags;
        return {
          ...raw,
          setlistSection: raw.setlistSection ?? "앵콜 확장",
        };
      });
    return hydrateTracks(picked, knownTracks, userKnownKeys, idOffset);
  }

  const ai = new GoogleGenAI({ apiKey });
  const existingSummary = currentPlaylist.tracks
    .map(
      (t, i) =>
        `${i + 1}. ${t.title} - ${t.artist} [${t.animeTitle} · ${t.themeLabel} · ${t.bpmVibe}]`
    )
    .join("\n");

  const requestCount = Math.min(12, addCount + 2);
  const sceneConstraint = isAnimeOnly
    ? "반드시 실제로 존재하는 애니메이션 공식 타이업 곡만 반환하세요."
    : `반드시 허용된 씬(${formatSceneNames(scenes)})에 속하는 실존 곡만 반환하세요.`;

  const userPrompt = `기존 ${isAnimeOnly ? "애니송 " : ""}플레이리스트의 뒷부분을 자연스럽게 이어가는 추가 트랙 ${requestCount}곡(중복 제외 후 ${addCount}곡 선별)을 추천해 주세요.

[기존 플레이리스트 정보]
- 제목: ${currentPlaylist.title}
- 설명: ${currentPlaylist.description}
- 큐레이션 요약: ${currentPlaylist.curatorSummary}
- 기존 트랙 목록 (절대 중복 선곡 금지):
${existingSummary}

- 추가 지시사항: ${instruction?.trim() ? instruction.trim() : "기존 셋리의 사운드 결, 에너지, 감정선을 자연스럽게 이어가면서 신선한 곡으로 후반부와 앵콜을 확장해 주세요."}

${sceneConstraint}`;

  const interaction = await ai.interactions.create({
    model: "gemini-3.8-flash",
    store: false,
    system_instruction: isAnimeOnly
      ? "당신은 일본 애니메이션 음악 전문 큐레이터 'AniTune'입니다. 기존 트랙 목록과 절대 중복되지 않으면서 셋리의 뒷 흐름을 매끄럽게 잇는 실존 애니송만 선별하세요."
      : `당신은 일본 서브컬처 음악(${formatSceneNames(scenes)}) 전문 큐레이터 'AniTune'입니다. 기존 트랙 목록과 절대 중복되지 않으면서 셋리의 뒷 흐름을 매끄럽게 잇는 실존 곡만 선별하세요.`,
    input: userPrompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: buildExtendJsonSchema(scenes, vocalMode),
    },
  });

  const text = interaction.output_text;
  if (!text) {
    throw new Error("Gemini API로부터 추가 트랙 응답을 받지 못했습니다.");
  }

  const parsed = ExtendResponseSchema.parse(JSON.parse(text));
  const hydrated = hydrateTracks(
    parsed.tracks,
    knownTracks,
    userKnownKeys,
    idOffset
  );
  const nonDuplicate = hydrated.filter((t) => !isTrackExcluded(t, existingRefs));
  return (nonDuplicate.length > 0 ? nonDuplicate : hydrated).slice(0, addCount);
}
