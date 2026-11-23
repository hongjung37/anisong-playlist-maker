"use client";

import Image from "next/image";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Disc3,
  Loader2,
  Shuffle,
  Tv,
} from "lucide-react";
import type { AniListUserMediaItem } from "@/types/playlist";

type StatusFilter = "ALL" | "COMPLETED" | "CURRENT";

interface AniListSeedImporterProps {
  initialUsername: string | null;
  seeds: string[];
  maxSeeds?: number;
  onAddSeed: (seed: string) => void;
  onRemoveSeed: (seed: string) => void;
}

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "COMPLETED", label: "시청 완료" },
  { value: "CURRENT", label: "시청 중" },
];

function getPreferredTitle(item: AniListUserMediaItem): string {
  return item.titleEnglish || item.titleRomaji || item.titleNative;
}

export function AniListSeedImporter({
  initialUsername,
  seeds,
  maxSeeds = 6,
  onAddSeed,
  onRemoveSeed,
}: AniListSeedImporterProps) {
  const [open, setOpen] = useState(false);
  const [draftUsername, setDraftUsername] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [titleQuery, setTitleQuery] = useState("");
  const [items, setItems] = useState<AniListUserMediaItem[]>([]);
  const [loadedUsername, setLoadedUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const username = draftUsername ?? initialUsername ?? "";

  const fetchUserList = async (
    targetUsername: string,
    targetStatus: StatusFilter
  ) => {
    const trimmed = targetUsername.trim();
    if (!trimmed) {
      setError("AniList 닉네임을 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/anilist/user?username=${encodeURIComponent(trimmed)}&status=${encodeURIComponent(targetStatus)}`,
        { cache: "no-store" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        username?: string;
        items?: AniListUserMediaItem[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "AniList 목록을 불러오지 못했습니다.");
      }
      setItems(data.items ?? []);
      setLoadedUsername(data.username ?? trimmed);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "AniList 조회 중 오류가 발생했습니다."
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (nextStatus: StatusFilter) => {
    setStatusFilter(nextStatus);
    if (loadedUsername || username.trim()) {
      void fetchUserList(loadedUsername || username, nextStatus);
    }
  };

  const filteredItems = items.filter((item) => {
    const q = titleQuery.trim().toLowerCase();
    if (!q) return true;
    return [item.titleEnglish, item.titleRomaji, item.titleNative]
      .filter(Boolean)
      .some((t) => t!.toLowerCase().includes(q));
  });

  const handleRandomPick = () => {
    if (filteredItems.length === 0) return;
    const remainingSlots = Math.max(0, maxSeeds - seeds.length);
    if (remainingSlots === 0) return;

    const pool = filteredItems.filter((item) => {
      const title = getPreferredTitle(item);
      return !seeds.includes(title);
    });
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const count = Math.min(3, remainingSlots, shuffled.length);
    for (let i = 0; i < count; i += 1) {
      onAddSeed(getPreferredTitle(shuffled[i]));
    }
  };

  const activeBadge = loadedUsername || initialUsername;

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded border border-hairline bg-sheet-muted px-2.5 py-1 text-[11px] font-medium text-ink-soft transition hover:border-hairline-strong hover:text-ink"
      >
        <Tv className="h-3 w-3 text-cobalt" />
        <span>AniList 시청 목록에서 고르기</span>
        {activeBadge && (
          <span className="rounded bg-cobalt-soft px-1.5 py-0.5 text-[10px] font-semibold text-cobalt-ink">
            @{activeBadge}
          </span>
        )}
        {open ? (
          <ChevronUp className="h-3 w-3 text-muted" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted" />
        )}
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-hairline-strong bg-sheet-muted p-3">
          <div className="flex gap-1.5">
            <input
              type="text"
              value={username}
              onChange={(e) => setDraftUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void fetchUserList(username, statusFilter);
                }
              }}
              placeholder="AniList 사용자 이름 입력"
              className="min-w-0 flex-1 rounded border border-hairline-strong bg-sheet px-2.5 py-1.5 text-xs text-ink placeholder:text-muted/70 focus:border-cobalt focus:outline-none"
            />
            <button
              type="button"
              disabled={loading || !username.trim()}
              onClick={() => void fetchUserList(username, statusFilter)}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-ink px-2.5 py-1.5 text-xs font-semibold text-sheet transition hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              불러오기
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex gap-1">
              {STATUS_TABS.map((tab) => {
                const active = statusFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => handleStatusChange(tab.value)}
                    className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition ${
                      active
                        ? "border-cobalt bg-cobalt-soft text-cobalt-ink"
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
                title="목록에서 무작위로 최대 3개 작품을 시드에 추가"
              >
                <Shuffle className="h-2.5 w-2.5 text-cobalt" />
                랜덤 3작품 시드 채우기
              </button>
            )}
          </div>

          {error && (
            <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {items.length > 0 && (
            <>
              <input
                type="text"
                value={titleQuery}
                onChange={(e) => setTitleQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                  }
                }}
                placeholder="불러온 목록 내 제목 필터..."
                className="mt-2 w-full rounded border border-hairline bg-sheet px-2.5 py-1 text-[11px] text-ink placeholder:text-muted/70 focus:border-cobalt focus:outline-none"
              />

              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
                {filteredItems.length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-muted">
                    일치하는 작품이 없습니다.
                  </p>
                ) : (
                  filteredItems.map((item) => {
                    const seedTitle = getPreferredTitle(item);
                    const selected = seeds.includes(seedTitle);
                    const disabled = !selected && seeds.length >= maxSeeds;
                    return (
                      <button
                        key={item.mediaId}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          selected
                            ? onRemoveSeed(seedTitle)
                            : onAddSeed(seedTitle)
                        }
                        className={`flex w-full items-center gap-2.5 rounded border p-1.5 text-left transition ${
                          selected
                            ? "border-cobalt bg-cobalt-soft text-ink"
                            : "border-hairline bg-sheet hover:border-hairline-strong disabled:opacity-45"
                        }`}
                      >
                        {item.coverImage ? (
                          <Image
                            src={item.coverImage}
                            alt={seedTitle}
                            width={28}
                            height={38}
                            unoptimized
                            className="h-9 w-7 shrink-0 rounded-sm object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-7 shrink-0 items-center justify-center rounded-sm bg-sheet-muted text-muted">
                            <Disc3 className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-semibold text-ink">
                            {seedTitle}
                          </div>
                          <div className="truncate text-[10px] text-muted">
                            {item.titleNative || item.titleRomaji}
                            {item.seasonYear ? ` · ${item.seasonYear}` : ""}
                            {item.score > 0 ? ` · ★ ${item.score}` : ""}
                          </div>
                        </div>
                        {selected && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-cobalt" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          {!loading && !error && loadedUsername && items.length === 0 && (
            <p className="mt-2 text-[11px] text-muted">
              해당 상태의 애니 시청 기록이 없습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
