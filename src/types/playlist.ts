export type SceneDomain = "anime" | "vocaloid" | "rhythm_doujin";

export type VocaloidVocalMode =
  | "original_only"
  | "allow_covers"
  | "covers_focus";

export type ThemeType =
  | "OP"
  | "ED"
  | "OST"
  | "INSERT"
  | "CHARACTER"
  | "VOCALOID"
  | "UTAITE"
  | "RHYTHM"
  | "DOUJIN";

export type EraFilter = "ALL" | "2020s" | "2010s" | "2000s" | "classic";

export type FamiliarityLevel = 1 | 2 | 3 | 4 | 5;

export type PopularityLevel = 1 | 2 | 3 | 4;

export interface AnimeSearchItem {
  id: number;
  titleRomaji: string;
  titleNative: string;
  titleEnglish: string | null;
  seasonYear: number | null;
  genres: string[];
  coverImage: string | null;
}

export interface YouTubePlaylistSummary {
  id: string;
  title: string;
  itemCount: number;
  thumbnail: string | null;
  kind: "playlist" | "likes";
}

export interface KnownTrackItem {
  rawTitle: string;
  channelTitle?: string;
  videoId?: string;
  sourceName: string;
  scene?: SceneDomain;
}

export interface TasteDNA {
  summary: string;
  sonicTraits: string[];
  favoriteArtists: string[];
  eraPreference: string;
  recommendedSeeds: string[];
}

export interface TasteProfile {
  version: 1;
  sourceSignature: string;
  updatedAt: string;
  selectedSources: Array<{ id: string; title: string; count: number }>;
  dna: TasteDNA;
  knownTracks: KnownTrackItem[];
}

export interface ExcludedTrackRef {
  title: string;
  titleRomaji?: string;
  artist: string;
  artistRomaji?: string;
  animeTitle?: string;
  scene?: SceneDomain;
}

export type WatchedAnimeStatus = "완료" | "보는 중";

export interface WatchedAnimeItem {
  id: string;
  title: string;
  status: WatchedAnimeStatus;
  rating: string | null;
  genre: string | null;
  rank: number | null;
  note: string | null;
  source: "notion" | "manual";
  addedAt: string;
}

export type WatchedAnimeMode =
  | "ignore"
  | "prefer_watched"
  | "discover_unwatched";

export interface PlaylistGenerateRequest {
  scenes?: SceneDomain[];
  vocaloidVocalMode?: VocaloidVocalMode;
  seeds: string[];
  moods: string[];
  genres?: string[];
  themeTypes: ThemeType[];
  era: EraFilter;
  trackCount: number;
  prompt?: string;
  includeHiddenGems?: boolean;
  popularityLevel?: PopularityLevel;
  familiarityLevel?: FamiliarityLevel;
  excludeRecentTurns?: number;
  watchedAnimeMode?: WatchedAnimeMode;
  tasteProfile?: {
    dna: TasteDNA;
    knownTracks: KnownTrackItem[];
  } | null;
}

export interface PlaylistTrack {
  id: string;
  scene?: SceneDomain;
  title: string;
  titleRomaji: string;
  artist: string;
  artistRomaji: string;
  animeTitle: string;
  animeTitleJapanese: string;
  animeTitleRomaji: string;
  themeType: ThemeType;
  themeLabel: string;
  year: number | null;
  bpmVibe: string;
  reason: string;
  setlistSection?: string;
  inUserLibrary?: boolean;
  coverImage: string | null;
  youtubeVideoId: string | null;
  youtubeCandidateIds?: string[];
  youtubeUrl: string;
  youtubeMusicUrl: string;
  spotifyUri: string | null;
  spotifyUrl: string;
}

export interface GeneratedPlaylist {
  title: string;
  description: string;
  curatorSummary: string;
  mode: "gemini" | "demo-fallback";
  scenes?: SceneDomain[];
  tracks: PlaylistTrack[];
}

export interface ExportTrackResult {
  trackId: string;
  title: string;
  artist: string;
  status: "added" | "not_found" | "failed";
  matchedTitle?: string;
  externalUrl?: string;
  reason?: string;
}

export interface PlaylistExportResponse {
  platform: "youtube" | "spotify";
  playlistId: string;
  playlistUrl: string;
  secondaryUrl?: string;
  addedCount: number;
  totalCount: number;
  results: ExportTrackResult[];
}

export interface PlaylistHistoryEntry {
  id: string;
  createdAt: string;
  title: string;
  trackCount: number;
  mode: "gemini" | "demo-fallback";
  playlist: GeneratedPlaylist;
}

export interface CustomPreset {
  id: string;
  label: string;
  createdAt: string;
  data: {
    scenes?: SceneDomain[];
    vocaloidVocalMode?: VocaloidVocalMode;
    seeds: string[];
    moods: string[];
    genres: string[];
    themeTypes: ThemeType[];
    era: EraFilter;
    trackCount: number;
    popularityLevel: PopularityLevel;
    prompt: string;
  };
}

export interface AniListUserMediaItem {
  mediaId: number;
  status: "CURRENT" | "COMPLETED" | "PAUSED" | "PLANNING" | "REPEATING";
  score: number;
  titleRomaji: string;
  titleNative: string;
  titleEnglish: string | null;
  seasonYear: number | null;
  genres: string[];
  coverImage: string | null;
}

export type GenerationStage =
  | "preparing"
  | "curating"
  | "enriching_anilist"
  | "enriching_youtube"
  | "saving"
  | "done"
  | "error";

export interface GenerationProgressState {
  stage: GenerationStage;
  message: string;
  detail?: string;
  percent: number;
}

export interface StoredUserData {
  accountKey: string;
  updatedAt: string;
  tasteProfile: TasteProfile | null;
  lastPlaylist: GeneratedPlaylist | null;
  playlistHistory: PlaylistHistoryEntry[];
  customPresets?: CustomPreset[];
  manualKnownTracks?: KnownTrackItem[];
  anilistUsername?: string | null;
}

export interface YouTubeQuotaStatus {
  ptDate: string;
  dailyLimit: number;
  usedUnits: number;
  remainingUnits: number;
  exhausted: boolean;
  searchCalls: number;
  writeCalls: number;
  readCalls: number;
  cacheHits: number;
  updatedAt: string;
  nextResetKstLabel: string;
}

export interface AuthStatus {
  geminiConfigured: boolean;
  youtubeConfigured: boolean;
  youtubeApiKeyConfigured: boolean;
  spotifyConfigured: boolean;
  youtubeConnected: boolean;
  youtubeChannelName?: string;
  spotifyConnected: boolean;
  spotifyDisplayName?: string;
  appUrl: string;
  youtubeQuota?: YouTubeQuotaStatus;
}
