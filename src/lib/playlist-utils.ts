import type { PlaylistTrack } from "@/types/playlist";

/**
 * Shuffles tracks using Fisher-Yates.
 * When `pinnedTrackId` matches a track, that track stays at index 0 so active playback is uninterrupted.
 * When 2+ tracks can move, guarantees the resulting order differs from the input order if possible.
 */
export function shuffleTracks(
  tracks: PlaylistTrack[],
  pinnedTrackId?: string | null,
  random: () => number = Math.random
): PlaylistTrack[] {
  if (tracks.length <= 1) {
    return [...tracks];
  }

  const pinnedIndex = pinnedTrackId
    ? tracks.findIndex((t) => t.id === pinnedTrackId)
    : -1;

  const pool =
    pinnedIndex >= 0
      ? tracks.filter((_, idx) => idx !== pinnedIndex)
      : [...tracks];

  if (pool.length <= 1) {
    return pinnedIndex >= 0 ? [tracks[pinnedIndex], ...pool] : pool;
  }

  const originalOrderIds = pool.map((t) => t.id);

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Ensure a visible shuffle when pool has >= 2 distinct tracks and RNG produced the same order
  const unchanged = pool.every((t, idx) => t.id === originalOrderIds[idx]);
  if (unchanged) {
    [pool[0], pool[pool.length - 1]] = [pool[pool.length - 1], pool[0]];
  }

  return pinnedIndex >= 0 ? [tracks[pinnedIndex], ...pool] : pool;
}

/**
 * Filters tracks when `onlyUnknown` is enabled, keeping original 0-based indices for actions.
 */
export function getVisibleTrackEntries(
  tracks: PlaylistTrack[],
  onlyUnknown: boolean
): Array<{ track: PlaylistTrack; index: number }> {
  return tracks.flatMap((track, index) => {
    if (onlyUnknown && track.inUserLibrary) {
      return [];
    }
    return [{ track, index }];
  });
}
