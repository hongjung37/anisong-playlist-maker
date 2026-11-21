# AniTune — 애니송 전문 AI 플레이리스트 생성기

유튜브 뮤직이나 스포티파이의 일반 추천 알고리즘이 놓치기 쉬운 **애니메이션 음악의 맥락(작품 분위기, OP/ED/극중 삽입곡/OST/캐릭터송 역할, 작곡가·밴드 계보, 원어·로마자 이중 표기)**을 기반으로 셋리를 생성하고, **앱 내 웹 플레이어 순차 재생** 및 **YouTube Music / Spotify 계정 원클릭 저장**까지 한 번에 처리하는 Next.js 풀스택 애플리케이션입니다.

---

## 주요 기능

### 1. 시드 · 조건 기반 애니송 AI 큐레이션 (`/api/playlist/generate`)
- **AniList GraphQL 연동 (`/api/anime/search`)**: 별도 API 키 없이 작품 자동완성 검색, 커버 아트 및 방영 연도 메타데이터 매칭.
- **Gemini API 기반 구조화 선곡 (`gemini-3.8-flash`, `@google/genai`)**:
  - **시드 작품/아티스트**(최대 6개), **무드 태그**, **장르/사운드 칩**(10종), **곡 유형**(`OP`, `ED`, `INSERT`, `OST`, `CHARACTER`), **시대 필터**(`ALL`, `2020s`, `2010s`, `2000s`, `classic`), **곡 수**(5~25곡), **프리셋**, **자연어 추가 요청**을 조합해 JSON 스키마 기반으로 선곡.
  - **4단계 인기도/마이너리티 슬라이더**: `메가히트` → `대중+명곡` → `숨은 명곡` → `코어 선곡(딥컷)`까지 선곡 스펙트럼 조절.
  - **최근 생성 곡 제외 옵션**: 직전 생성 히스토리(최대 10턴)에 등장한 곡을 제외하고 새로운 트랙 위주로 큐레이션.
- **이중 표기 및 셋리 아크 출력**: 원어 곡명/아티스트명 + 로마자 표기 + 한국어/일본어/로마자 작품명, `setlistSection`(오프닝·빌드업·피크·앵콜 등), BPM/사운드 태그, 선곡 이유를 함께 제공해 스트리밍 플랫폼 검색 정확도를 높입니다.
- **데모 폴백 지원**: `GEMINI_API_KEY`가 없는 환경에서도 UI와 필터링, 선곡 흐름을 바로 체험할 수 있는 내장 큐레이션 폴백을 제공합니다.

### 2. 내 라이브러리 기반 취향 DNA 분석 & 아는 곡 비중 조절 (`/api/youtube/library`, `/api/taste/profile`)
- **YouTube 라이브러리 수집 & 취향 DNA 추출**: YouTube 로그인 후 내 재생목록 및 좋아요 목록(최대 10개 소스, 최대 150곡)을 불러와 `gemini-3.8-flash`로 사운드 특성·선호 아티스트·선호 연대·추천 시드를 요약한 **취향 DNA**를 생성합니다.
- **취향 DNA 반영 토글**: 플레이리스트 생성 시 분석된 취향 DNA를 프롬프트에 반영할지 켜고 끌 수 있습니다.
- **5단계 아는 곡 비중(Familiarity Level)**:
  - `0% (전부 새로움)` — 내 라이브러리 곡을 제외한 100% 신규 선곡
  - `25% (발굴 위주)` — 아는 곡을 셋리 앵커로만 소수 배치
  - `50% (황금 밸런스)` — 애청곡과 결이 맞는 신곡을 절반씩 교차
  - `75% (애청곡 중심)` — 내 애청곡을 라이브 셋리 흐름대로 재배치
  - `100% (내 곡만)` — 내 라이브러리/캐시 보유 곡만으로 셋리 구성

