"use client";

import { useState } from "react";
import {
  AudioLines,
  Check,
  ListMusic,
  Loader2,
  RefreshCw,
  Trash2,
  Plus,
} from "lucide-react";
import type {
  AuthStatus,
  FamiliarityLevel,
  KnownTrackItem,
  TasteProfile,
  YouTubePlaylistSummary,
} from "@/types/playlist";

const FAMILIARITY_STEPS: Array<{
  level: FamiliarityLevel;
  title: string;
  ratio: string;
  desc: string;
}> = [
  {
    level: 1,
    title: "전부 새로움",
    ratio: "0%",
    desc: "내 라이브러리 곡은 빼고 새 곡만 선곡합니다",
  },
  {
    level: 2,
    title: "발굴 위주",
    ratio: "25%",
    desc: "아는 곡은 앵커로만 조금 두고 새 곡을 주로 찾습니다",
  },
  {
    level: 3,
    title: "황금 밸런스",
    ratio: "50%",
    desc: "내 애청곡과 같은 결의 새 곡을 절반씩 섞습니다",
  },
  {
    level: 4,
    title: "애청곡 중심",
    ratio: "75%",
    desc: "내 라이브러리 곡을 셋리 흐름대로 다시 짭니다",
  },
  {
    level: 5,
    title: "내 곡만",
    ratio: "100%",
    desc: "내 라이브러리에 있는 곡들만으로 셋리를 구성합니다",
  },
];

interface TasteProfilePanelProps {
  authStatus: AuthStatus | null;
  tasteProfile: TasteProfile | null;
  useTasteDna: boolean;
  familiarityLevel: FamiliarityLevel;
  onChangeTasteProfile: (profile: TasteProfile | null) => void;
  onToggleUseTasteDna: (enabled: boolean) => void;
  onChangeFamiliarity: (level: FamiliarityLevel) => void;
  onAddSeed: (seed: string) => void;
}

