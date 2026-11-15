import { NextRequest, NextResponse } from "next/server";
import {
  getAppOrigin,
  getValidSpotifySession,
  getValidYouTubeSession,
} from "@/lib/oauth";
import type { AuthStatus } from "@/types/playlist";

export async function GET(request: NextRequest) {
  const [ytSession, spSession] = await Promise.all([
    getValidYouTubeSession(),
    getValidSpotifySession(),
  ]);

  const status: AuthStatus = {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    youtubeConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    youtubeApiKeyConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    spotifyConfigured: Boolean(
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
    ),
    youtubeConnected: Boolean(ytSession),
    youtubeChannelName: ytSession?.displayName,
    spotifyConnected: Boolean(spSession),
    spotifyDisplayName: spSession?.displayName,
    appUrl: getAppOrigin(request),
  };

  return NextResponse.json(status);
}
