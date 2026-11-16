import crypto from "node:crypto";
import type {
  ExportTrackResult,
  KnownTrackItem,
  PlaylistTrack,
  YouTubePlaylistSummary,
} from "@/types/playlist";

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: { title?: string; channelTitle?: string };
}

interface YouTubeVideoDetailItem {
  id?: string;
  status?: { embeddable?: boolean };
  contentDetails?: {
    regionRestriction?: {
      allowed?: string[];
      blocked?: string[];
    };
  };
}

interface VideoEmbedStatus {
  embeddable: boolean;
  blockedInKr: boolean;
}

function buildSearchUrls(track: PlaylistTrack) {
  const q = encodeURIComponent(
    `${track.title} ${track.artist} ${track.animeTitleJapanese || track.animeTitle}`
  );
  return {
    youtubeUrl: `https://www.youtube.com/results?search_query=${q}`,
    youtubeMusicUrl: `https://music.youtube.com/search?q=${q}`,
  };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function isLowQualityMatch(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    lower.includes("nightcore") ||
    lower.includes("1 hour") ||
    lower.includes("1시간") ||
    lower.includes("hour loop") ||
    lower.includes("時間耐久") ||
    lower.includes("karaoke") ||
    lower.includes("off vocal") ||
    lower.includes("instrumental") ||
    lower.includes("piano cover") ||
    lower.includes("8d audio") ||
    lower.includes("#shorts") ||
    lower.includes("視聴動画")
  );
}

function isTopicChannel(channelTitle: string): boolean {
  const trimmed = channelTitle.trim();
  return trimmed.endsWith("- Topic") || trimmed.endsWith("- 주제");
}

function normalizeMatchText(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s\-_'"`~!@#$%^&*+=[\]{}();:,.<>?/\\|！？・〜～『』「」【】]/g, "");
}

function cleanSearchText(str: string): string {
  return str
    .replace(/[（(][^）)]*cv[:：]?[^）)]*[）)]/gi, " ")
    .replace(/[☆★×～〜・、,（）()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class YouTubeApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function buildAuthHeadersAndParams(
  params: URLSearchParams,
  auth: { accessToken?: string; apiKey?: string }
): Record<string, string> | null {
  const headers: Record<string, string> = {};
  if (auth.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  } else if (auth.apiKey) {
    params.set("key", auth.apiKey);
  } else {
    return null;
  }
  return headers;
}

async function queryYouTubeSearch(
  query: string,
  auth: { accessToken?: string; apiKey?: string },
  options: {
    musicOnly: boolean;
    embeddableOnly?: boolean;
    maxResults?: number;
    throwOnError?: boolean;
  }
): Promise<YouTubeSearchItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(options.maxResults ?? 15),
    q: query,
  });

  if (options.musicOnly) {
    params.set("videoCategoryId", "10");
  }
  if (options.embeddableOnly) {
    params.set("videoEmbeddable", "true");
  }

  const headers = buildAuthHeadersAndParams(params, auth);
  if (!headers) return [];

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    { headers, cache: "no-store" }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn(`[YouTube search.list] HTTP ${res.status} for "${query}": ${errText.slice(0, 200)}`);
    if (options.throwOnError && (res.status === 401 || res.status === 403)) {
      throw new YouTubeApiError(
        res.status,
        res.status === 401
          ? "YouTube 로그인 세션이 만료되었습니다. 다시 연결해 주세요."
          : "YouTube API 일일 할당량이 초과되었거나 권한이 없습니다."
      );
    }
    return [];
  }
  const data = (await res.json()) as { items?: YouTubeSearchItem[] };
  return data.items ?? [];
}

async function fetchVideoEmbedStatuses(
  videoIds: string[],
  auth: { accessToken?: string; apiKey?: string }
): Promise<Map<string, VideoEmbedStatus>> {
  const statusMap = new Map<string, VideoEmbedStatus>();
  const uniqueIds = Array.from(new Set(videoIds)).slice(0, 50);
  if (uniqueIds.length === 0) return statusMap;

  const params = new URLSearchParams({
    part: "status,contentDetails",
    id: uniqueIds.join(","),
  });
  const headers = buildAuthHeadersAndParams(params, auth);
  if (!headers) return statusMap;

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
      { headers, cache: "no-store" }
    );
    if (!res.ok) return statusMap;

    const data = (await res.json()) as { items?: YouTubeVideoDetailItem[] };
    for (const item of data.items ?? []) {
      if (!item.id) continue;
      const restriction = item.contentDetails?.regionRestriction;
      const blockedInKr = Boolean(
        restriction?.blocked?.includes("KR") ||
          (restriction?.allowed && !restriction.allowed.includes("KR"))
      );
      statusMap.set(item.id, {
        embeddable: item.status?.embeddable !== false,
        blockedInKr,
      });
    }
  } catch {
    // Graceful fallback: keep search results usable if videos.list fails
  }

  return statusMap;
}

