# 내 라이브러리(아는 곡) 확장 및 프롬프트 최적화 메모

## 1. 현재 구조 요약과 한계
- **수집 범위**: `TasteProfilePanel`에서 YouTube 플레이리스트/좋아요를 최대 10개까지 선택할 수 있으나, `/api/youtube/library`에서 `maxTotalTracks: 150`으로 상한이 걸려 있음.
- **프롬프트 주입 방식**: `generatePlaylistWithGemini` 호출 시 `knownTracks.slice(0, 100)`을 매번 원문 제목(`rawTitle`) 그대로 프롬프트에 포함함.
- **라이브러리 판별(`내 라이브러리` 배지)**: `isTrackInKnownLibrary`가 위 150곡 이내의 `knownTracks`와만 대조하여 판별함.
- **고민 포인트**: 실제 아는 곡(수백~수천 곡)을 전부 저장하고 그대로 프롬프트에 넣으면 입력 토큰·비용·지연 시간이 커지고, 목록이 길어질수록 LLM 선곡 집중도도 떨어짐.

---

## 2. 핵심 설계 방향: 저장 / 필터링 / 선곡 앵커 분리

> **전체 아는 곡 DB는 크게 저장하되, Gemini 프롬프트에는 조건에 맞는 20~30곡만 동적으로 주입한다.**

### A. 단계별(Familiarity Level) 프롬프트 최적화
1. **0% (전부 새로움, `familiarityLevel === 1`)**
   - Gemini 프롬프트에 아는 곡 전체 목록을 넣지 않거나 최근 대표 20곡 요약만 제공.
   - 대신 `요청 곡 수 + 8곡` 정도로 여유분을 생성받아 **서버 후처리(`isTrackInKnownLibrary`)에서 전체 아는 곡 DB(수천 곡)와 대조해 결정론적으로 제거**.
   - 결과: DB가 10배 커져도 프롬프트 토큰은 오히려 현재보다 감소.
2. **25% / 50% (발굴 위주 · 황금 밸런스)**
   - 전체 아는 곡 DB에서 이번 요청의 `시드 / 무드 / 장르 / 연대`와 겹치는 곡 + 랜덤 앵커 **20~30곡만 서버에서 추출**하여 프롬프트에 주입.
3. **75% (애청곡 재구성)**
   - 서버에서 조건에 맞는 애청곡 7~9곡을 먼저 선별한 뒤, Gemini에게는 *"이 곡들을 셋리 흐름대로 배치하고 빈 자리 3곡만 결에 맞는 새 곡으로 채워라"*고 지시하는 하이브리드 방식 적용.

### B. 곡 메타데이터 증분 정규화(한 번만 파싱)
- 현재는 `【MAD】コネクト / ClariS` 같은 유튜브 원문 제목(`rawTitle`)을 매번 그대로 넘김.
- 새 곡이 라이브러리에 처음 추가될 때 **1회만** `{ title, artist, animeTitle, tags }`로 정제해 저장해 두면:
  - 프롬프트 문자열 길이 30~50% 절감
  - `isTrackInKnownLibrary` 매칭 정확도 대폭 향상

### C. 유저 입력 부담 없는 라이브러리 확장 UX
- **생성 결과 내 "이미 아는 곡" 토글 버튼**: 플레이리스트를 들으면서 이미 아는 곡을 1클릭으로 내 라이브러리에 누적 저장.
- **YouTube/Spotify 전체 동기화 상한 해제**: YouTube `playlistItems.list`는 50곡당 1 unit이므로 1,000곡을 긁어도 20 units 수준. `TasteDNA` 요약 생성 시에만 대표 샘플(100~120곡)을 쓰고, 전체 목록은 필터·샘플링용 저장소에 보관.
- **작품 단위 체크(선택)**: AniList 연동 등을 통해 "봤던/아는 작품"을 체크하면 해당 작품 OP/ED를 추론 신호로 활용 가능.

---

## 3. 관련 코드 위치
- [src/components/TasteProfilePanel.tsx](../src/components/TasteProfilePanel.tsx): 라이브러리 소스 선택 및 DNA 요약 UI
- [src/app/api/youtube/library/route.ts](../src/app/api/youtube/library/route.ts): `maxTotalTracks` 제한
- [src/app/api/taste/profile/route.ts](../src/app/api/taste/profile/route.ts): 트랙 분석/저장 엔드포인트 (`max(200)`)
- [src/lib/taste-profiler.ts](../src/lib/taste-profiler.ts): DNA 요약 생성 (`slice(0, 120)`)
- [src/lib/gemini-curator.ts](../src/lib/gemini-curator.ts): `knownTracks` 프롬프트 주입 (`slice(0, 100)`) 및 `isTrackInKnownLibrary`
- [src/lib/profile-store.ts](../src/lib/profile-store.ts): 사용자 상태 저장 (`.data/users`)
