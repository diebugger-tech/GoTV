import { extractUrls, normalizeUrl, isStreamUrl } from "./urls";

describe("extractUrls", () => {
  it("finds urls with scheme and bare stream hosts", () => {
    let text =
      "Check https://youtu.be/abcDEF12 and www.twitch.tv/gosensations " +
      "plus http://youtube.com/watch?v=xyz12345 and a plain word";
    expect(extractUrls(text)).toEqual([
      "https://youtu.be/abcDEF12",
      "www.twitch.tv/gosensations",
      "http://youtube.com/watch?v=xyz12345",
    ]);
  });

  it("ignores non-stream hosts without scheme", () => {
    expect(extractUrls("see example.com/foo and go.dev/x")).toEqual([]);
  });

  it("strips trailing punctuation", () => {
    expect(extractUrls("look: https://youtu.be/abcDEF12.")).toEqual([
      "https://youtu.be/abcDEF12",
    ]);
  });
});

describe("normalizeUrl", () => {
  it("prepends https:// when there is no scheme", () => {
    expect(normalizeUrl("youtu.be/abcDEF12")).toBe("https://youtu.be/abcDEF12");
    expect(normalizeUrl("http://youtu.be/abcDEF12")).toBe(
      "http://youtu.be/abcDEF12"
    );
  });
});

describe("isStreamUrl", () => {
  it("recognizes youtube and twitch hosts", () => {
    expect(isStreamUrl("https://www.youtube.com/watch?v=x")).toBe(true);
    expect(isStreamUrl("https://youtu.be/x")).toBe(true);
    expect(isStreamUrl("twitch.tv/somechannel")).toBe(true);
    expect(isStreamUrl("https://example.com/watch?v=x")).toBe(false);
  });
});
