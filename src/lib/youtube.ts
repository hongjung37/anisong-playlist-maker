import crypto from "node:crypto";
import {
  lookupCachedYouTubeMatch,
  saveCachedYouTubeBatch,
} from "@/lib/youtube-cache";
import {
  markYouTubeQuotaExhausted,
  recordYouTubeCacheHit,
  recordYouTubeQuotaUsage,
} from "@/lib/youtube-quota";
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
    duration?: string;
    regionRestriction?: {
      allowed?: string[];
      blocked?: string[];
    };
  };
}

interface VideoEmbedStatus {
  embeddable: boolean;
  blockedInKr: boolean;
  durationSec: number;
}

export function parseIsoDurationSec(iso?: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) break;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
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

export function decodeHtmlEntities(str: string): string {
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

export function isLowQualityMatch(title: string): boolean {
  const lower = title.toLowerCase();
  if (
    lower.includes("nightcore") ||
    lower.includes("sped up") ||
    lower.includes("slowed") ||
    lower.includes("1 hour") ||
    lower.includes("1시간") ||
    lower.includes("hour loop") ||
    lower.includes("時間耐久") ||
    lower.includes("作業用") ||
    lower.includes("bgm集") ||
    lower.includes("op集") ||
    lower.includes("ed集") ||
    lower.includes("karaoke") ||
    lower.includes("nicokara") ||
    lower.includes("ニコカラ") ||
    lower.includes("dam音源") ||
    lower.includes("joysound") ||
    lower.includes("off vocal") ||
    lower.includes("on vocal") ||
    lower.includes("instrumental") ||
    lower.includes("ガイドメロディ") ||
    lower.includes("반주") ||
    lower.includes("노래방") ||
    lower.includes("금영") ||
    lower.includes("태진") ||
    lower.includes("カラオケ") ||
    lower.includes("オフボーカル") ||
    lower.includes("オフボ") ||
    lower.includes("インスト") ||
    lower.includes("歌なし") ||
    lower.includes("歌無し") ||
    lower.includes("ボーカルなし") ||
    lower.includes("弾いてみた") ||
    lower.includes("叩いてみた") ||
    lower.includes("吹いてみた") ||
    lower.includes("피아노 커버") ||
    lower.includes("기타 커버") ||
    lower.includes("드럼 커버") ||
    lower.includes("with guitar") ||
    lower.includes("tab譜") ||
    lower.includes("music box") ||
    lower.includes("オルゴール") ||
    lower.includes("8bit") ||
    lower.includes("chiptune") ||
    lower.includes("8d audio") ||
    lower.includes("#shorts") ||
    lower.includes("視聴動画") ||
    lower.includes("medley") ||
    lower.includes("メドレー") ||
    lower.includes("메들리")
  ) {
    return true;
  }

  return (
    /\bmr\b/i.test(title) ||
    /\binst\.?\b/i.test(title) ||
    /\b(piano|guitar|bass|drum|violin|sax|flute|acoustic)\s*covers?\b/i.test(title)
  );
}

export function isLivePerformance(videoTitle: string, trackTitle: string): boolean {
  if (/\blive\b|라이브|ライブ/i.test(trackTitle)) {
    return false;
  }
  return /\blive\b|라이브|ライブ|first\s*take|animelo|アニサマ|武道館|budokan|concert|コンサート|\btour\b|\bfes\.?\b/i.test(
    videoTitle
  );
}

export function isCoverMatch(
  videoTitle: string,
  channelTitle: string,
  trackTitle: string,
  trackArtist: string,
  animeName = ""
): boolean {
  const combinedTrack = `${trackTitle} ${trackArtist} ${animeName}`;
  const combinedVideo = `${videoTitle} ${channelTitle}`;

  if (
    !/\bcovers?\b|커버|歌ってみた/i.test(combinedTrack) &&
    /\bcovers?\b|\bcovered\s+by\b|커버|歌ってみた|aiカバー|ai歌ってみた|ai\s*커버|ai\s*합성|\b(ai\s*cover|rvc)\b|ai[^\s]{1,12}(?:たちの|が歌う)/i.test(
      combinedVideo
    )
  ) {
    return true;
  }

  const vtuberPattern =
    /切り抜き|歌枠|弾き語り|hololive|ホロライブ|ホロ音|にじさんじ|nijisanji|vtuber|ぶいすぽ|vspo/i;
  if (!vtuberPattern.test(combinedTrack) && vtuberPattern.test(combinedVideo)) {
    return true;
  }

  return false;
}

export function isTopicChannel(channelTitle: string): boolean {
  const trimmed = channelTitle.trim();
  return trimmed.endsWith("- Topic") || trimmed.endsWith("- 주제");
}

export function normalizeMatchText(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s\-_'"`~!@#$%^&*+=[\]{}();:,.<>?/\\|！？・〜～『』「」【】]/g, "");
}

export function cleanSearchText(str: string): string {
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

  await recordYouTubeQuotaUsage({ units: 100, category: "search" });

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    { headers, cache: "no-store" }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn(`[YouTube search.list] HTTP ${res.status} for "${query}": ${errText.slice(0, 200)}`);
    if (res.status === 403 && /quotaExceeded|dailyLimitExceeded/i.test(errText)) {
      await markYouTubeQuotaExhausted();
    }
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

export async function fetchVideoEmbedStatuses(
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
    await recordYouTubeQuotaUsage({ units: 1, category: "read" });
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
        durationSec: parseIsoDurationSec(item.contentDetails?.duration),
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
  livePerformance: boolean;
  coverMatch: boolean;
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
    stopAtGoodCount?: number;
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
  const stopAtGoodCount = options?.stopAtGoodCount ?? 2;

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
  const normArtists = [track.artist, track.artistRomaji]
    .map(normalizeMatchText)
    .filter((a) => a.length >= 2);

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
        livePerformance: isLivePerformance(title, track.title),
        coverMatch: isCoverMatch(
          title,
          channelTitle,
          track.title,
          track.artist,
          animeName
        ),
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

    // Stop early only when we have enough clean, studio-original, embeddable candidates.
    const goodCount = Array.from(collected.values()).filter((c) => {
      if (c.lowQuality || c.livePerformance || c.coverMatch) return false;
      if (!embeddableOnly) return true;
      const st = verifiedStatus.get(c.videoId);
      if (st) {
        if (!st.embeddable || st.blockedInKr) return false;
        if (st.durationSec > 0 && (st.durationSec < 45 || st.durationSec > 600)) {
          return false;
        }
      }
      return !c.topicChannel;
    }).length;

    if (goodCount >= stopAtGoodCount) {
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
      const normChannel = normalizeMatchText(c.channelTitle);
      if (normArtists.some((a) => normChannel.includes(a))) {
        score += 18;
      }
      if (c.musicOnly) {
        score += 5;
      }
      if (c.lowQuality) {
        score -= 120;
      }
      if (c.livePerformance) {
        score -= 45;
      }
      if (c.coverMatch) {
        score -= 55;
      }
      if (embeddableOnly) {
        const st = verifiedStatus.get(c.videoId);
        if (st?.blockedInKr) {
          score -= 500;
        }
        if (st && st.durationSec > 0 && (st.durationSec < 45 || st.durationSec > 600)) {
          score -= 150;
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

function findMatchingKnownVideoId(
  track: PlaylistTrack,
  knownTracks: KnownTrackItem[]
): string | null {
  if (knownTracks.length === 0) return null;
  const titles = [track.title, track.titleRomaji]
    .map(normalizeMatchText)
    .filter((t) => t.length >= 2);
  const artists = [track.artist, track.artistRomaji]
    .map(normalizeMatchText)
    .filter((a) => a.length >= 2);

  for (const known of knownTracks) {
    if (!known.videoId) continue;
    const rawNorm = normalizeMatchText(known.rawTitle);
    if (!rawNorm) continue;

    const strongTitleMatch = titles.some(
      (t) =>
        t.length >= 4 &&
        (rawNorm === t || rawNorm.includes(t) || t.includes(rawNorm))
    );
    if (strongTitleMatch) {
      return known.videoId;
    }

    const shortTitleMatch = titles.some((t) => rawNorm === t);
    if (shortTitleMatch && known.channelTitle) {
      const chNorm = normalizeMatchText(known.channelTitle);
      if (artists.some((a) => chNorm.includes(a) || a.includes(chNorm))) {
        return known.videoId;
      }
    }
  }
  return null;
}

export async function enrichTracksWithYouTube(
  tracks: PlaylistTrack[],
  auth: { accessToken?: string; apiKey?: string },
  options?: { knownTracks?: KnownTrackItem[] }
): Promise<PlaylistTrack[]> {
  const knownTracks = options?.knownTracks ?? [];
  const hasAuth = Boolean(auth.accessToken || auth.apiKey);

  // 1. Zero-quota lookup from persistent local YouTube cache for ALL tracks
  let cacheHits = 0;
  const afterCache = await Promise.all(
    tracks.map(async (track) => {
      const fallback = buildSearchUrls(track);
      if (track.youtubeVideoId) {
        return {
          ...track,
          youtubeUrl: `https://www.youtube.com/watch?v=${track.youtubeVideoId}`,
          youtubeMusicUrl: `https://music.youtube.com/watch?v=${track.youtubeVideoId}`,
        };
      }

      const cached = await lookupCachedYouTubeMatch(track);
      if (cached) {
        cacheHits += 1;
        return {
          ...track,
          youtubeVideoId: cached.videoId,
          youtubeCandidateIds: cached.candidateVideoIds,
          youtubeUrl: `https://www.youtube.com/watch?v=${cached.videoId}`,
          youtubeMusicUrl: `https://music.youtube.com/watch?v=${cached.videoId}`,
        };
      }

      return { ...track, ...fallback };
    })
  );

  if (cacheHits > 0) {
    await recordYouTubeCacheHit(cacheHits);
  }

  if (!hasAuth) {
    return afterCache;
  }

  // 2. Reuse videoId from user's knownTracks (verified via single 1-unit videos.list call)
  const knownCandidates = new Map<number, string>();
  afterCache.forEach((track, idx) => {
    if (track.youtubeVideoId) return;
    const knownId = findMatchingKnownVideoId(track, knownTracks);
    if (knownId) knownCandidates.set(idx, knownId);
  });

  const knownStatuses =
    knownCandidates.size > 0
      ? await fetchVideoEmbedStatuses(Array.from(knownCandidates.values()), auth)
      : new Map<string, VideoEmbedStatus>();

  const toSaveToCache: Array<{
    track: PlaylistTrack;
    match: { videoId: string; candidateVideoIds?: string[]; title?: string };
  }> = [];

  const afterKnown = afterCache.map((track, idx) => {
    const knownId = knownCandidates.get(idx);
    if (!knownId) return track;
    const st = knownStatuses.get(knownId);
    if (st && (!st.embeddable || st.blockedInKr)) {
      return track;
    }

    const match = {
      videoId: knownId,
      candidateVideoIds: [knownId],
      title: track.title,
    };
    toSaveToCache.push({ track, match });
    return {
      ...track,
      youtubeVideoId: knownId,
      youtubeCandidateIds: [knownId],
      youtubeUrl: `https://www.youtube.com/watch?v=${knownId}`,
      youtubeMusicUrl: `https://music.youtube.com/watch?v=${knownId}`,
    };
  });

  // 3. Live search only for first 3 still-unresolved tracks; rest prefetch lazily during playback
  const LIVE_SEARCH_LIMIT = 3;
  const unresolvedIndices: number[] = [];
  afterKnown.forEach((track, idx) => {
    if (!track.youtubeVideoId && unresolvedIndices.length < LIVE_SEARCH_LIMIT) {
      unresolvedIndices.push(idx);
    }
  });
  const liveSearchSet = new Set(unresolvedIndices);

  const enriched = await Promise.all(
    afterKnown.map(async (track, idx) => {
      if (!liveSearchSet.has(idx)) {
        return track;
      }

      const match = await searchYouTubeTrack(track, auth, {
        embeddableOnly: true,
        maxStepCount: 2,
        stopAtGoodCount: 1,
      });
      if (!match) {
        return track;
      }

      toSaveToCache.push({ track, match });
      return {
        ...track,
        youtubeVideoId: match.videoId,
        youtubeCandidateIds: match.candidateVideoIds,
        youtubeUrl: `https://www.youtube.com/watch?v=${match.videoId}`,
        youtubeMusicUrl: `https://music.youtube.com/watch?v=${match.videoId}`,
      };
    })
  );

  if (toSaveToCache.length > 0) {
    await saveCachedYouTubeBatch(toSaveToCache).catch((err) => {
      console.warn("[youtube-cache] Failed to save batch:", err);
    });
  }

  return enriched;
}

export async function createYouTubePlaylist(params: {
  accessToken: string;
  title: string;
  description: string;
  privacyStatus: "private" | "unlisted" | "public";
  tracks: PlaylistTrack[];
  accountKey?: string;
}): Promise<{
  playlistId: string;
  youtubeUrl: string;
  youtubeMusicUrl: string;
  results: ExportTrackResult[];
}> {
  const {
    accessToken,
    title,
    description,
    privacyStatus,
    tracks,
    accountKey,
  } = params;

  // Phase 1: Resolve all tracks (with bounded concurrency) before creating/populating playlist items
  const resolvedTracks = await mapWithConcurrency(
    tracks,
    4,
    async (track) => {
      if (track.youtubeVideoId) {
        return {
          track,
          videoId: track.youtubeVideoId,
          matchedTitle: track.title,
          cacheHit: false,
          freshMatch: null as {
            videoId: string;
            candidateVideoIds: string[];
            title: string;
          } | null,
        };
      }

      const cached = await lookupCachedYouTubeMatch(track);
      if (cached) {
        return {
          track,
          videoId: cached.videoId,
          matchedTitle: cached.title,
          cacheHit: true,
          freshMatch: null,
        };
      }

      const match = await searchYouTubeTrack(track, { accessToken });
      if (match) {
        return {
          track,
          videoId: match.videoId,
          matchedTitle: match.title,
          cacheHit: false,
          freshMatch: match,
        };
      }

      return {
        track,
        videoId: null as string | null,
        matchedTitle: track.title,
        cacheHit: false,
        freshMatch: null,
      };
    }
  );

  const cacheHitCount = resolvedTracks.filter((item) => item.cacheHit).length;
  if (cacheHitCount > 0) {
    await recordYouTubeCacheHit(cacheHitCount);
  }

  const newlyMatched = resolvedTracks
    .filter(
      (
        item
      ): item is typeof item & {
        freshMatch: NonNullable<typeof item.freshMatch>;
      } => Boolean(item.freshMatch)
    )
    .map((item) => ({
      track: item.track,
      match: item.freshMatch,
    }));

  if (newlyMatched.length > 0) {
    await saveCachedYouTubeBatch(newlyMatched, { accountKey }).catch((err) => {
      console.warn("[youtube-cache] Failed to save export matches:", err);
    });
  }

  // Phase 2: Create playlist and insert items sequentially to preserve setlist order
  await recordYouTubeQuotaUsage({ units: 50, category: "write" });
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

  for (const resolved of resolvedTracks) {
    const { track, videoId, matchedTitle } = resolved;

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

    await recordYouTubeQuotaUsage({ units: 50, category: "write" });
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
    await recordYouTubeQuotaUsage({ units: 1, category: "read" });
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

  // 2. Fetch user's playlists (paginated up to 2 pages / 100 playlists)
  let pageToken: string | undefined;
  for (let page = 0; page < 2; page += 1) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    await recordYouTubeQuotaUsage({ units: 1, category: "read" });
    const plRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!plRes.ok) {
      if (page === 0) {
        const errText = await plRes.text();
        throw new Error(
          `YouTube 플레이리스트 목록 조회 실패 (${plRes.status}): ${errText}`
        );
      }
      break;
    }

    const plData = (await plRes.json()) as {
      nextPageToken?: string;
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

    pageToken = plData.nextPageToken;
    if (!pageToken) break;
  }

  return summaries;
}

export async function fetchYouTubePlaylistTracks(params: {
  accessToken: string;
  sources: Array<{ id: string; title: string }>;
  maxTotalTracks?: number;
}): Promise<{ tracks: KnownTrackItem[]; sourceSignature: string }> {
  const { accessToken, sources, maxTotalTracks = 500 } = params;
  const seenVideoIds = new Set<string>();
  const tracks: KnownTrackItem[] = [];

  for (const src of sources) {
    if (tracks.length >= maxTotalTracks) break;

    let pageToken: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      if (tracks.length >= maxTotalTracks) break;

      const url = new URL(
        "https://www.googleapis.com/youtube/v3/playlistItems"
      );
      url.searchParams.set("part", "snippet,contentDetails");
      url.searchParams.set("playlistId", src.id);
      url.searchParams.set("maxResults", "50");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      await recordYouTubeQuotaUsage({ units: 1, category: "read" });
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      if (!res.ok) break;

      const data = (await res.json()) as {
        nextPageToken?: string;
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

      pageToken = data.nextPageToken;
      if (!pageToken) break;
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
