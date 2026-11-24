import { describe, expect, it } from "vitest";
import {
  breakDurations, applyPronunciations, isPauseOnly, looksBroken, naturalCompare, pauseDurationMs, sameLine, sentenceSpan, splitIntoParagraphs, splitLong, toTranscript,
} from "@/lib/text";

describe("sameLine", () => {
  it("ignores case, whitespace, punctuation (incl. danda) and symbols", () => {
    expect(sameLine("आवश्यक जानकारी:", "आवश्यक  जानकारी")).toBe(true);
    expect(sameLine("यह रिकॉर्डिंग का अंत है।", "यह रिकॉर्डिंग का अंत है")).toBe(true);
    expect(sameLine("अंत ॥", "अंत")).toBe(true);
    expect(sameLine("The END!", "the end")).toBe(true);
    expect(sameLine("क़", "क़")).toBe(true); // क़ precomposed vs nukta (NFC)
    expect(sameLine("आवश्यक जानकारी", "आवश्यक")).toBe(false);
    expect(sameLine("कि", "की")).toBe(false);
  });
});

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

it("applies the pronunciation dictionary", () => {
  expect(applyPronunciations("jambalaya and rice", [{ text: "jambalaya", pronunciation: "jam bal aya" }])).toBe("<<jam bal aya>> and rice");
  expect(applyPronunciations("longword", [{ text: "longword", pronunciation: "x" }, { text: "word", pronunciation: "y" }])).toBe("<<x>>"); // longest first
  expect(applyPronunciations("unchanged", [{ text: "missing", pronunciation: "z" }])).toBe("unchanged");
  expect(applyPronunciations("ok", [])).toBe("ok");
});

it("matches pronunciations on word boundaries only", () => {
  expect(applyPronunciations("many", [{ text: "an", pronunciation: "X" }])).toBe("many");
  expect(applyPronunciations("many than Johns", [{ text: "an", pronunciation: "X" }, { text: "John", pronunciation: "Y" }])).toBe("many than Johns");
  expect(applyPronunciations("an apple", [{ text: "an", pronunciation: "X" }])).toBe("<<X>> apple");
});

it("does not nest pronunciations", () => {
  expect(applyPronunciations("joe", [{ text: "joe", pronunciation: "jo" }, { text: "oe", pronunciation: "o" }])).toBe("<<jo>>");
  expect(applyPronunciations("a", [{ text: "a", pronunciation: "A" }, { text: "A", pronunciation: "a" }])).toBe("<<A>>");
});

it("matches pronunciations on Devanagari word boundaries", () => {
  expect(applyPronunciations("हिंदी", [{ text: "हिंद", pronunciation: "Hind" }])).toBe("हिंदी");
  expect(applyPronunciations("हिंद", [{ text: "हिंद", pronunciation: "Hind" }])).toBe("<<Hind>>");
});

it("detects text that arrived as question marks", () => {
  expect(looksBroken("?????? ?? ??????:")).toBe(true);
  expect(looksBroken("यह Recording ?? ???")).toBe(true);
  expect(looksBroken("उन्होंने क्या-क्या तैयारी की? वे इस काम के लिए क्यों?")).toBe(false);
  expect(looksBroken("What? Really?! (yes?) \"ok?\"")).toBe(false);
  expect(looksBroken("नमस्ते")).toBe(false);
});

describe("sentenceSpan", () => {
  it("finds the sentence a click landed in", () => {
    const t = "First one. Second one! Third one?";
    expect(sentenceSpan(t, 2)).toEqual({ start: 0, end: 10 });
    expect(sentenceSpan(t, 12)).toEqual({ start: 12, end: 22 });
    expect(sentenceSpan(t, 25)).toEqual({ start: 25, end: 33 });
  });

  it("handles the Devanagari danda", () => {
    const t = "एक वाक्य। दूसरा वाक्य॥ तीसरा";
    expect(sentenceSpan(t, 0)).toEqual({ start: 0, end: 9 });
    expect(sentenceSpan(t, 15)).toEqual({ start: 15, end: 22 });
    expect(sentenceSpan(t, 25)).toEqual({ start: 25, end: 28 });
  });

  it("keeps a single sentence whole", () => {
    expect(sentenceSpan("Only one sentence here", 5)).toEqual({ start: 0, end: 22 });
  });

  it("clamps an offset past the end", () => {
    expect(sentenceSpan("One. Two.", 999)).toEqual({ start: 9, end: 9 });
  });
});
