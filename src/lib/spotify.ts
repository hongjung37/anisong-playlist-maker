import type { ExportTrackResult, PlaylistTrack } from "@/types/playlist";

interface SpotifyTrackItem {
  uri: string;
  name: string;
  popularity?: number;
  external_urls?: { spotify?: string };
  artists?: Array<{ name: string }>;
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s\-_'"`~!@#$%^&*()+=\[\]{};:,.<>?/\\|！？・〜～]/g, "");
}

function scoreSpotifyCandidate(
  candidate: SpotifyTrackItem,
  track: PlaylistTrack
): number {
  const nameNorm = normalize(candidate.name ?? "");
  const artistNames = (candidate.artists ?? [])
    .map((a) => normalize(a.name))
    .join(" ");

  const lowerName = (candidate.name ?? "").toLowerCase();
  if (
    lowerName.includes("karaoke") ||
    lowerName.includes("instrumental") ||
    lowerName.includes("off vocal") ||
    lowerName.includes("music box") ||
    lowerName.includes("lullaby") ||
    lowerName.includes("8-bit") ||
    lowerName.includes("piano cover")
  ) {
    return -100;
  }

  let score = 0;
  const titleTargets = [track.title, track.titleRomaji].map(normalize).filter(Boolean);
  const artistTargets = [track.artist, track.artistRomaji].map(normalize).filter(Boolean);

  for (const t of titleTargets) {
    if (nameNorm === t) score += 50;
    else if (nameNorm.includes(t) || t.includes(nameNorm)) score += 25;
  }

  for (const a of artistTargets) {
    if (artistNames.includes(a)) score += 40;
  }

  score += Math.min((candidate.popularity ?? 0) / 10, 10);
  return score;
}

async function querySpotifySearch(
  query: string,
  accessToken: string
): Promise<SpotifyTrackItem[]> {
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: "5",
  });

  const res = await fetch(
    `https://api.spotify.com/v1/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) return [];
  const data = (await res.json()) as {
    tracks?: { items?: SpotifyTrackItem[] };
  };
  return data.tracks?.items ?? [];
}

export async function searchSpotifyTrack(
  track: PlaylistTrack,
  accessToken: string
): Promise<{ uri: string; name: string; artist: string; url?: string } | null> {
  const queries = [
    `${track.title} ${track.artist}`,
    `${track.titleRomaji} ${track.artistRomaji}`,
    `${track.title} ${track.animeTitleRomaji}`,
    track.title,
  ]
    .map((q) => q.trim())
    .filter((q, idx, arr) => q.length > 0 && arr.indexOf(q) === idx);

  let bestCandidate: SpotifyTrackItem | null = null;
  let bestScore = -Infinity;

  for (const q of queries) {
    const items = await querySpotifySearch(q, accessToken);
    for (const item of items) {
      const score = scoreSpotifyCandidate(item, track);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = item;
      }
    }
    if (bestScore >= 60) break;
  }

  if (!bestCandidate || bestScore < 10) {
    return null;
  }

  return {
    uri: bestCandidate.uri,
    name: bestCandidate.name,
    artist: bestCandidate.artists?.map((a) => a.name).join(", ") ?? track.artist,
    url: bestCandidate.external_urls?.spotify,
  };
}

export async function createSpotifyPlaylist(params: {
  accessToken: string;
  title: string;
  description: string;
  isPublic: boolean;
  tracks: PlaylistTrack[];
}): Promise<{
  playlistId: string;
  spotifyUrl: string;
  results: ExportTrackResult[];
}> {
  const { accessToken, title, description, isPublic, tracks } = params;

  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!meRes.ok) {
    const errText = await meRes.text();
    throw new Error(`Spotify 사용자 조회 실패 (${meRes.status}): ${errText}`);
  }

  const me = (await meRes.json()) as { id: string };

  const createRes = await fetch(
    `https://api.spotify.com/v1/users/${encodeURIComponent(me.id)}/playlists`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: title.slice(0, 100),
        description: description.slice(0, 300),
        public: isPublic,
      }),
    }
  );

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Spotify 플레이리스트 생성 실패 (${createRes.status}): ${errText}`);
  }

  const created = (await createRes.json()) as {
    id: string;
    external_urls?: { spotify?: string };
  };

  const urisToAdd: string[] = [];
  const results: ExportTrackResult[] = [];

  for (const track of tracks) {
    if (track.spotifyUri) {
      urisToAdd.push(track.spotifyUri);
      results.push({
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        status: "added",
        matchedTitle: track.title,
        externalUrl: track.spotifyUrl,
      });
      continue;
    }

    const match = await searchSpotifyTrack(track, accessToken);
    if (!match) {
      results.push({
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        status: "not_found",
        reason:
          "Spotify에서 일치하는 공식 음원을 찾지 못했습니다 (지역 제한 또는 미발매 곡일 수 있음).",
      });
      continue;
    }

    urisToAdd.push(match.uri);
    results.push({
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      status: "added",
      matchedTitle: `${match.name} — ${match.artist}`,
      externalUrl: match.url,
    });
  }

  // Spotify supports adding up to 100 URIs per request
  for (let i = 0; i < urisToAdd.length; i += 100) {
    const chunk = urisToAdd.slice(i, i + 100);
    const addRes = await fetch(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(created.id)}/tracks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: chunk }),
      }
    );

    if (!addRes.ok) {
      const errText = await addRes.text();
      throw new Error(`Spotify 트랙 추가 실패 (${addRes.status}): ${errText}`);
    }
  }

  return {
    playlistId: created.id,
    spotifyUrl:
      created.external_urls?.spotify ??
      `https://open.spotify.com/playlist/${created.id}`,
    results,
  };
}
