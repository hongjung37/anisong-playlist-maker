import { describe, expect, it } from "vitest";
import { decryptPayload, encryptPayload } from "@/lib/oauth";

describe("oauth payload encryption", () => {
  it("encrypts and decrypts a session payload cleanly", () => {
    const session = {
      accessToken: "ya29.test-access-token",
      refreshToken: "1//test-refresh-token",
      expiresAt: 1_800_000_000_000,
      displayName: "AniTune User",
      accountId: "UC_test_12345",
    };

    const token = encryptPayload(session);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(30);

    const decoded = decryptPayload<typeof session>(token);
    expect(decoded).toEqual(session);
  });

  it("returns null for tampered, truncated, or invalid tokens", () => {
    const token = encryptPayload({ state: "abc", provider: "youtube" });
    const midIdx = Math.floor(token.length / 2);
    const flippedChar = token[midIdx] === "A" ? "B" : "A";
    const tampered = `${token.slice(0, midIdx)}${flippedChar}${token.slice(midIdx + 1)}`;

    expect(decryptPayload(tampered)).toBeNull();
    expect(decryptPayload("short")).toBeNull();
    expect(decryptPayload("")).toBeNull();
  });
});