export type YouTubeSearchableTrack = Pick<
  PlaylistTrack,
  | "title"
  | "titleRomaji"
  | "artist"
  | "artistRomaji"
  | "animeTitleJapanese"
  | "animeTitleRomaji"
  | "themeLabel"
>;

interface CollectedCandidate {
  videoId: string;
  title: string;
  channelTitle: string;
  musicOnly: boolean;
  rankIndex: number;
  lowQuality: boolean;
  topicChannel: boolean;
}

export async function searchYouTubeTrack(
  track: YouTubeSearchableTrack,
  auth: { accessToken?: string; apiKey?: string },
  options?: {
    embeddableOnly?: boolean;
    excludeVideoIds?: string[];
    maxStepCount?: number;
    maxCandidates?: number;
    throwOnError?: boolean;
  }
): Promise<{
  videoId: string;
  title: string;
  candidateVideoIds: string[];
} | null> {
  const excluded = new Set(options?.excludeVideoIds ?? []);
  const embeddableOnly = Boolean(options?.embeddableOnly);
  const maxStepCount = options?.maxStepCount ?? (embeddableOnly ? 4 : 2);
  const maxCandidates = options?.maxCandidates ?? 8;

  const cleanArtist = cleanSearchText(track.artist);
  const cleanAnimeJp = cleanSearchText(track.animeTitleJapanese || "");
  const cleanAnimeRomaji = cleanSearchText(track.animeTitleRomaji || "");
  const animeName = cleanAnimeJp || cleanAnimeRomaji;

  const searchSteps: Array<{
    query: string;
    musicOnly: boolean;
    useEmbedFilter: boolean;
  }> = [
    {
      query: `${track.title} ${cleanArtist || track.artist}`,
      musicOnly: true,
      useEmbedFilter: embeddableOnly,
    },
    ...(animeName
      ? [
          {
            query: `${track.title} ${animeName}`,
            musicOnly: false,
            useEmbedFilter: embeddableOnly,
          },
        ]
      : []),
    ...(cleanAnimeRomaji && cleanAnimeRomaji !== animeName
      ? [
          {
            query: `${track.titleRomaji || track.title} ${cleanAnimeRomaji}`,
            musicOnly: false,
            useEmbedFilter: embeddableOnly,
          },
        ]
      : []),
    {
      query: `${track.titleRomaji || track.title} ${cleanSearchText(track.artistRomaji || "") || cleanArtist}`,
      musicOnly: false,
      useEmbedFilter: embeddableOnly,
    },
    ...(embeddableOnly
      ? [
          {
            query: `${track.title} ${animeName || cleanArtist}`.trim(),
            musicOnly: false,
            useEmbedFilter: false,
          },
        ]
      : []),
  ]
    .map((step) => ({ ...step, query: step.query.trim() }))
    .filter(
      (step, idx, arr) =>
        step.query.length > 0 &&
        arr.findIndex(
          (other) =>
            other.query === step.query &&
            other.musicOnly === step.musicOnly &&
            other.useEmbedFilter === step.useEmbedFilter
        ) === idx
    )
    .slice(0, maxStepCount);

  const collected = new Map<string, CollectedCandidate>();
  const verifiedStatus = new Map<string, VideoEmbedStatus>();

  const normTitles = [track.title, track.titleRomaji]
    .map(normalizeMatchText)
    .filter((t) => t.length >= 2);

  for (const step of searchSteps) {
    const items = await queryYouTubeSearch(step.query, auth, {
      musicOnly: step.musicOnly,
      embeddableOnly: step.useEmbedFilter,
      maxResults: 15,
      throwOnError: options?.throwOnError,
    });

    const newIds: string[] = [];
    items.forEach((item, rankIndex) => {
      const videoId = item.id?.videoId;
      if (!videoId || excluded.has(videoId) || collected.has(videoId)) return;
      const title = decodeHtmlEntities(item.snippet?.title ?? track.title);
      const channelTitle = decodeHtmlEntities(item.snippet?.channelTitle ?? "");
      collected.set(videoId, {
        videoId,
        title,
        channelTitle,
        musicOnly: step.musicOnly,
        rankIndex,
        lowQuality: isLowQualityMatch(title),
        topicChannel: isTopicChannel(channelTitle),
      });
      newIds.push(videoId);
    });

    if (embeddableOnly && newIds.length > 0) {
      const batchStatuses = await fetchVideoEmbedStatuses(newIds, auth);
      for (const [id, st] of batchStatuses.entries()) {
        verifiedStatus.set(id, st);
      }
    }

    // Stop early only when we have enough clean, embeddable candidates.
    // For embeddable playback, require at least 2 non-Topic clean candidates
    // so Topic-only / blocked official uploads don't block anime fan/MV uploads.
    const goodCount = Array.from(collected.values()).filter((c) => {
      if (c.lowQuality) return false;
      if (!embeddableOnly) return true;
      const st = verifiedStatus.get(c.videoId);
      if (st && (!st.embeddable || st.blockedInKr)) return false;
      return !c.topicChannel;
    }).length;

    if (goodCount >= 2) {
      break;
    }
  }

  const allCandidates = Array.from(collected.values()).filter((c) => {
    if (!embeddableOnly) return true;
    const st = verifiedStatus.get(c.videoId);
    return st ? st.embeddable : true;
  });

  if (allCandidates.length === 0) {
    return null;
  }

  const hasCleanCandidate = allCandidates.some((c) => !c.lowQuality);
  let pool = hasCleanCandidate
    ? allCandidates.filter((c) => !c.lowQuality)
    : allCandidates;

  const titleMatchedPool =
    normTitles.length > 0
      ? pool.filter((c) => {
          const normTitle = normalizeMatchText(c.title);
          return normTitles.some((t) => normTitle.includes(t));
        })
      : [];
  if (titleMatchedPool.length > 0) {
    pool = titleMatchedPool;
  }

  const scored = pool
    .map((c) => {
      let score = 30 - c.rankIndex;
      const normTitle = normalizeMatchText(c.title);
      if (normTitles.some((t) => normTitle.includes(t))) {
        score += 25;
      }
      if (c.musicOnly) {
        score += 5;
      }
      if (c.lowQuality) {
        score -= 120;
      }
      if (embeddableOnly) {
        const st = verifiedStatus.get(c.videoId);
        if (st?.blockedInKr) {
          score -= 500;
        }
        // Slightly prefer non-Topic embeddable uploads while keeping Topic in fallbacks
        score += c.topicChannel ? -12 : 12;
      } else if (c.topicChannel) {
        score += 10;
      }
      return { candidate: c, score };
    })
    .sort((a, b) => b.score - a.score);

  const topCandidates = scored.slice(0, maxCandidates).map((s) => s.candidate);
  const best = topCandidates[0];
  if (!best) return null;

  return {
    videoId: best.videoId,
    title: best.title,
    candidateVideoIds: topCandidates.map((c) => c.videoId),
  };
}

