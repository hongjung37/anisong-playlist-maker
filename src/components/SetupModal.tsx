"use client";

import { CheckCircle2, KeyRound, X, AlertCircle, ExternalLink } from "lucide-react";
import type { AuthStatus } from "@/types/playlist";

interface SetupModalProps {
  open: boolean;
  onClose: () => void;
  authStatus: AuthStatus | null;
}

export function SetupModal({ open, onClose, authStatus }: SetupModalProps) {
  if (!open) return null;

  const origin = authStatus?.appUrl || "http://localhost:3000";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-modal-title"
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-hairline bg-sheet p-6 text-ink shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1.5 text-muted transition hover:bg-sheet-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-cobalt"
          aria-label="닫기"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center gap-3 border-b border-hairline pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cobalt-soft text-cobalt-ink">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 id="setup-modal-title" className="text-lg font-bold text-ink">
              연동 및 API 키 설정 안내
            </h2>
            <p className="text-xs text-muted">
              프로젝트 루트의{" "}
              <code className="rounded bg-sheet-muted px-1.5 py-0.5 text-ink">
                .env.local
              </code>{" "}
              파일에 키를 입력한 뒤 서버를 재시작하면 활성화됩니다.
            </p>
          </div>
        </div>

        <div className="divide-y divide-hairline">
          {/* Gemini */}
          <div className="py-4 first:pt-0">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                AI 선곡 엔진 (Gemini API)
              </span>
              {authStatus?.geminiConfigured ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 연결됨
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <AlertCircle className="h-3.5 w-3.5" /> 미설정 (샘플 모드 동작 중)
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Google AI Studio에서 발급한 키를{" "}
              <code className="rounded bg-sheet-muted px-1.5 py-0.5 text-ink">
                GEMINI_API_KEY
              </code>
              에 입력하면 시드 작품과 조건에 맞춘 실시간 AI 큐레이션이 동작합니다.
            </p>
          </div>

          {/* YouTube */}
          <div className="py-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                YouTube / YouTube Music 계정 저장
              </span>
              {authStatus?.youtubeConfigured ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> OAuth 준비됨
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-sheet-muted px-2 py-0.5 text-xs font-medium text-muted">
                  미설정
                </span>
              )}
            </div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-muted">
              <li>
                • Google Cloud Console에서 <strong className="text-ink-soft">YouTube Data API v3</strong>를 사용 설정하고{" "}
                <strong className="text-ink-soft">OAuth 2.0 클라이언트 ID (웹 애플리케이션)</strong>를 생성하세요.
              </li>
              <li>
                • 승인된 리디렉션 URI 등록:
                <code className="mt-1 block rounded border border-hairline bg-sheet-muted px-2.5 py-1.5 text-[11px] text-ink">
                  {origin}/api/auth/youtube/callback
                </code>
              </li>
              <li>
                • 앱이 테스트 중 상태라면 <strong className="text-ink-soft">대상(Audience) → 테스트 사용자</strong>에 본인 Gmail을 추가해야 403 오류가 나지 않습니다.
              </li>
              <li>
                • <code className="text-ink">GOOGLE_CLIENT_ID</code>,{" "}
                <code className="text-ink">GOOGLE_CLIENT_SECRET</code> (및 선택적으로{" "}
                <code className="text-ink">YOUTUBE_API_KEY</code>)를 저장하세요.
              </li>
            </ul>
          </div>

          {/* Spotify */}
          <div className="py-4 last:pb-0">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                Spotify 계정 저장
              </span>
              {authStatus?.spotifyConfigured ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> OAuth 준비됨
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-sheet-muted px-2 py-0.5 text-xs font-medium text-muted">
                  미설정
                </span>
              )}
            </div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-muted">
              <li>
                • Spotify Developer Dashboard에서 앱을 만들고 Redirect URI를 등록하세요:
                <code className="mt-1 block rounded border border-hairline bg-sheet-muted px-2.5 py-1.5 text-[11px] text-ink">
                  {origin}/api/auth/spotify/callback
                </code>
              </li>
              <li>
                • <code className="text-ink">127.0.0.1</code> 주소를 요구하는 경우{" "}
                <code className="text-ink">NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000</code>으로 맞추고 해당 주소로 접속하세요.
              </li>
              <li>
                • <code className="text-ink">SPOTIFY_CLIENT_ID</code>,{" "}
                <code className="text-ink">SPOTIFY_CLIENT_SECRET</code>를 입력하세요.
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-hairline pt-4 text-xs text-muted">
          <span>작품 검색과 커버 아트는 별도 키 없이 자동으로 불러옵니다.</span>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-cobalt-ink hover:underline"
          >
            Google AI Studio 열기 <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
