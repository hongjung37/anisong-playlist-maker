import { enrichTracksWithAniList } from "@/lib/anilist";
import { mergeKnownTrackLists } from "@/lib/gemini-curator";
import { getValidYouTubeSession } from "@/lib/oauth";
import { readUserData, resolveUserAccountKey } from "@/lib/profile-store";
import { enrichTracksWithYouTube } from "@/lib/youtube";
import { getUserKnownTrackKeys } from "@/lib/youtube-cache";
import type { KnownTrackItem, PlaylistTrack } from "@/types/playlist";

export async function loadUserTrackContext(): Promise<{
  accountKey: string;
  knownTracks: KnownTrackItem[];
  userKnownKeys: Set<string>;
  ytAuth: { accessToken?: string; apiKey?: string };
}> {
  const accountKey = await resolveUserAccountKey();
  const [stored, userKnownKeys, ytSession] = await Promise.all([
    readUserData(accountKey),
    getUserKnownTrackKeys(accountKey),
    getValidYouTubeSession(),
  ]);

  const knownTracks = mergeKnownTrackLists(
    stored.tasteProfile?.knownTracks ?? [],
    stored.manualKnownTracks ?? []
  );

  const ytAuth = ytSession
    ? { accessToken: ytSession.accessToken }
    : process.env.YOUTUBE_API_KEY
      ? { apiKey: process.env.YOUTUBE_API_KEY }
      : {};

  return { accountKey, knownTracks, userKnownKeys, ytAuth };
}

export async function enrichPlaylistTracks(
  tracks: PlaylistTrack[],
  ytAuth: { accessToken?: string; apiKey?: string },
  knownTracks: KnownTrackItem[]
): Promise<PlaylistTrack[]> {
  const [aniListEnriched, ytEnriched] = await Promise.all([
    enrichTracksWithAniList(tracks),
    enrichTracksWithYouTube(tracks, ytAuth, { knownTracks }),
  ]);

  return tracks.map((track, idx) => ({
    ...track,
    coverImage: aniListEnriched[idx]?.coverImage ?? track.coverImage,
    year: aniListEnriched[idx]?.year ?? track.year,
    youtubeVideoId: ytEnriched[idx]?.youtubeVideoId ?? track.youtubeVideoId,
    youtubeCandidateIds:
      ytEnriched[idx]?.youtubeCandidateIds ?? track.youtubeCandidateIds,
    youtubeUrl: ytEnriched[idx]?.youtubeUrl ?? track.youtubeUrl,
    youtubeMusicUrl: ytEnriched[idx]?.youtubeMusicUrl ?? track.youtubeMusicUrl,
  }));
}
