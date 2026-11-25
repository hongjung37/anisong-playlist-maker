"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Copy,
  Disc3,
  Download,
  ExternalLink,
  Filter,
  GripVertical,
  ListMusic,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Shuffle,
  Sparkles,
  Trash2,
  AlertTriangle,
  X,
  XCircle,
} from "lucide-react";
import { PlaylistPlayer } from "@/components/PlaylistPlayer";
import {
  getVisibleTrackEntries,
  shuffleTracks,
} from "@/lib/playlist-utils";
import {
  buildTrackSpinoffRequest,
  type TrackSpinoffMode,
} from "@/lib/spinoff-tournament";
import type {
  AuthStatus,
  GeneratedPlaylist,
  GenerationProgressState,
  GenerationStage,
  PlaylistExportResponse,
  PlaylistGenerateRequest,
  PlaylistTrack,
  ThemeType,
} from "@/types/playlist";

const GENERATION_STEPS: Array<{ stage: GenerationStage; label: string }> = [
  { stage: "curating", label: "1. AI 셋리 선곡" },
  { stage: "enriching_anilist", label: "2. AniList 커버 매칭" },
  { stage: "enriching_youtube", label: "3. YouTube 영상 확인" },
  { stage: "saving", label: "4. 히스토리 저장" },
];

const STAGE_ORDER: GenerationStage[] = [
  "preparing",
  "curating",
  "enriching_anilist",
  "enriching_youtube",
  "saving",
  "done",
];

const THEME_BADGE_STYLES: Record<ThemeType, string> = {
  OP: "bg-obi-soft text-obi-ink border-obi/25",
  ED: "bg-cobalt-soft text-cobalt-ink border-cobalt/25",
  INSERT:
    "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300",
  OST: "bg-sheet-muted text-ink-soft border-hairline-strong",
  CHARACTER:
    "bg-purple-500/10 text-purple-700 border-purple-500/25 dark:text-purple-300",
};

interface PlaylistWorkspaceProps {
  playlist: GeneratedPlaylist | null;
  loading: boolean;
  generationProgress?: GenerationProgressState | null;
  authStatus: AuthStatus | null;
  onUpdatePlaylist: (updated: GeneratedPlaylist) => void;
  onKnownTracksChanged?: () => void;
  onGenerateSpinoff?: (request: PlaylistGenerateRequest) => void;
  onOpenSetup: () => void;
}

