"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Bookmark,
  BookMarked,
  ChevronDown,
  ChevronUp,
  Search,
  Plus,
  RotateCcw,
  Trophy,
  Tv,
  X,
  Disc3,
  Loader2,
  Gem,
  History,
  SlidersHorizontal,
} from "lucide-react";
import type {
  AnimeSearchItem,
  AuthStatus,
  CustomPreset,
  EraFilter,
  FamiliarityLevel,
  PlaylistGenerateRequest,
  PlaylistHistoryEntry,
  PopularityLevel,
  SceneDomain,
  TasteProfile,
  ThemeType,
  VocaloidVocalMode,
  WatchedAnimeItem,
  WatchedAnimeMode,
} from "@/types/playlist";
import { AniListSeedImporter } from "@/components/AniListSeedImporter";
import { MoodTournamentModal } from "@/components/MoodTournamentModal";
import { TasteProfilePanel } from "@/components/TasteProfilePanel";
import { WatchedAnimePanel } from "@/components/WatchedAnimePanel";

const MOOD_OPTIONS = [
  "질주감 / 열혈",
  "새벽 감성",
  "울컥 / 감동",
  "몽환 / 이세계",
  "다크 / 비장함",
  "발랄 / 일상",
  "청량 / 여름",
  "긴박 / 배틀",
];

const GENRE_OPTIONS = [
  "기타록 / 밴드",
  "전파송 / 덴파",
  "심포닉 / 오케스트라",
  "일렉트로 / 퓨처베이스",
  "유로비트 / 하이테크",
  "보컬로이드 / 우타이테계",
  "아이돌 / 콜곡",
  "시티팝 / 칠 R&B",
  "어쿠스틱 / 피아노 발라드",
  "성우 팝 / 캐릭터송",
];

const POPULARITY_STEPS: Array<{
  level: PopularityLevel;
  badge: string;
  title: string;
  desc: string;
}> = [
  {
    level: 1,
    badge: "메이저",
    title: "메가히트",
    desc: "입문자도 바로 알 만한 대표 OP/ED와 메가히트곡 위주로 고릅니다",
  },
  {
    level: 2,
    badge: "밸런스",
    title: "대중+명곡",
    desc: "널리 알려진 대표곡과 팬들에게 인정받는 명곡을 절반씩 섞습니다",
  },
  {
    level: 3,
    badge: "마이너",
    title: "숨은 명곡",
    desc: "뻔한 메가히트 대신 2쿨 OP/ED·극중 삽입곡·명품 OST를 주로 고릅니다",
  },
  {
    level: 4,
    badge: "딥컷",
    title: "코어 선곡",
    desc: "B-side·특정 화수 삽입곡·비주류 명작 등 마니아 취향 딥컷에 집중합니다",
  },
];

const SCENE_OPTIONS: Array<{
  value: SceneDomain;
  label: string;
  desc: string;
}> = [
  { value: "anime", label: "애니송", desc: "OP · ED · OST · 삽입곡" },
  { value: "vocaloid", label: "보컬로이드", desc: "미쿠 · 프로세카 · 우타이테" },
  { value: "rhythm_doujin", label: "리듬게임 · 동인", desc: "나나히라 · SDVX · 동방" },
];

const VOCALOID_VOCAL_MODE_OPTIONS: Array<{
  value: VocaloidVocalMode;
  label: string;
}> = [
  { value: "original_only", label: "합성음성 원곡만" },
  { value: "allow_covers", label: "우타이테 허용" },
  { value: "covers_focus", label: "우타이테 위주" },
];

const VOCALOID_QUICK_SEEDS = [
  "DECO*27",
  "wowaka",
  "Orangestar",
  "나유탄 성인",
  "이요와",
  "프로젝트 세카이",
  "카후(KAFU)",
];

const RHYTHM_DOUJIN_QUICK_SEEDS = [
  "나나히라",
  "Camellia",
  "t+pazolite",
  "HARDCORE TANO*C",
  "SOUND VOLTEX",
  "maimai",
  "CHUNITHM",
  "BMS",
  "동방 어레인지",
];

const THEME_TYPE_OPTIONS: Array<{
  value: ThemeType;
  label: string;
  hint: string;
  scene: SceneDomain;
}> = [
  { value: "OP", label: "OP", hint: "오프닝", scene: "anime" },
  { value: "ED", label: "ED", hint: "엔딩", scene: "anime" },
  { value: "INSERT", label: "삽입곡", hint: "극중가", scene: "anime" },
  { value: "OST", label: "OST", hint: "연주곡", scene: "anime" },
  { value: "CHARACTER", label: "캐릭터송", hint: "성우곡", scene: "anime" },
  { value: "VOCALOID", label: "보카로", hint: "합성음성", scene: "vocaloid" },
  { value: "UTAITE", label: "우타이테", hint: "보컬 커버", scene: "vocaloid" },
  { value: "RHYTHM", label: "리듬게임", hint: "기종 수록", scene: "rhythm_doujin" },
  { value: "DOUJIN", label: "동인·전파", hint: "서클/동방", scene: "rhythm_doujin" },
];

const ERA_OPTIONS: Array<{ value: EraFilter; label: string }> = [
  { value: "ALL", label: "전체 시대" },
  { value: "2020s", label: "2020년대" },
  { value: "2010s", label: "2010년대" },
  { value: "2000s", label: "2000년대" },
  { value: "classic", label: "1990년대 이하" },
];

