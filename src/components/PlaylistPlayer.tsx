"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Tv,
  X,
} from "lucide-react";
import type { PlaylistTrack } from "@/types/playlist";

interface YTPlayerInstance {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      height?: string | number;
      width?: string | number;
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayerInstance;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Browser only"));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      if (window.YT) {
        resolve(window.YT);
      } else {
        reject(new Error("YouTube IFrame API failed to initialize"));
      }
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        ytApiPromise = null;
        reject(new Error("Failed to load YouTube IFrame API"));
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

interface PlaylistPlayerProps {
  tracks: PlaylistTrack[];
  activeTrackId: string;
  isPlaying: boolean;
  repeatAll: boolean;
  canResolveYouTube: boolean;
  onSelectTrack: (trackId: string) => void;
  onPlayingChange: (playing: boolean) => void;
  onToggleRepeatAll: () => void;
  onClosePlayer: () => void;
  onTrackResolved: (
    trackId: string,
    patch: Pick<
      PlaylistTrack,
      "youtubeVideoId" | "youtubeCandidateIds" | "youtubeUrl" | "youtubeMusicUrl"
    >
  ) => void;
  onOpenSetup: () => void;
}

export function PlaylistPlayer({
  tracks,
  activeTrackId,
  isPlaying,
  repeatAll,
  canResolveYouTube,
  onSelectTrack,
  onPlayingChange,
  onToggleRepeatAll,
  onClosePlayer,
  onTrackResolved,
  onOpenSetup,
}: PlaylistPlayerProps) {
  const activeIndex = tracks.findIndex((t) => t.id === activeTrackId);
  const currentTrack = activeIndex >= 0 ? tracks[activeIndex] : tracks[0];
  const nextTrack =
    tracks.length > 0 && activeIndex >= 0
      ? activeIndex + 1 < tracks.length
        ? tracks[activeIndex + 1]
        : repeatAll
          ? tracks[0]
          : null
      : null;

  const hostWrapperRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const playerReadyRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);

  const failedVideoIdsRef = useRef<Set<string>>(new Set());
  const retriedTrackIdsRef = useRef<Set<string>>(new Set());
  const resolvedAttemptedIdsRef = useRef<Set<string>>(new Set());
  const consecutiveSkipsRef = useRef(0);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const [resolving, setResolving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const tracksRef = useRef(tracks);
  const currentTrackRef = useRef(currentTrack);
  const repeatAllRef = useRef(repeatAll);
  const canResolveRef = useRef(canResolveYouTube);
  const onSelectTrackRef = useRef(onSelectTrack);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onTrackResolvedRef = useRef(onTrackResolved);

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  const stepToAdjacent = useCallback(
    (delta: -1 | 1, reason: "user" | "ended" | "skip") => {
      clearAutoAdvanceTimer();
      const list = tracksRef.current;
      const cur = currentTrackRef.current;
      if (!cur || list.length === 0) return;

      const idx = list.findIndex((t) => t.id === cur.id);
      if (idx < 0) return;

      if (reason === "user") {
        consecutiveSkipsRef.current = 0;
        setNotice(null);
      }

      const candidateIdx = idx + delta;
      if (candidateIdx >= 0 && candidateIdx < list.length) {
        onSelectTrackRef.current(list[candidateIdx].id);
        return;
      }

      if (delta === 1 && candidateIdx >= list.length) {
        if (repeatAllRef.current && list.length > 0) {
          onSelectTrackRef.current(list[0].id);
        } else {
          onPlayingChangeRef.current(false);
          setNotice("마지막 곡까지 재생을 완료했습니다.");
        }
      }
    },
    [clearAutoAdvanceTimer]
  );

  const scheduleSkipToNext = useCallback(
    (
      message: string,
      allFailedMessage: string,
      delayMs = 1100
    ) => {
      consecutiveSkipsRef.current += 1;
      if (consecutiveSkipsRef.current >= tracksRef.current.length) {
        onPlayingChangeRef.current(false);
        setNotice(allFailedMessage);
        return;
      }

      setNotice(message);
      clearAutoAdvanceTimer();
      autoAdvanceTimerRef.current = setTimeout(() => {
        stepToAdjacent(1, "skip");
      }, delayMs);
    },
    [clearAutoAdvanceTimer, stepToAdjacent]
  );

  const resolveSingleTrack = useCallback(
    async (
      track: PlaylistTrack,
      excludeIds: string[]
    ): Promise<{ videoId: PlaylistTrack["youtubeVideoId"]; error?: string }> => {
      setResolving(true);
      try {
        const res = await fetch("/api/youtube/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tracks: [track],
            excludeVideoIds: excludeIds,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          resolved?: Record<
            string,
            {
              youtubeVideoId: string;
              youtubeCandidateIds?: string[];
              youtubeUrl: string;
              youtubeMusicUrl: string;
            }
          >;
        };
        if (!res.ok) {
          return { videoId: null, error: data.error };
        }
        const match = data.resolved?.[track.id];
        if (match?.youtubeVideoId) {
          onTrackResolvedRef.current(track.id, match);
          return { videoId: match.youtubeVideoId };
        }
        return { videoId: null };
      } catch {
        return { videoId: null };
      } finally {
        setResolving(false);
      }
    },
    []
  );

  const handlePlayerStateChange = useCallback(
    (state: number) => {
      const ytState = window.YT?.PlayerState;
      if (!ytState) return;
      if (state === ytState.PLAYING) {
        consecutiveSkipsRef.current = 0;
        setNotice(null);
        onPlayingChangeRef.current(true);
      } else if (state === ytState.PAUSED) {
        onPlayingChangeRef.current(false);
      } else if (state === ytState.ENDED) {
        consecutiveSkipsRef.current = 0;
        stepToAdjacent(1, "ended");
      }
    },
    [stepToAdjacent]
  );

  const handlePlayerError = useCallback(async () => {
    const cur = currentTrackRef.current;
    if (!cur) return;

    if (cur.youtubeVideoId) {
      failedVideoIdsRef.current.add(cur.youtubeVideoId);
    }

    // 1. Try next pre-fetched embeddable candidate locally (0 extra API quota)
    const nextLocalCandidate = cur.youtubeCandidateIds?.find(
      (id) => !failedVideoIdsRef.current.has(id)
    );
    if (nextLocalCandidate) {
      setNotice("외부 재생이 제한되어 다른 후보 영상으로 전환 중...");
      onTrackResolvedRef.current(cur.id, {
        youtubeVideoId: nextLocalCandidate,
        youtubeCandidateIds: cur.youtubeCandidateIds,
        youtubeUrl: `https://www.youtube.com/watch?v=${nextLocalCandidate}`,
        youtubeMusicUrl: `https://music.youtube.com/watch?v=${nextLocalCandidate}`,
      });
      return;
    }

    // 2. Fallback: query server once with all failed video IDs excluded
    let resolveError: string | undefined;
    if (canResolveRef.current && !retriedTrackIdsRef.current.has(cur.id)) {
      retriedTrackIdsRef.current.add(cur.id);
      setNotice("외부 재생이 제한된 영상이라 대체 영상을 찾는 중...");
      const result = await resolveSingleTrack(
        cur,
        Array.from(failedVideoIdsRef.current)
      );
      resolveError = result.error;
      if (result.videoId && currentTrackRef.current?.id === cur.id) {
        setNotice(null);
        return;
      }
    }

    scheduleSkipToNext(
      resolveError
        ? `${resolveError} 다음 곡으로 이동합니다.`
        : `"${cur.title}" 영상은 외부 재생이 제한되어 다음 곡으로 이동합니다.`,
      resolveError ||
        "현재 재생 가능한 임베드 영상이 없어 대기 중입니다. 각 트랙의 YT Music 버튼으로 들을 수 있습니다."
    );
  }, [resolveSingleTrack, scheduleSkipToNext]);

  const handlePlayerStateChangeRef = useRef(handlePlayerStateChange);
  const handlePlayerErrorRef = useRef(handlePlayerError);

  useEffect(() => {
    tracksRef.current = tracks;
    currentTrackRef.current = currentTrack;
    repeatAllRef.current = repeatAll;
    canResolveRef.current = canResolveYouTube;
    onSelectTrackRef.current = onSelectTrack;
    onPlayingChangeRef.current = onPlayingChange;
    onTrackResolvedRef.current = onTrackResolved;
    handlePlayerStateChangeRef.current = handlePlayerStateChange;
    handlePlayerErrorRef.current = handlePlayerError;
  }, [
    canResolveYouTube,
    currentTrack,
    handlePlayerError,
    handlePlayerStateChange,
    onPlayingChange,
    onSelectTrack,
    onTrackResolved,
    repeatAll,
    tracks,
  ]);

  const activeTrackKey = currentTrack?.id ?? null;
  const currentVideoId = currentTrack?.youtubeVideoId ?? null;

  // Clear pending skip timer only when the active track changes
  useEffect(() => {
    clearAutoAdvanceTimer();
  }, [activeTrackKey, clearAutoAdvanceTimer]);

  // Resolve missing youtubeVideoId on demand when navigating to track #13+ or unresolved track
  useEffect(() => {
    if (!currentTrack || currentTrack.youtubeVideoId) return;

    if (canResolveYouTube && !resolvedAttemptedIdsRef.current.has(currentTrack.id)) {
      const targetTrack = currentTrack;
      const timer = setTimeout(() => {
        if (currentTrackRef.current?.id !== targetTrack.id) return;
        resolvedAttemptedIdsRef.current.add(targetTrack.id);
        void resolveSingleTrack(
          targetTrack,
          Array.from(failedVideoIdsRef.current)
        ).then(({ videoId, error }) => {
          if (!videoId && currentTrackRef.current?.id === targetTrack.id) {
            scheduleSkipToNext(
              error
                ? `${error} 다음 곡으로 넘어갑니다.`
                : `"${targetTrack.title}" 매칭 영상을 찾지 못해 다음 곡으로 넘어갑니다.`,
              error ||
                "재생 가능한 YouTube 영상을 찾지 못했습니다. 트랙의 YT Music 검색 링크를 이용해 주세요."
            );
          }
        });
      }, 0);
      return () => clearTimeout(timer);
    }

    // Already attempted before or cannot resolve while other tracks are playable -> skip cleanly
    const hasAnyPlayable = tracksRef.current.some((t) => Boolean(t.youtubeVideoId));
    if (canResolveYouTube || hasAnyPlayable) {
      const timer = setTimeout(() => {
        if (currentTrackRef.current?.id !== currentTrack.id) return;
        scheduleSkipToNext(
          `"${currentTrack.title}" 재생 가능한 영상이 없어 다음 곡으로 넘어갑니다.`,
          "재생 가능한 YouTube 영상을 찾지 못했습니다. 트랙의 YT Music 검색 링크를 이용해 주세요."
        );
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [
    activeTrackKey,
    canResolveYouTube,
    currentTrack,
    currentVideoId,
    resolveSingleTrack,
    scheduleSkipToNext,
  ]);

  // Initialize YT.Player once on first available videoId, then reuse loadVideoById
  useEffect(() => {
    if (!currentVideoId || !hostWrapperRef.current) return;

    if (playerRef.current && playerReadyRef.current) {
      if (loadedVideoIdRef.current !== currentVideoId) {
        loadedVideoIdRef.current = currentVideoId;
        playerRef.current.loadVideoById(currentVideoId);
      }
      return;
    }

    if (playerRef.current) {
      return;
    }

    let cancelled = false;
    const wrapper = hostWrapperRef.current;

    void loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !wrapper || playerRef.current) return;

        // Isolate child element from React's virtual DOM because YT.Player replaces target with <iframe>
        wrapper.innerHTML = "";
        const targetEl = document.createElement("div");
        wrapper.appendChild(targetEl);

        loadedVideoIdRef.current = currentVideoId;
        playerRef.current = new YT.Player(targetEl, {
          width: "100%",
          height: "100%",
          videoId: currentVideoId,
          playerVars: {
            autoplay: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerReadyRef.current = true;
              const latestId = currentTrackRef.current?.youtubeVideoId;
              if (latestId && latestId !== loadedVideoIdRef.current) {
                loadedVideoIdRef.current = latestId;
                playerRef.current?.loadVideoById(latestId);
              }
            },
            onStateChange: (event) => {
              handlePlayerStateChangeRef.current(event.data);
            },
            onError: () => {
              void handlePlayerErrorRef.current();
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setNotice("YouTube 플레이어를 불러오지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentVideoId]);

  // Destroy player cleanly only when PlaylistPlayer unmounts
  useEffect(() => {
    const wrapper = hostWrapperRef.current;
    return () => {
      clearAutoAdvanceTimer();
      playerReadyRef.current = false;
      loadedVideoIdRef.current = null;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore teardown errors
        }
        playerRef.current = null;
      }
      if (wrapper) {
        wrapper.innerHTML = "";
      }
    };
  }, [clearAutoAdvanceTimer]);

  const handleTogglePlayPause = () => {
    if (!playerRef.current || !playerReadyRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  if (!currentTrack) return null;

  const displayedNotice =
    notice ??
    (!currentVideoId
      ? resolving
        ? `"${currentTrack.title}" 재생 영상을 찾는 중...`
        : !canResolveYouTube
          ? "이 곡의 재생 영상 ID가 없습니다. YouTube 계정을 연결하거나 YOUTUBE_API_KEY를 설정하면 웹에서 바로 이어 듣기가 가능합니다."
          : null
      : null);

  return (
    <section
      aria-label="웹 순차 재생 플레이어"
      className="overflow-hidden rounded-lg border border-hairline-strong bg-[#0B0D13] text-white"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
          <Tv className="h-4 w-4 shrink-0 text-obi" />
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-200">
            {String(activeIndex + 1).padStart(2, "0")} /{" "}
            {String(tracks.length).padStart(2, "0")}
          </span>
          <span className="truncate font-semibold text-white">
            {currentTrack.title}
          </span>
          <span className="hidden truncate text-slate-400 sm:inline">
            — {currentTrack.artist}
          </span>
        </div>

        <button
          type="button"
          onClick={onClosePlayer}
          className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
          닫기
        </button>
      </div>

      {/* Player Deck */}
      <div className="flex flex-col sm:flex-row">
        {/* Video Viewport */}
        <div className="relative aspect-video w-full shrink-0 bg-black sm:w-[360px]">
          <div ref={hostWrapperRef} className="h-full w-full" />
          {!currentVideoId && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 p-4 text-center">
              {resolving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-cobalt" />
                  <span className="text-xs text-slate-300">
                    재생 영상을 찾는 중...
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-400" />
                  <span className="text-xs text-slate-300">
                    {canResolveYouTube
                      ? "임베드 가능한 영상을 준비 중입니다"
                      : "YouTube 연결이 필요합니다"}
                  </span>
                  {!canResolveYouTube && (
                    <button
                      type="button"
                      onClick={onOpenSetup}
                      className="mt-1 rounded bg-cobalt px-2.5 py-1 text-[11px] font-semibold text-white hover:brightness-110"
                    >
                      연결 설정 열기
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Transport & Queue Info */}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-cobalt">
                {currentTrack.animeTitle}
              </span>
              <span className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-slate-300">
                {currentTrack.themeLabel}
              </span>
              {currentTrack.setlistSection && (
                <span className="text-slate-400">
                  · {currentTrack.setlistSection}
                </span>
              )}
            </div>
            <h3 className="mt-1 truncate text-base font-bold text-white">
              {currentTrack.title}
            </h3>
            <p className="truncate text-xs text-slate-300">
              {currentTrack.artist}
            </p>
            <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
              {currentTrack.reason}
            </p>
          </div>

          {displayedNotice && (
            <div className="flex items-center justify-between gap-2 rounded border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-200">
              <span className="truncate">{displayedNotice}</span>
              <a
                href={currentTrack.youtubeMusicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 font-semibold underline hover:text-white"
              >
                YT Music <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            {/* Transport Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => stepToAdjacent(-1, "user")}
                disabled={activeIndex <= 0}
                aria-label="이전 곡"
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/15 disabled:opacity-35"
              >
                <SkipBack className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={handleTogglePlayPause}
                disabled={!currentVideoId}
                className="inline-flex h-8 items-center gap-1.5 rounded bg-obi px-3.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5 fill-current" />
                    일시정지
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    재생
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => stepToAdjacent(1, "user")}
                disabled={activeIndex >= tracks.length - 1 && !repeatAll}
                aria-label="다음 곡"
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/15 disabled:opacity-35"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={onToggleRepeatAll}
                aria-pressed={repeatAll}
                title="전곡 반복"
                className={`inline-flex h-8 items-center gap-1 rounded border px-2.5 text-[11px] font-medium transition ${
                  repeatAll
                    ? "border-cobalt bg-cobalt/20 text-cobalt"
                    : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <Repeat className="h-3.5 w-3.5" />
                반복
              </button>
            </div>

            {/* Up Next */}
            <div className="min-w-0 text-right text-[11px] text-slate-400">
              {nextTrack ? (
                <span className="block truncate">
                  다음 곡:{" "}
                  <strong className="font-medium text-slate-200">
                    {nextTrack.title}
                  </strong>
                </span>
              ) : (
                <span>셋리 마지막 곡</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
