import type {
  AniListUserMediaItem,
  AnimeSearchItem,
  PlaylistTrack,
} from "@/types/playlist";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

const SEARCH_ANIME_QUERY = `
  query SearchAnime($search: String!, $perPage: Int!) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, sort: [POPULARITY_DESC, SEARCH_MATCH]) {
        id
        seasonYear
        genres
        title {
          romaji
          native
          english
        }
        coverImage {
          large
          medium
        }
      }
    }
  }
`;

const USER_ANIME_LIST_QUERY = `
  query UserAnimeList($userName: String!, $statuses: [MediaListStatus]) {
    MediaListCollection(
      userName: $userName
      type: ANIME
      status_in: $statuses
      sort: [SCORE_DESC, UPDATED_TIME_DESC]
    ) {
      lists {
        name
        status
        entries {
          score(format: POINT_100)
          status
          media {
            id
            seasonYear
            genres
            title {
              romaji
              native
              english
            }
            coverImage {
              large
              medium
            }
          }
        }
      }
    }
  }
`;

interface AniListMediaNode {
  id: number;
  seasonYear: number | null;
  genres?: string[];
  title?: {
    romaji?: string | null;
    native?: string | null;
    english?: string | null;
  };
  coverImage?: {
    large?: string | null;
    medium?: string | null;
  };
}

interface AniListGraphQLError {
  message?: string;
  status?: number;
}

interface AniListRawResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errors: AniListGraphQLError[];
}

async function queryAniListRaw<T>(
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = 7000
): Promise<AniListRawResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
      cache: "no-store",
    });

    const json = (await res.json().catch(() => ({}))) as {
      data?: T;
      errors?: AniListGraphQLError[];
    };

    return {
      ok: res.ok && !json.errors?.length,
      status: res.status,
      data: json.data ?? null,
      errors: json.errors ?? [],
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      errors: [{ message: "AniList API 요청 시간 초과 또는 네트워크 오류" }],
    };
  } finally {
    clearTimeout(timer);
  }
}

async function queryAniList<T>(
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = 4500
): Promise<T | null> {
  const result = await queryAniListRaw<T>(query, variables, timeoutMs);
  if (!result.ok) return null;
  return result.data;
}

export async function searchAnime(
  search: string,
  perPage = 8
): Promise<AnimeSearchItem[]> {
  const trimmed = search.trim();
  if (!trimmed) return [];

  const data = await queryAniList<{
    Page?: { media?: AniListMediaNode[] };
  }>(SEARCH_ANIME_QUERY, { search: trimmed, perPage });

  const media = data?.Page?.media ?? [];
  return media.map((item) => ({
    id: item.id,
    titleRomaji: item.title?.romaji ?? item.title?.english ?? "Unknown",
    titleNative: item.title?.native ?? "",
    titleEnglish: item.title?.english ?? null,
    seasonYear: item.seasonYear ?? null,
    genres: item.genres ?? [],
    coverImage: item.coverImage?.large ?? item.coverImage?.medium ?? null,
  }));
}

interface AniListUserListResponse {
  MediaListCollection?: {
    lists?: Array<{
      name?: string;
      status?: string;
      entries?: Array<{
        score?: number | null;
        status?: AniListUserMediaItem["status"] | null;
        media?: AniListMediaNode | null;
      }>;
    }>;
  } | null;
}

export async function fetchAniListUserList(
  userName: string,
  statuses?: Array<"CURRENT" | "COMPLETED" | "REPEATING" | "PAUSED" | "PLANNING">
): Promise<{
  items: AniListUserMediaItem[];
  notFound?: boolean;
  error?: string;
}> {
  const trimmed = userName.trim();
  if (!trimmed) {
    return { items: [], error: "AniList 사용자 이름을 입력해 주세요." };
  }

  const effectiveStatuses =
    statuses && statuses.length > 0
      ? statuses
      : ["CURRENT", "COMPLETED", "REPEATING", "PAUSED"];

  const raw = await queryAniListRaw<AniListUserListResponse>(
    USER_ANIME_LIST_QUERY,
    { userName: trimmed, statuses: effectiveStatuses },
    8000
  );

  const errMsg = raw.errors.map((e) => e.message ?? "").join(" ");
  if (
    raw.status === 404 ||
    raw.errors.some((e) => e.status === 404) ||
    /not found/i.test(errMsg)
  ) {
    return { items: [], notFound: true };
  }

  if (/private/i.test(errMsg)) {
    return {
      items: [],
      notFound: true,
      error: "AniList 목록이 비공개로 설정되어 있습니다.",
    };
  }

  if (!raw.data?.MediaListCollection) {
    return {
      items: [],
      error:
        raw.status === 429
          ? "AniList 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
          : errMsg || "AniList 시청 목록을 불러오지 못했습니다.",
    };
  }

  const deduped = new Map<number, AniListUserMediaItem>();

  for (const list of raw.data.MediaListCollection.lists ?? []) {
    for (const entry of list.entries ?? []) {
      const media = entry.media;
      if (!media?.id) continue;

      const score = Number(entry.score ?? 0);
      const item: AniListUserMediaItem = {
        mediaId: media.id,
        status: entry.status ?? "COMPLETED",
        score: Number.isFinite(score) ? score : 0,
        titleRomaji:
          media.title?.romaji ?? media.title?.english ?? "Unknown",
        titleNative: media.title?.native ?? "",
        titleEnglish: media.title?.english ?? null,
        seasonYear: media.seasonYear ?? null,
        genres: media.genres ?? [],
        coverImage: media.coverImage?.large ?? media.coverImage?.medium ?? null,
      };

      const existing = deduped.get(media.id);
      if (!existing || item.score > existing.score) {
        deduped.set(media.id, item);
      }
    }
  }

  const items = Array.from(deduped.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.seasonYear ?? 0) - (a.seasonYear ?? 0);
    })
    .slice(0, 150);

  return { items };
}

async function findCoverForAnime(candidates: string[]): Promise<{
  coverImage: string | null;
  year: number | null;
}> {
  for (const query of candidates) {
    const trimmed = query.trim();
    if (!trimmed) continue;
    const results = await searchAnime(trimmed, 1);
    if (results.length > 0) {
      return {
        coverImage: results[0].coverImage,
        year: results[0].seasonYear,
      };
    }
  }
  return { coverImage: null, year: null };
}

export async function enrichTracksWithAniList(
  tracks: PlaylistTrack[]
): Promise<PlaylistTrack[]> {
  const cache = new Map<
    string,
    Promise<{ coverImage: string | null; year: number | null }>
  >();

  return Promise.all(
    tracks.map(async (track) => {
      const key = (
        track.animeTitleRomaji ||
        track.animeTitleJapanese ||
        track.animeTitle
      ).toLowerCase();

      if (!cache.has(key)) {
        cache.set(
          key,
          findCoverForAnime([
            track.animeTitleRomaji,
            track.animeTitleJapanese,
            track.animeTitle,
          ])
        );
      }

      const meta = await cache.get(key)!;
      return {
        ...track,
        coverImage: track.coverImage ?? meta.coverImage,
        year: track.year ?? meta.year,
      };
    })
  );
}
