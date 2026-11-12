import {
  getLiveGames,
  getLiveEventGames,
  getLiveEventForGame,
  validateTvEvent,
  getYouTubeVideoId,
  getTwitchChannel,
  getEmbedUrlForEvent,
  groupEventsByTime,
  getLiveEvents,
  getNextUpcomingEvent,
  fetchTvEvents,
  _resetTvEventsCache,
  REMOTE_EVENTS_URL,
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

describe("getLiveEventForGame", () => {
  let now = new Date("2026-06-15T12:00:00");
  let liveToday = (id, name, notes) =>
    validateTvEvent({
      id,
      name,
      notes,
      date_start: "2026-06-15",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@x",
    });

  it("returns null for games that aren't KGS server events", () => {
    let game = makeGame(1, makeUser("a", 3), makeUser("b", 3), false);
    expect(getLiveEventForGame(game, [liveToday("e1", "Event")], {}, now)).toBe(
      null
    );
  });

  it("returns null when nothing is live", () => {
    let game = {
      ...makeGame(1, makeUser("a", 3), makeUser("b", 3), false),
      event: true,
    };
    expect(getLiveEventForGame(game, [], {}, now)).toBe(null);
  });

  it("returns the only live event unambiguously", () => {
    let game = {
      ...makeGame(1, makeUser("a", 3), makeUser("b", 3), false),
      event: true,
    };
    let events = [liveToday("e1", "Some Cup")];
    expect(getLiveEventForGame(game, events, {}, now).id).toBe("e1");
  });

  it("prefers a match on the game's room name (kgs_room)", () => {
    let game = {
      ...makeGame(1, makeUser("a", 3), makeUser("b", 3), false),
      event: true,
      roomId: 42,
    };
    let roomsById = { 42: { id: 42, name: "LG Cup" } };
    let events = [
      liveToday("other", "Other Cup"),
      liveToday("match", "LG Cup 2026 round 3"),
    ];
    expect(getLiveEventForGame(game, events, roomsById, now).id).toBe("match");
  });

  it("prefers a match on a player's name (kgs_players)", () => {
    let game = {
      ...makeGame(
        1,
        { name: "goplayer", rankVal: 3 },
        { name: "otherplayer", rankVal: 3 },
        false
      ),
      event: true,
    };
    let events = [
      liveToday("other", "Other Cup"),
      liveToday("match", "Finals", "Commentary features goplayer"),
    ];
    expect(getLiveEventForGame(game, events, {}, now).id).toBe("match");
  });

  it("falls back to the first live event when nothing matches", () => {
    let game = {
      ...makeGame(1, makeUser("a", 3), makeUser("b", 3), false),
      event: true,
    };
    let events = [liveToday("first", "Cup A"), liveToday("second", "Cup B")];
    expect(getLiveEventForGame(game, events, {}, now).id).toBe("first");
  });
});

describe("fetchTvEvents", () => {
  let originalFetch;

  function okResponse(body) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
  }

  beforeEach(() => {
    originalFetch = global.fetch;
    _resetTvEventsCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("uses the remote events.json when it is reachable", async () => {
    let remoteBody = {
      events: [
        {
          id: "remote",
          name: "Remote",
          date_start: "2026-01-01",
          platform: "youtube",
          stream_url: "https://www.youtube.com/@x",
        },
      ],
    };
    global.fetch = jest.fn(() => okResponse(remoteBody));
    let events = await fetchTvEvents();
    expect(events.map((e) => e.id)).toEqual(["remote"]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(REMOTE_EVENTS_URL);
  });

  it("falls back to the local copy when the remote fetch fails", async () => {
    let localBody = {
      events: [
        {
          id: "local",
          name: "Local",
          date_start: "2026-01-01",
          platform: "youtube",
          stream_url: "https://www.youtube.com/@x",
        },
      ],
    };
    global.fetch = jest.fn((url) => {
      if (url === REMOTE_EVENTS_URL) {
        return Promise.reject(new Error("network error"));
      }
      return okResponse(localBody);
    });
    let events = await fetchTvEvents();
    expect(events.map((e) => e.id)).toEqual(["local"]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to the local copy on a non-2xx remote response", async () => {
    let localBody = { events: [] };
    global.fetch = jest.fn((url) => {
      if (url === REMOTE_EVENTS_URL) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return okResponse(localBody);
    });
    let events = await fetchTvEvents();
    expect(events).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("caches a successful result for an hour", async () => {
    global.fetch = jest.fn(() => okResponse({ events: [] }));
    await fetchTvEvents();
    await fetchTvEvents();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches once the cache expires", async () => {
    global.fetch = jest.fn(() => okResponse({ events: [] }));
    let nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(1000000);
    await fetchTvEvents();
    nowSpy.mockReturnValue(1000000 + 61 * 60 * 1000);
    await fetchTvEvents();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