### 3. 인앱 순차 재생 웹 플레이어 & YouTube 캐시 · 쿼터 관리 (`/api/youtube/resolve`, `/api/youtube/quota`)
- **YouTube IFrame 순차 플레이어 (`PlaylistPlayer`)**: 전체 순차 재생, 전체 반복, 이전/다음 곡 이동, 재생 시점 온디맨드 영상 매칭 및 다음 곡 백그라운드 프리페치(prefetch) 지원.
- **스튜디오 원곡 필터링 & 임베드 폴백**: 노래방·커버·나이트코어·내구성/메들리 등을 제외하고 공식/스튜디오 음원을 우선 매칭하며, 외부 임베드 제한이나 지역 제한 발생 시 사전 확보된 후보 영상(`youtubeCandidateIds`) 또는 서버 재조회로 자동 전환합니다.
- **영속 영상 캐시 (`.data/youtube-cache.json`)**: 한 번 매칭된 트랙의 YouTube 영상 ID와 사용자 보유 곡 여부를 로컬에 캐시해 재조회 시 API 쿼터 소모를 줄입니다.
- **YouTube API 일일 쿼터 추적 배지 (`YouTubeQuotaBadge`)**: 일일 한도(10,000 units, PT 자정 / KST 기준 초기화 시간 안내) 대비 추정 잔여량, 캐시 히트 수, 수동 잔여량 보정(`PATCH /api/youtube/quota`)을 헤더에서 바로 확인할 수 있습니다.

### 4. YouTube Music & Spotify OAuth 원클릭 플레이리스트 저장
- **YouTube (`/api/auth/youtube/*`, `/api/export/youtube`)**: Google OAuth 2.0 로그인 후 YouTube Data API v3로 트랙을 매칭하고 비공개/일부공개/공개 플레이리스트를 생성합니다 (`music.youtube.com/playlist?list=...` 및 `youtube.com` 링크 즉시 반환).
- **Spotify (`/api/auth/spotify/*`, `/api/export/spotify`)**: Spotify OAuth 2.0 로그인 후 노래방/커버 노이즈를 제외한 스코어링 검색으로 공식 음원을 매칭하고 공개/비공개 플레이리스트를 생성합니다. 미매칭 곡(지역 제한·미발매 등)은 결과 리포트로 별도 안내합니다.

### 5. 트랙 편집 · 히스토리 · 로컬 영속 저장 · 파일 내보내기 (`/api/user/state`)
- 생성된 플레이리스트의 제목/설명 수정, 트랙 순서 조정 및 삭제.
- 계정 키별 취향 DNA, 마지막 플레이리스트, 생성 히스토리를 서버 로컬 파일(`.data/users/*.json`)에 자동 저장·복원.
- 텍스트 복사, `.m3u8`, `.json` 파일 다운로드 지원.

---

## 기술 스택

- **Framework**: Next.js `16.4.6` (App Router), React `19.3.0`, TypeScript `5`
- **Styling / UI**: Tailwind CSS `4.3.3`, `lucide-react`
- **AI / Validation**: `@google/genai` (`gemini-3.8-flash`), `zod`
- **External APIs**: AniList GraphQL API, Google Gemini API, YouTube Data API v3 & YouTube IFrame Player API, Spotify Web API

---

## 프로젝트 구조

