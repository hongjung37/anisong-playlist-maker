import { NextResponse } from "next/server";
import { clearSessionCookie, YOUTUBE_COOKIE_NAME } from "@/lib/oauth";

export async function POST() {
  await clearSessionCookie(YOUTUBE_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