export async function enrichTracksWithYouTube(
  tracks: PlaylistTrack[],
  auth: { accessToken?: string; apiKey?: string }
): Promise<PlaylistTrack[]> {
  if (!auth.accessToken && !auth.apiKey) {
    return tracks.map((track) => ({
      ...track,
      ...buildSearchUrls(track),
    }));
  }

  // Resolve up to first 12 tracks in parallel batches to keep YouTube quota reasonable
  const limit = Math.min(tracks.length, 12);
  const enriched = await Promise.all(
    tracks.map(async (track, idx) => {
      const fallback = buildSearchUrls(track);
      if (idx >= limit || track.youtubeVideoId) {
        return {
          ...track,
          youtubeUrl: track.youtubeVideoId
            ? `https://www.youtube.com/watch?v=${track.youtubeVideoId}`
            : fallback.youtubeUrl,
          youtubeMusicUrl: track.youtubeVideoId
            ? `https://music.youtube.com/watch?v=${track.youtubeVideoId}`
            : fallback.youtubeMusicUrl,
        };
      }

      const match = await searchYouTubeTrack(track, auth, {
        embeddableOnly: true,
        maxStepCount: 2,
      });
      if (!match) {
        return { ...track, ...fallback };
      }

      return {
        ...track,
        youtubeVideoId: match.videoId,
        youtubeCandidateIds: match.candidateVideoIds,
        youtubeUrl: `https://www.youtube.com/watch?v=${match.videoId}`,
        youtubeMusicUrl: `https://music.youtube.com/watch?v=${match.videoId}`,
      };
    })
  );

  return enriched;
}