```text
src/
├── app/
│   ├── page.tsx                        # 메인 워크스페이스 (헤더, 쿼터 배지, 빌더/워크스페이스 연동)
│   └── api/
│       ├── anime/search/route.ts       # AniList 작품 자동완성 검색
│       ├── auth/
│       │   ├── status/route.ts         # API 키/OAuth 연결 상태 및 YT 쿼터 조회
│       │   ├── youtube/{login,callback,logout}/route.ts
│       │   └── spotify/{login,callback,logout}/route.ts
│       ├── export/
│       │   ├── youtube/route.ts        # YouTube/YT Music 플레이리스트 생성
│       │   └── spotify/route.ts        # Spotify 플레이리스트 생성
│       ├── playlist/generate/route.ts  # AI 플레이리스트 생성 + AniList/YT 메타 보강
│       ├── taste/profile/route.ts      # 취향 DNA 분석 및 저장
│       ├── user/state/route.ts         # 사용자 취향 DNA/히스토리/마지막 플리 CRUD
│       └── youtube/
│           ├── library/route.ts        # YouTube 재생목록/좋아요 트랙 수집
│           ├── quota/route.ts          # YouTube 일일 쿼터 상태 조회/수동 보정
│           └── resolve/route.ts        # 온디맨드 YouTube 영상 ID 매칭 및 캐시
├── components/
│   ├── PlaylistBuilder.tsx             # 시드/무드/장르/인기도/최근곡제외/취향 패널
│   ├── TasteProfilePanel.tsx           # YouTube 라이브러리 선택, DNA 요약, 아는 곡 비중 조절
│   ├── PlaylistWorkspace.tsx           # 셋리 편집, 플랫폼 내보내기, 복사/다운로드
│   ├── PlaylistPlayer.tsx              # YouTube IFrame 순차 재생 및 폴백 플레이어
│   ├── YouTubeQuotaBadge.tsx           # 헤더용 YouTube API 일일 쿼터 상태 팝오버
│   └── SetupModal.tsx                  # 환경 변수 및 OAuth 리디렉션 URI 설정 가이드
├── lib/
│   ├── anilist.ts                      # AniList GraphQL 클라이언트
│   ├── gemini-curator.ts               # Gemini 큐레이션 프롬프트/후처리 및 데모 폴백
│   ├── taste-profiler.ts               # Gemini 취향 DNA 분석기
│   ├── oauth.ts                        # AES-256-GCM 세션 쿠키 및 OAuth 헬퍼
│   ├── profile-store.ts                # `.data/users/` 영속 저장소
│   ├── youtube.ts                      # YouTube 검색/스코어링/임베드 검증/내보내기
│   ├── youtube-cache.ts                # `.data/youtube-cache.json` 영속 매칭 캐시
│   ├── youtube-quota.ts                # `.data/youtube-quota.json` 일일 쿼터 추적기
│   └── spotify.ts                      # Spotify 검색/스코어링/내보내기
└── types/
    └── playlist.ts                     # 공통 도메인 타입 정의
```

> **참고**: 런타임에 생성되는 사용자 상태, 영상 캐시, 쿼터 추적 데이터는 프로젝트 루트의 `.data/` 디렉터리에 저장되며 `.gitignore`에 의해 Git 추적에서 제외됩니다. 설계 메모는 [docs/library-expansion-notes.md](docs/library-expansion-notes.md)를 참고하세요.

---

## 시작하기

### 1. 패키지 설치 및 개발 서버 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

Windows PowerShell에서는 `Copy-Item .env.example .env.local`을 사용할 수 있습니다.  
실행 후 브라우저에서 `http://localhost:3000`으로 접속하세요.

### 2. 스크립트

- `npm run dev`: 개발 서버 실행
- `npm run build`: 프로덕션 빌드
- `npm run start`: 프로덕션 서버 실행
- `npm run lint`: ESLint 검사

### 3. 환경 변수 설정 (`.env.local`)

`.env.example`을 참고해 필요한 키를 채우세요. (앱 상단의 **연동 설정** 모달에서도 현재 설정 상태와 등록할 Redirect URI를 바로 확인할 수 있습니다.)

- `GEMINI_API_KEY`: [Google AI Studio](https://aistudio.google.com/apikey)에서 발급 (미설정 시 내장 데모 폴백으로 동작)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google Cloud Console → YouTube Data API v3 활성화 → OAuth 2.0 클라이언트 ID(웹 애플리케이션) 생성
  - 승인된 리디렉션 URI: `http://localhost:3000/api/auth/youtube/callback`
- `YOUTUBE_API_KEY` (선택): Google OAuth 로그인 전에도 웹 플레이어 영상 매칭 및 미리듣기를 사용하고 싶을 때 설정
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`: [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)에서 앱 생성
  - Redirect URI: `http://localhost:3000/api/auth/spotify/callback` (Spotify 정책상 루프백 IP가 필요한 경우 `http://127.0.0.1:3000/api/auth/spotify/callback` 등록 후 `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000` 설정)
- `NEXT_PUBLIC_APP_URL`: OAuth 리디렉션 URI 생성을 위한 앱 기본 URL (기본값 `http://localhost:3000`)
- `AUTH_COOKIE_SECRET`: OAuth 세션 쿠키 AES-256-GCM 암호화용 임의 문자열 (32자 이상 권장)
