import { connection, NextRequest, NextResponse } from "next/server";
import { createOAuthState, getAppOrigin } from "@/lib/oauth";

export async function GET(request: NextRequest) {
  await connection();
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId || !process.env.SPOTIFY_CLIENT_SECRET) {
    return NextResponse.redirect(
      `${getAppOrigin(request)}/?auth_error=spotify_not_configured`
    );
  }

  const origin = getAppOrigin(request);
  const redirectUri = `${origin}/api/auth/spotify/callback`;
  const state = await createOAuthState("spotify", { origin });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "playlist-modify-public playlist-modify-private user-read-private",
    redirect_uri: redirectUri,
    state,
    show_dialog: "true",
  });

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );
}
