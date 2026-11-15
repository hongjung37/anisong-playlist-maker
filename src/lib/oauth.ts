import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export interface OAuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  displayName?: string;
  accountId?: string;
}

export const YOUTUBE_COOKIE_NAME = "anitune_yt_session";
export const SPOTIFY_COOKIE_NAME = "anitune_sp_session";
export const OAUTH_STATE_COOKIE_NAME = "anitune_oauth_state";

function getSecret(): Buffer {
  const raw =
    process.env.AUTH_COOKIE_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.SPOTIFY_CLIENT_SECRET ||
    "anitune-local-dev-ephemeral-secret";
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptPayload(payload: object): string {
  const key = getSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptPayload<T>(token: string): T | null {
  try {
    const key = getSecret();
    const buf = Buffer.from(token, "base64url");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function getAppOrigin(request?: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  if (request) {
    return request.nextUrl.origin;
  }
  return "http://localhost:3000";
}

export async function readSessionCookie(
  name: string
): Promise<OAuthSession | null> {
  const store = await cookies();
  const value = store.get(name)?.value;
  if (!value) return null;
  return decryptPayload<OAuthSession>(value);
}

export async function writeSessionCookie(
  name: string,
  session: OAuthSession
): Promise<void> {
  const store = await cookies();
  store.set(name, encryptPayload(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });
}

export async function clearSessionCookie(name: string): Promise<void> {
  const store = await cookies();
  store.delete(name);
}

export async function createOAuthState(
  provider: "youtube" | "spotify",
  extra?: Record<string, string>
): Promise<string> {
  const state = crypto.randomBytes(24).toString("base64url");
  const store = await cookies();
  store.set(
    OAUTH_STATE_COOKIE_NAME,
    encryptPayload({ state, provider, ...extra }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10, // 10 minutes
    }
  );
  return state;
}

export async function verifyOAuthState(
  expectedProvider: "youtube" | "spotify",
  returnedState: string | null
): Promise<Record<string, string> | null> {
  if (!returnedState) return null;
  const store = await cookies();
  const raw = store.get(OAUTH_STATE_COOKIE_NAME)?.value;
  store.delete(OAUTH_STATE_COOKIE_NAME);
  if (!raw) return null;
  const parsed = decryptPayload<Record<string, string>>(raw);
  if (!parsed) return null;
  if (parsed.provider !== expectedProvider || parsed.state !== returnedState) {
    return null;
  }
  return parsed;
}

export async function getValidYouTubeSession(): Promise<OAuthSession | null> {
  const session = await readSessionCookie(YOUTUBE_COOKIE_NAME);
  if (!session) return null;

  if (Date.now() < session.expiresAt - 60_000) {
    return session;
  }

  if (
    !session.refreshToken ||
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  ) {
    return null;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: session.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    await clearSessionCookie(YOUTUBE_COOKIE_NAME);
    return null;
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  const updated: OAuthSession = {
    ...session,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  await writeSessionCookie(YOUTUBE_COOKIE_NAME, updated);
  return updated;
}

export async function getValidSpotifySession(): Promise<OAuthSession | null> {
  const session = await readSessionCookie(SPOTIFY_COOKIE_NAME);
  if (!session) return null;

  if (Date.now() < session.expiresAt - 60_000) {
    return session;
  }

  if (
    !session.refreshToken ||
    !process.env.SPOTIFY_CLIENT_ID ||
    !process.env.SPOTIFY_CLIENT_SECRET
  ) {
    return null;
  }

  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }),
  });

  if (!res.ok) {
    await clearSessionCookie(SPOTIFY_COOKIE_NAME);
    return null;
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  };
  const updated: OAuthSession = {
    ...session,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  await writeSessionCookie(SPOTIFY_COOKIE_NAME, updated);
  return updated;
}
