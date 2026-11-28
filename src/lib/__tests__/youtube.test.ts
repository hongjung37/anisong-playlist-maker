import { describe, expect, it } from "vitest";
import {
  cleanSearchText,
  decodeHtmlEntities,
  isCoverMatch,
  isLivePerformance,
  isLowQualityMatch,
  isRhythmGameplayVideo,
  isTopicChannel,
  mapWithConcurrency,
  parseIsoDurationSec,
} from "@/lib/youtube";

describe("youtube matching & filtering helpers", () => {
  it("flags low-quality variants (karaoke, nightcore, covers, loops, shorts)", () => {
    expect(isLowQualityMatch("青春コンプレックス [Karaoke]")).toBe(true);
    expect(isLowQualityMatch("Seishun Complex Off Vocal")).toBe(true);
    expect(isLowQualityMatch("unravel - Nightcore ver.")).toBe(true);
    expect(isLowQualityMatch("KICK BACK 1 hour loop")).toBe(true);
    expect(isLowQualityMatch("God knows... piano cover")).toBe(true);
    expect(isLowQualityMatch("アイドル #shorts")).toBe(true);

    expect(isLowQualityMatch("結束バンド「青春コンプレックス」MUSIC VIDEO")).toBe(false);
    expect(isLowQualityMatch("Kenshi Yonezu - KICK BACK")).toBe(false);
  });

  it("filters live performances unless track title itself is live", () => {
    expect(isLivePerformance("unravel (LIVE at Nippon Budokan)", "unravel")).toBe(true);
    expect(isLivePerformance("晴る - THE FIRST TAKE", "晴る")).toBe(true);
    expect(isLivePerformance("God knows... (Live ver.)", "God knows... Live")).toBe(false);
    expect(isLivePerformance("晴る Official MV", "晴る")).toBe(false);
  });

  it("filters user covers, AI covers, and VTuber singing streams", () => {
    expect(
      isCoverMatch("青春コンプレックス 歌ってみた", "Utattemita Ch", "青春コンプレックス", "結束バンド")
    ).toBe(true);
    expect(
      isCoverMatch("KICK BACK AIカバー", "AIChannel", "KICK BACK", "米津玄師")
    ).toBe(true);
    expect(
      isCoverMatch("【歌枠】アニソン縛り", "Hololive VTuber", "晴る", "ヨルシカ")
    ).toBe(true);
    expect(
      isCoverMatch("青春コンプレックス", "結束バンド Official", "青春コンプレックス", "結束バンド")
    ).toBe(false);
  });

  it("detects YouTube Topic channels in English and Korean", () => {
    expect(isTopicChannel("Kessoku Band - Topic")).toBe(true);
    expect(isTopicChannel("YOASOBI - 주제")).toBe(true);
    expect(isTopicChannel("アニプレックス チャンネル")).toBe(false);
  });

  it("parses ISO 8601 durations accurately", () => {
    expect(parseIsoDurationSec("PT3M45S")).toBe(225);
    expect(parseIsoDurationSec("PT1H2M3S")).toBe(3723);
    expect(parseIsoDurationSec("PT42S")).toBe(42);
    expect(parseIsoDurationSec(undefined)).toBe(0);
  });

  it("cleans search text and decodes HTML entities", () => {
    expect(cleanSearchText("涼宮ハルヒ (CV.平野綾) ☆")).toBe("涼宮ハルヒ");
    expect(decodeHtmlEntities("A &amp; B &quot;Live&#39;s&#x21;")).toBe(
      "A & B \"Live's!"
    );
  });

  it("mapWithConcurrency preserves order and caps concurrent execution", async () => {
    let active = 0;
    let peak = 0;
    const inputs = [40, 10, 30, 5, 25, 15];

    const outputs = await mapWithConcurrency(inputs, 2, async (delayMs, idx) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, delayMs));
      active -= 1;
      return `${idx}:${delayMs}`;
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(outputs).toEqual(["0:40", "1:10", "2:30", "3:5", "4:25", "5:15"]);
  });

  it("allows instrumental and chiptune only for rhythm_doujin or OST/RHYTHM tracks", () => {
    expect(isLowQualityMatch("FREEDOM DiVE (Instrumental)")).toBe(true);
    expect(
      isLowQualityMatch("FREEDOM DiVE (Instrumental)", { scene: "anime" })
    ).toBe(true);
    expect(
      isLowQualityMatch("You Make My Life 1UP 8bit chiptune", {
        scene: "rhythm_doujin",
      })
    ).toBe(false);
    expect(
      isLowQualityMatch("Zoltraak インスト", { themeType: "OST" })
    ).toBe(false);
    expect(
      isLowQualityMatch("Brain Power [Karaoke]", { scene: "rhythm_doujin" })
    ).toBe(true);
    expect(
      isLowQualityMatch("Oshama Scramble! Nightcore", { scene: "rhythm_doujin" })
    ).toBe(true);
    expect(
      isLowQualityMatch("FREEDOM DiVE 1 hour loop", { scene: "rhythm_doujin" })
    ).toBe(true);
  });

  it("detects rhythm game gameplay/chart videos while preserving official audio and remixes", () => {
    expect(isRhythmGameplayVideo("Brain Power [SDVX 譜面確認]")).toBe(true);
    expect(isRhythmGameplayVideo("Oshama Scramble! 手元 理論値")).toBe(true);
    expect(isRhythmGameplayVideo("Cyaegha Arcaea All Perfect")).toBe(true);
    expect(isRhythmGameplayVideo("FREEDOM DiVE 플레이 영상 채보")).toBe(true);

    expect(
      isRhythmGameplayVideo("かめりあ feat. ななひら - ベースラインやってる？笑 Official Audio")
    ).toBe(false);
    expect(isRhythmGameplayVideo("xi - FREEDOM DiVE (BMS BGA)")).toBe(false);
    expect(isRhythmGameplayVideo("Oshama Scramble! (Long ver.)")).toBe(false);
    expect(isRhythmGameplayVideo("Song Title (Camellia Remix)")).toBe(false);
  });

  it("permits human utaite covers only for UTAITE tracks while always blocking AI covers", () => {
    expect(
      isCoverMatch(
        "命に嫌われている。 歌ってみた",
        "まふまふちゃんねる",
        "命に嫌われている。",
        "まふまふ",
        "",
        { themeType: "UTAITE" }
      )
    ).toBe(false);

    expect(
      isCoverMatch(
        "メルト cover",
        "Utaite Ch",
        "メルト",
        "supercell",
        "",
        { themeType: "VOCALOID" }
      )
    ).toBe(true);

    expect(
      isCoverMatch(
        "命に嫌われている。 AIカバー",
        "AIChannel",
        "命に嫌われている。",
        "まふまふ",
        "",
        { themeType: "UTAITE" }
      )
    ).toBe(true);
  });
});
