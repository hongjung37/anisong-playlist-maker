"use client";

import { useState } from "react";
import {
  BookMarked,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Shuffle,
  X,
} from "lucide-react";
import type { WatchedAnimeItem } from "@/types/playlist";

type RatingTab = "ALL" | "인생작" | "명작" | "수작" | "보는 중";

const RATING_TABS: Array<{ value: RatingTab; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "인생작", label: "⭐️인생작" },
  { value: "명작", label: "명작⭐️" },
  { value: "수작", label: "수작📍" },
  { value: "보는 중", label: "보는 중" },
];

const ADD_RATING_OPTIONS = [
  { value: "⭐️인생작⭐️", label: "⭐️인생작⭐️" },
  { value: "명작⭐️", label: "명작⭐️" },
  { value: "수작📍", label: "수작📍" },
  { value: "킬링타임😀", label: "킬링타임😀" },
  { value: "", label: "평점 없음" },
];

function ratingWeight(rating: string | null): number {
  if (!rating) return 1;
  if (rating.includes("인생작")) return 5;
  if (rating.includes("명작")) return 4;
  if (rating.includes("수작")) return 3;
  if (rating.includes("킬링타임")) return 2;
  if (rating.includes("시간이아깝다") || rating.includes("쓰레기")) return 0;
  return 1;
}

interface WatchedAnimePanelProps {
  items: WatchedAnimeItem[];
  seeds: string[];
  maxSeeds?: number;
  onAddSeed: (seed: string) => void;
  onRemoveSeed: (seed: string) => void;
  onChangeItems: (items: WatchedAnimeItem[]) => void;
}

