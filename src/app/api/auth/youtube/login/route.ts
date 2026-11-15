import { connection, NextRequest, NextResponse } from "next/server";
import { createOAuthState, getAppOrigin } from "@/lib/oauth";

export async function GET(request: NextRequest) {
  await connection();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(
      `${getAppOrigin(request)}/?auth_error=youtube_not_configured`
    );
  }

  const origin = getAppOrigin(request);
  const redirectUri = `${origin}/api/auth/youtube/callback`;
  const state = await createOAuthState("youtube", { origin });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
