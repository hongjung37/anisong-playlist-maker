# AniTune — 애니송 전문 AI 플레이리스트 생성기

유튜브 뮤직이나 스포티파이의 일반 추천 알고리즘이 놓치기 쉬운 **애니메이션 음악의 맥락(작품 분위기, OP/ED/극중 삽입곡/OST/캐릭터송 역할, 작곡가·밴드 계보, 원어·로마자 이중 표기)**을 기반으로 셋리를 설계하고, **앱 내 웹 플레이어 순차 재생** 및 **YouTube Music / Spotify 계정 원클릭 저장**까지 한 번에 처리하는 Next.js 풀스택 애플리케이션입니다.

---

## 동작 흐름 (How It Works)

```text
[1. 선곡 조건 입력]
  시드(직접 검색 · 내 본 작품 보관함 · AniList 시청 목록) + 무드 · 장르 · 시대 · 인기도(4단계)
  + 내 YouTube 취향 DNA & 아는 곡 비중(5단계) + 본 작품 선곡 반영 모드
        │
        ▼  (POST /api/playlist/generate · NDJSON 실시간 진행률 스트리밍)
[2. AI 구조화 큐레이션]
  Gemini (`gemini-3.8-flash`)가 JSON 스키마 기반으로
  원어/로마자 이중 표기 · 작품명 · 셋리 섹션(오프닝/빌드업/피크/앵콜) · 선곡 이유 생성
        │  (+ 최근 생성 곡 제외 / 아는 곡 0%·100% 후처리 필터링)
        ▼
[3. 병렬 메타 보강 (AniList + YouTube)]
  ├─ AniList GraphQL : 작품 커버 아트 & 방영 연도 매칭
  └─ YouTube Data API : 로컬 영속 캐시 우선 조회 → 보유 곡 재사용 → 상위 3곡 스튜디오 원곡 검색
        │
        ▼
[4. 셋리 워크스페이스 & 웹 플레이어]
  드래그 정렬 · 개별 곡 교체(Reroll) · 원클릭 아는 곡 등록 · 5곡 추가 확장 · 순차 재생 & 다음 곡 프리페치
        │
        ▼
[5. 플랫폼 내보내기 / 로컬 저장]
  YouTube Music(병렬 매칭 + 캐시 저장 + 순서 유지 삽입) · Spotify · M3U8 / JSON
```

---

## 주요 기능

### 1. 시드 · 본 작품 보관함 · 조건 기반 AI 큐레이션 (`/api/playlist/generate`)
- **3가지 시드 입력 방식**:
  - **AniList 작품 자동완성 (`/api/anime/search`)**: 별도 API 키 없이 작품 검색 및 커버/연도 매칭.
  - **AniList 공개 시청 목록 불러오기 (`/api/anilist/user`)**: AniList 닉네임으로 시청 완료/시청 중 작품과 평점을 불러와 시드로 선택 (`AniListSeedImporter`).
  - **내 본 작품 보관함 (`/api/user/watched-anime`, `.data/watched-anime.json`)**: 내가 본 애니메이션을 평점·장르·선호 순위와 함께 로컬에 보관하고, 필터·랜덤 추출·직접 추가/삭제는 물론 **3단계 선곡 반영 모드(`반영 안 함` / `본 작품 위주` / `안 본 작품 발굴`)**를 지원 (`WatchedAnimePanel`).
- **Gemini API 기반 구조화 선곡 (`gemini-3.8-flash`, `@google/genai`)**:
  - **시드**(최대 6개), **무드 태그**, **장르/사운드 칩**(10종), **곡 유형**(`OP`, `ED`, `INSERT`, `OST`, `CHARACTER`), **시대 필터**(`ALL`, `2020s`, `2010s`, `2000s`, `classic`), **곡 수**(5~25곡), **커스텀 프리셋 저장**, **자연어 메모** 조합.
  - **4단계 대중성/인지도 슬라이더**: `메가히트` → `대중+명곡` → `숨은 명곡` → `코어 선곡(딥컷)`.
  - **최근 생성 곡 제외**: 직전 생성 히스토리(최대 10턴) 곡을 프롬프트와 서버 후처리로 중복 제외.
  - **NDJSON 진행률 스트리밍**: `준비 → AI 선곡 → AniList 커버 매칭 → YouTube 영상 확인 → 저장` 단계를 실시간으로 표시.
  - **데모 폴백 지원**: `GEMINI_API_KEY` 미설정 환경에서도 내장 카탈로그로 선곡·필터링 체험 가능.

