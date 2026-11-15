import { NextRequest, NextResponse } from "next/server";
import {
  getAppOrigin,
  verifyOAuthState,
  writeSessionCookie,
  YOUTUBE_COOKIE_NAME,
} from "@/lib/oauth";

export async function GET(request: NextRequest) {
  const origin = getAppOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(`youtube:${error}`)}`
    );
  }

  const statePayload = await verifyOAuthState("youtube", state);
  if (!statePayload || !code) {
    return NextResponse.redirect(`${origin}/?auth_error=youtube_invalid_state`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?auth_error=youtube_not_configured`);
  }

  const redirectUri = `${statePayload.origin || origin}/api/auth/youtube/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/?auth_error=youtube_token_failed`);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  let channelName = "YouTube 계정";
  let accountId: string | undefined;
  try {
    const channelRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );
    if (channelRes.ok) {
      const channelData = (await channelRes.json()) as {
        items?: Array<{ id?: string; snippet?: { title?: string } }>;
      };
      const ch = channelData.items?.[0];
      if (ch?.snippet?.title) channelName = ch.snippet.title;
      if (ch?.id) accountId = ch.id;
    }
  } catch {
    // Non-fatal; channel name stays default
  }

  await writeSessionCookie(YOUTUBE_COOKIE_NAME, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    displayName: channelName,
    accountId,
  });

  return NextResponse.redirect(`${origin}/?connected=youtube`);
}
