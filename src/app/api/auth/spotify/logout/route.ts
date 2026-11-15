import { NextResponse } from "next/server";
import { clearSessionCookie, SPOTIFY_COOKIE_NAME } from "@/lib/oauth";

export async function POST() {
  await clearSessionCookie(SPOTIFY_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