### 2. YouTube 라이브러리 취향 DNA & 아는 곡 비중 조절 (`/api/youtube/library`, `/api/taste/profile`)
- **페이지네이션 라이브러리 수집**: YouTube 로그인 후 재생목록(최대 100개 목록) 및 좋아요 곡을 페이지네이션으로 최대 **500곡**까지 불러와 `gemini-3.8-flash`로 **취향 DNA** 추출 (반영 토글 지원).
- **5단계 아는 곡 비중(Familiarity Level)**: `0% (전부 새로움)` · `25% (발굴 위주)` · `50% (황금 밸런스)` · `75% (애청곡 중심)` · `100% (내 곡만)`.
- **계정별 아는 곡 스코프 & 원클릭 등록 (`/api/user/known-track`)**: 계정 키(`knownByAccounts`)별로 아는 곡을 분리 추적하며, 셋리에서 버튼 한 번으로 수동 등록/해제 가능.

### 3. 인앱 순차 재생 웹 플레이어 & YouTube 캐시 · 쿼터 관리 (`/api/youtube/resolve`, `/api/youtube/quota`)
- **YouTube IFrame 순차 플레이어 (`PlaylistPlayer`)**: 전체 순차 재생, 전체 반복, 이전/다음 곡 이동, 재생 시점 온디맨드 매칭 및 다음 곡 무음 프리페치(prefetch) 지원.
- **스튜디오 원곡 필터링 & 임베드 폴백**: 노래방·커버·AI 커버·나이트코어·라이브·메들리를 제외하고 공식/스튜디오 음원을 우선 매칭하며, 임베드/지역 제한 시 후보 영상(`youtubeCandidateIds`) 또는 재조회로 자동 전환.
- **영속 영상 캐시 & 쓰기 직렬화 (`.data/youtube-cache.json`)**: 매칭된 영상 ID를 직렬화 큐를 통해 안전하게 저장·재사용해 API 쿼터 소모를 최소화.
- **일일 쿼터 추적 배지 (`YouTubeQuotaBadge`)**: 일일 한도(10,000 units, PT 자정 / KST 초기화 시각 안내) 대비 추정 잔여량, 캐시 히트 수, 수동 잔여량 보정 제공.

### 4. 트랙 워크스페이스 편집 & 플랫폼 원클릭 저장
- **트랙 단위 인터랙션 (`PlaylistWorkspace`)**:
  - `setlistSection`(오프닝·빌드업·피크·앵콜 등) 섹션 헤더 자동 구분
  - 드래그 앤 드롭 및 위/아래 버튼 순서 조정, 트랙 삭제
  - **개별 곡 교체 (`/api/playlist/reroll`)**: 마음에 들지 않는 한 곡만 기존 곡과 겹치지 않게 리롤
  - **셋리 확장 (`/api/playlist/extend`)**: 현재 셋리 흐름을 이어가는 5곡 추가 생성
  - **커스텀 프리셋 & 히스토리 (`/api/user/state`)**: 계정 키별 마지막 플리, 히스토리(최대 10개), 커스텀 프리셋, 수동 아는 곡을 `.data/users/*.json`에 직렬화 저장
- **YouTube Music & Spotify 내보내기 (`/api/export/youtube`, `/api/export/spotify`)**:
  - YouTube 내보내기는 동시성 제한(4) 병렬 검색 + 신규 매칭 캐시 반영 후 플레이리스트에 순서대로 삽입해 `music.youtube.com/playlist?list=...` 링크 즉시 반환.
  - 텍스트 복사, `.m3u8`, `.json` 파일 다운로드 지원.

---

## 기술 스택

- **Framework**: Next.js `16.4.6` (App Router, `cacheComponents`), React `19.3.0`, TypeScript `5`
- **Styling / UI**: Tailwind CSS `4.3.3`, `lucide-react`
- **AI / Validation**: `@google/genai` (`gemini-3.8-flash`), `zod`
- **Testing**: Vitest `4` (`npm test`)
- **External APIs**: AniList GraphQL API, Google Gemini API, YouTube Data API v3 & YouTube IFrame Player API, Spotify Web API

---

## 프로젝트 구조