export function WatchedAnimePanel({
  items,
  seeds,
  maxSeeds = 6,
  onAddSeed,
  onRemoveSeed,
  onChangeItems,
}: WatchedAnimePanelProps) {
  const [open, setOpen] = useState(false);
  const [ratingTab, setRatingTab] = useState<RatingTab>("ALL");
  const [genreFilter, setGenreFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newRating, setNewRating] = useState("명작⭐️");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uniqueGenres = Array.from(
    new Set(items.map((item) => item.genre).filter((g): g is string => Boolean(g)))
  ).sort((a, b) => a.localeCompare(b, "ko"));

  const filteredItems = items.filter((item) => {
    if (ratingTab === "보는 중" && item.status !== "보는 중") return false;
    if (
      (ratingTab === "인생작" ||
        ratingTab === "명작" ||
        ratingTab === "수작") &&
      !(item.rating ?? "").includes(ratingTab)
    ) {
      return false;
    }
    if (genreFilter !== "ALL" && item.genre !== genreFilter) return false;

    const q = searchQuery.trim().toLowerCase();
    if (q && !item.title.toLowerCase().includes(q)) return false;
    return true;
  });

  const handleRandomPick = () => {
    const remainingSlots = Math.max(0, maxSeeds - seeds.length);
    if (remainingSlots === 0 || filteredItems.length === 0) return;

    const unselected = filteredItems.filter(
      (item) => !seeds.includes(item.title)
    );
    if (unselected.length === 0) return;

    const highRated =
      ratingTab === "ALL"
        ? unselected.filter((item) => ratingWeight(item.rating) >= 3)
        : unselected;
    const pool = highRated.length >= 3 ? highRated : unselected;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const count = Math.min(3, remainingSlots, shuffled.length);

    for (let i = 0; i < count; i += 1) {
      onAddSeed(shuffled[i].title);
    }
  };

  const handleAddWatched = async () => {
    const title = newTitle.trim();
    if (!title || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/watched-anime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          status: "완료",
          rating: newRating || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        items?: WatchedAnimeItem[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.items)) {
        throw new Error(data.error || "본 작품 추가에 실패했습니다.");
      }
      onChangeItems(data.items);
      setNewTitle("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "본 작품 저장 중 오류가 발생했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteWatched = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/user/watched-anime?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        items?: WatchedAnimeItem[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.items)) {
        throw new Error(data.error || "삭제에 실패했습니다.");
      }
      onChangeItems(data.items);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다."
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded border border-hairline bg-sheet-muted px-2.5 py-1 text-[11px] font-medium text-ink-soft transition hover:border-hairline-strong hover:text-ink"
      >
        <BookMarked className="h-3 w-3 text-obi" />
        <span>내 본 작품 보관함</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
            items.length > 0
              ? "bg-obi-soft text-obi-ink"
              : "bg-sheet text-muted"
          }`}
        >
          {items.length}작품
        </span>
        {open ? (
          <ChevronUp className="h-3 w-3 text-muted" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted" />
        )}
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-hairline-strong bg-sheet-muted p-3">
          {/* Rating tabs + Random Pick */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap gap-1">
              {RATING_TABS.map((tab) => {
                const active = ratingTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setRatingTab(tab.value)}
                    className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition ${
                      active
                        ? "border-obi bg-obi-soft text-obi-ink"
                        : "border-hairline bg-sheet text-muted hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {filteredItems.length > 0 && (
              <button
                type="button"
                disabled={seeds.length >= maxSeeds}
                onClick={handleRandomPick}
                className="inline-flex items-center gap-1 rounded border border-hairline-strong bg-sheet px-2 py-0.5 text-[10px] font-semibold text-ink-soft transition hover:text-ink disabled:opacity-40"
                title="필터된 본 작품 중 무작위로 최대 3작품을 시드에 추가"
              >
                <Shuffle className="h-2.5 w-2.5 text-cobalt" />
                랜덤 3작품 시드
              </button>
            )}
          </div>

          {/* Search & Genre filter */}
          <div className="mt-2 flex gap-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                }
              }}
              placeholder="본 작품 제목 검색..."
              className="min-w-0 flex-1 rounded border border-hairline bg-sheet px-2.5 py-1 text-[11px] text-ink placeholder:text-muted/70 focus:border-cobalt focus:outline-none"
            />
            {uniqueGenres.length > 0 && (
              <select
                value={genreFilter}
                onChange={(e) => setGenreFilter(e.target.value)}
                aria-label="본 작품 장르 필터"
                className="max-w-[130px] rounded border border-hairline bg-sheet px-2 py-1 text-[11px] text-ink focus:border-cobalt focus:outline-none"
              >
                <option value="ALL">전체 장르</option>
                {uniqueGenres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && (
            <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Watched list */}
          <div className="mt-2 max-h-60 space-y-1 overflow-y-auto pr-1">
            {filteredItems.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-muted">
                조건에 맞는 본 작품이 없습니다. 아래에서 직접 추가해 보세요.
              </p>
            ) : (
              filteredItems.map((item) => {
                const selected = seeds.includes(item.title);
                const addDisabled = !selected && seeds.length >= maxSeeds;
                const isDeleting = deletingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-1 rounded border transition ${
                      selected
                        ? "border-cobalt bg-cobalt-soft"
                        : "border-hairline bg-sheet hover:border-hairline-strong"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={addDisabled}
                      onClick={() =>
                        selected
                          ? onRemoveSeed(item.title)
                          : onAddSeed(item.title)
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left disabled:opacity-45"
                    >
                      {item.rank !== null && (
                        <span className="shrink-0 rounded bg-sheet-muted px-1 py-0.5 text-[10px] font-bold tabular-nums text-cobalt-ink">
                          #{item.rank}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink">
                        {item.title}
                      </span>
                      {item.status === "보는 중" && (
                        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                          보는 중
                        </span>
                      )}
                      {item.rating && (
                        <span className="shrink-0 text-[10px] text-ink-soft">
                          {item.rating}
                        </span>
                      )}
                      {item.genre && (
                        <span className="hidden shrink-0 rounded bg-sheet-muted px-1.5 py-0.5 text-[9px] text-muted sm:inline">
                          {item.genre}
                        </span>
                      )}
                      {selected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-cobalt" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => void handleDeleteWatched(item.id)}
                      className="mr-1 shrink-0 rounded p-1 text-muted hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
                      title="보관함에서 삭제"
                      aria-label={`${item.title} 삭제`}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Inline manual add */}
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-hairline pt-2.5">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddWatched();
                }
              }}
              placeholder="직접 본 작품 추가 (예: 진격의 거인)"
              className="min-w-[140px] flex-1 rounded border border-hairline bg-sheet px-2.5 py-1 text-[11px] text-ink placeholder:text-muted/70 focus:border-cobalt focus:outline-none"
            />
            <select
              value={newRating}
              onChange={(e) => setNewRating(e.target.value)}
              aria-label="새 작품 평점"
              className="rounded border border-hairline bg-sheet px-2 py-1 text-[11px] text-ink focus:border-cobalt focus:outline-none"
            >
              {ADD_RATING_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={submitting || !newTitle.trim()}
              onClick={() => void handleAddWatched()}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-ink px-2.5 py-1 text-[11px] font-semibold text-sheet transition hover:opacity-90 disabled:opacity-45"
            >
              {submitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              추가
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
