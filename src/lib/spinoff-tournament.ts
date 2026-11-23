import type {
  FamiliarityLevel,
  PlaylistGenerateRequest,
  PlaylistTrack,
  ThemeType,
  WatchedAnimeItem,
  WatchedAnimeMode,
} from "@/types/playlist";

export function getRatingWeight(rating: string | null): number {
  if (!rating) return 1;
  if (rating.includes("인생작")) return 5;
  if (rating.includes("명작")) return 4;
  if (rating.includes("수작")) return 3;
  if (rating.includes("킬링타임")) return 2;
  if (rating.includes("시간이아깝다") || rating.includes("쓰레기")) return 0;
  return 1;
}

export type TrackSpinoffMode = "lineage" | "sonic_clone" | "anime_deep_dive";

export function buildTrackSpinoffRequest(
  track: PlaylistTrack,
  mode: TrackSpinoffMode,
  options?: {
    trackCount?: number;
    tasteProfile?: PlaylistGenerateRequest["tasteProfile"];
    familiarityLevel?: FamiliarityLevel;
    watchedAnimeMode?: WatchedAnimeMode;
  }
): PlaylistGenerateRequest {
  const trackCount = options?.trackCount ?? 12;
  const baseTaste = options?.tasteProfile ?? null;
  const familiarityLevel = options?.familiarityLevel ?? 3;
  const watchedAnimeMode = options?.watchedAnimeMode ?? "ignore";

  if (mode === "lineage") {
    return {
      seeds: Array.from(
        new Set([track.artist, track.animeTitle].filter(Boolean))
      ).slice(0, 4),
      moods: [],
      genres: [],
      themeTypes: ["OP", "ED", "INSERT", "OST"],
      era: "ALL",
      trackCount,
      popularityLevel: 3,
      includeHiddenGems: true,
      excludeRecentTurns: 1,
      familiarityLevel,
      watchedAnimeMode,
      tasteProfile: baseTaste,
      prompt: `기준 트랙 「${track.title} - ${track.artist} (${track.animeTitle} ${track.themeLabel})」의 아티스트·작곡가·프로듀서 계보와 편곡 문법을 공유하는 애니송 셋리를 구성해 줘. 같은 아티스트/작곡가 계보의 대표곡과 숨은 명곡을 자연스럽게 이어줘.`,
    };
  }

  if (mode === "sonic_clone") {
    return {
      seeds: Array.from(
        new Set([track.title, track.artist].filter(Boolean))
      ).slice(0, 4),
      moods: [],
      genres: [],
      themeTypes: Array.from(
        new Set<ThemeType>([track.themeType, "OP", "ED", "INSERT"])
      ),
      era: "ALL",
      trackCount,
      popularityLevel: 3,
      includeHiddenGems: true,
      excludeRecentTurns: 1,
      familiarityLevel,
      watchedAnimeMode,
      tasteProfile: baseTaste,
      prompt: `기준 트랙 「${track.title} - ${track.artist}」의 사운드 질감·템포(${track.bpmVibe})와 가장 비슷한 텐션의 애니송들만 모아 셋리를 구성해 줘. (${track.reason})`,
    };
  }

  return {
    seeds: [track.animeTitle].filter(Boolean),
    moods: [],
    genres: [],
    themeTypes: ["OP", "ED", "INSERT", "OST", "CHARACTER"],
    era: "ALL",
    trackCount,
    popularityLevel: 4,
    includeHiddenGems: true,
    excludeRecentTurns: 0,
    familiarityLevel,
    watchedAnimeMode,
    tasteProfile: baseTaste,
    prompt: `「${track.animeTitle} (${track.animeTitleJapanese || track.animeTitleRomaji})」 전 시즌·극장판의 OP/ED/극중 삽입곡/OST/캐릭터송을 총망라한 작품 스페셜 셋리를 짜줘. 단일 작품 곡이 부족할 때만 결이 가장 비슷한 자매작 곡으로 보충해 줘.`,
  };
}

export interface TournamentContender {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  moods: string[];
  genres: string[];
  seedValue: string;
  description: string;
}