export async function createYouTubePlaylist(params: {
  accessToken: string;
  title: string;
  description: string;
  privacyStatus: "private" | "unlisted" | "public";
  tracks: PlaylistTrack[];
}): Promise<{
  playlistId: string;
  youtubeUrl: string;
  youtubeMusicUrl: string;
  results: ExportTrackResult[];
}> {
  const { accessToken, title, description, privacyStatus, tracks } = params;

  const createRes = await fetch(
    "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          title: title.slice(0, 150),
          description: description.slice(0, 4900),
        },
        status: {
          privacyStatus,
        },
      }),
    }
  );

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`YouTube 플레이리스트 생성 실패 (${createRes.status}): ${errText}`);
  }

  const created = (await createRes.json()) as { id: string };
  const playlistId = created.id;
  const results: ExportTrackResult[] = [];

  for (const track of tracks) {
    let videoId = track.youtubeVideoId;
    let matchedTitle = track.title;

    if (!videoId) {
      const match = await searchYouTubeTrack(track, { accessToken });
      if (match) {
        videoId = match.videoId;
        matchedTitle = match.title;
      }
    }

    if (!videoId) {
      results.push({
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        status: "not_found",
        reason: "YouTube 검색 결과를 찾지 못했습니다.",
      });
      continue;
    }

    const insertRes = await fetch(
      "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            playlistId,
            resourceId: {
              kind: "youtube#video",
              videoId,
            },
          },
        }),
      }
    );

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      results.push({
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        status: "failed",
        reason: `추가 실패 (${insertRes.status}): ${errText.slice(0, 120)}`,
      });
      continue;
    }

    results.push({
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      status: "added",
      matchedTitle,
      externalUrl: `https://music.youtube.com/watch?v=${videoId}`,
    });
  }

  return {
    playlistId,
    youtubeUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    youtubeMusicUrl: `https://music.youtube.com/playlist?list=${playlistId}`,
    results,
  };
}

export async function listUserYouTubePlaylists(
  accessToken: string
): Promise<YouTubePlaylistSummary[]> {
  const summaries: YouTubePlaylistSummary[] = [];

  // 1. Fetch "Likes" special playlist ID from user's channel
  try {
    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );
    if (chRes.ok) {
      const chData = (await chRes.json()) as {
        items?: Array<{
          contentDetails?: { relatedPlaylists?: { likes?: string } };
        }>;
      };
      const likesId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
      if (likesId) {
        summaries.push({
          id: likesId,
          title: "좋아요 표시한 동영상 / 음악",
          itemCount: 50,
          thumbnail: null,
          kind: "likes",
        });
      }
    }
  } catch {
    // Non-fatal
  }

  // 2. Fetch user's playlists
  const plRes = await fetch(
    "https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=25",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  if (!plRes.ok) {
    const errText = await plRes.text();
    throw new Error(
      `YouTube 플레이리스트 목록 조회 실패 (${plRes.status}): ${errText}`
    );
  }

  const plData = (await plRes.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        title?: string;
        thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
      };
      contentDetails?: { itemCount?: number };
    }>;
  };

  for (const item of plData.items ?? []) {
    summaries.push({
      id: item.id,
      title: item.snippet?.title ?? "제목 없는 플레이리스트",
      itemCount: item.contentDetails?.itemCount ?? 0,
      thumbnail:
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        null,
      kind: "playlist",
    });
  }

  return summaries;
}

export async function fetchYouTubePlaylistTracks(params: {
  accessToken: string;
  sources: Array<{ id: string; title: string }>;
  maxTotalTracks?: number;
}): Promise<{ tracks: KnownTrackItem[]; sourceSignature: string }> {
  const { accessToken, sources, maxTotalTracks = 150 } = params;
  const seenVideoIds = new Set<string>();
  const tracks: KnownTrackItem[] = [];

  for (const src of sources) {
    if (tracks.length >= maxTotalTracks) break;

    const url = new URL(
      "https://www.googleapis.com/youtube/v3/playlistItems"
    );
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", src.id);
    url.searchParams.set("maxResults", "50");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) continue;

    const data = (await res.json()) as {
      items?: Array<{
        snippet?: {
          title?: string;
          videoOwnerChannelTitle?: string;
          channelTitle?: string;
        };
        contentDetails?: { videoId?: string };
      }>;
    };

    for (const item of data.items ?? []) {
      const title = item.snippet?.title?.trim() ?? "";
      const videoId = item.contentDetails?.videoId;
      if (
        !title ||
        title === "Deleted video" ||
        title === "Private video" ||
        (videoId && seenVideoIds.has(videoId))
      ) {
        continue;
      }

      if (videoId) seenVideoIds.add(videoId);
      const channelTitle =
        item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle;

      tracks.push({
        rawTitle: title,
        channelTitle: channelTitle?.replace(/\s*-\s*Topic$/i, "").trim(),
        videoId,
        sourceName: src.title,
      });

      if (tracks.length >= maxTotalTracks) break;
    }
  }

  const signatureInput = JSON.stringify({
    sources: sources.map((s) => s.id).sort(),
    sample: tracks.slice(0, 40).map((t) => t.videoId ?? t.rawTitle),
    total: tracks.length,
  });
  const sourceSignature = crypto
    .createHash("sha256")
    .update(signatureInput)
    .digest("hex")
    .slice(0, 16);

  return { tracks, sourceSignature };
}