export function TasteProfilePanel({
  authStatus,
  tasteProfile,
  useTasteDna,
  familiarityLevel,
  onChangeTasteProfile,
  onToggleUseTasteDna,
  onChangeFamiliarity,
  onAddSeed,
}: TasteProfilePanelProps) {
  const [playlists, setPlaylists] = useState<YouTubePlaylistSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => tasteProfile?.selectedSources.map((s) => s.id) ?? []
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const [loadingList, setLoadingList] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResetProfile = async () => {
    setError(null);
    setStatusMessage(null);
    try {
      await fetch("/api/user/state?target=tasteProfile", { method: "DELETE" });
      onChangeTasteProfile(null);
    } catch {
      setError("저장된 취향 DNA 삭제에 실패했습니다.");
    }
  };

  const handleLoadLibrary = async () => {
    setLoadingList(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/youtube/library", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "라이브러리를 불러오지 못했습니다.");
      }
      const list = (data.playlists ?? []) as YouTubePlaylistSummary[];
      setPlaylists(list);
      setPickerOpen(true);

      const savedIds = tasteProfile?.selectedSources.map((s) => s.id) ?? [];
      if (selectedIds.length === 0) {
        if (savedIds.length > 0) {
          setSelectedIds(savedIds);
        } else if (list.length > 0) {
          setSelectedIds([list[0].id]);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "YouTube 라이브러리 조회 실패"
      );
    } finally {
      setLoadingList(false);
      window.dispatchEvent(new Event("anitune:quota-updated"));
    }
  };

  const togglePlaylistId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleAnalyze = async (forceRefresh = false) => {
    const activeIds =
      selectedIds.length > 0
        ? selectedIds
        : tasteProfile?.selectedSources.map((s) => s.id) ?? [];

    if (activeIds.length === 0) return;
    setAnalyzing(true);
    setError(null);
    setStatusMessage(null);

    try {
      const chosen = playlists.filter((p) => activeIds.includes(p.id));
      const sourcesPayload =
        chosen.length > 0
          ? chosen.map((p) => ({ id: p.id, title: p.title }))
          : tasteProfile?.selectedSources.map((s) => ({
              id: s.id,
              title: s.title,
            })) ?? [];

      if (sourcesPayload.length === 0) {
        throw new Error("먼저 YouTube 플리 목록을 불러와 선택해 주세요.");
      }

      const tracksRes = await fetch("/api/youtube/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: sourcesPayload }),
      });
      const tracksData = await tracksRes.json();
      if (!tracksRes.ok) {
        throw new Error(tracksData.error || "곡 목록 추출에 실패했습니다.");
      }

      const knownTracks = (tracksData.tracks ?? []) as KnownTrackItem[];
      const sourceSignature = String(tracksData.sourceSignature ?? "");

      if (knownTracks.length === 0) {
        throw new Error("선택한 플레이리스트에서 분석할 수 있는 곡을 찾지 못했습니다.");
      }

      if (
        !forceRefresh &&
        tasteProfile &&
        tasteProfile.sourceSignature === sourceSignature
      ) {
        setStatusMessage("변경된 곡이 없어 서버에 저장된 기존 취향 DNA를 유지합니다.");
        setPickerOpen(false);
        return;
      }

      const selectedSourcesSummary = sourcesPayload.map((s) => ({
        id: s.id,
        title: s.title,
        count: knownTracks.filter((k) => k.sourceName === s.title).length,
      }));

      const profileRes = await fetch("/api/taste/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracks: knownTracks,
          sourceSignature,
          selectedSources: selectedSourcesSummary,
        }),
      });
      const profileData = await profileRes.json();
      if (!profileRes.ok) {
        throw new Error(profileData.error || "취향 DNA 분석에 실패했습니다.");
      }

      onChangeTasteProfile(profileData.tasteProfile as TasteProfile);
      setPickerOpen(false);
      setStatusMessage(
        `${knownTracks.length}개 항목의 취향 DNA를 서버(.data)에 저장했습니다.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "취향 분석 중 오류가 발생했습니다."
      );
    } finally {
      setAnalyzing(false);
      window.dispatchEvent(new Event("anitune:quota-updated"));
    }
  };

  const activeFamiliarity = FAMILIARITY_STEPS.find(
    (s) => s.level === familiarityLevel
  );

  return (
    <div className="py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <AudioLines className="h-3.5 w-3.5 text-obi" />
          내 YouTube 취향 DNA
        </div>

        {tasteProfile && (
          <div className="flex items-center gap-2.5">
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 select-none"
              title="끄면 내 취향 DNA와 라이브러리 곡 목록을 프롬프트에 넣지 않고 새로운 결로 선곡합니다"
            >
              <span
                className={`text-[11px] font-medium ${
                  useTasteDna ? "text-cobalt-ink" : "text-muted"
                }`}
              >
                프롬프트 반영
              </span>
              <input
                type="checkbox"
                checked={useTasteDna}
                onChange={(e) => onToggleUseTasteDna(e.target.checked)}
                aria-label="내 취향 DNA 프롬프트 반영"
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                  useTasteDna ? "bg-cobalt" : "bg-hairline-strong"
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                    useTasteDna ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </span>
            </label>

            <button
              type="button"
              onClick={handleResetProfile}
              className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-obi-ink"
              title="서버에 저장된 취향 DNA 초기화"
            >
              <Trash2 className="h-3 w-3" /> 초기화
            </button>
          </div>
        )}
      </div>

      {!authStatus?.youtubeConnected ? (
        <div className="rounded-md border border-hairline bg-sheet-muted p-3">
          <p className="text-[11px] leading-relaxed text-muted">
            YouTube 계정을 연결하면 내 기존 플레이리스트와 좋아요한 음악을 분석해 서버에 취향 DNA를 저장하고, 아는 곡·새 곡 비중을 맞춰 셋리를 짤 수 있습니다.
          </p>
          {authStatus?.youtubeConfigured && (
            <a
              href="/api/auth/youtube/login"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded border border-obi/35 bg-sheet px-2.5 py-1.5 text-xs font-semibold text-obi-ink transition hover:bg-obi-soft"
            >
              <ListMusic className="h-3.5 w-3.5" />
              Google 로그인하고 플리 불러오기
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleLoadLibrary}
              disabled={loadingList || analyzing}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-sheet px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-sheet-muted disabled:opacity-50"
            >
              {loadingList ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ListMusic className="h-3.5 w-3.5 text-obi" />
              )}
              {tasteProfile ? "플리 소스 바꾸기" : "내 플리 · 좋아요 불러오기"}
            </button>

            {tasteProfile && (
              <button
                type="button"
                onClick={() => handleAnalyze(true)}
                disabled={analyzing || loadingList}
                className="inline-flex items-center gap-1 rounded-md border border-hairline bg-sheet-muted px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:text-ink disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                다시 분석
              </button>
            )}
          </div>

          {/* Playlist Picker */}
          {pickerOpen && playlists.length > 0 && (
            <div className="rounded-md border border-hairline-strong bg-sheet-muted p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-ink">
                <span>분석에 반영할 플리 선택 (최대 150곡)</span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="text-muted hover:text-ink"
                >
                  접기
                </button>
              </div>
              <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {playlists.map((pl) => {
                  const checked = selectedIds.includes(pl.id);
                  return (
                    <label
                      key={pl.id}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs transition ${
                        checked
                          ? "border-cobalt bg-cobalt-soft text-ink"
                          : "border-hairline bg-sheet text-ink-soft hover:border-hairline-strong"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                            checked
                              ? "border-cobalt bg-cobalt text-white"
                              : "border-hairline-strong bg-sheet"
                          }`}
                        >
                          {checked && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePlaylistId(pl.id)}
                          className="sr-only"
                        />
                        <span className="truncate font-medium">{pl.title}</span>
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted">
                        {pl.kind === "likes" ? "최근 좋아요" : `${pl.itemCount}곡`}
                      </span>
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={selectedIds.length === 0 || analyzing}
                onClick={() => handleAnalyze(false)}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded bg-ink px-3 py-2 text-xs font-semibold text-sheet transition hover:opacity-90 disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    곡 추출 및 취향 분석 중...
                  </>
                ) : (
                  <>선택한 {selectedIds.length}개 소스로 취향 DNA 저장</>
                )}
              </button>
            </div>
          )}

          {statusMessage && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-800 dark:text-emerald-200">
              {statusMessage}
            </div>
          )}

          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Saved Taste DNA Summary + 4-stage familiarity selector */}
          {tasteProfile && (
            <div className="space-y-3 rounded-md border border-hairline bg-sheet-muted p-3">
              {!useTasteDna && (
                <div className="flex items-center justify-between gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                  <span>
                    취향 DNA 반영 꺼짐 — 내 취향을 빼고 시드·무드 조건만으로 새로운 곡을 찾습니다.
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleUseTasteDna(true)}
                    className="shrink-0 font-semibold underline hover:opacity-80"
                  >
                    다시 켜기
                  </button>
                </div>
              )}

              <div className={useTasteDna ? "" : "opacity-50 transition-opacity"}>
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted">
                  <span>
                    반영 곡 {tasteProfile.knownTracks.length}개 ·{" "}
                    {tasteProfile.dna.eraPreference}
                  </span>
                  <span
                    className={`rounded border border-hairline bg-sheet px-1.5 py-0.5 text-[10px] ${
                      useTasteDna
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-muted"
                    }`}
                  >
                    {useTasteDna ? "선곡에 반영 중" : "이번 선곡 제외됨"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink">
                  {tasteProfile.dna.summary}
                </p>

                {tasteProfile.dna.sonicTraits.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tasteProfile.dna.sonicTraits.map((trait) => (
                      <span
                        key={trait}
                        className="rounded border border-hairline bg-sheet px-2 py-0.5 text-[10px] font-medium text-ink-soft"
                      >
                        {trait}
                      </span>
                    ))}
                  </div>
                )}

                {tasteProfile.dna.recommendedSeeds.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-semibold text-muted">
                      추천 시드:
                    </span>
                    {tasteProfile.dna.recommendedSeeds.map((seed) => (
                      <button
                        key={seed}
                        type="button"
                        onClick={() => onAddSeed(seed)}
                        className="inline-flex items-center gap-0.5 rounded bg-cobalt-soft px-1.5 py-0.5 text-[10px] font-medium text-cobalt-ink hover:brightness-95"
                        title="시드에 추가"
                      >
                        <Plus className="h-2.5 w-2.5" />
                        {seed}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 4-Stage Familiarity Ratio */}
              <div
                className={`border-t border-hairline pt-2.5 ${
                  useTasteDna ? "" : "pointer-events-none opacity-45"
                }`}
              >
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold text-ink">
                    아는 곡 포함 비중
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-cobalt-ink">
                    {activeFamiliarity?.title} ({activeFamiliarity?.ratio})
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {FAMILIARITY_STEPS.map((step) => {
                    const active = familiarityLevel === step.level;
                    return (
                      <button
                        key={step.level}
                        type="button"
                        disabled={!useTasteDna}
                        onClick={() => onChangeFamiliarity(step.level)}
                        className={`flex flex-col items-center rounded border py-1.5 text-center transition ${
                          active
                            ? "border-cobalt bg-cobalt-soft text-cobalt-ink"
                            : "border-hairline bg-sheet text-muted hover:border-hairline-strong hover:text-ink"
                        }`}
                      >
                        <span className="text-[11px] font-bold tabular-nums">
                          {step.ratio}
                        </span>
                        <span className="text-[10px] leading-tight">
                          {step.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {activeFamiliarity && (
                  <p className="mt-1.5 text-[11px] text-muted">
                    {activeFamiliarity.desc}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
