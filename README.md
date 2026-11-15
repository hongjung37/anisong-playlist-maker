# AniTune — 애니송 전문 AI 플레이리스트 생성기 (MVP)

유튜브 뮤직이나 스포티파이의 일반 추천 알고리즘이 놓치기 쉬운 **애니메이션 음악의 맥락(작품 분위기, OP/ED/극중 삽입곡/OST/캐릭터송 역할, 작곡가·밴드 계보, 원어·로마자 이중 표기)**을 기반으로 플레이리스트를 생성하고, 내 **YouTube Music / Spotify 계정에 원클릭으로 실제 플레이리스트를 만들어 주는** Next.js 풀스택 MVP입니다.

## 주요 기능

1. **시드 + 조건 기반 애니송 AI 큐레이션 (`/api/playlist/generate`)**
   - **AniList GraphQL 연동 (`/api/anime/search`)**: API 키 없이 작품 자동완성 검색 및 커버 아트·방영 연도 매칭.
   - **Gemini API (`gemini-3.8-flash`, `@google/genai` Interactions API)**: 시드 작품/아티스트, 무드 태그, 곡 유형(`OP`, `ED`, `INSERT`, `OST`, `CHARACTER`), 연대, 숨은 명곡 비중 옵션, 자연어 추가 요청을 조합해 JSON 구조화 선곡.
   - **이중 표기 출력**: 원어 곡명/아티스트명 + 로마자 표기 + 한국어/일본어/로마자 작품명을 함께 생성해 스트리밍 플랫폼 검색 정확도를 높입니다.
   - **데모 폴백 지원**: `GEMINI_API_KEY`가 없는 상태에서도 UI와 필터링 흐름을 바로 체험할 수 있는 내장 큐레이션 폴백을 제공합니다.

2. **YouTube / YouTube Music & Spotify OAuth 자동 생성**
   - **YouTube (`/api/auth/youtube/*`, `/api/export/youtube`)**: Google OAuth 2.0 로그인 후 YouTube Data API v3로 트랙을 매칭하고 비공개/일부공개/공개 플레이리스트를 생성합니다 (`music.youtube.com/playlist?list=...` 링크 즉시 반환).
   - **Spotify (`/api/auth/spotify/*`, `/api/export/spotify`)**: Spotify OAuth 2.0 로그인 후 노래방/커버곡 노이즈를 제외한 스코어링 검색으로 공식 음원을 매칭하고 플레이리스트를 생성합니다. 매칭 실패 곡(지역 제한·미발매 등)은 리포트로 별도 표시합니다.

3. **트랙 편집 · 인앱 미리듣기 · 내보내기**
   - 생성된 플레이리스트 제목/설명 수정, 트랙 순서 변경 및 삭제.
   - `YOUTUBE_API_KEY` 또는 YouTube 로그인 상태에서는 앱 내 YouTube IFrame 미리듣기 지원.
   - 텍스트 복사, `.m3u8`, `.json` 파일 다운로드 지원.

## 시작하기

### 1. 패키지 설치 및 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속하세요.

### 2. 환경 변수 설정 (`.env.local`)

`.env.example`을 참고해 필요한 키를 채우세요.

- `GEMINI_API_KEY`: [Google AI Studio](https://aistudio.google.com/apikey)에서 발급
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google Cloud Console → YouTube Data API v3 활성화 → OAuth 2.0 클라이언트 ID 생성
  - 승인된 리디렉션 URI: `http://localhost:3000/api/auth/youtube/callback`
- `YOUTUBE_API_KEY` (선택): 로그인 전에도 인앱 미리듣기 영상 ID를 매칭하고 싶을 때 설정
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`: [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)에서 앱 생성
  - Redirect URI: `http://localhost:3000/api/auth/spotify/callback` (또는 Spotify 정책상 `127.0.0.1`이 필요한 경우 `http://127.0.0.1:3000/api/auth/spotify/callback` 등록 후 `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000` 설정)
- `AUTH_COOKIE_SECRET`: OAuth 세션 쿠키 AES-256-GCM 암호화용 임의 문자열
