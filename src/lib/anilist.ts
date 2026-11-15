import type { AnimeSearchItem, PlaylistTrack } from "@/types/playlist";

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

async function queryAniList<T>(
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = 4500
): Promise<T | null> {
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

    if (!res.ok) {
      return null;
    }

    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