```text
src/
├── app/
│   ├── page.tsx                              # 메인 워크스페이스 (헤더, 쿼터 배지, NDJSON 스트림 수신)
│   └── api/
│       ├── anilist/user/route.ts             # AniList 공개 시청 목록 조회 및 닉네임 저장
│       ├── anime/search/route.ts             # AniList 작품 자동완성 검색
│       ├── auth/
│       │   ├── status/route.ts               # API 키/OAuth 연결 상태 및 YT 쿼터 조회
│       │   ├── youtube/{login,callback,logout}/route.ts
│       │   └── spotify/{login,callback,logout}/route.ts
│       ├── export/
│       │   ├── youtube/route.ts              # YouTube/YT Music 플레이리스트 생성
│       │   └── spotify/route.ts              # Spotify 플레이리스트 생성
│       ├── playlist/
│       │   ├── generate/route.ts             # AI 플레이리스트 생성 (NDJSON 스트리밍/JSON)
│       │   ├── reroll/route.ts               # 단일 트랙 교체
│       │   └── extend/route.ts               # 기존 셋리 기반 N곡 추가 확장
│       ├── taste/profile/route.ts            # 취향 DNA 분석 및 저장
│       ├── user/
│       │   ├── state/route.ts                # 취향 DNA/히스토리/프리셋/마지막 플리 CRUD
│       │   ├── known-track/route.ts          # 원클릭 아는 곡 등록/해제
│       │   └── watched-anime/route.ts        # 내 본 작품 보관함 CRUD
│       └── youtube/
│           ├── library/route.ts              # YouTube 재생목록/좋아요 페이지네이션 수집
│           ├── quota/route.ts                # YouTube 일일 쿼터 상태 조회/수동 보정
│           └── resolve/route.ts              # 온디맨드 YouTube 영상 ID 매칭 및 캐시
├── components/
│   ├── PlaylistBuilder.tsx                   # 시드/프리셋/무드/장르/인기도/최근곡제외/취향 패널
│   ├── WatchedAnimePanel.tsx                 # 내 본 작품 보관함 필터·랜덤 시드·직접 추가 UI
│   ├── AniListSeedImporter.tsx               # AniList 공개 시청 목록 시드 선택기
│   ├── TasteProfilePanel.tsx                 # YouTube 라이브러리 선택, DNA 요약, 아는 곡 비중
│   ├── PlaylistWorkspace.tsx                 # 섹션 헤더, 드래그 정렬, 교체/확장, 플랫폼 내보내기
│   ├── PlaylistPlayer.tsx                    # YouTube IFrame 순차 재생 및 폴백 플레이어
│   ├── YouTubeQuotaBadge.tsx                 # 헤더용 YouTube API 일일 쿼터 상태 팝오버
│   └── SetupModal.tsx                        # 환경 변수 및 OAuth 리디렉션 URI 설정 가이드
├── lib/
│   ├── anilist.ts                            # AniList GraphQL 검색 및 사용자 시청 목록 클라이언트
│   ├── gemini-curator.ts                     # Gemini 큐레이션/교체/확장 프롬프트 및 폴백 카탈로그
│   ├── taste-profiler.ts                     # Gemini 취향 DNA 분석기
│   ├── track-enrichment.ts                   # AniList + YouTube 병렬 트랙 보강 공통 헬퍼
│   ├── oauth.ts                              # AES-256-GCM 세션 쿠키 및 OAuth 토큰 갱신 헬퍼
│   ├── profile-store.ts                      # `.data/users/` 직렬화 영속 저장소
│   ├── watched-anime-store.ts                # `.data/watched-anime.json` 본 작품 보관함 저장소
│   ├── youtube.ts                            # YouTube 페이지네이션/스코어링/임베드 검증/병렬 내보내기
│   ├── youtube-cache.ts                      # `.data/youtube-cache.json` 직렬화 · 계정별 매칭 캐시
│   ├── youtube-quota.ts                      # `.data/youtube-quota.json` 일일 쿼터 추적기
│   ├── spotify.ts                            # Spotify 검색/스코어링/내보내기
│   └── __tests__/                            # Vitest 단위 테스트 (youtube, curator, cache, oauth, watched)
└── types/
    └── playlist.ts                           # 공통 도메인 타입 정의
```

> **참고**: 런타임에 생성·갱신되는 사용자 상태, 본 작품 보관함, 영상 캐시, 쿼터 추적 데이터는 프로젝트 루트의 `.data/` 디렉터리에 저장되며 `.gitignore`에 의해 Git 추적에서 제외됩니다. 라이브러리 확장 설계 메모는 [docs/library-expansion-notes.md](docs/library-expansion-notes.md)를 참고하세요.

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
- `npm test`: Vitest 단위 테스트 실행 (`npm run test:watch`로 감시 모드)

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