const PRESETS: Array<{
  label: string;
  data: Partial<PlaylistGenerateRequest>;
}> = [
  {
    label: "청춘 밴드 록",
    data: {
      scenes: ["anime"],
      seeds: ["봇치 더 록!", "걸즈 밴드 크라이"],
      moods: ["질주감 / 열혈", "청량 / 여름"],
      genres: ["기타록 / 밴드"],
      themeTypes: ["OP", "ED", "INSERT"],
      era: "2020s",
      popularityLevel: 3,
      prompt: "기타와 베이스가 돋보이는 극중 라이브 및 밴드 곡 위주로 이어지게 구성해 줘.",
    },
  },
  {
    label: "새벽 감성 ED",
    data: {
      scenes: ["anime"],
      seeds: ["장송의 프리렌", "바케모노가타리"],
      moods: ["새벽 감성", "울컥 / 감동"],
      genres: ["어쿠스틱 / 피아노 발라드"],
      themeTypes: ["ED", "INSERT"],
      era: "ALL",
      popularityLevel: 3,
      prompt: "새벽에 혼자 듣기 좋은 잔잔한 도입부에서 후렴에 벅차오르는 흐름.",
    },
  },
  {
    label: "다크 배틀",
    data: {
      scenes: ["anime"],
      seeds: ["주술회전", "체인소 맨"],
      moods: ["다크 / 비장함", "질주감 / 열혈"],
      genres: ["기타록 / 밴드", "일렉트로 / 퓨처베이스"],
      themeTypes: ["OP", "OST"],
      era: "2020s",
      popularityLevel: 2,
      prompt: "강렬한 비트와 어두운 분위기의 최신 다크 판타지 배틀 트랙 중심.",
    },
  },
  {
    label: "이세계 · 오케스트라",
    data: {
      scenes: ["anime"],
      seeds: ["Re:제로부터 시작하는 이세계 생활", "알드노아. 제로"],
      moods: ["몽환 / 이세계", "울컥 / 감동"],
      genres: ["심포닉 / 오케스트라"],
      themeTypes: ["OP", "ED", "OST", "INSERT"],
      era: "ALL",
      popularityLevel: 3,
      prompt: "신스와 오케스트라 스케일이 큰 웅장한 곡들과 몽환적인 엔딩을 섞어 줘.",
    },
  },
  {
    label: "나나히라 · 전파 하이텐션",
    data: {
      scenes: ["rhythm_doujin", "anime"],
      seeds: ["나나히라", "Camellia"],
      moods: ["발랄 / 일상", "질주감 / 열혈"],
      genres: ["전파송 / 덴파", "유로비트 / 하이테크"],
      themeTypes: ["DOUJIN", "RHYTHM", "OP", "CHARACTER"],
      era: "ALL",
      popularityLevel: 3,
      prompt: "나나히라·Confetto 특유의 하이톤 전파송과 결이 맞는 리듬게임/애니 전파곡을 자연스럽게 이어줘.",
    },
  },
  {
    label: "보카로 록 × 청춘 밴드",
    data: {
      scenes: ["anime", "vocaloid"],
      vocaloidVocalMode: "original_only",
      seeds: ["봇치 더 록!", "wowaka", "Orangestar"],
      moods: ["질주감 / 열혈", "울컥 / 감동"],
      genres: ["기타록 / 밴드", "보컬로이드 / 우타이테계"],
      themeTypes: ["OP", "INSERT", "VOCALOID"],
      era: "ALL",
      popularityLevel: 3,
      prompt: "빠른 기타 리프와 피아노 록 사운드를 다리 삼아 밴드 애니송과 보카로 록을 매끄럽게 교차해 줘.",
    },
  },
  {
    label: "리듬게임 보스곡 러시",
    data: {
      scenes: ["rhythm_doujin"],
      seeds: ["SOUND VOLTEX", "t+pazolite", "USAO"],
      moods: ["긴박 / 배틀", "질주감 / 열혈"],
      genres: ["유로비트 / 하이테크", "일렉트로 / 퓨처베이스"],
      themeTypes: ["RHYTHM", "DOUJIN"],
      era: "ALL",
      popularityLevel: 3,
      prompt: "고BPM 해피하드코어, 스피드코어, 아트코어 중심으로 점차 템포가 끓어오르는 아케이드 셋리.",
    },
  },
];

interface PlaylistBuilderProps {
  loading: boolean;
  authStatus: AuthStatus | null;
  tasteProfile: TasteProfile | null;
  playlistHistory: PlaylistHistoryEntry[];
  customPresets?: CustomPreset[];
  watchedAnime?: WatchedAnimeItem[];
  initialAnilistUsername?: string | null;
  onChangeTasteProfile: (profile: TasteProfile | null) => void;
  onChangeCustomPresets?: (presets: CustomPreset[]) => void;
  onChangeWatchedAnime?: (items: WatchedAnimeItem[]) => void;
  onGenerate: (request: PlaylistGenerateRequest) => void;
}

function countUniqueHistoryTracks(
  history: PlaylistHistoryEntry[],
  turns: number
): number {
  if (turns <= 0 || history.length === 0) return 0;
  const seen = new Set<string>();
  for (const entry of history.slice(0, turns)) {
    for (const track of entry.playlist.tracks) {
      seen.add(`${track.title.trim().toLowerCase()}::${track.artist.trim().toLowerCase()}`);
    }
  }
  return seen.size;
}