export function PlaylistWorkspace({
  playlist,
  loading,
  generationProgress = null,
  authStatus,
  onUpdatePlaylist,
  onKnownTracksChanged,
  onGenerateSpinoff,
  onOpenSetup,
}: PlaylistWorkspaceProps) {
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatAll, setRepeatAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const [ytPrivacy, setYtPrivacy] = useState<"private" | "unlisted" | "public">(
    "private"
  );
  const [spPublic, setSpPublic] = useState<boolean>(false);

  const [exportingPlatform, setExportingPlatform] = useState<
    "youtube" | "spotify" | null
  >(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] =
    useState<PlaylistExportResponse | null>(null);

  const [rerollingTrackId, setRerollingTrackId] = useState<string | null>(null);
  const [togglingKnownTrackId, setTogglingKnownTrackId] = useState<
    string | null
  >(null);
  const [extending, setExtending] = useState(false);
  const [extendInstruction, setExtendInstruction] = useState("");
  const [trackActionError, setTrackActionError] = useState<string | null>(null);
  const [openSpinoffTrackId, setOpenSpinoffTrackId] = useState<string | null>(
    null
  );
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!openSpinoffTrackId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenSpinoffTrackId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSpinoffTrackId]);

  if (loading) {
    const activeStage = generationProgress?.stage ?? "preparing";
    const activeStageIndex = STAGE_ORDER.indexOf(activeStage);
    const percent = generationProgress?.percent ?? 15;

    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center rounded-lg border border-hairline bg-sheet p-8 text-center sm:p-10">
        <Loader2 className="mb-4 h-7 w-7 animate-spin text-cobalt" />
        <h3 className="font-display text-xl font-bold text-ink">
          {generationProgress?.message ?? "셋리를 엮는 중입니다"}
        </h3>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-muted">
          {generationProgress?.detail ??
            "원어 곡명과 로마자 표기, 작품 커버 아트를 맞춰 유튜브 뮤직에서도 바로 찾을 수 있도록 정리하고 있습니다."}
        </p>

        <div className="mt-6 w-full max-w-md space-y-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-sheet-muted">
            <div
              className="h-full rounded-full bg-cobalt transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(5, percent))}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-left sm:grid-cols-4">
            {GENERATION_STEPS.map((step) => {
              const stepIdx = STAGE_ORDER.indexOf(step.stage);
              const isDone = activeStageIndex > stepIdx;
              const isCurrent = activeStageIndex === stepIdx;
              return (
                <div
                  key={step.stage}
                  className={`flex items-center gap-1.5 rounded border px-2.5 py-2 text-[11px] font-medium transition ${
                    isDone
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : isCurrent
                        ? "border-cobalt/40 bg-cobalt-soft text-cobalt-ink"
                        : "border-hairline bg-sheet-muted text-muted"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : isCurrent ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cobalt" />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-hairline-strong" />
                  )}
                  <span className="truncate">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="overflow-hidden rounded-lg border border-hairline bg-sheet">
        <div className="flex flex-col sm:flex-row">
          {/* Signature CD Obi Strip */}
          <div className="flex items-center justify-between bg-obi px-5 py-3 text-white sm:w-14 sm:flex-col sm:py-6">
            <span className="text-[11px] font-bold tracking-[0.22em] sm:[writing-mode:vertical-rl]">
              ANITUNE DISC
            </span>
            <Disc3 className="h-5 w-5 opacity-90" />
          </div>

          <div className="flex-1 p-7 sm:p-10">
            <p className="text-xs font-semibold text-obi-ink">
              라이너 노트 &amp; 셋리 시트
            </p>
            <h2 className="font-display mt-2 text-2xl font-bold leading-snug text-ink sm:text-3xl">
              작품의 장면과 여운이 이어지는
              <br />
              나만의 애니송 셋리를 짜보세요
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              스트리밍 앱의 자동 추천은 인기곡 몇 개만 반복해서 들려줍니다. 왼쪽 선곡 조건에서 좋아하는 작품과 분위기를 고르면, OP·ED·극중 삽입곡의 감정선까지 맞춘 셋리를 만들고 내 계정으로 바로 저장할 수 있습니다.
            </p>

            <dl className="mt-8 grid grid-cols-1 gap-5 border-t border-hairline pt-6 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold text-ink">
                  장면 맥락 기반 선곡
                </dt>
                <dd className="mt-1 text-xs leading-relaxed text-muted">
                  시드 작품의 밴드 사운드, 작곡가 계보, 극중 역할을 함께 고려해 흐름을 짭니다.
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ink">
                  원어·로마자 이중 매칭
                </dt>
                <dd className="mt-1 text-xs leading-relaxed text-muted">
                  일본어 원제와 로마자 표기를 같이 찾아 스포티파이·유튜브 검색 누락을 줄입니다.
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ink">
                  계정에 바로 저장
                </dt>
                <dd className="mt-1 text-xs leading-relaxed text-muted">
                  YouTube Music과 Spotify OAuth 로그인 후 완성된 셋리를 즉시 플리로 생성합니다.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    );
  }

  const canResolveYouTube = Boolean(
    authStatus?.youtubeConnected || authStatus?.youtubeApiKeyConfigured
  );
  const effectiveActiveTrackId =
    activeTrackId && playlist.tracks.some((t) => t.id === activeTrackId)
      ? activeTrackId
      : null;

  const moveTrack = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= playlist.tracks.length) return;
    const next = [...playlist.tracks];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdatePlaylist({ ...playlist, tracks: next });
  };

  const reorderTracks = (fromIdx: number, toIdx: number) => {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= playlist.tracks.length ||
      toIdx >= playlist.tracks.length
    ) {
      return;
    }
    const next = [...playlist.tracks];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onUpdatePlaylist({ ...playlist, tracks: next });
  };

  const handleRerollTrack = async (track: PlaylistTrack) => {
    setRerollingTrackId(track.id);
    setTrackActionError(null);
    try {
      const res = await fetch("/api/playlist/reroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlist,
          trackId: track.id,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        track?: PlaylistTrack;
        error?: string;
      };
      if (!res.ok || !data.track) {
        throw new Error(data.error || "트랙 교체에 실패했습니다.");
      }

      const replacement = data.track;
      const nextTracks = playlist.tracks.map((t) =>
        t.id === track.id ? replacement : t
      );
      onUpdatePlaylist({ ...playlist, tracks: nextTracks });
      if (effectiveActiveTrackId === track.id) {
        setActiveTrackId(replacement.id);
      }
    } catch (err) {
      setTrackActionError(
        err instanceof Error ? err.message : "트랙 교체 중 오류가 발생했습니다."
      );
    } finally {
      setRerollingTrackId(null);
      window.dispatchEvent(new Event("anitune:quota-updated"));
    }
  };

  const handleToggleKnown = async (track: PlaylistTrack) => {
    const nextKnown = !track.inUserLibrary;
    setTogglingKnownTrackId(track.id);
    setTrackActionError(null);
    try {
      const res = await fetch("/api/user/known-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: {
            title: track.title,
            titleRomaji: track.titleRomaji,
            artist: track.artist,
            artistRomaji: track.artistRomaji,
            animeTitle: track.animeTitle,
            youtubeVideoId: track.youtubeVideoId,
          },
          known: nextKnown,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "아는 곡 저장에 실패했습니다.");
      }

      onUpdatePlaylist({
        ...playlist,
        tracks: playlist.tracks.map((t) =>
          t.id === track.id ? { ...t, inUserLibrary: nextKnown } : t
        ),
      });
      onKnownTracksChanged?.();
    } catch (err) {
      setTrackActionError(
        err instanceof Error ? err.message : "아는 곡 등록 중 오류가 발생했습니다."
      );
    } finally {
      setTogglingKnownTrackId(null);
    }
  };

  const handleExtendPlaylist = async () => {
    setExtending(true);
    setTrackActionError(null);
    try {
      const res = await fetch("/api/playlist/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlist,
          addCount: 5,
          instruction: extendInstruction.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        tracks?: PlaylistTrack[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.tracks)) {
        throw new Error(data.error || "곡 추가에 실패했습니다.");
      }

      onUpdatePlaylist({
        ...playlist,
        tracks: [...playlist.tracks, ...data.tracks],
      });
      setExtendInstruction("");
    } catch (err) {
      setTrackActionError(
        err instanceof Error ? err.message : "셋리 확장 중 오류가 발생했습니다."
      );
    } finally {
      setExtending(false);
      window.dispatchEvent(new Event("anitune:quota-updated"));
    }
  };

  const removeTrack = (trackId: string) => {
    const removedIdx = playlist.tracks.findIndex((t) => t.id === trackId);
    const next = playlist.tracks.filter((t) => t.id !== trackId);
    onUpdatePlaylist({ ...playlist, tracks: next });
    if (effectiveActiveTrackId === trackId) {
      if (next.length === 0) {
        setActiveTrackId(null);
        setIsPlaying(false);
      } else {
        const nextIdx = Math.min(removedIdx, next.length - 1);
        setActiveTrackId(next[nextIdx].id);
      }
    }
  };

  const handlePlayAll = () => {
    if (playlist.tracks.length === 0) return;
    if (effectiveActiveTrackId) return;
    setActiveTrackId(playlist.tracks[0].id);
  };

  const handleTrackResolved = (
    trackId: string,
    patch: Pick<
      PlaylistTrack,
      "youtubeVideoId" | "youtubeCandidateIds" | "youtubeUrl" | "youtubeMusicUrl"
    >
  ) => {
    onUpdatePlaylist({
      ...playlist,
      tracks: playlist.tracks.map((t) =>
        t.id === trackId ? { ...t, ...patch } : t
      ),
    });
  };

  const handleCopyText = async () => {
    const lines = [
      playlist.title,
      playlist.description,
      "",
      ...playlist.tracks.map(
        (t, i) =>
          `${i + 1}. ${t.title} - ${t.artist} [${t.animeTitle} ${t.themeLabel}]`
      ),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    downloadFile(
      `${playlist.title.replace(/[^\w가-힣-]+/g, "_")}.json`,
      JSON.stringify(playlist, null, 2),
      "application/json"
    );
  };

  const handleDownloadM3u = () => {
    const lines = [
      "#EXTM3U",
      `#PLAYLIST:${playlist.title}`,
      ...playlist.tracks.flatMap((t) => [
        `#EXTINF:-1,${t.artist} - ${t.title} (${t.animeTitle} ${t.themeLabel})`,
        t.youtubeUrl,
      ]),
    ];
    downloadFile(
      `${playlist.title.replace(/[^\w가-힣-]+/g, "_")}.m3u8`,
      lines.join("\n"),
      "audio/x-mpegurl"
    );
  };

  const handleExport = async (platform: "youtube" | "spotify") => {
    setExportingPlatform(platform);
    setExportError(null);
    setExportResult(null);

    try {
      const endpoint =
        platform === "youtube" ? "/api/export/youtube" : "/api/export/spotify";
      const body =
        platform === "youtube"
          ? {
              title: playlist.title,
              description: playlist.description,
              privacyStatus: ytPrivacy,
              tracks: playlist.tracks,
            }
          : {
              title: playlist.title,
              description: playlist.description,
              isPublic: spPublic,
              tracks: playlist.tracks,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "내보내기 중 오류가 발생했습니다.");
      }

      setExportResult(data as PlaylistExportResponse);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "내보내기 요청에 실패했습니다."
      );
    } finally {
      setExportingPlatform(null);
      if (platform === "youtube") {
        window.dispatchEvent(new Event("anitune:quota-updated"));
      }
    }
  };

  const firstCover = playlist.tracks.find((t) => t.coverImage)?.coverImage;
  const showSpotify = Boolean(authStatus?.spotifyConnected);

  const arcSections: Array<{
    section: string;
    count: number;
    firstTrackId: string;
  }> = [];
  for (const track of playlist.tracks) {
    const sec = track.setlistSection?.trim();
    if (!sec) continue;
    const last = arcSections[arcSections.length - 1];
    if (last && last.section === sec) {
      last.count += 1;
    } else {
      arcSections.push({ section: sec, count: 1, firstTrackId: track.id });
    }
  }
  const hasKnownMetadata = playlist.tracks.some(
    (t) => t.inUserLibrary !== undefined
  );
  const knownCount = playlist.tracks.filter((t) => t.inUserLibrary).length;
  const unknownCount = playlist.tracks.length - knownCount;
  const showOnlyUnknown = onlyUnknown && hasKnownMetadata && knownCount > 0;
  const visibleEntries = getVisibleTrackEntries(
    playlist.tracks,
    showOnlyUnknown
  );

  const handleShuffleTracks = () => {
    if (playlist.tracks.length < 2) return;
    onUpdatePlaylist({
      ...playlist,
      tracks: shuffleTracks(playlist.tracks, effectiveActiveTrackId),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Album Obi + Liner Sheet Header */}
      <section className="overflow-hidden rounded-lg border border-hairline bg-sheet">
        <div className="flex flex-col sm:flex-row">
          {/* Vertical CD Obi Spine */}
          <div className="flex items-center justify-between bg-obi px-4 py-2.5 text-white sm:w-12 sm:shrink-0 sm:flex-col sm:py-5">
            <span className="text-[11px] font-bold tracking-[0.2em] sm:[writing-mode:vertical-rl]">
              SETLIST
            </span>
            <span className="text-[11px] font-semibold tabular-nums sm:[writing-mode:vertical-rl]">
              {playlist.tracks.length} TRACKS
            </span>
          </div>

          {/* Main Liner Metadata */}
          <div className="min-w-0 flex-1 p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {playlist.mode === "gemini" ? (
                  <span className="rounded bg-cobalt-soft px-2 py-0.5 text-[11px] font-semibold text-cobalt-ink">
                    AI 큐레이션 완료
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenSetup}
                    className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-500/25 dark:text-amber-300"
                  >
                    <AlertTriangle className="h-3 w-3" /> 샘플 카탈로그 모드 (API 키 설정 안내)
                  </button>
                )}
              </div>

              {/* Local Utilities */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="inline-flex items-center gap-1 rounded border border-hairline bg-sheet px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-hairline-strong hover:text-ink"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "복사됨" : "목록 복사"}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadM3u}
                  className="inline-flex items-center gap-1 rounded border border-hairline bg-sheet px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-hairline-strong hover:text-ink"
                >
                  <Download className="h-3.5 w-3.5" /> M3U8
                </button>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="inline-flex items-center gap-1 rounded border border-hairline bg-sheet px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-hairline-strong hover:text-ink"
                >
                  <Download className="h-3.5 w-3.5" /> JSON
                </button>
              </div>
            </div>

            <div className="flex items-start gap-4">
              {firstCover && (
                <Image
                  src={firstCover}
                  alt={playlist.title}
                  width={76}
                  height={104}
                  unoptimized
                  className="hidden h-[104px] w-[76px] shrink-0 rounded-sm border border-hairline object-cover sm:block"
                />
              )}
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={playlist.title}
                  onChange={(e) =>
                    onUpdatePlaylist({ ...playlist, title: e.target.value })
                  }
                  aria-label="플레이리스트 제목"
                  className="font-display w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-2xl font-bold text-ink transition hover:border-hairline focus:border-cobalt focus:bg-sheet-muted focus:outline-none"
                />
                <input
                  type="text"
                  value={playlist.description}
                  onChange={(e) =>
                    onUpdatePlaylist({
                      ...playlist,
                      description: e.target.value,
                    })
                  }
                  aria-label="플레이리스트 설명"
                  className="mt-1 w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted transition hover:border-hairline focus:border-cobalt focus:bg-sheet-muted focus:outline-none"
                />
                <p className="mt-3 border-l-2 border-ink pl-3 text-xs leading-relaxed text-ink-soft">
                  {playlist.curatorSummary}
                </p>
              </div>
            </div>

            {/* Platform Save Bar (YouTube Music First) */}
            <div
              className={`mt-5 border-t border-hairline pt-4 ${
                showSpotify
                  ? "grid grid-cols-1 gap-3 md:grid-cols-2"
                  : "space-y-2"
              }`}
            >
              {/* YouTube Music Save */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline bg-sheet-muted p-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-obi" />
                  <span className="text-xs font-semibold text-ink">
                    YouTube Music
                  </span>
                  <select
                    value={ytPrivacy}
                    onChange={(e) =>
                      setYtPrivacy(
                        e.target.value as "private" | "unlisted" | "public"
                      )
                    }
                    aria-label="YouTube 공개 설정"
                    className="rounded border border-hairline-strong bg-sheet px-1.5 py-0.5 text-[11px] text-ink-soft"
                  >
                    <option value="private">비공개</option>
                    <option value="unlisted">일부 공개</option>
                    <option value="public">공개</option>
                  </select>
                </div>

                {authStatus?.youtubeConnected ? (
                  <button
                    type="button"
                    disabled={
                      exportingPlatform !== null || playlist.tracks.length === 0
                    }
                    onClick={() => handleExport("youtube")}
                    className="inline-flex items-center gap-1.5 rounded bg-obi px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                  >
                    {exportingPlatform === "youtube" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      <>YouTube Music에 저장</>
                    )}
                  </button>
                ) : authStatus?.youtubeConfigured ? (
                  <a
                    href="/api/auth/youtube/login"
                    className="inline-flex items-center rounded border border-obi/35 bg-sheet px-3 py-1.5 text-xs font-semibold text-obi-ink transition hover:bg-obi-soft"
                  >
                    Google 로그인
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenSetup}
                    className="rounded border border-hairline-strong bg-sheet px-2.5 py-1 text-[11px] font-medium text-muted hover:text-ink"
                  >
                    연동 설정 필요
                  </button>
                )}
              </div>

              {/* Spotify Save (full box only when connected; subtle link otherwise) */}
              {showSpotify ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline bg-sheet-muted p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs font-semibold text-ink">
                      Spotify
                    </span>
                    <select
                      value={spPublic ? "public" : "private"}
                      onChange={(e) => setSpPublic(e.target.value === "public")}
                      aria-label="Spotify 공개 설정"
                      className="rounded border border-hairline-strong bg-sheet px-1.5 py-0.5 text-[11px] text-ink-soft"
                    >
                      <option value="private">비공개</option>
                      <option value="public">공개</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={
                      exportingPlatform !== null || playlist.tracks.length === 0
                    }
                    onClick={() => handleExport("spotify")}
                    className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {exportingPlatform === "spotify" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      <>계정에 저장</>
                    )}
                  </button>
                </div>
              ) : authStatus?.spotifyConfigured ? (
                <div className="flex justify-end">
                  <a
                    href="/api/auth/spotify/login"
                    className="text-[11px] font-medium text-muted hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
                  >
                    Spotify 계정도 함께 연결하기
                  </a>
                </div>
              ) : null}
            </div>

            {exportError && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-200">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{exportError}</span>
              </div>
            )}

            {exportResult && (
              <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    {exportResult.platform === "youtube"
                      ? "YouTube Music"
                      : "Spotify"}
                    에 {exportResult.addedCount} / {exportResult.totalCount}곡이 저장되었습니다
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={exportResult.playlistUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded bg-ink px-3 py-1 text-xs font-semibold text-sheet hover:opacity-90"
                    >
                      {exportResult.platform === "youtube"
                        ? "YouTube Music 열기"
                        : "Spotify 열기"}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {exportResult.secondaryUrl && (
                      <a
                        href={exportResult.secondaryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-hairline-strong bg-sheet px-2.5 py-1 text-xs font-medium text-ink-soft hover:text-ink"
                      >
                        YouTube 열기 <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>

                {exportResult.results.some((r) => r.status !== "added") && (
                  <div className="mt-2.5 space-y-1 border-t border-emerald-500/20 pt-2 text-[11px] text-ink-soft">
                    <div className="font-semibold text-amber-700 dark:text-amber-300">
                      찾지 못한 트랙 (
                      {exportResult.totalCount - exportResult.addedCount}곡)
                    </div>
                    {exportResult.results
                      .filter((r) => r.status !== "added")
                      .map((r) => (
                        <div key={r.trackId}>
                          • {r.title} ({r.artist}) — {r.reason}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Sequential Web Player */}
      {effectiveActiveTrackId && (
        <PlaylistPlayer
          tracks={playlist.tracks}
          activeTrackId={effectiveActiveTrackId}
          isPlaying={isPlaying}
          repeatAll={repeatAll}
          canResolveYouTube={canResolveYouTube}
          onSelectTrack={(trackId) => setActiveTrackId(trackId)}
          onPlayingChange={setIsPlaying}
          onToggleRepeatAll={() => setRepeatAll((prev) => !prev)}
          onClosePlayer={() => {
            setActiveTrackId(null);
            setIsPlaying(false);
          }}
          onTrackResolved={handleTrackResolved}
          onOpenSetup={onOpenSetup}
        />
      )}

      {/* Unified Tracklist Liner Sheet */}
      <section className="overflow-hidden rounded-lg border border-hairline bg-sheet">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-sheet-muted px-5 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-muted">
            <ListMusic className="h-3.5 w-3.5 text-cobalt" />
            <span>트랙 리스트</span>
            <span className="font-normal">· 드래그/버튼 순서 조정 · 곡 교체 및 아는 곡 등록</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShuffleTracks}
              disabled={playlist.tracks.length < 2}
              title={
                effectiveActiveTrackId
                  ? "재생 중인 곡은 유지하고 나머지 트랙 순서 섞기"
                  : "트랙 순서 랜덤 셔플"
              }
              className="inline-flex items-center gap-1 rounded border border-hairline bg-sheet px-2.5 py-1 text-[11px] font-medium text-ink-soft transition hover:border-hairline-strong hover:text-ink disabled:opacity-40"
            >
              <Shuffle className="h-3 w-3" />
              셔플
            </button>
            {!effectiveActiveTrackId ? (
              <button
                type="button"
                onClick={handlePlayAll}
                disabled={playlist.tracks.length === 0}
                className="inline-flex items-center gap-1.5 rounded bg-obi px-3 py-1 text-[11px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <Play className="h-3 w-3 fill-current" />
                전체 순차 재생 ({playlist.tracks.length}곡)
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded bg-cobalt-soft px-2.5 py-1 text-[11px] font-semibold text-cobalt-ink">
                {isPlaying ? "웹 순차 재생 중" : "플레이어 열림"}
              </span>
            )}
          </div>
        </div>

        {(arcSections.length > 0 || hasKnownMetadata) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-sheet px-5 py-2 text-[11px]">
            {arcSections.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 font-semibold text-muted">셋리 흐름</span>
                {arcSections.map((group, gIdx) => (
                  <span
                    key={`${group.section}-${group.firstTrackId}`}
                    className="inline-flex items-center gap-1"
                  >
                    {gIdx > 0 && (
                      <span className="text-muted/60" aria-hidden="true">
                        →
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById(`track-row-${group.firstTrackId}`)
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          })
                      }
                      className="rounded border border-hairline bg-sheet-muted px-2 py-0.5 font-medium text-ink-soft transition hover:border-cobalt/40 hover:text-cobalt-ink"
                    >
                      {group.section}{" "}
                      <span className="tabular-nums text-muted">
                        {group.count}
                      </span>
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <span />
            )}

            {hasKnownMetadata && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  아는 곡 {knownCount} / {playlist.tracks.length}곡
                </span>
                {knownCount > 0 && (
                  <button
                    type="button"
                    aria-pressed={showOnlyUnknown}
                    onClick={() => setOnlyUnknown((prev) => !prev)}
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold tabular-nums transition ${
                      showOnlyUnknown
                        ? "border-cobalt bg-cobalt text-white"
                        : "border-hairline bg-sheet-muted text-ink-soft hover:border-cobalt/40 hover:text-cobalt-ink"
                    }`}
                    title="내가 아는 곡을 가리고 새로운 곡만 모아보기"
                  >
                    <Filter className="h-2.5 w-2.5" />
                    {showOnlyUnknown
                      ? `전체 보기 (${playlist.tracks.length}곡)`
                      : `모르는 곡만 (${unknownCount}곡)`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {trackActionError && (
          <div className="flex items-center justify-between gap-2 border-b border-red-500/30 bg-red-500/10 px-5 py-2 text-xs text-red-800 dark:text-red-200">
            <div className="flex items-center gap-2">
              <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
              <span>{trackActionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setTrackActionError(null)}
              className="rounded p-0.5 hover:bg-red-500/15"
              aria-label="오류 알림 닫기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <ol className="divide-y divide-hairline">
          {visibleEntries.length === 0 ? (
            <li className="px-5 py-8 text-center text-xs text-muted">
              현재 셋리의 모든 곡이 내 아는 곡 목록에 등록되어 있습니다.{" "}
              <button
                type="button"
                onClick={() => setOnlyUnknown(false)}
                className="font-semibold text-cobalt-ink underline"
              >
                전체 트랙 보기
              </button>
            </li>
          ) : (
            visibleEntries.map(({ track, index: idx }, visibleIdx) => {
              const isCurrent = effectiveActiveTrackId === track.id;
              const playableOnWeb = Boolean(
                track.youtubeVideoId || canResolveYouTube
              );
              const prevSection =
                visibleIdx > 0
                  ? visibleEntries[visibleIdx - 1]?.track.setlistSection
                  : null;
              const showSectionHeader =
                Boolean(track.setlistSection) &&
                track.setlistSection !== prevSection;
              const isRerolling = rerollingTrackId === track.id;
              const isTogglingKnown = togglingKnownTrackId === track.id;
              const isDragTarget =
                !showOnlyUnknown &&
                dragOverIndex === idx &&
                dragIndex !== null &&
                dragIndex !== idx;

              return (
                <li
                  key={track.id}
                  id={`track-row-${track.id}`}
                  draggable={!showOnlyUnknown}
                onDragStart={(e) => {
                  if (showOnlyUnknown) return;
                  setDragIndex(idx);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(idx));
                }}
                onDragOver={(e) => {
                  if (showOnlyUnknown) return;
                  e.preventDefault();
                  if (dragOverIndex !== idx) {
                    setDragOverIndex(idx);
                  }
                }}
                onDrop={(e) => {
                  if (showOnlyUnknown) return;
                  e.preventDefault();
                  if (dragIndex !== null) {
                    reorderTracks(dragIndex, idx);
                  }
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                className={`group transition ${
                  isCurrent
                    ? "border-l-2 border-l-cobalt bg-cobalt-soft/45"
                    : "hover:bg-sheet-muted"
                } ${isDragTarget ? "border-t-2 border-t-cobalt bg-cobalt-soft/20" : ""} ${
                  dragIndex === idx ? "opacity-55" : ""
                }`}
              >
                {showSectionHeader && (
                  <div className="flex items-center gap-2 border-b border-hairline/70 bg-sheet-muted/70 px-4 py-1.5 text-[10px] font-bold tracking-wide text-cobalt-ink sm:px-5">
                    <span className="h-1.5 w-1.5 rounded-full bg-cobalt" />
                    <span>{track.setlistSection}</span>
                  </div>
                )}

                <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
                  {/* Drag Handle, Index & Cover */}
                  <div className="flex items-center gap-2.5">
                    {!showOnlyUnknown && (
                      <span
                        className="hidden cursor-grab text-muted/60 hover:text-ink active:cursor-grabbing sm:inline-flex"
                        title="드래그해서 순서 이동"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                    )}
                    <span
                      className={`w-6 text-right text-xs font-semibold tabular-nums ${
                        isCurrent ? "text-cobalt-ink" : "text-muted"
                      }`}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>

                    {track.coverImage ? (
                      <Image
                        src={track.coverImage}
                        alt={track.animeTitle}
                        width={46}
                        height={62}
                        unoptimized
                        className="h-[62px] w-[46px] shrink-0 rounded-sm border border-hairline object-cover"
                      />
                    ) : (
                      <div className="flex h-[62px] w-[46px] shrink-0 items-center justify-center rounded-sm border border-hairline bg-sheet-muted text-muted">
                        <Disc3 className="h-5 w-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1 sm:hidden">
                      <div className="truncate text-sm font-bold text-ink">
                        {track.title}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {track.artist}
                      </div>
                    </div>
                  </div>

                  {/* Track Body (2-line hierarchy + unified interactive known badge) */}
                  <div className="min-w-0 flex-1">
                    <div className="hidden sm:flex sm:flex-wrap sm:items-baseline sm:gap-2">
                      <h3 className="text-sm font-bold text-ink">
                        {track.title}
                      </h3>
                      {track.titleRomaji &&
                        track.titleRomaji !== track.title && (
                          <span className="text-xs text-muted">
                            {track.titleRomaji}
                          </span>
                        )}
                      <span className="text-xs font-medium text-ink-soft">
                        · {track.artist}
                      </span>
                      {isCurrent && (
                        <span className="rounded bg-cobalt px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {isPlaying ? "재생 중" : "선택됨"}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-cobalt-ink">
                        {track.animeTitle}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${THEME_BADGE_STYLES[track.themeType]}`}
                      >
                        {track.themeLabel}
                      </span>
                      {track.year && (
                        <span className="text-[11px] tabular-nums text-muted">
                          {track.year}
                        </span>
                      )}
                      <span className="text-[11px] text-muted">
                        {track.bpmVibe}
                      </span>
                      <button
                        type="button"
                        disabled={isTogglingKnown}
                        onClick={() => void handleToggleKnown(track)}
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold transition ${
                          track.inUserLibrary
                            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                            : "border-hairline bg-sheet text-muted hover:border-cobalt/40 hover:text-cobalt-ink"
                        } disabled:opacity-50`}
                        title="클릭하여 내 아는 곡 목록에 추가/해제"
                      >
                        {isTogglingKnown ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : track.inUserLibrary ? (
                          <BookmarkCheck className="h-2.5 w-2.5" />
                        ) : (
                          <BookmarkPlus className="h-2.5 w-2.5" />
                        )}
                        {track.inUserLibrary ? "내 아는 곡" : "아는 곡 등록"}
                      </button>
                    </div>

                    <p className="mt-1.5 max-w-[74ch] text-xs leading-relaxed text-ink-soft">
                      {track.reason}
                    </p>
                  </div>

                  {/* Row Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-end">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {playableOnWeb && (
                        <button
                          type="button"
                          onClick={() => setActiveTrackId(track.id)}
                          className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                            isCurrent
                              ? "bg-cobalt text-white"
                              : "bg-ink text-sheet hover:bg-cobalt hover:text-white"
                          }`}
                        >
                          <Play className="h-3 w-3 fill-current" />{" "}
                          {isCurrent && isPlaying ? "재생 중" : "재생"}
                        </button>
                      )}
                      <a
                        href={track.youtubeMusicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-hairline bg-sheet px-2 py-1 text-[11px] font-medium text-ink-soft transition hover:border-obi/50 hover:text-obi-ink"
                      >
                        YT Music <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      {showSpotify && (
                        <a
                          href={track.spotifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-hairline bg-sheet px-2 py-1 text-[11px] font-medium text-ink-soft transition hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400"
                        >
                          Spotify <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1 text-muted sm:opacity-85 sm:group-hover:opacity-100">
                      {onGenerateSpinoff && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpenSpinoffTrackId((prev) =>
                              prev === track.id ? null : track.id
                            )
                          }
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold transition ${
                            openSpinoffTrackId === track.id
                              ? "border-obi bg-obi-soft text-obi-ink"
                              : "border-hairline bg-sheet text-ink-soft hover:border-obi/40 hover:text-obi-ink"
                          }`}
                          title="이 곡의 계보/질감/작품으로 새 셋리 파생 생성"
                        >
                          <Sparkles className="h-3 w-3" />
                          파생 셋리
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isRerolling || extending}
                        onClick={() => void handleRerollTrack(track)}
                        className="inline-flex items-center gap-1 rounded border border-hairline bg-sheet px-2 py-0.5 text-[10px] font-semibold text-ink-soft transition hover:border-cobalt/40 hover:text-cobalt-ink disabled:opacity-50"
                        title="이 곡만 다른 곡으로 교체"
                      >
                        {isRerolling ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        교체
                      </button>

                      {!showOnlyUnknown && (
                        <>
                          <button
                            type="button"
                            onClick={() => moveTrack(idx, -1)}
                            disabled={idx === 0}
                            className="rounded p-1 hover:bg-hairline/60 hover:text-ink disabled:opacity-30"
                            title="위로 이동"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTrack(idx, 1)}
                            disabled={idx === playlist.tracks.length - 1}
                            className="rounded p-1 hover:bg-hairline/60 hover:text-ink disabled:opacity-30"
                            title="아래로 이동"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removeTrack(track.id)}
                        className="rounded p-1 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                        title="트랙 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {openSpinoffTrackId === track.id && onGenerateSpinoff && (
                  <div className="border-t border-hairline/80 bg-sheet-muted px-4 py-2.5 sm:px-5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink">
                        <Sparkles className="h-3.5 w-3.5 text-obi" />
                        「{track.title}」 결로 새 셋리 파생 생성
                      </span>
                      <button
                        type="button"
                        onClick={() => setOpenSpinoffTrackId(null)}
                        className="rounded p-0.5 text-muted hover:text-ink"
                        aria-label="파생 셋리 메뉴 닫기"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      {(
                        [
                          {
                            mode: "lineage" as TrackSpinoffMode,
                            title: "작곡가 · 밴드 계보",
                            desc: `${track.artist} 계보와 편곡 문법`,
                          },
                          {
                            mode: "sonic_clone" as TrackSpinoffMode,
                            title: "BPM · 사운드 질감 클론",
                            desc: `${track.bpmVibe} 텐션 복제`,
                          },
                          {
                            mode: "anime_deep_dive" as TrackSpinoffMode,
                            title: "이 작품 전곡 털기",
                            desc: `${track.animeTitle} OP·ED·OST 스페셜`,
                          },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.mode}
                          type="button"
                          onClick={() => {
                            setOpenSpinoffTrackId(null);
                            onGenerateSpinoff(
                              buildTrackSpinoffRequest(track, opt.mode)
                            );
                          }}
                          className="rounded border border-hairline bg-sheet px-2.5 py-2 text-left transition hover:border-obi/50 hover:bg-obi-soft/40"
                        >
                          <div className="text-[11px] font-semibold text-ink">
                            {opt.title}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-muted">
                            {opt.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })
          )}
        </ol>

        {/* Extend Playlist Footer Bar */}
        <div className="flex flex-col gap-2 border-t border-hairline bg-sheet-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <input
            type="text"
            value={extendInstruction}
            onChange={(e) => setExtendInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!extending && playlist.tracks.length > 0) {
                  void handleExtendPlaylist();
                }
              }
            }}
            placeholder="추가 요청 메모 (선택: 예. 후반부는 좀 더 빠른 템포로 이어줘)"
            className="min-w-0 flex-1 rounded border border-hairline-strong bg-sheet px-3 py-1.5 text-xs text-ink placeholder:text-muted/70 focus:border-cobalt focus:outline-none"
          />
          <button
            type="button"
            disabled={extending || playlist.tracks.length === 0}
            onClick={() => void handleExtendPlaylist()}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded bg-ink px-3.5 py-1.5 text-xs font-semibold text-sheet transition hover:opacity-90 disabled:opacity-50"
          >
            {extending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                5곡 추가 중...
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                비슷한 결로 5곡 더 추가
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
