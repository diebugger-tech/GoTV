import {
  getLiveGames,
  getLiveEventGames,
  validateTvEvent,
  getYouTubeVideoId,
  getTwitchChannel,
  getEmbedUrlForEvent,
  groupEventsByTime,
  getLiveEvents,
  getNextUpcomingEvent,
} from "./tv";

function makeUser(name, rankVal) {
  return { name, rankVal };
}

function makeGame(id, black, white, over) {
  return {
    id,
    type: "ranked",
    players: { black, white },
    over: !!over,
  };
}

describe("getLiveGames", () => {
  it("keeps only in-progress games with both players", () => {
    let games = [
      makeGame(1, makeUser("a", 3), makeUser("b", 3), false),
      makeGame(2, makeUser("a", 3), makeUser("b", 3), true),
      makeGame(3, null, makeUser("b", 3), false),
    ];
    expect(getLiveGames(games).map((g) => g.id)).toEqual([1]);
  });
});

describe("getLiveEventGames", () => {
  it("keeps only in-progress games flagged as KGS server events", () => {
    let games = [
      {
        ...makeGame(1, makeUser("a", 3), makeUser("b", 3), false),
        event: true,
      },
      makeGame(2, makeUser("a", 3), makeUser("b", 3), false), // not an event
      { ...makeGame(3, makeUser("a", 3), makeUser("b", 3), true), event: true }, // over
    ];
    expect(getLiveEventGames(games).map((g) => g.id)).toEqual([1]);
  });
});

describe("validateTvEvent", () => {
  it("accepts a valid youtube event", () => {
    let event = validateTvEvent({
      id: "ev1",
      name: "Test Event",
      date_start: "2026-06-15",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@channel",
    });
    expect(event).not.toBe(null);
    expect(event.id).toBe("ev1");
  });

  it("rejects entries with invalid fields", () => {
    expect(validateTvEvent(null)).toBe(null);
    expect(validateTvEvent({ id: "x" })).toBe(null);
    expect(
      validateTvEvent({
        id: "x",
        name: "X",
        date_start: "not-a-date",
        platform: "youtube",
        stream_url: "https://x",
      })
    ).toBe(null);
    expect(
      validateTvEvent({
        id: "x",
        name: "X",
        date_start: "2026-01-01",
        platform: "vimeo",
        stream_url: "https://x",
      })
    ).toBe(null);
  });
});

describe("getYouTubeVideoId", () => {
  it("extracts ids from watch/share/embed/live urls", () => {
    expect(getYouTubeVideoId("https://www.youtube.com/watch?v=abcDEF12")).toBe(
      "abcDEF12"
    );
    expect(getYouTubeVideoId("https://youtu.be/abcDEF12")).toBe("abcDEF12");
    expect(getYouTubeVideoId("https://www.youtube.com/embed/abcDEF12")).toBe(
      "abcDEF12"
    );
    expect(getYouTubeVideoId("https://www.youtube.com/live/abcDEF12")).toBe(
      "abcDEF12"
    );
  });

  it("returns null for channel urls", () => {
    expect(getYouTubeVideoId("https://www.youtube.com/@BadukTV")).toBe(null);
    expect(getYouTubeVideoId("https://www.youtube.com/channel/UCxyz")).toBe(
      null
    );
  });
});

describe("getTwitchChannel", () => {
  it("extracts channel names", () => {
    expect(getTwitchChannel("https://www.twitch.tv/gosensations")).toBe(
      "gosensations"
    );
  });

  it("returns null for video links and other hosts", () => {
    expect(getTwitchChannel("https://www.twitch.tv/videos/12345")).toBe(null);
    expect(getTwitchChannel("https://example.com/foo")).toBe(null);
  });
});

describe("getEmbedUrlForEvent", () => {
  it("builds a nocookie youtube embed url", () => {
    let url = getEmbedUrlForEvent(
      {
        id: "e",
        name: "E",
        date_start: "2026-01-01",
        platform: "youtube",
        stream_url: "https://www.youtube.com/watch?v=abcDEF12",
      },
      "localhost"
    );
    expect(url).toBe("https://www.youtube-nocookie.com/embed/abcDEF12");
  });

  it("returns null when embedding is not possible (channel url)", () => {
    let url = getEmbedUrlForEvent(
      {
        id: "e",
        name: "E",
        date_start: "2026-01-01",
        platform: "youtube",
        stream_url: "https://www.youtube.com/@BadukTV",
      },
      "localhost"
    );
    expect(url).toBe(null);
  });

  it("builds twitch player urls with parent param", () => {
    let channelUrl = getEmbedUrlForEvent(
      {
        id: "e",
        name: "E",
        date_start: "2026-01-01",
        platform: "twitch",
        stream_url: "https://www.twitch.tv/somechannel",
      },
      "example.com"
    );
    expect(channelUrl).toBe(
      "https://player.twitch.tv/?channel=somechannel&parent=example.com"
    );
  });
});

describe("groupEventsByTime", () => {
  let events = [
    validateTvEvent({
      id: "past",
      name: "Past",
      date_start: "2026-05-30",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@x",
    }),
    validateTvEvent({
      id: "today",
      name: "Today",
      date_start: "2026-06-15",
      date_end: "2026-06-16",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@x",
    }),
    validateTvEvent({
      id: "upcoming",
      name: "Upcoming",
      date_start: "2026-08-10",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@x",
    }),
  ];

  it("groups events relative to now", () => {
    let now = new Date("2026-06-16T12:00:00");
    let groups = groupEventsByTime(events, now);
    expect(groups.today.map((e) => e.id)).toEqual(["today"]);
    expect(groups.upcoming.map((e) => e.id)).toEqual(["upcoming"]);
    expect(groups.past.map((e) => e.id)).toEqual(["past"]);
  });
});

describe("getLiveEvents", () => {
  let events = [
    validateTvEvent({
      id: "today",
      name: "Today",
      date_start: "2026-06-15",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@x",
    }),
    validateTvEvent({
      id: "upcoming",
      name: "Upcoming",
      date_start: "2026-08-10",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@x",
    }),
  ];

  it("returns only events live right now", () => {
    let now = new Date("2026-06-15T12:00:00");
    expect(getLiveEvents(events, now).map((e) => e.id)).toEqual(["today"]);
  });

  it("returns an empty array when nothing is live", () => {
    let now = new Date("2026-01-01T12:00:00");
    expect(getLiveEvents(events, now)).toEqual([]);
  });
});

describe("getNextUpcomingEvent", () => {
  let events = [
    validateTvEvent({
      id: "soon",
      name: "Soon",
      date_start: "2026-08-10",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@x",
    }),
    validateTvEvent({
      id: "later",
      name: "Later",
      date_start: "2026-09-01",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@x",
    }),
  ];

  it("returns the soonest event that hasn't started yet", () => {
    let now = new Date("2026-06-16T12:00:00");
    let next = getNextUpcomingEvent(events, now);
    expect(next && next.id).toBe("soon");
  });

  it("returns null when nothing is upcoming", () => {
    let now = new Date("2027-01-01T12:00:00");
    expect(getNextUpcomingEvent(events, now)).toBe(null);
  });
});