export function PlaylistBuilder({
  loading,
  authStatus,
  tasteProfile,
  playlistHistory,
  customPresets = [],
  watchedAnime = [],
  initialAnilistUsername = null,
  onChangeTasteProfile,
  onChangeCustomPresets,
  onChangeWatchedAnime,
  onGenerate,
}: PlaylistBuilderProps) {
  const [scenes, setScenes] = useState<SceneDomain[]>(["anime"]);
  const [vocaloidVocalMode, setVocaloidVocalMode] =
    useState<VocaloidVocalMode>("original_only");
  const [familiarityLevel, setFamiliarityLevel] = useState<FamiliarityLevel>(3);
  const [useTasteDna, setUseTasteDna] = useState<boolean>(true);
  const [seeds, setSeeds] = useState<string[]>([]);
  const [watchedAnimeMode, setWatchedAnimeMode] =
    useState<WatchedAnimeMode>("ignore");
  const [seedInput, setSeedInput] = useState("");
  const [searchResults, setSearchResults] = useState<AnimeSearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [moods, setMoods] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [themeTypes, setThemeTypes] = useState<ThemeType[]>(["OP", "ED", "INSERT"]);
  const [era, setEra] = useState<EraFilter>("ALL");
  const [trackCount, setTrackCount] = useState<number>(12);
  const [popularityLevel, setPopularityLevel] = useState<PopularityLevel>(3);
  const [excludeRecentEnabled, setExcludeRecentEnabled] = useState<boolean>(true);
  const [recentExcludeTurns, setRecentExcludeTurns] = useState<1 | 3 | 5>(1);
  const [prompt, setPrompt] = useState<string>("");
  const [savingPresetOpen, setSavingPresetOpen] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [activeSeedDrawer, setActiveSeedDrawer] = useState<
    "watched" | "anilist" | null
  >(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [tournamentOpen, setTournamentOpen] = useState(false);

  const hasAnimeScene = scenes.includes("anime");
  const hasVocaloidScene = scenes.includes("vocaloid");
  const hasRhythmScene = scenes.includes("rhythm_doujin");

  useEffect(() => {
    const q = seedInput.trim();
    if (!hasAnimeScene || q.length < 2) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`);
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { items?: AnimeSearchItem[] };
          setSearchResults(data.items ?? []);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [seedInput, hasAnimeScene]);

  const toggleScene = (scene: SceneDomain) => {
    const isRemoving = scenes.includes(scene);
    if (isRemoving && scenes.length === 1) return;

    const nextScenes: SceneDomain[] = isRemoving
      ? scenes.filter((s) => s !== scene)
      : [...scenes, scene];

    setScenes(nextScenes);

    if (isRemoving && scene === "anime") {
      setActiveSeedDrawer(null);
      setSearchResults([]);
    }

    setThemeTypes((prev) => {
      let next = prev.filter((t) => {
        const opt = THEME_TYPE_OPTIONS.find((o) => o.value === t);
        return opt ? nextScenes.includes(opt.scene) : false;
      });
      if (!isRemoving) {
        if (scene === "anime" && !next.some((t) => ["OP", "ED", "INSERT", "OST", "CHARACTER"].includes(t))) {
          next = [...next, "OP", "ED", "INSERT"];
        }
        if (scene === "vocaloid" && !next.includes("VOCALOID")) {
          next = [...next, "VOCALOID"];
          if (vocaloidVocalMode !== "original_only" && !next.includes("UTAITE")) {
            next.push("UTAITE");
          }
        }
        if (scene === "rhythm_doujin") {
          if (!next.includes("RHYTHM")) next = [...next, "RHYTHM"];
          if (!next.includes("DOUJIN")) next = [...next, "DOUJIN"];
        }
      }
      if (next.length === 0) {
        const fallbackOpt = THEME_TYPE_OPTIONS.find((o) =>
          nextScenes.includes(o.scene)
        );
        return fallbackOpt ? [fallbackOpt.value] : ["OP"];
      }
      return Array.from(new Set(next));
    });
  };

  const handleVocaloidModeChange = (mode: VocaloidVocalMode) => {
    setVocaloidVocalMode(mode);
    setThemeTypes((prev) => {
      if (mode === "original_only") {
        const filtered = prev.filter((t) => t !== "UTAITE");
        if (filtered.length > 0) return filtered;
        return ["VOCALOID"];
      }
      if (mode === "covers_focus" && !prev.includes("UTAITE")) {
        return [...prev, "UTAITE"];
      }
      return prev;
    });
  };

  const addSeed = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSeeds((prev) => {
      if (prev.includes(trimmed) || prev.length >= 6) return prev;
      return [...prev, trimmed];
    });
    setSeedInput("");
    setSearchResults([]);
  };

  const removeSeed = (value: string) => {
    setSeeds((prev) => prev.filter((item) => item !== value));
  };

  const toggleMood = (mood: string) => {
    setMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]
    );
  };

  const toggleGenre = (genre: string) => {
    setGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleThemeType = (type: ThemeType) => {
    setThemeTypes((prev) => {
      if (prev.includes(type)) {
        return prev.length === 1 ? prev : prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  };

  const applyPreset = (presetData: Partial<PlaylistGenerateRequest>) => {
    if (presetData.scenes && presetData.scenes.length > 0) {
      setScenes(presetData.scenes);
      if (!presetData.scenes.includes("anime")) {
        setActiveSeedDrawer(null);
        setSearchResults([]);
      }
    }
    if (presetData.vocaloidVocalMode) {
      setVocaloidVocalMode(presetData.vocaloidVocalMode);
    }
    if (presetData.seeds) setSeeds(presetData.seeds);
    if (presetData.moods) setMoods(presetData.moods);
    if (presetData.genres) setGenres(presetData.genres);
    if (presetData.themeTypes) setThemeTypes(presetData.themeTypes);
    if (presetData.era) setEra(presetData.era);
    if (presetData.trackCount) setTrackCount(presetData.trackCount);
    if (presetData.popularityLevel) {
      setPopularityLevel(presetData.popularityLevel);
    }
    if (presetData.prompt !== undefined) setPrompt(presetData.prompt);
  };

  const resetConditions = () => {
    setScenes(["anime"]);
    setVocaloidVocalMode("original_only");
    setSeeds([]);
    setSeedInput("");
    setSearchResults([]);
    setMoods([]);
    setGenres([]);
    setThemeTypes(["OP", "ED", "INSERT"]);
    setEra("ALL");
    setTrackCount(12);
    setPopularityLevel(3);
    setWatchedAnimeMode("ignore");
    setPrompt("");
  };

  const handleSaveCustomPreset = () => {
    const label = presetNameInput.trim();
    if (!label || !onChangeCustomPresets) return;
    const newPreset: CustomPreset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      createdAt: new Date().toISOString(),
      data: {
        scenes,
        vocaloidVocalMode,
        seeds,
        moods,
        genres,
        themeTypes,
        era,
        trackCount,
        popularityLevel,
        prompt,
      },
    };
    onChangeCustomPresets([newPreset, ...customPresets].slice(0, 15));
    setPresetNameInput("");
    setSavingPresetOpen(false);
  };

  const handleDeleteCustomPreset = (id: string) => {
    if (!onChangeCustomPresets) return;
    onChangeCustomPresets(customPresets.filter((p) => p.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate({
      scenes,
      vocaloidVocalMode,
      seeds,
      moods,
      genres,
      themeTypes,
      era,
      trackCount,
      popularityLevel,
      includeHiddenGems: popularityLevel >= 3,
      excludeRecentTurns: excludeRecentEnabled ? recentExcludeTurns : 0,
      watchedAnimeMode: hasAnimeScene ? watchedAnimeMode : "ignore",
      prompt,
      familiarityLevel,
      tasteProfile:
        useTasteDna && tasteProfile
          ? {
              dna: tasteProfile.dna,
              knownTracks: tasteProfile.knownTracks,
            }
          : null,
    });
  };

  const activePopularity = POPULARITY_STEPS.find(
    (step) => step.level === popularityLevel
  );
  const excludedTrackCount = countUniqueHistoryTracks(
    playlistHistory,
    excludeRecentEnabled ? recentExcludeTurns : 0
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-hairline bg-sheet"
    >
      {/* Workbench Header */}
      <div className="flex items-center justify-between rounded-t-lg border-b border-hairline bg-sheet-muted px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <SlidersHorizontal className="h-4 w-4 text-cobalt" />
          선곡 조건
        </div>
        <div className="flex items-center gap-2.5">
          <span className="hidden text-xs text-muted sm:inline">최대 6개 시드</span>
          <button
            type="button"
            onClick={resetConditions}
            className="inline-flex items-center gap-1 rounded border border-hairline bg-sheet px-2 py-0.5 text-[11px] font-medium text-muted transition hover:border-hairline-strong hover:text-ink"
            title="시드, 무드, 장르 등 선곡 조건 초기화"
          >
            <RotateCcw className="h-3 w-3" />
            조건 초기화
          </button>
        </div>
      </div>

      <div className="divide-y divide-hairline px-5">
        {/* Taste DNA & 4-stage familiarity */}
        <TasteProfilePanel
          authStatus={authStatus}
          tasteProfile={tasteProfile}
          useTasteDna={useTasteDna}
          familiarityLevel={familiarityLevel}
          onChangeTasteProfile={onChangeTasteProfile}
          onToggleUseTasteDna={setUseTasteDna}
          onChangeFamiliarity={setFamiliarityLevel}
          onAddSeed={addSeed}
        />

        {/* Music Scene Multi-Toggle */}
        <div className="py-3.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink">음악 씬</span>
            {scenes.length > 1 ? (
              <span className="rounded bg-cobalt-soft px-2 py-0.5 text-[10px] font-semibold text-cobalt-ink">
                크로스오버 ({scenes.length}개 씬)
              </span>
            ) : (
              <span className="text-[11px] text-muted">복수 선택 가능</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {SCENE_OPTIONS.map((opt) => {
              const active = scenes.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleScene(opt.value)}
                  className={`flex flex-col items-start rounded-md border px-2.5 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-cobalt ${
                    active
                      ? "border-cobalt bg-cobalt-soft text-cobalt-ink"
                      : "border-hairline bg-sheet text-ink-soft hover:border-hairline-strong hover:text-ink"
                  }`}
                >
                  <span className="text-xs font-semibold">{opt.label}</span>
                  <span className="mt-0.5 truncate text-[10px] opacity-80">
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>

          {hasVocaloidScene && (
            <div className="mt-2.5 rounded-md border border-hairline bg-sheet-muted p-2">
              <div className="mb-1.5 text-[10px] font-semibold text-ink">
                보컬로이드 보컬 범위
              </div>
              <div className="grid grid-cols-3 gap-1">
                {VOCALOID_VOCAL_MODE_OPTIONS.map((opt) => {
                  const active = vocaloidVocalMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleVocaloidModeChange(opt.value)}
                      className={`rounded border py-1 text-[10px] font-semibold transition ${
                        active
                          ? "border-cobalt bg-sheet text-cobalt-ink shadow-2xs"
                          : "border-transparent text-muted hover:text-ink"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Quick Presets & Saved Custom Presets */}
        <div className="py-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink">
              빠른 시작 프리셋
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setTournamentOpen(true)}
                className="inline-flex items-center gap-1 rounded border border-obi/35 bg-obi-soft px-2 py-0.5 text-[11px] font-semibold text-obi-ink transition hover:brightness-95"
              >
                <Trophy className="h-3 w-3" />
                8강 월드컵
              </button>
              {onChangeCustomPresets && (
                <button
                  type="button"
                  onClick={() => setSavingPresetOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-cobalt-ink hover:underline"
                >
                  <Bookmark className="h-3 w-3" />
                  {savingPresetOpen ? "닫기" : "현재 조건 저장"}
                </button>
              )}
            </div>
          </div>

          {savingPresetOpen && onChangeCustomPresets && (
            <div className="mb-2.5 flex gap-1.5 rounded-md border border-hairline-strong bg-sheet-muted p-2">
              <input
                type="text"
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveCustomPreset();
                  }
                }}
                maxLength={40}
                placeholder="나만의 프리셋 이름 (예: 심야 운동용)"
                className="min-w-0 flex-1 rounded border border-hairline bg-sheet px-2.5 py-1 text-xs text-ink placeholder:text-muted/70 focus:border-cobalt focus:outline-none"
              />
              <button
                type="button"
                disabled={!presetNameInput.trim()}
                onClick={handleSaveCustomPreset}
                className="shrink-0 rounded bg-cobalt px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-45"
              >
                저장
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.data)}
                className="rounded-md border border-hairline bg-sheet-muted px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:border-hairline-strong hover:bg-sheet hover:text-ink focus-visible:outline-2 focus-visible:outline-cobalt"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {customPresets.length > 0 && (
            <div className="mt-2.5 border-t border-hairline/70 pt-2.5">
              <div className="mb-1.5 text-[10px] font-semibold text-muted">
                내 커스텀 프리셋
              </div>
              <div className="flex flex-wrap gap-1.5">
                {customPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="inline-flex items-center overflow-hidden rounded-md border border-cobalt/35 bg-cobalt-soft/60 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => applyPreset(preset.data)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-cobalt-ink transition hover:bg-cobalt-soft"
                      title={`시드 ${preset.data.seeds.length}개 · ${preset.data.trackCount}곡`}
                    >
                      <Bookmark className="h-3 w-3 shrink-0" />
                      <span>{preset.label}</span>
                    </button>
                    {onChangeCustomPresets && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomPreset(preset.id)}
                        className="border-l border-cobalt/20 px-1.5 py-1 text-cobalt-ink/70 hover:bg-cobalt/15 hover:text-cobalt-ink"
                        aria-label={`${preset.label} 삭제`}
                        title="프리셋 삭제"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Seeds */}
        <div className="relative py-4">
          <label
            htmlFor="seed-search-input"
            className="mb-1 block text-xs font-semibold text-ink"
          >
            {hasAnimeScene && !hasVocaloidScene && !hasRhythmScene
              ? "기준 작품, 곡 또는 아티스트"
              : "기준 시드 (작품 · 프로듀서 · 서클 · 리듬게임)"}
          </label>
          <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
            {hasAnimeScene
              ? "영문·로마지 입력 시 AniList 작품 자동완성이 열립니다. 아티스트·서클·기종명은 입력 후 Enter로 추가하세요."
              : "프로듀서(P), 아티스트, 서클, 리듬게임 기종 또는 곡명을 입력 후 Enter로 추가하세요."}
          </p>

          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />
            <input
              id="seed-search-input"
              type="text"
              value={seedInput}
              onChange={(e) => {
                const val = e.target.value;
                setSeedInput(val);
                if (val.trim().length < 2) {
                  setSearchResults([]);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSeed(seedInput);
                }
              }}
              placeholder={
                hasRhythmScene && !hasAnimeScene
                  ? "예: 나나히라, Camellia, SOUND VOLTEX, t+pazolite"
                  : hasVocaloidScene && !hasAnimeScene
                    ? "예: DECO*27, wowaka, Orangestar, 프로젝트 세카이"
                    : "예: Bocchi the Rock, 장송의 프리렌, 나나히라, DECO*27"
              }
              className="w-full rounded-md border border-hairline-strong bg-sheet py-2 pl-9 pr-16 text-sm text-ink placeholder:text-muted/70 focus:border-cobalt focus:outline-none"
            />
            <button
              type="button"
              onClick={() => addSeed(seedInput)}
              disabled={!seedInput.trim()}
              className="absolute right-1.5 inline-flex items-center gap-1 rounded bg-ink px-2.5 py-1 text-xs font-medium text-sheet transition hover:opacity-90 disabled:bg-hairline disabled:text-muted"
            >
              {searching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              추가
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 z-20 mt-1.5 max-h-60 overflow-y-auto rounded-md border border-hairline-strong bg-sheet p-1 shadow-lg">
              {searchResults.map((anime) => (
                <button
                  key={anime.id}
                  type="button"
                  onClick={() =>
                    addSeed(
                      anime.titleEnglish || anime.titleRomaji || anime.titleNative
                    )
                  }
                  className="flex w-full items-center gap-3 rounded p-2 text-left transition hover:bg-sheet-muted"
                >
                  {anime.coverImage ? (
                    <Image
                      src={anime.coverImage}
                      alt={anime.titleRomaji}
                      width={32}
                      height={42}
                      unoptimized
                      className="h-10 w-8 rounded-sm object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-8 items-center justify-center rounded-sm bg-sheet-muted text-muted">
                      <Disc3 className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-ink">
                      {anime.titleEnglish || anime.titleRomaji}
                    </div>
                    <div className="truncate text-[11px] text-muted">
                      {anime.titleNative}{" "}
                      {anime.seasonYear ? `(${anime.seasonYear})` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {seeds.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {seeds.map((seed) => (
                <span
                  key={seed}
                  className="inline-flex items-center gap-1 rounded bg-cobalt-soft px-2.5 py-1 text-xs font-medium text-cobalt-ink"
                >
                  {seed}
                  <button
                    type="button"
                    onClick={() => removeSeed(seed)}
                    className="rounded p-0.5 text-cobalt-ink/80 hover:bg-cobalt/20 hover:text-cobalt-ink"
                    aria-label={`${seed} 제거`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {(hasVocaloidScene || hasRhythmScene) && (
            <div className="mt-2.5 space-y-2">
              {hasVocaloidScene && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold text-muted">
                    보카로 추천 시드
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {VOCALOID_QUICK_SEEDS.map((seed) => {
                      const active = seeds.includes(seed);
                      return (
                        <button
                          key={seed}
                          type="button"
                          onClick={() =>
                            active ? removeSeed(seed) : addSeed(seed)
                          }
                          className={`rounded border px-2 py-0.5 text-[11px] font-medium transition ${
                            active
                              ? "border-cobalt bg-cobalt-soft text-cobalt-ink"
                              : "border-hairline bg-sheet-muted text-ink-soft hover:border-hairline-strong hover:text-ink"
                          }`}
                        >
                          + {seed}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {hasRhythmScene && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold text-muted">
                    리듬게임 · 동인 추천 시드
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {RHYTHM_DOUJIN_QUICK_SEEDS.map((seed) => {
                      const active = seeds.includes(seed);
                      return (
                        <button
                          key={seed}
                          type="button"
                          onClick={() =>
                            active ? removeSeed(seed) : addSeed(seed)
                          }
                          className={`rounded border px-2 py-0.5 text-[11px] font-medium transition ${
                            active
                              ? "border-obi bg-obi-soft text-obi-ink"
                              : "border-hairline bg-sheet-muted text-ink-soft hover:border-hairline-strong hover:text-ink"
                          }`}
                        >
                          + {seed}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Unified Seed Source Tabs (Anime scene only) */}
          {hasAnimeScene && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setActiveSeedDrawer((prev) =>
                      prev === "watched" ? null : "watched"
                    )
                  }
                  className={`inline-flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-[11px] font-medium transition ${
                    activeSeedDrawer === "watched"
                      ? "border-obi bg-obi-soft text-obi-ink"
                      : "border-hairline bg-sheet-muted text-ink-soft hover:border-hairline-strong hover:text-ink"
                  }`}
                >
                  <BookMarked className="h-3 w-3 shrink-0 text-obi" />
                  <span className="truncate">내 본 작품 ({watchedAnime.length})</span>
                  {activeSeedDrawer === "watched" ? (
                    <ChevronUp className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveSeedDrawer((prev) =>
                      prev === "anilist" ? null : "anilist"
                    )
                  }
                  className={`inline-flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-[11px] font-medium transition ${
                    activeSeedDrawer === "anilist"
                      ? "border-cobalt bg-cobalt-soft text-cobalt-ink"
                      : "border-hairline bg-sheet-muted text-ink-soft hover:border-hairline-strong hover:text-ink"
                  }`}
                >
                  <Tv className="h-3 w-3 shrink-0 text-cobalt" />
                  <span className="truncate">
                    AniList 목록{initialAnilistUsername ? ` (@${initialAnilistUsername})` : ""}
                  </span>
                  {activeSeedDrawer === "anilist" ? (
                    <ChevronUp className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  )}
                </button>
              </div>

              <WatchedAnimePanel
                items={watchedAnime}
                seeds={seeds}
                open={activeSeedDrawer === "watched"}
                hideToggleButton
                onAddSeed={addSeed}
                onRemoveSeed={removeSeed}
                onChangeItems={(next) => onChangeWatchedAnime?.(next)}
              />

              <AniListSeedImporter
                initialUsername={initialAnilistUsername}
                seeds={seeds}
                open={activeSeedDrawer === "anilist"}
                hideToggleButton
                onAddSeed={addSeed}
                onRemoveSeed={removeSeed}
              />

              {watchedAnime.length > 0 && (
                <div className="mt-3 rounded-md border border-hairline bg-sheet-muted p-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-ink">
                      본 작품 선곡 반영
                      {scenes.length > 1 ? " (애니송 트랙에만 적용)" : ""}
                    </span>
                    <span className="text-[10px] text-muted">
                      보관함 {watchedAnime.length}작품 기준
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { value: "ignore", label: "반영 안 함" },
                        { value: "prefer_watched", label: "본 작품 위주" },
                        { value: "discover_unwatched", label: "안 본 작품 발굴" },
                      ] as const
                    ).map((opt) => {
                      const active = watchedAnimeMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setWatchedAnimeMode(opt.value)}
                          className={`rounded border py-1.5 text-[10px] font-semibold transition ${
                            active
                              ? "border-obi bg-obi-soft text-obi-ink"
                              : "border-hairline bg-sheet text-muted hover:text-ink"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                    {watchedAnimeMode === "prefer_watched"
                      ? "보관함의 인생작·명작과 본 작품들의 OP/ED/OST 비중을 높여 선곡합니다."
                      : watchedAnimeMode === "discover_unwatched"
                        ? "보관함에 있는 이미 본 작품은 제외하고 새로운 애니의 명곡만 발굴합니다."
                        : "시드로 고른 항목 외에는 본 작품 보관함을 선곡 제약에 쓰지 않습니다."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Moods */}
        <div className="py-4">
          <div className="mb-2 text-xs font-semibold text-ink">분위기</div>
          <div className="flex flex-wrap gap-1.5">
            {MOOD_OPTIONS.map((mood) => {
              const active = moods.includes(mood);
              return (
                <button
                  key={mood}
                  type="button"
                  onClick={() => toggleMood(mood)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-cobalt ${
                    active
                      ? "border-ink bg-ink text-sheet"
                      : "border-hairline bg-sheet text-ink-soft hover:border-hairline-strong hover:text-ink"
                  }`}
                >
                  {mood}
                </button>
              );
            })}
          </div>
        </div>

        {/* Genres / Styles */}
        <div className="py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-ink">장르 / 스타일</span>
            <span className="text-[11px] text-muted">
              {genres.length > 0 ? `${genres.length}개 선택` : "선택 안 함 = 자유"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GENRE_OPTIONS.map((genre) => {
              const active = genres.includes(genre);
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleGenre(genre)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-cobalt ${
                    active
                      ? "border-cobalt bg-cobalt-soft text-cobalt-ink"
                      : "border-hairline bg-sheet text-ink-soft hover:border-hairline-strong hover:text-ink"
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>
        </div>

        {/* Track Count */}
        <div className="py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-ink">트랙 수</span>
            <span className="text-[11px] font-semibold tabular-nums text-cobalt-ink">
              {trackCount}곡
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[8, 12, 16, 20].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setTrackCount(num)}
                className={`rounded-md border py-2 text-xs font-semibold tabular-nums transition ${
                  trackCount === num
                    ? "border-ink bg-ink text-sheet"
                    : "border-hairline bg-sheet text-muted hover:border-hairline-strong hover:text-ink"
                }`}
              >
                {num}곡
              </button>
            ))}
          </div>
        </div>

        {/* Collapsible Advanced Tuning */}
        <div className="py-4">
          <button
            type="button"
            onClick={() => setAdvancedOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div>
              <div className="text-xs font-semibold text-ink">
                세부 튜닝
              </div>
              {!advancedOpen && (
                <div className="mt-0.5 text-[11px] text-muted">
                  {activePopularity?.title} ·{" "}
                  {ERA_OPTIONS.find((e) => e.value === era)?.label} ·{" "}
                  {themeTypes.join("/")} ·{" "}
                  {excludeRecentEnabled
                    ? `중복제외 ${recentExcludeTurns}턴`
                    : "중복허용"}
                </div>
              )}
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-hairline bg-sheet-muted px-2 py-1 text-[11px] font-medium text-ink-soft">
              {advancedOpen ? "접기" : "펼치기"}
              {advancedOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </button>

          {advancedOpen && (
            <div className="mt-4 space-y-4 border-t border-hairline/70 pt-4">
              {/* Theme Types */}
              <div>
                <div className="mb-2 text-xs font-semibold text-ink">곡 유형</div>
                <div className="flex flex-wrap gap-1.5">
                  {THEME_TYPE_OPTIONS.filter((opt) =>
                    scenes.includes(opt.scene)
                  ).map((opt) => {
                    const active = themeTypes.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleThemeType(opt.value)}
                        className={`flex min-w-[60px] flex-1 flex-col items-center rounded-md border px-2 py-2 text-center transition focus-visible:outline-2 focus-visible:outline-cobalt ${
                          active
                            ? "border-cobalt bg-cobalt-soft text-cobalt-ink"
                            : "border-hairline bg-sheet text-muted hover:border-hairline-strong hover:text-ink"
                        }`}
                      >
                        <span className="text-xs font-semibold">{opt.label}</span>
                        <span className="text-[10px] opacity-80">{opt.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Era */}
              <div>
                <label
                  htmlFor="era-select"
                  className="mb-1.5 block text-xs font-semibold text-ink"
                >
                  {hasAnimeScene && !hasVocaloidScene && !hasRhythmScene
                    ? "방영 연대"
                    : "발표 / 방영 연대"}
                </label>
                <select
                  id="era-select"
                  value={era}
                  onChange={(e) => setEra(e.target.value as EraFilter)}
                  className="w-full rounded-md border border-hairline-strong bg-sheet px-2.5 py-2 text-xs font-medium text-ink focus:border-cobalt focus:outline-none"
                >
                  {ERA_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Popularity Slider (Major <-> Minor) */}
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <label
                    htmlFor="popularity-slider"
                    className="flex items-center gap-1.5 text-xs font-semibold text-ink"
                  >
                    <Gem className="h-3.5 w-3.5 shrink-0 text-obi" />
                    인지도 / 대중성 (메이저 ↔ 마이너)
                  </label>
                  <span className="text-[11px] font-semibold text-cobalt-ink">
                    {activePopularity?.badge} · {activePopularity?.title}
                  </span>
                </div>

                <input
                  id="popularity-slider"
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={popularityLevel}
                  onChange={(e) =>
                    setPopularityLevel(Number(e.target.value) as PopularityLevel)
                  }
                  className="mb-2.5 h-1.5 w-full cursor-pointer accent-cobalt"
                />

                <div className="grid grid-cols-4 gap-1">
                  {POPULARITY_STEPS.map((step) => {
                    const active = popularityLevel === step.level;
                    return (
                      <button
                        key={step.level}
                        type="button"
                        onClick={() => setPopularityLevel(step.level)}
                        className={`flex flex-col items-center rounded border py-1.5 text-center transition focus-visible:outline-2 focus-visible:outline-cobalt ${
                          active
                            ? "border-cobalt bg-cobalt-soft text-cobalt-ink"
                            : "border-hairline bg-sheet text-muted hover:border-hairline-strong hover:text-ink"
                        }`}
                      >
                        <span className="text-[10px] font-bold">{step.badge}</span>
                        <span className="text-[10px] leading-tight">{step.title}</span>
                      </button>
                    );
                  })}
                </div>
                {activePopularity && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                    {activePopularity.desc}
                  </p>
                )}
              </div>

              {/* Exclude Recent Playlists */}
              <div>
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cobalt" />
                    <div>
                      <div className="text-xs font-semibold text-ink">
                        이전 생성 플리 중복 제외
                      </div>
                      <div className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        {playlistHistory.length === 0
                          ? "생성 이력이 쌓이면 이전 플리에 나온 곡과 겹치지 않게 제외합니다"
                          : excludeRecentEnabled
                            ? `최근 ${Math.min(recentExcludeTurns, playlistHistory.length)}턴 (${excludedTrackCount}곡)을 이번 선곡에서 제외합니다`
                            : "이전 생성 플리와의 곡 중복을 허용합니다"}
                      </div>
                    </div>
                  </div>
                  <input
                    id="exclude-recent-toggle"
                    type="checkbox"
                    checked={excludeRecentEnabled}
                    onChange={(e) => setExcludeRecentEnabled(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-cobalt"
                  />
                </label>

                {excludeRecentEnabled && (
                  <div className="mt-2.5 grid grid-cols-3 gap-1">
                    {([1, 3, 5] as const).map((turns) => {
                      const active = recentExcludeTurns === turns;
                      return (
                        <button
                          key={turns}
                          type="button"
                          onClick={() => setRecentExcludeTurns(turns)}
                          className={`rounded border py-1.5 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:outline-cobalt ${
                            active
                              ? "border-cobalt bg-cobalt-soft text-cobalt-ink"
                              : "border-hairline bg-sheet text-muted hover:border-hairline-strong hover:text-ink"
                          }`}
                        >
                          {turns === 1 ? "직전 1턴" : `최근 ${turns}턴`}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Custom Note */}
        <div className="py-4">
          <label
            htmlFor="custom-prompt"
            className="mb-1.5 block text-xs font-semibold text-ink"
          >
            큐레이션 메모 (선택)
          </label>
          <textarea
            id="custom-prompt"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="예: 초반은 신나게 달리고, 마지막 2곡은 여운 남는 엔딩 발라드로 마무리해 줘"
            className="w-full resize-none rounded-md border border-hairline-strong bg-sheet px-3 py-2 text-xs text-ink placeholder:text-muted/70 focus:border-cobalt focus:outline-none"
          />
        </div>
      </div>

      {/* Sticky Primary Action */}
      <div className="sticky bottom-0 z-10 rounded-b-lg border-t border-hairline bg-sheet/95 p-4 backdrop-blur-sm">
        {tasteProfile && (
          <div className="mb-2.5 flex items-center justify-between text-[11px]">
            <span className="text-muted">내 취향 DNA 프롬프트 반영</span>
            <button
              type="button"
              onClick={() => setUseTasteDna((prev) => !prev)}
              className={`font-semibold transition hover:underline ${
                useTasteDna ? "text-cobalt-ink" : "text-amber-700 dark:text-amber-300"
              }`}
            >
              {useTasteDna ? "ON (취향 반영 중)" : "OFF (새로운 결로 탐색)"}
            </button>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-cobalt px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              셋리를 구성하는 중...
            </>
          ) : (
            <>셋리 만들기</>
          )}
      </button>
      </div>

      {tournamentOpen && (
        <MoodTournamentModal
          watchedAnime={watchedAnime}
          trackCount={trackCount}
          familiarityLevel={familiarityLevel}
          watchedAnimeMode={watchedAnimeMode}
          tasteProfile={
            useTasteDna && tasteProfile
              ? {
                  dna: tasteProfile.dna,
                  knownTracks: tasteProfile.knownTracks,
                }
              : null
          }
          onClose={() => setTournamentOpen(false)}
          onApplyToBuilder={(res) => {
            applyPreset(res);
          }}
          onGenerateImmediate={(res, req) => {
            applyPreset(res);
            onGenerate(req);
          }}
        />
      )}
    </form>
  );
}
