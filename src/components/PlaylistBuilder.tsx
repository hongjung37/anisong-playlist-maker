"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Search,
  Plus,
  X,
  Disc3,
  Loader2,
  Gem,
  SlidersHorizontal,
} from "lucide-react";
import type {
  AnimeSearchItem,
  AuthStatus,
  EraFilter,
  FamiliarityLevel,
  PlaylistGenerateRequest,
  PopularityLevel,
  TasteProfile,
  ThemeType,
} from "@/types/playlist";
import { TasteProfilePanel } from "@/components/TasteProfilePanel";

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

const THEME_TYPE_OPTIONS: Array<{ value: ThemeType; label: string; hint: string }> = [
  { value: "OP", label: "OP", hint: "오프닝" },
  { value: "ED", label: "ED", hint: "엔딩" },
  { value: "INSERT", label: "삽입곡", hint: "극중가" },
  { value: "OST", label: "OST", hint: "연주곡" },
  { value: "CHARACTER", label: "캐릭터송", hint: "성우곡" },
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
      seeds: ["Re:제로부터 시작하는 이세계 생활", "알드노아. 제로"],
      moods: ["몽환 / 이세계", "울컥 / 감동"],
      genres: ["심포닉 / 오케스트라"],
      themeTypes: ["OP", "ED", "OST", "INSERT"],
      era: "ALL",
      popularityLevel: 3,
      prompt: "신스와 오케스트라 스케일이 큰 웅장한 곡들과 몽환적인 엔딩을 섞어 줘.",
    },
  },
];

interface PlaylistBuilderProps {
  loading: boolean;
  authStatus: AuthStatus | null;
  tasteProfile: TasteProfile | null;
  onChangeTasteProfile: (profile: TasteProfile | null) => void;
  onGenerate: (request: PlaylistGenerateRequest) => void;
}

export function PlaylistBuilder({
  loading,
  authStatus,
  tasteProfile,
  onChangeTasteProfile,
  onGenerate,
}: PlaylistBuilderProps) {
  const [familiarityLevel, setFamiliarityLevel] = useState<FamiliarityLevel>(3);
  const [seeds, setSeeds] = useState<string[]>(["봇치 더 록!"]);
  const [seedInput, setSeedInput] = useState("");
  const [searchResults, setSearchResults] = useState<AnimeSearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [moods, setMoods] = useState<string[]>(["질주감 / 열혈", "울컥 / 감동"]);
  const [genres, setGenres] = useState<string[]>(["기타록 / 밴드"]);
  const [themeTypes, setThemeTypes] = useState<ThemeType[]>(["OP", "ED", "INSERT"]);
  const [era, setEra] = useState<EraFilter>("ALL");
  const [trackCount, setTrackCount] = useState<number>(12);
  const [popularityLevel, setPopularityLevel] = useState<PopularityLevel>(3);
  const [prompt, setPrompt] = useState<string>("");

  useEffect(() => {
    const q = seedInput.trim();
    if (q.length < 2) {
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
  }, [seedInput]);

  const addSeed = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!seeds.includes(trimmed) && seeds.length < 6) {
      setSeeds((prev) => [...prev, trimmed]);
    }
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
    if (presetData.seeds) setSeeds(presetData.seeds);
    if (presetData.moods) setMoods(presetData.moods);
    if (presetData.genres) setGenres(presetData.genres);
    if (presetData.themeTypes) setThemeTypes(presetData.themeTypes);
    if (presetData.era) setEra(presetData.era);
    if (presetData.popularityLevel) {
      setPopularityLevel(presetData.popularityLevel);
    }
    if (presetData.prompt !== undefined) setPrompt(presetData.prompt);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate({
      seeds,
      moods,
      genres,
      themeTypes,
      era,
      trackCount,
      popularityLevel,
      includeHiddenGems: popularityLevel >= 3,
      prompt,
      familiarityLevel,
      tasteProfile: tasteProfile
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

  return (
    <form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-lg border border-hairline bg-sheet"
    >
      {/* Workbench Header */}
      <div className="flex items-center justify-between border-b border-hairline bg-sheet-muted px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <SlidersHorizontal className="h-4 w-4 text-cobalt" />
          선곡 조건
        </div>
        <span className="text-xs text-muted">최대 6개 시드 조합</span>
      </div>

      <div className="divide-y divide-hairline px-5">
        {/* Taste DNA & 4-stage familiarity */}
        <TasteProfilePanel
          authStatus={authStatus}
          tasteProfile={tasteProfile}
          familiarityLevel={familiarityLevel}
          onChangeTasteProfile={onChangeTasteProfile}
          onChangeFamiliarity={setFamiliarityLevel}
          onAddSeed={addSeed}
        />

        {/* Quick Presets */}
        <div className="py-4">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-ink">
              빠른 시작 프리셋
            </span>
            <span className="text-[11px] text-muted">누르면 조건이 채워집니다</span>
          </div>
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
        </div>

        {/* Seeds */}
        <div className="relative py-4">
          <label
            htmlFor="seed-search-input"
            className="mb-1 block text-xs font-semibold text-ink"
          >
            기준 작품, 곡 또는 아티스트
          </label>
          <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
            영문·로마지 입력 시 작품 DB 자동완성이 열립니다. 한글 제목이나 작곡가명은 입력 후 Enter로 추가하세요.
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
              placeholder="예: Bocchi the Rock, 장송의 프리렌, Sawano"
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

        {/* Theme Types */}
        <div className="py-4">
          <div className="mb-2 text-xs font-semibold text-ink">곡 유형</div>
          <div className="grid grid-cols-5 gap-1.5">
            {THEME_TYPE_OPTIONS.map((opt) => {
              const active = themeTypes.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleThemeType(opt.value)}
                  className={`flex flex-col items-center rounded-md border py-2 text-center transition focus-visible:outline-2 focus-visible:outline-cobalt ${
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

        {/* Era & Track Count */}
        <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="era-select"
              className="mb-1.5 block text-xs font-semibold text-ink"
            >
              방영 연대
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

          <div>
            <div className="mb-1.5 text-xs font-semibold text-ink">트랙 수</div>
            <div className="grid grid-cols-4 gap-1">
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
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Popularity Slider (Major <-> Minor) */}
        <div className="py-4">
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

      {/* Primary Action */}
      <div className="border-t border-hairline bg-sheet-muted p-5">
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
    </form>
  );
}