export const DEFAULT_TOURNAMENT_POOL: TournamentContender[] = [
  {
    id: "curated-bocchi",
    title: "봇치 더 록!",
    subtitle: "결속밴드 · 青春コンプレックス",
    badge: "188 BPM · 질주 기타록",
    moods: ["질주감 / 열혈", "청량 / 여름"],
    genres: ["기타록 / 밴드"],
    seedValue: "봇치 더 록!",
    description: "날카로운 기타 리프와 청춘의 조급함이 터지는 정통 밴드 사운드",
  },
  {
    id: "curated-frieren",
    title: "장송의 프리렌",
    subtitle: "요루시카 / milet · 晴る · Anytime Anywhere",
    badge: "서정 록 & 발라드",
    moods: ["몽환 / 이세계", "울컥 / 감동"],
    genres: ["어쿠스틱 / 피아노 발라드"],
    seedValue: "장송의 프리렌",
    description: "여정의 여운과 투명한 어쿠스틱·스트링 선율이 남기는 감동",
  },
  {
    id: "curated-edgerunners",
    title: "사이버펑크: 엣지 러너",
    subtitle: "Rosa Walton · I Really Want to Stay at Your House",
    badge: "네온 일렉트로 · 애절",
    moods: ["새벽 감성", "다크 / 비장함"],
    genres: ["일렉트로 / 퓨처베이스"],
    seedValue: "사이버펑크: 엣지 러너",
    description: "네온 불빛 아래에서 벅차오르는 비극적 신스웨이브 감성",
  },
  {
    id: "curated-jjk",
    title: "주술회전",
    subtitle: "Eve / King Gnu / 키타니 타츠야",
    badge: "다크 모던 록",
    moods: ["다크 / 비장함", "긴박 / 배틀"],
    genres: ["기타록 / 밴드"],
    seedValue: "주술회전",
    description: "어둡고 감각적인 묵직한 그루브와 폭발적인 배틀 텐션",
  },
  {
    id: "curated-bakemonogatari",
    title: "바케모노가타리",
    subtitle: "supercell · 君の知らない物語",
    badge: "밤하늘 피아노록",
    moods: ["새벽 감성", "울컥 / 감동"],
    genres: ["어쿠스틱 / 피아노 발라드", "성우 팝 / 캐릭터송"],
    seedValue: "바케모노가타리",
    description: "여름밤 별빛 아래 듣기 좋은 서정적 피아노록과 시부야케이 팝",
  },
  {
    id: "curated-aldnoah",
    title: "알드노아. 제로",
    subtitle: "사와노 히로유키 · aLIEz",
    badge: "심포닉 일렉트로",
    moods: ["다크 / 비장함", "몽환 / 이세계"],
    genres: ["심포닉 / 오케스트라", "일렉트로 / 퓨처베이스"],
    seedValue: "알드노아. 제로",
    description: "웅장한 오케스트라 빌드업 뒤 터지는 사와노 특유의 폭발 드롭",
  },
  {
    id: "curated-gbc",
    title: "걸즈 밴드 크라이",
    subtitle: "토게나시 토게아리 · 雑踏、僕らの街",
    badge: "178 BPM · 이모셔널 록",
    moods: ["질주감 / 열혈", "울컥 / 감동"],
    genres: ["기타록 / 밴드"],
    seedValue: "걸즈 밴드 크라이",
    description: "거친 보컬과 피아노·기타가 부딪히는 청춘 감정 폭발 사운드",
  },
  {
    id: "curated-bebop",
    title: "카우보이 비밥",
    subtitle: "SEATBELTS · Tank!",
    badge: "재즈 · 시티 그루브",
    moods: ["발랄 / 일상", "청량 / 여름"],
    genres: ["시티팝 / 칠 R&B"],
    seedValue: "카우보이 비밥",
    description: "세련된 빅밴드 재즈와 브라스가 만드는 스타일리시한 무드",
  },
  {
    id: "curated-rezero",
    title: "Re:제로부터 시작하는 이세계 생활",
    subtitle: "MYTH & ROID / 스즈키 코노미",
    badge: "고속 신스 · 다크 판타지",
    moods: ["몽환 / 이세계", "긴박 / 배틀"],
    genres: ["일렉트로 / 퓨처베이스", "심포닉 / 오케스트라"],
    seedValue: "Re:제로부터 시작하는 이세계 생활",
    description: "초고속 신스 록과 서늘한 몽환미가 교차하는 루프 서사",
  },
  {
    id: "curated-spyxfamily",
    title: "스파이 패밀리",
    subtitle: "Official髭男dism / 호시노 겐",
    badge: "브라스 팝 · 칠 소울",
    moods: ["발랄 / 일상", "청량 / 여름"],
    genres: ["시티팝 / 칠 R&B"],
    seedValue: "스파이 패밀리",
    description: "화려한 재즈 브라스와 따뜻한 밤 산책 그루브의 조화",
  },
  {
    id: "curated-plastic",
    title: "플라스틱 메모리즈",
    subtitle: "사사키 에리 · Ring of Fortune",
    badge: "감성 애절 발라드",
    moods: ["울컥 / 감동", "새벽 감성"],
    genres: ["어쿠스틱 / 피아노 발라드"],
    seedValue: "플라스틱 메모리즈",
    description: "시간의 유한함을 노래하는 맑고 가슴 시린 멜로디",
  },
  {
    id: "curated-railgun",
    title: "어떤 과학의 초전자포",
    subtitle: "fripSide · only my railgun",
    badge: "유로비트 · 하이테크 신스",
    moods: ["질주감 / 열혈", "긴박 / 배틀"],
    genres: ["유로비트 / 하이테크"],
    seedValue: "어떤 과학의 초전자포",
    description: "시원하게 내달리는 디지털 신스 리프와 쾌감 넘치는 고음",
  },
  {
    id: "curated-chainsaw",
    title: "체인소 맨",
    subtitle: "요네즈 켄시 / ano / Vaundy",
    badge: "하이브리드 얼터너티브",
    moods: ["다크 / 비장함", "질주감 / 열혈"],
    genres: ["기타록 / 밴드", "일렉트로 / 퓨처베이스"],
    seedValue: "체인소 맨",
    description: "예측 불가능한 전개와 호화 엔딩 라인업의 실험적 사운드",
  },
  {
    id: "curated-kaguya",
    title: "카구야 님은 고백받고 싶어",
    subtitle: "스즈키 마사유키 · 치카 댄스",
    badge: "펑키 러브 팝 · 전파",
    moods: ["발랄 / 일상", "청량 / 여름"],
    genres: ["전파송 / 덴파", "성우 팝 / 캐릭터송"],
    seedValue: "카구야 님은 고백받고 싶어",
    description: "흥겨운 시티 펑크부터 중독성 강한 캐릭터 송까지 유쾌한 에너지",
  },
  {
    id: "curated-haruhi",
    title: "스즈미야 하루히의 우울",
    subtitle: "히라노 아야 · God knows...",
    badge: "2000s 레전드 밴드",
    moods: ["질주감 / 열혈", "발랄 / 일상"],
    genres: ["기타록 / 밴드", "성우 팝 / 캐릭터송"],
    seedValue: "스즈미야 하루히의 우울",
    description: "학원제 무대의 전율과 2000년대 애니송의 낭만이 담긴 클래식",
  },
  {
    id: "curated-idolmaster",
    title: "아이돌마스터 / 러브라이브 계열",
    subtitle: "765PRO ALLSTARS · 自分REST@RT",
    badge: "라이브 콜 · 아이돌 팝",
    moods: ["질주감 / 열혈", "울컥 / 감동"],
    genres: ["아이돌 / 콜곡"],
    seedValue: "THE IDOLM@STER",
    description: "함께 소리 지르고 싶어지는 화려한 브라스와 무대 합창 에너지",
  },
];

