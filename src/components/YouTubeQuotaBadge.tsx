"use client";

import { useEffect, useRef, useState } from "react";
import { Gauge, RefreshCw } from "lucide-react";
import type { YouTubeQuotaStatus } from "@/types/playlist";

interface YouTubeQuotaBadgeProps {
  quota: YouTubeQuotaStatus | null;
  onUpdateQuota: (next: YouTubeQuotaStatus) => void;
}

export function YouTubeQuotaBadge({
  quota,
  onUpdateQuota,
}: YouTubeQuotaBadgeProps) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (!quota) return null;

  const pct = Math.max(
    0,
    Math.min(100, Math.round((quota.remainingUnits / quota.dailyLimit) * 100))
  );
  const isLow = quota.remainingUnits < 2000;
  const isEmpty = quota.exhausted || quota.remainingUnits === 0;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/youtube/quota", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as YouTubeQuotaStatus;
        onUpdateQuota(data);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(manualInput);
    if (!Number.isFinite(num) || num < 0 || num > quota.dailyLimit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/youtube/quota", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remainingUnits: num }),
      });
      if (res.ok) {
        const data = (await res.json()) as YouTubeQuotaStatus;
        onUpdateQuota(data);
        setManualInput("");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums transition ${
          isEmpty
            ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
            : isLow
              ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
              : "border-hairline bg-sheet-muted text-ink hover:border-hairline-strong"
        }`}
        title="YouTube API v3 일일 추정 잔여 쿼터 보기"
      >
        <Gauge className="h-3.5 w-3.5 shrink-0 text-cobalt" />
        <span className="hidden sm:inline">YT 쿼터</span>
        <span className="font-semibold">
          {quota.remainingUnits.toLocaleString()}
        </span>
        <span className="text-[10px] text-muted">
          / {(quota.dailyLimit / 1000).toFixed(0)}k
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-hairline-strong bg-sheet p-3.5 text-xs text-ink shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2">
            <div>
              <div className="font-semibold text-ink">
                YouTube API v3 일일 쿼터 (추정)
              </div>
              <div className="text-[10px] text-muted">
                {quota.nextResetKstLabel}
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded p-1 text-muted hover:bg-sheet-muted hover:text-ink disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          <div className="mt-2.5 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-muted">남은 유닛</span>
              <span className="text-sm font-bold tabular-nums text-ink">
                {quota.remainingUnits.toLocaleString()} /{" "}
                {quota.dailyLimit.toLocaleString()} u
              </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-sheet-muted">
              <div
                className={`h-full transition-all ${
                  isEmpty
                    ? "bg-red-500"
                    : isLow
                      ? "bg-amber-500"
                      : "bg-cobalt"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded bg-sheet-muted p-2 text-[11px] tabular-nums">
              <div className="flex justify-between">
                <span className="text-muted">검색 (100u)</span>
                <span className="font-semibold">{quota.searchCalls}회</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">저장 (50u)</span>
                <span className="font-semibold">{quota.writeCalls}회</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">조회 (1u)</span>
                <span className="font-semibold">{quota.readCalls}회</span>
              </div>
              <div className="flex justify-between text-emerald-700 dark:text-emerald-300">
                <span>캐시 절약</span>
                <span className="font-semibold">{quota.cacheHits}곡</span>
              </div>
            </div>

            <p className="text-[10px] leading-relaxed text-muted">
              Google이 API로 실시간 잔여량을 제공하지 않아 앱 내 호출량을
              기준으로 추적합니다.
            </p>

            <form
              onSubmit={handleSaveManual}
              className="flex items-center gap-1.5 border-t border-hairline pt-2"
            >
              <input
                type="number"
                min={0}
                max={quota.dailyLimit}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="남은 유닛 수동 보정"
                className="w-full rounded border border-hairline-strong bg-sheet px-2 py-1 text-[11px] text-ink placeholder:text-muted/70 focus:border-cobalt focus:outline-none"
              />
              <button
                type="submit"
                disabled={saving || manualInput === ""}
                className="shrink-0 rounded bg-ink px-2 py-1 text-[11px] font-semibold text-sheet transition hover:opacity-90 disabled:opacity-40"
              >
                반영
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
