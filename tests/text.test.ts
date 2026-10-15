import { describe, expect, it } from "vitest";
import {
  breakDurations, isPauseOnly, looksBroken, naturalCompare, pauseDurationMs, splitIntoParagraphs, splitLong, toTranscript,
} from "@/lib/text";

const B = '<break time="1s" />';

describe("break tags", () => {
  it("parses s, ms, decimals and spacing variants", () => {
    expect(breakDurations('<break time="1s"/> <break time="500ms" /> <break time=\'1.5s\'/>')).toEqual([1000, 500, 1500]);
  });
  it("detects pause-only paragraphs", () => {
    expect(isPauseOnly(`${B}${B} ${B}`)).toBe(true);
    expect(isPauseOnly(`नमस्ते ${B}`)).toBe(false);
    expect(isPauseOnly("plain")).toBe(false);
    expect(pauseDurationMs(B.repeat(5))).toBe(5000);
  });
  it("normalises transcript", () => {
    expect(toTranscript('a  <break time="1S" />\n b')).toBe('a <break time="1s"/> b');
  });
});

describe("splitIntoParagraphs", () => {
  it("handles the user's exact pause line format", () => {
    const raw = '<break time="1s" /><break time="1s" /> <break time="1s" />  <break time="1s" /><break time="1s" /> ';
    expect(isPauseOnly(raw)).toBe(true);
    expect(pauseDurationMs(raw)).toBe(5000);
    expect(splitIntoParagraphs(raw)).toEqual([B.repeat(5)]);
    expect(splitIntoParagraphs(`इस ऑडियो को यहां रोकें। ${raw}`)).toEqual(["इस ऑडियो को यहां रोकें।", B.repeat(5)]);
  });
  it("splits on lines and separates trailing pause runs (ElevenLabs style)", () => {
    const raw = `यहां रुकें और चर्चा करें। इस ऑडियो को यहां रोकें। ${B}${B}${B}\nफिर मूसा बैल के बाकी हिस्सों को जला दे।`;
    expect(splitIntoParagraphs(raw)).toEqual([
      "यहां रुकें और चर्चा करें। इस ऑडियो को यहां रोकें।",
      B.repeat(3),
      "फिर मूसा बैल के बाकी हिस्सों को जला दे।",
    ]);
  });
  it("keeps a single inline break inside a sentence", () => {
    expect(splitIntoParagraphs(`Hello ${B} world.`)).toEqual([`Hello ${B} world.`]);
  });
  it("splits a run of 2+ breaks in the middle", () => {
    expect(splitIntoParagraphs(`One. ${B}${B} Two.`)).toEqual(["One.", B + B, "Two."]);
  });
  it("blank-line mode joins wrapped lines", () => {
    expect(splitIntoParagraphs("a\nb\n\nc\r\n", "blank")).toEqual(["a b", "c"]);
  });
  it("splits long paragraphs on sentence ends incl. danda", () => {
    const s = "क".repeat(40) + "। ";
    const parts = splitLong(s.repeat(10), 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, "")).toBe(s.repeat(10).replace(/\s+/g, ""));
  });
});

it("natural sort", () => {
  expect(["s10", "s2", "s1"].sort(naturalCompare)).toEqual(["s1", "s2", "s10"]);
});

it("detects text that arrived as question marks", () => {
  expect(looksBroken("?????? ?? ??????:")).toBe(true);
  expect(looksBroken("यह Recording ?? ???")).toBe(true);
  expect(looksBroken("उन्होंने क्या-क्या तैयारी की? वे इस काम के लिए क्यों?")).toBe(false);
  expect(looksBroken("What? Really?! (yes?) \"ok?\"")).toBe(false);
  expect(looksBroken("नमस्ते")).toBe(false);
});