function inferTagsFromWatchedGenre(item: WatchedAnimeItem): {
  moods: string[];
  genres: string[];
} {
  const g = item.genre ?? "";
  if (g.includes("액션") || g.includes("판타지") || g.includes("이세계")) {
    return {
      moods: ["질주감 / 열혈", "몽환 / 이세계"],
      genres: ["기타록 / 밴드", "심포닉 / 오케스트라"],
    };
  }
  if (g.includes("일상") || g.includes("치유")) {
    return {
      moods: ["발랄 / 일상", "새벽 감성"],
      genres: ["어쿠스틱 / 피아노 발라드", "시티팝 / 칠 R&B"],
    };
  }
  if (g.includes("러브 코미디")) {
    return {
      moods: ["발랄 / 일상", "청량 / 여름"],
      genres: ["성우 팝 / 캐릭터송", "기타록 / 밴드"],
    };
  }
  if (g.includes("두뇌")) {
    return {
      moods: ["다크 / 비장함", "긴박 / 배틀"],
      genres: ["일렉트로 / 퓨처베이스"],
    };
  }
  if (g.includes("개그")) {
    return {
      moods: ["발랄 / 일상"],
      genres: ["전파송 / 덴파", "성우 팝 / 캐릭터송"],
    };
  }
  return {
    moods: ["질주감 / 열혈", "울컥 / 감동"],
    genres: ["기타록 / 밴드"],
  };
}

