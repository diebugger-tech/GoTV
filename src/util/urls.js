// @flow

// Port of extract_urls from Tiger's Mouth (crates/ui/src/chat_panel.rs):
// token-based URL detection for chat text. Finds tokens starting with a
// scheme or a bare stream host.
export function extractUrls(text: string): Array<string> {
  return text
    .split(/\s+/)
    .filter((w) => {
      return (
        w.startsWith("https://") ||
        w.startsWith("http://") ||
        w.startsWith("twitch.tv/") ||
        w.startsWith("www.twitch.tv/") ||
        w.startsWith("youtube.com/") ||
        w.startsWith("www.youtube.com/") ||
        w.startsWith("youtu.be/")
      );
    })
    .map((w) => w.replace(/[.,;:!?)\]}]+$/, ""));
}

// Port of normalize_url from Tiger's Mouth: prepend https:// if the token
// has no scheme.
export function normalizeUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return "https://" + url;
}

// Stream hosts we can open in the TV tab (YouTube/Twitch)
export function isStreamUrl(url: string): boolean {
  let normalized = normalizeUrl(url);
  try {
    let hostname = new URL(normalized).hostname.replace(/^www\./, "");
    return (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "youtu.be" ||
      hostname === "twitch.tv" ||
      hostname === "m.twitch.tv"
    );
  } catch (e) {
    return false;
  }
}
