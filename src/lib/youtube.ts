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

function buildSearchUrls(track: PlaylistTrack) {
  const q = encodeURIComponent(
    `${track.title} ${track.artist} ${track.animeTitleJapanese || track.animeTitle}`
  );
  return {
    youtubeUrl: `https://www.youtube.com/results?search_query=${q}`,
    youtubeMusicUrl: `https://music.youtube.com/search?q=${q}`,
  };
}

function isLowQualityMatch(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    lower.includes("nightcore") ||
    lower.includes("1 hour") ||
    lower.includes("1시간") ||
    lower.includes("karaoke") ||
    lower.includes("off vocal") ||
    lower.includes("instrumental") ||
    lower.includes("piano cover") ||
    lower.includes("8d audio")
  );
}

async function queryYouTubeSearch(
  query: string,
  auth: { accessToken?: string; apiKey?: string },
  musicOnly: boolean
): Promise<YouTubeSearchItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "5",
    q: query,
  });

  if (musicOnly) {
    params.set("videoCategoryId", "10");
  }

  const headers: Record<string, string> = {};
  if (auth.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  } else if (auth.apiKey) {
    params.set("key", auth.apiKey);
  } else {
    return [];
  }

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    { headers, cache: "no-store" }
  );

  if (!res.ok) return [];
  const data = (await res.json()) as { items?: YouTubeSearchItem[] };
  return data.items ?? [];
}

export async function searchYouTubeTrack(
  track: PlaylistTrack,
  auth: { accessToken?: string; apiKey?: string }
): Promise<{ videoId: string; title: string } | null> {
  const queries = [
    `${track.title} ${track.artist}`,
    `${track.title} ${track.animeTitleJapanese || track.animeTitleRomaji} ${track.themeLabel}`,
    `${track.titleRomaji} ${track.artistRomaji}`,
  ]
    .map((q) => q.trim())
    .filter((q, idx, arr) => q.length > 0 && arr.indexOf(q) === idx);

  for (const query of queries) {
    // Prefer Music category first, then general video search (for official OP/ED uploads)
    for (const musicOnly of [true, false]) {
      const items = await queryYouTubeSearch(query, auth, musicOnly);
      const best =
        items.find(
          (item) =>
            item.id?.videoId &&
            !isLowQualityMatch(item.snippet?.title ?? "")
        ) ?? items.find((item) => Boolean(item.id?.videoId));

      if (best?.id?.videoId) {
        return {
          videoId: best.id.videoId,
          title: best.snippet?.title ?? track.title,
        };
      }
    }
  }

  return null;
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

      const match = await searchYouTubeTrack(track, auth);
      if (!match) {
        return { ...track, ...fallback };
      }

      return {
        ...track,
        youtubeVideoId: match.videoId,
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
