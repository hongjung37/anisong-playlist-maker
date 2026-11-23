"use client";

import { useCallback, useEffect, useState } from "react";
import { Shuffle, Sparkles, Trophy, X } from "lucide-react";
import {
  buildTournamentContenders,
  buildTournamentWinnerRequest,
  getRatingWeight,
  type TournamentContender,
} from "@/lib/spinoff-tournament";
import type {
  FamiliarityLevel,
  PlaylistGenerateRequest,
  WatchedAnimeItem,
  WatchedAnimeMode,
} from "@/types/playlist";

interface MoodTournamentModalProps {
  watchedAnime: WatchedAnimeItem[];
  trackCount: number;
  familiarityLevel: FamiliarityLevel;
  watchedAnimeMode: WatchedAnimeMode;
  tasteProfile: PlaylistGenerateRequest["tasteProfile"];
  onClose: () => void;
  onApplyToBuilder: (result: {
    seeds: string[];
    moods: string[];
    genres: string[];
    prompt: string;
  }) => void;
  onGenerateImmediate: (
    result: {
      seeds: string[];
      moods: string[];
      genres: string[];
      prompt: string;
    },
    request: PlaylistGenerateRequest
  ) => void;
}

export function MoodTournamentModal({
  watchedAnime,
  trackCount,
  familiarityLevel,
  watchedAnimeMode,
  tasteProfile,
  onClose,
  onApplyToBuilder,
  onGenerateImmediate,
}: MoodTournamentModalProps) {
  const eligibleWatchedCount = watchedAnime.filter(
    (item) => getRatingWeight(item.rating) >= 2
  ).length;
  const canUseWatched = eligibleWatchedCount >= 8;

  const [sourceMode, setSourceMode] = useState<"watched" | "curated">(() =>
    canUseWatched ? "watched" : "curated"
  );
  const [roundContenders, setRoundContenders] = useState<TournamentContender[]>(
    () =>
      buildTournamentContenders(
        watchedAnime,
        canUseWatched ? "watched" : "curated"
      )
  );
  const [matchIndex, setMatchIndex] = useState(0);
  const [winners, setWinners] = useState<TournamentContender[]>([]);
  const [semifinalLosers, setSemifinalLosers] = useState<TournamentContender[]>(
    []
  );
  const [finalResult, setFinalResult] = useState<{
    champion: TournamentContender;
    runnerUp: TournamentContender;
    semifinalists: TournamentContender[];
  } | null>(null);

  const resetBracket = useCallback(
    (nextMode: "watched" | "curated") => {
      setSourceMode(nextMode);
      setRoundContenders(buildTournamentContenders(watchedAnime, nextMode));
      setMatchIndex(0);
      setWinners([]);
      setSemifinalLosers([]);
      setFinalResult(null);
    },
    [watchedAnime]
  );

  const handlePick = useCallback(
    (side: 0 | 1) => {
      if (finalResult) return;
      const left = roundContenders[matchIndex * 2];
      const right = roundContenders[matchIndex * 2 + 1];
      if (!left || !right) return;

      const winner = side === 0 ? left : right;
      const loser = side === 0 ? right : left;

      const nextSemifinalLosers =
        roundContenders.length === 4
          ? [...semifinalLosers, loser]
          : semifinalLosers;

      if (roundContenders.length === 4) {
        setSemifinalLosers(nextSemifinalLosers);
      }

      const nextWinners = [...winners, winner];
      const totalMatchesInRound = roundContenders.length / 2;

      if (matchIndex + 1 < totalMatchesInRound) {
        setWinners(nextWinners);
        setMatchIndex(matchIndex + 1);
      } else if (nextWinners.length === 1) {
        setFinalResult({
          champion: winner,
          runnerUp: loser,
          semifinalists: nextSemifinalLosers,
        });
      } else {
        setRoundContenders(nextWinners);
        setWinners([]);
        setMatchIndex(0);
      }
    },
    [finalResult, matchIndex, roundContenders, semifinalLosers, winners]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (finalResult) return;
      if (e.key === "ArrowLeft" || e.key === "1") {
        e.preventDefault();
        handlePick(0);
      } else if (e.key === "ArrowRight" || e.key === "2") {
        e.preventDefault();
        handlePick(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finalResult, handlePick, onClose]);

  const leftContender = roundContenders[matchIndex * 2];
  const rightContender = roundContenders[matchIndex * 2 + 1];

  const roundLabel =
    roundContenders.length === 8
      ? `8강 (${matchIndex + 1} / 4)`
      : roundContenders.length === 4
        ? `4강 준결승 (${matchIndex + 1} / 2)`
        : "🏆 결승전";

  const completedBefore =
    roundContenders.length === 8 ? 0 : roundContenders.length === 4 ? 4 : 6;
  const currentStep = finalResult ? 7 : completedBefore + matchIndex + 1;
  const progressPct = finalResult
    ? 100
    : Math.round(((currentStep - 1) / 7) * 100);

  const builtWinner = finalResult
    ? buildTournamentWinnerRequest({
        champion: finalResult.champion,
        runnerUp: finalResult.runnerUp,
        semifinalists: finalResult.semifinalists,
        trackCount,
        familiarityLevel,
        watchedAnimeMode,
        tasteProfile,
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="8강 애니송 이상형 월드컵"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-hairline-strong bg-sheet shadow-2xl">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-sheet-muted px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-obi" />
            <h2 className="font-display text-base font-bold text-ink">
              오늘의 기분 · 8강 이상형 월드컵
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            {canUseWatched && (
              <div className="flex rounded-md border border-hairline bg-sheet p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => resetBracket("watched")}
                  className={`rounded px-2 py-0.5 font-semibold transition ${
                    sourceMode === "watched"
                      ? "bg-obi text-white"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  내 본 작품
                </button>
                <button
                  type="button"
                  onClick={() => resetBracket("curated")}
                  className={`rounded px-2 py-0.5 font-semibold transition ${
                    sourceMode === "curated"
                      ? "bg-cobalt text-white"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  명곡·사운드
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => resetBracket(sourceMode)}
              className="inline-flex items-center gap-1 rounded border border-hairline bg-sheet px-2 py-1 text-[11px] font-medium text-ink-soft hover:text-ink"
              title="대진표 다시 섞기"
            >
              <Shuffle className="h-3 w-3" />
              다시 섞기
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted hover:bg-hairline hover:text-ink"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="border-b border-hairline bg-sheet px-5 py-2.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-cobalt-ink">
              {finalResult ? "토너먼트 우승 결정!" : roundLabel}
            </span>
            <span className="tabular-nums text-muted">
              {finalResult
                ? "7 / 7 매치 완료"
                : `${currentStep} / 7 매치 · 키보드 ← / → 선택 가능`}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sheet-muted">
            <div
              className="h-full rounded-full bg-obi transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {!finalResult && leftContender && rightContender ? (
            <div>
              <p className="mb-4 text-center text-xs text-muted">
                지금 이 순간 더 끌리는 쪽을 고르세요 (3라운드, 7번만 선택하면 셋리 조건이 완성됩니다)
              </p>

              <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[leftContender, rightContender].map((contender, idx) => (
                  <button
                    key={contender.id}
                    type="button"
                    onClick={() => handlePick(idx as 0 | 1)}
                    className="group flex flex-col justify-between rounded-lg border border-hairline-strong bg-sheet-muted p-4 text-left transition hover:border-cobalt hover:bg-cobalt-soft/45 focus-visible:outline-2 focus-visible:outline-cobalt"
                  >
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="rounded bg-sheet px-2 py-0.5 text-[10px] font-semibold text-obi-ink">
                          {contender.badge}
                        </span>
                        <span className="text-[10px] font-bold text-muted group-hover:text-cobalt-ink">
                          {idx === 0 ? "← 1번 선택" : "2번 선택 →"}
                        </span>
                      </div>

                      <h3 className="font-display text-lg font-bold leading-snug text-ink">
                        {contender.title}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-cobalt-ink">
                        {contender.subtitle}
                      </p>
                      <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">
                        {contender.description}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1 border-t border-hairline/70 pt-2.5">
                      {contender.moods.map((m) => (
                        <span
                          key={m}
                          className="rounded border border-hairline bg-sheet px-1.5 py-0.5 text-[10px] text-ink-soft"
                        >
                          {m}
                        </span>
                      ))}
                      {contender.genres.map((g) => (
                        <span
                          key={g}
                          className="rounded bg-cobalt-soft px-1.5 py-0.5 text-[10px] font-medium text-cobalt-ink"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : finalResult && builtWinner ? (
            <div className="space-y-4">
              {/* Podium */}
              <div className="rounded-lg border border-obi/35 bg-obi-soft/40 p-4 text-center">
                <div className="text-xs font-bold text-obi-ink">
                  🏆 오늘의 우승
                </div>
                <h3 className="font-display mt-1 text-2xl font-bold text-ink">
                  {finalResult.champion.title}
                </h3>
                <p className="mt-1 text-xs text-ink-soft">
                  {finalResult.champion.subtitle} · {finalResult.champion.badge}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-3 border-t border-obi/20 pt-2.5 text-[11px] text-ink-soft">
                  <span>
                    🥈 준우승: <strong>{finalResult.runnerUp.title}</strong>
                  </span>
                  {finalResult.semifinalists.length > 0 && (
                    <span>
                      🥉 4강:{" "}
                      <strong>
                        {finalResult.semifinalists.map((s) => s.title).join(" · ")}
                      </strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Inferred Conditions */}
              <div className="rounded-lg border border-hairline bg-sheet-muted p-3.5 text-xs">
                <div className="mb-2 font-semibold text-ink">
                  자동 조합된 선곡 조건
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-10 shrink-0 font-semibold text-muted">
                      시드
                    </span>
                    {builtWinner.seeds.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-cobalt-soft px-2 py-0.5 font-medium text-cobalt-ink"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-10 shrink-0 font-semibold text-muted">
                      무드
                    </span>
                    {builtWinner.moods.map((m) => (
                      <span
                        key={m}
                        className="rounded border border-hairline bg-sheet px-2 py-0.5 text-ink"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-10 shrink-0 font-semibold text-muted">
                      장르
                    </span>
                    {builtWinner.genres.map((g) => (
                      <span
                        key={g}
                        className="rounded border border-hairline bg-sheet px-2 py-0.5 text-ink-soft"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    onGenerateImmediate(
                      {
                        seeds: builtWinner.seeds,
                        moods: builtWinner.moods,
                        genres: builtWinner.genres,
                        prompt: builtWinner.prompt,
                      },
                      builtWinner.request
                    );
                    onClose();
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-obi px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-110"
                >
                  <Sparkles className="h-3.5 w-3.5" />이 결과로 바로 셋리 만들기 ({trackCount}곡)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onApplyToBuilder({
                      seeds: builtWinner.seeds,
                      moods: builtWinner.moods,
                      genres: builtWinner.genres,
                      prompt: builtWinner.prompt,
                    });
                    onClose();
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-hairline-strong bg-sheet px-3.5 py-2.5 text-xs font-semibold text-ink transition hover:bg-sheet-muted"
                >
                  선곡 조건에만 채우기
                </button>

                <button
                  type="button"
                  onClick={() => resetBracket(sourceMode)}
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-hairline bg-sheet-muted px-3 py-2.5 text-xs font-medium text-ink-soft hover:text-ink"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  다시 하기
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
