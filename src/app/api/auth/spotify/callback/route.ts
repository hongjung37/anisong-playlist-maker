import { NextRequest, NextResponse } from "next/server";
import {
  getAppOrigin,
  SPOTIFY_COOKIE_NAME,
  verifyOAuthState,
  writeSessionCookie,
} from "@/lib/oauth";

export async function GET(request: NextRequest) {
  const origin = getAppOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(`spotify:${error}`)}`
    );
  }

  const statePayload = await verifyOAuthState("spotify", state);
  if (!statePayload || !code) {
    return NextResponse.redirect(`${origin}/?auth_error=spotify_invalid_state`);
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?auth_error=spotify_not_configured`);
  }

  const redirectUri = `${statePayload.origin || origin}/api/auth/spotify/callback`;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/?auth_error=spotify_token_failed`);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  let displayName = "Spotify 계정";
  let accountId: string | undefined;
  try {
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as {
        id?: string;
        display_name?: string;
      };
      if (me.display_name) displayName = me.display_name;
      if (me.id) accountId = me.id;
    }
  } catch {
    // Non-fatal
  }

  await writeSessionCookie(SPOTIFY_COOKIE_NAME, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    displayName,
    accountId,
  });

  return NextResponse.redirect(`${origin}/?connected=spotify`);
}
