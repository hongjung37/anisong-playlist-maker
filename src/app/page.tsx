"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Disc3,
  KeyRound,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Sun,
  Moon,
  History,
} from "lucide-react";
import { PlaylistBuilder } from "@/components/PlaylistBuilder";
import { PlaylistWorkspace } from "@/components/PlaylistWorkspace";
import { SetupModal } from "@/components/SetupModal";
import { YouTubeQuotaBadge } from "@/components/YouTubeQuotaBadge";
import type {
  AuthStatus,
  CustomPreset,
  GeneratedPlaylist,
  PlaylistGenerateRequest,
  PlaylistHistoryEntry,
  StoredUserData,
  TasteProfile,
  YouTubeQuotaStatus,
} from "@/types/playlist";

const LEGACY_TASTE_KEY = "anitune_taste_profile_v1";
const LEGACY_PLAYLIST_KEY = "anitune_last_playlist_v1";

export default function HomePage() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [youtubeQuota, setYoutubeQuota] = useState<YouTubeQuotaStatus | null>(
    null
  );
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);
  const [playlist, setPlaylist] = useState<GeneratedPlaylist | null>(null);
  const [playlistHistory, setPlaylistHistory] = useState<
    PlaylistHistoryEntry[]
  >([]);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [anilistUsername, setAnilistUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAuthAndUserState = useCallback(async () => {
    try {
      const [authRes, stateRes] = await Promise.all([
        fetch("/api/auth/status", { cache: "no-store" }),
        fetch("/api/user/state", { cache: "no-store" }),
      ]);

      if (authRes.ok) {
        const authData = (await authRes.json()) as AuthStatus;
        setAuthStatus(authData);
        if (authData.youtubeQuota) {
          setYoutubeQuota(authData.youtubeQuota);
        }
      }

      if (stateRes.ok) {
        let userData = (await stateRes.json()) as StoredUserData;

        // One-time migration from legacy browser storage if server store is empty
        if (!userData.tasteProfile) {
          try {
            const legacyRaw = window.localStorage.getItem(LEGACY_TASTE_KEY);
            if (legacyRaw) {
              const legacyProfile = JSON.parse(legacyRaw) as TasteProfile;
              if (legacyProfile?.dna) {
                const migRes = await fetch("/api/user/state", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tasteProfile: legacyProfile }),
                });
                if (migRes.ok) {
                  userData = (await migRes.json()) as StoredUserData;
                }
              }
              window.localStorage.removeItem(LEGACY_TASTE_KEY);
            }
          } catch {
            // Ignore migration errors
          }
        }

        try {
          window.sessionStorage.removeItem(LEGACY_PLAYLIST_KEY);
        } catch {
          // Ignore cleanup errors
        }

        setTasteProfile(userData.tasteProfile);
        setPlaylist(userData.lastPlaylist);
        setPlaylistHistory(userData.playlistHistory ?? []);
        setCustomPresets(userData.customPresets ?? []);
        setAnilistUsername(userData.anilistUsername ?? null);
      }
    } catch {
      // Ignore transient network errors
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function hydrateClientState() {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("connected");
      const authError = params.get("auth_error");
      if (active) {
        if (connected === "youtube") {
          setBanner({
            type: "ok",
            text: "YouTube 계정이 연결되었습니다. 내 플리를 불러오거나 완성된 셋리를 바로 저장할 수 있습니다.",
          });
        } else if (connected === "spotify") {
          setBanner({
            type: "ok",
            text: "Spotify 계정이 연결되었습니다. 이제 완성된 셋리를 바로 저장할 수 있습니다.",
          });
        } else if (authError) {
          setBanner({
            type: "err",
            text: `계정 연결 중 오류가 발생했습니다 (${authError}). 연동 설정 안내를 확인해 주세요.`,
          });
        }
      }

      if (connected || authError) {
        window.history.replaceState({}, "", "/");
      }

      if (active) {
        await fetchAuthAndUserState();
      }
    }

    void hydrateClientState();

    const refreshQuota = async () => {
      try {
        const res = await fetch("/api/youtube/quota", { cache: "no-store" });
        if (res.ok && active) {
          const data = (await res.json()) as YouTubeQuotaStatus;
          setYoutubeQuota(data);
        }
      } catch {
        // Ignore transient errors
      }
    };
    window.addEventListener("anitune:quota-updated", refreshQuota);

    return () => {
      active = false;
      window.removeEventListener("anitune:quota-updated", refreshQuota);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [fetchAuthAndUserState]);

  const toggleTheme = () => {
    const root = document.documentElement;
    const isDark = root.classList.toggle("dark");
    try {
      localStorage.setItem("anitune_theme", isDark ? "dark" : "light");
    } catch {
      // Ignore storage errors
    }
  };

  const updatePlaylist = (next: GeneratedPlaylist | null) => {
    setPlaylist(next);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        await fetch("/api/user/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastPlaylist: next }),
        });
      } catch {
        // Ignore background sync errors
      }
    }, 350);
  };

  const handleUpdateCustomPresets = async (next: CustomPreset[]) => {
    setCustomPresets(next);
    try {
      await fetch("/api/user/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPresets: next }),
      });
    } catch {
      // Ignore background sync errors
    }
  };

  const handleGenerate = async (request: PlaylistGenerateRequest) => {
    setLoading(true);
    setError(null);
    setBanner(null);

    try {
      const res = await fetch("/api/playlist/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "플레이리스트 생성에 실패했습니다.");
      }

      const { playlistHistory: updatedHistory, ...generated } = data as GeneratedPlaylist & {
        playlistHistory?: PlaylistHistoryEntry[];
      };
      setPlaylist(generated);
      if (Array.isArray(updatedHistory)) {
        setPlaylistHistory(updatedHistory);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "요청 처리 중 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
      window.dispatchEvent(new Event("anitune:quota-updated"));
    }
  };

  const handleLogout = async (provider: "youtube" | "spotify") => {
    await fetch(`/api/auth/${provider}/logout`, { method: "POST" });
    await fetchAuthAndUserState();
  };

  return (
    <div className="min-h-screen">
      {/* Studio Top Bar */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-sheet/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-ink text-sheet">
              <Disc3 className="h-4 w-4" />
            </div>
            <div className="flex items-baseline gap-2.5">
              <h1 className="font-display text-lg font-bold tracking-tight text-ink">
                AniTune
              </h1>
              <span className="hidden text-xs text-muted sm:inline">
                애니송 셋리 큐레이션 스튜디오
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* YouTube Quota Indicator */}
            <YouTubeQuotaBadge
              quota={youtubeQuota}
              onUpdateQuota={setYoutubeQuota}
            />

            {/* YouTube Account */}
            {authStatus?.youtubeConnected ? (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-sheet-muted px-2.5 py-1 text-xs font-medium text-ink">
                <span className="h-2 w-2 rounded-full bg-obi" />
                <span>{authStatus.youtubeChannelName}</span>
                <button
                  type="button"
                  onClick={() => handleLogout("youtube")}
                  className="ml-0.5 rounded p-0.5 text-muted hover:bg-hairline hover:text-ink"
                  title="YouTube 연결 해제"
                >
                  <LogOut className="h-3 w-3" />
                </button>
              </div>
            ) : authStatus?.youtubeConfigured ? (
              <a
                href="/api/auth/youtube/login"
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-sheet px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-obi/50 hover:text-obi-ink"
              >
                <span className="h-2 w-2 rounded-full bg-obi" />
                YouTube 연결
              </a>
            ) : null}

            {/* Spotify Account */}
            {authStatus?.spotifyConnected ? (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-sheet-muted px-2.5 py-1 text-xs font-medium text-ink">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>{authStatus.spotifyDisplayName}</span>
                <button
                  type="button"
                  onClick={() => handleLogout("spotify")}
                  className="ml-0.5 rounded p-0.5 text-muted hover:bg-hairline hover:text-ink"
                  title="Spotify 연결 해제"
                >
                  <LogOut className="h-3 w-3" />
                </button>
              </div>
            ) : authStatus?.spotifyConfigured ? (
              <a
                href="/api/auth/spotify/login"
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-sheet px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Spotify 연결
              </a>
            ) : null}

            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-sheet px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sheet-muted"
            >
              <KeyRound className="h-3.5 w-3.5 text-cobalt" />
              연동 설정
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-sheet px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sheet-muted focus-visible:outline-2 focus-visible:outline-cobalt"
              title="다크 / 라이트 모드 전환"
              aria-label="다크 / 라이트 모드 전환"
            >
              <Moon className="h-3.5 w-3.5 dark:hidden" />
              <Sun className="hidden h-3.5 w-3.5 text-amber-400 dark:inline" />
              <span className="dark:hidden">다크</span>
              <span className="hidden dark:inline">라이트</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Two-Column Workbench */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {banner && (
          <div
            className={`mb-5 flex items-center justify-between gap-3 rounded-md border px-4 py-2.5 text-xs ${
              banner.type === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === "ok" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="font-medium text-muted hover:text-ink"
            >
              닫기
            </button>
          </div>
        )}

        {error && (
          <div className="mb-5 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-800 dark:text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 xl:col-span-4">
            <PlaylistBuilder
              loading={loading}
              authStatus={authStatus}
              tasteProfile={tasteProfile}
              playlistHistory={playlistHistory}
              customPresets={customPresets}
              initialAnilistUsername={anilistUsername}
              onChangeTasteProfile={setTasteProfile}
              onChangeCustomPresets={handleUpdateCustomPresets}
              onGenerate={handleGenerate}
            />
          </div>

          <div className="space-y-4 lg:col-span-7 xl:col-span-8">
            {playlistHistory.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-sheet px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <History className="h-3.5 w-3.5 text-cobalt" />
                  최근 생성 셋리
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {playlistHistory.slice(0, 5).map((entry) => {
                    const active = playlist?.title === entry.title;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => updatePlaylist(entry.playlist)}
                        className={`max-w-[190px] truncate rounded border px-2 py-1 text-[11px] font-medium transition ${
                          active
                            ? "border-cobalt bg-cobalt-soft text-cobalt-ink"
                            : "border-hairline bg-sheet-muted text-ink-soft hover:border-hairline-strong hover:text-ink"
                        }`}
                        title={`${entry.title} (${entry.trackCount}곡)`}
                      >
                        {entry.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <PlaylistWorkspace
              playlist={playlist}
              loading={loading}
              authStatus={authStatus}
              onUpdatePlaylist={updatePlaylist}
              onOpenSetup={() => setSetupOpen(true)}
            />
          </div>
        </div>
      </main>

      <SetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        authStatus={authStatus}
      />
    </div>
  );
}