function shuffleArray<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildTournamentContenders(
  watchedAnime: WatchedAnimeItem[],
  sourceMode: "watched" | "curated"
): TournamentContender[] {
  if (sourceMode === "watched") {
    const eligible = watchedAnime.filter(
      (item) => getRatingWeight(item.rating) >= 2
    );
    if (eligible.length >= 8) {
      const pool = eligible.slice(0, 40).map((item) => {
        const inferred = inferTagsFromWatchedGenre(item);
        return {
          id: `watched-${item.id}`,
          title: item.title,
          subtitle: [item.genre, item.status === "보는 중" ? "보는 중" : null]
            .filter(Boolean)
            .join(" · ") || "내 본 작품 보관함",
          badge:
            item.rank !== null
              ? `#${item.rank} · ${item.rating ?? "보관함"}`
              : item.rating ?? "본 작품",
          moods: inferred.moods,
          genres: inferred.genres,
          seedValue: item.title,
          description:
            item.note?.trim() ||
            `내 보관함에서 선택한 작품 — ${inferred.moods.join(" / ")} 분위기`,
        } satisfies TournamentContender;
      });
      return shuffleArray(pool).slice(0, 8);
    }
  }

  return shuffleArray(DEFAULT_TOURNAMENT_POOL).slice(0, 8);
}

export function buildTournamentWinnerRequest(params: {
  champion: TournamentContender;
  runnerUp: TournamentContender;
  semifinalists: TournamentContender[];
  trackCount?: number;
  tasteProfile?: PlaylistGenerateRequest["tasteProfile"];
  familiarityLevel?: FamiliarityLevel;
  watchedAnimeMode?: WatchedAnimeMode;
}): {
  seeds: string[];
  moods: string[];
  genres: string[];
  prompt: string;
  request: PlaylistGenerateRequest;
} {
  const { champion, runnerUp, semifinalists, trackCount = 12 } = params;
  const ordered = [champion, runnerUp, ...semifinalists];

  const seeds = Array.from(
    new Set(ordered.map((c) => c.seedValue).filter(Boolean))
  ).slice(0, 4);
  const moods = Array.from(
    new Set(ordered.flatMap((c) => c.moods).filter(Boolean))
  ).slice(0, 3);
  const genres = Array.from(
    new Set(ordered.flatMap((c) => c.genres).filter(Boolean))
  ).slice(0, 2);

  const sfNames = semifinalists.map((s) => s.title).join(", ");
  const prompt = `이상형 월드컵 우승작 「${champion.title}」의 분위기와 사운드를 메인 축으로 삼고, 준우승 「${runnerUp.title}」${
    sfNames ? ` 및 4강 진출작(${sfNames})` : ""
  }의 결이 자연스럽게 이어지는 셋리를 구성해 줘.`;

  return {
    seeds,
    moods,
    genres,
    prompt,
    request: {
      seeds,
      moods,
      genres,
      themeTypes: ["OP", "ED", "INSERT"],
      era: "ALL",
      trackCount,
      popularityLevel: 3,
      includeHiddenGems: true,
      excludeRecentTurns: 1,
      familiarityLevel: params.familiarityLevel ?? 3,
      watchedAnimeMode: params.watchedAnimeMode ?? "ignore",
      tasteProfile: params.tasteProfile ?? null,
      prompt,
    },
  };
}
