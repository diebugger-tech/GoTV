import {
  getLiveGames,
  getLiveEventGames,
  getLiveEventForGame,
  validateTvEvent,
  validateTvChannel,
  getYouTubeVideoId,
  getTwitchChannel,
  getEmbedUrlForEvent,
  getEmbedUrlForChannel,
  groupEventsByTime,
  groupEventsByRegion,
  getEventRegion,
  getLiveEvents,
  getNextUpcomingEvent,
  fetchTvEvents,
  fetchTvChannels,
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

  it("accepts a valid channel field", () => {
    let event = validateTvEvent({
      id: "ev1",
      name: "Test Event",
      date_start: "2026-06-15",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@channel",
      channel: { platform: "youtube", id: "UCabc123" },
    });
    expect(event).not.toBe(null);
    expect(event.channel).toEqual({ platform: "youtube", id: "UCabc123" });
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

  it("rejects an invalid channel field", () => {
    expect(
      validateTvEvent({
        id: "x",
        name: "X",
        date_start: "2026-01-01",
        platform: "youtube",
        stream_url: "https://x",
        channel: { platform: "vimeo", id: "abc" },
      })
    ).toBe(null);
    expect(
      validateTvEvent({
        id: "x",
        name: "X",
        date_start: "2026-01-01",
        platform: "youtube",
        stream_url: "https://x",
        channel: { platform: "youtube" },
      })
    ).toBe(null);
  });

  it("accepts valid start and source fields", () => {
    let event = validateTvEvent({
      id: "x",
      name: "X",
      date_start: "2026-01-01",
      platform: "twitch",
      stream_url: "https://x",
      start: "2026-01-01T19:00:00+01:00",
      source: "twitch-egf",
    });
    expect(event).not.toBe(null);
    expect(event.start).toBe("2026-01-01T19:00:00+01:00");
    expect(event.source).toBe("twitch-egf");
  });

  it("rejects an unparseable start field", () => {
    expect(
      validateTvEvent({
        id: "x",
        name: "X",
        date_start: "2026-01-01",
        platform: "twitch",
        stream_url: "https://x",
        start: "not-a-datetime",
      })
    ).toBe(null);
  });

  it("accepts a valid region field", () => {
    let event = validateTvEvent({
      id: "x",
      name: "X",
      date_start: "2026-01-01",
      platform: "other",
      stream_url: "https://x",
      region: "de",
    });
    expect(event).not.toBe(null);
    expect(event.region).toBe("de");
  });

  it("leaves region undefined when not given", () => {
    let event = validateTvEvent({
      id: "x",
      name: "X",
      date_start: "2026-01-01",
      platform: "other",
      stream_url: "https://x",
    });
    expect(event).not.toBe(null);
    expect(event.region).toBe(undefined);
  });

  it("rejects an invalid region value", () => {
    expect(
      validateTvEvent({
        id: "x",
        name: "X",
        date_start: "2026-01-01",
        platform: "other",
        stream_url: "https://x",
        region: "us",
      })
    ).toBe(null);
  });
});

describe("validateTvChannel", () => {
  it("accepts a valid youtube channel", () => {
    let channel = validateTvChannel({
      id: "baduk-tv",
      name: "Baduk TV",
      platform: "youtube",
      url: "https://www.youtube.com/@BadukTV",
      channel_id: "UCDDpGwSirMEje8H0fI7wM_A",
      notes: "Koreanische Profiturniere",
    });
    expect(channel).not.toBe(null);
    expect(channel.id).toBe("baduk-tv");
    expect(channel.notes).toBe("Koreanische Profiturniere");
  });

  it("accepts a valid twitch channel without notes", () => {
    let channel = validateTvChannel({
      id: "egf-twitch",
      name: "European Go Federation (Twitch)",
      platform: "twitch",
      url: "https://www.twitch.tv/europeangofederation",
      channel_id: "europeangofederation",
    });
    expect(channel).not.toBe(null);
    expect(channel.notes).toBe(undefined);
  });

  it("rejects entries with invalid or missing fields", () => {
    expect(validateTvChannel(null)).toBe(null);
    expect(validateTvChannel({ id: "x" })).toBe(null);
    expect(
      // "other" is valid for TvEvent but not for a standing TvChannel -
      // the platform determines the embed shape and there's no generic one.
      validateTvChannel({
        id: "x",
        name: "X",
        platform: "other",
        url: "https://x",
        channel_id: "123",
      })
    ).toBe(null);
    expect(
      validateTvChannel({
        id: "x",
        name: "X",
        platform: "youtube",
        url: "https://x",
        // missing channel_id
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

  it("embeds a youtube channel's live stream while the event is live", () => {
    let url = getEmbedUrlForEvent(
      {
        id: "e",
        name: "E",
        date_start: "2026-06-15",
        platform: "youtube",
        stream_url: "https://www.youtube.com/@SomeChannel",
        channel: { platform: "youtube", id: "UCabc123" },
      },
      "localhost",
      new Date("2026-06-15T12:00:00")
    );
    expect(url).toBe(
      "https://www.youtube-nocookie.com/embed/live_stream?channel=UCabc123"
    );
  });

  it("embeds a twitch channel live while the event is live, with no video_id and an unparseable stream_url", () => {
    let url = getEmbedUrlForEvent(
      {
        id: "e",
        name: "E",
        date_start: "2026-06-15",
        platform: "twitch",
        stream_url: "https://example.com/schedule",
        channel: { platform: "twitch", id: "somechannel" },
      },
      "example.com",
      new Date("2026-06-15T12:00:00")
    );
    expect(url).toBe(
      "https://player.twitch.tv/?channel=somechannel&parent=example.com"
    );
  });

  it("ignores the channel field when the event is not live", () => {
    let url = getEmbedUrlForEvent(
      {
        id: "e",
        name: "E",
        date_start: "2026-06-15",
        platform: "youtube",
        stream_url: "https://www.youtube.com/@SomeChannel",
        channel: { platform: "youtube", id: "UCabc123" },
      },
      "localhost",
      new Date("2026-07-01T12:00:00")
    );
    expect(url).toBe(null);
  });

  it("prefers video_id over the channel field even while live", () => {
    let url = getEmbedUrlForEvent(
      {
        id: "e",
        name: "E",
        date_start: "2026-06-15",
        platform: "youtube",
        stream_url: "https://www.youtube.com/@SomeChannel",
        video_id: "specificVideo1",
        channel: { platform: "youtube", id: "UCabc123" },
      },
      "localhost",
      new Date("2026-06-15T12:00:00")
    );
    expect(url).toBe("https://www.youtube-nocookie.com/embed/specificVideo1");
  });
});

describe("getEmbedUrlForChannel", () => {
  it("builds a youtube live_stream embed url", () => {
    let url = getEmbedUrlForChannel({
      id: "baduk-tv",
      name: "Baduk TV",
      platform: "youtube",
      url: "https://www.youtube.com/@BadukTV",
      channel_id: "UCDDpGwSirMEje8H0fI7wM_A",
    });
    expect(url).toBe(
      "https://www.youtube-nocookie.com/embed/live_stream?channel=UCDDpGwSirMEje8H0fI7wM_A"
    );
  });

  it("builds a twitch player embed url with the parent param", () => {
    let url = getEmbedUrlForChannel(
      {
        id: "egf-twitch",
        name: "European Go Federation (Twitch)",
        platform: "twitch",
        url: "https://www.twitch.tv/europeangofederation",
        channel_id: "europeangofederation",
      },
      "example.com"
    );
    expect(url).toBe(
      "https://player.twitch.tv/?channel=europeangofederation&parent=example.com"
    );
  });

  it("defaults the parent param to localhost when no hostname is given", () => {
    let url = getEmbedUrlForChannel({
      id: "egf-twitch",
      name: "EGF",
      platform: "twitch",
      url: "https://www.twitch.tv/europeangofederation",
      channel_id: "europeangofederation",
    });
    expect(url).toBe(
      "https://player.twitch.tv/?channel=europeangofederation&parent=localhost"
    );
  });
});

describe("groupEventsByTime", () => {
  let events = [
    validateTvEvent({
      id: "past",
      name: "Past",
      date_start: "2026-06-10",
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
    expect(groups.archive).toEqual([]);
  });

  it("drops a past event older than 14 days with nothing recorded", () => {
    let now = new Date("2026-06-25T12:00:00"); // 15 days after "past" ended
    let groups = groupEventsByTime(events, now);
    // "past" (ended 2026-06-10) is now 15 days old with nothing recorded -> dropped.
    // "today" (ended 2026-06-16) is only 9 days old -> still a recent past event.
    expect(groups.past.map((e) => e.id)).toEqual(["today"]);
    expect(groups.archive).toEqual([]);
  });

  it("archives (instead of dropping) an old past event with a video_id", () => {
    let withRecording = [
      ...events,
      validateTvEvent({
        id: "recorded",
        name: "Recorded",
        date_start: "2026-06-01",
        platform: "youtube",
        stream_url: "https://www.youtube.com/watch?v=abcDEF12",
        video_id: "abcDEF12",
      }),
    ];
    let now = new Date("2026-06-25T12:00:00"); // 24 days after "recorded" ended
    let groups = groupEventsByTime(withRecording, now);
    expect(groups.archive.map((e) => e.id)).toEqual(["recorded"]);
    // "today" (ended 2026-06-16) is only 9 days old -> still a recent past event.
    expect(groups.past.map((e) => e.id)).toEqual(["today"]);
  });

  it("archives an old past event with an sgf_url instead of a video_id", () => {
    let withSgf = [
      validateTvEvent({
        id: "recorded-sgf",
        name: "Recorded SGF",
        date_start: "2026-06-01",
        platform: "other",
        stream_url: "https://example.com",
        sgf_url: "https://example.com/game.sgf",
      }),
    ];
    let now = new Date("2026-06-25T12:00:00");
    let groups = groupEventsByTime(withSgf, now);
    expect(groups.archive.map((e) => e.id)).toEqual(["recorded-sgf"]);
  });

  it("keeps a recent past event with a video_id out of the archive", () => {
    let recentWithRecording = [
      validateTvEvent({
        id: "recent-recorded",
        name: "Recent Recorded",
        date_start: "2026-06-14",
        platform: "youtube",
        stream_url: "https://www.youtube.com/watch?v=abcDEF12",
        video_id: "abcDEF12",
      }),
    ];
    let now = new Date("2026-06-16T12:00:00"); // 2 days later - well under 14
    let groups = groupEventsByTime(recentWithRecording, now);
    expect(groups.past.map((e) => e.id)).toEqual(["recent-recorded"]);
    expect(groups.archive).toEqual([]);
  });
});

describe("getEventRegion", () => {
  it("returns the event's region when set to de", () => {
    expect(getEventRegion({ region: "de" })).toBe("de");
  });

  it("defaults to intl when region is unset", () => {
    expect(getEventRegion({})).toBe("intl");
  });

  it("defaults to intl for an explicit intl region too", () => {
    expect(getEventRegion({ region: "intl" })).toBe("intl");
  });
});

describe("groupEventsByRegion", () => {
  let de1 = validateTvEvent({
    id: "de1",
    name: "DE later",
    date_start: "2026-12-01",
    platform: "other",
    stream_url: "https://x",
    region: "de",
  });
  let de2 = validateTvEvent({
    id: "de2",
    name: "DE earlier",
    date_start: "2026-11-01",
    platform: "other",
    stream_url: "https://x",
    region: "de",
  });
  let intlNoRegion = validateTvEvent({
    id: "intl-default",
    name: "No region set",
    date_start: "2026-11-15",
    platform: "youtube",
    stream_url: "https://www.youtube.com/@x",
  });

  it("splits events by region, defaulting to intl", () => {
    let groups = groupEventsByRegion([de1, de2, intlNoRegion]);
    expect(groups.de.map((e) => e.id)).toEqual(["de2", "de1"]);
    expect(groups.intl.map((e) => e.id)).toEqual(["intl-default"]);
  });

  it("sorts each region group by date_start", () => {
    let groups = groupEventsByRegion([de1, de2]);
    expect(groups.de.map((e) => e.id)).toEqual(["de2", "de1"]);
  });

  it("returns empty arrays for an empty input", () => {
    expect(groupEventsByRegion([])).toEqual({ de: [], intl: [] });
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

describe("fetchTvChannels", () => {
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

  it("validates and returns the channels array", async () => {
    let remoteBody = {
      events: [],
      channels: [
        {
          id: "baduk-tv",
          name: "Baduk TV",
          platform: "youtube",
          url: "https://www.youtube.com/@BadukTV",
          channel_id: "UCDDpGwSirMEje8H0fI7wM_A",
        },
      ],
    };
    global.fetch = jest.fn(() => okResponse(remoteBody));
    let channels = await fetchTvChannels();
    expect(channels.map((c) => c.id)).toEqual(["baduk-tv"]);
  });

  it("defaults to an empty list when the file has no channels field", async () => {
    global.fetch = jest.fn(() => okResponse({ events: [] }));
    let channels = await fetchTvChannels();
    expect(channels).toEqual([]);
  });

  it("skips invalid channel entries", async () => {
    let remoteBody = {
      events: [],
      channels: [{ id: "bad", name: "Bad" }], // missing platform/url/channel_id
    };
    global.fetch = jest.fn(() => okResponse(remoteBody));
    let channels = await fetchTvChannels();
    expect(channels).toEqual([]);
  });

  it("shares the fetch and cache with fetchTvEvents (same source file)", async () => {
    global.fetch = jest.fn(() =>
      okResponse({
        events: [
          {
            id: "e1",
            name: "E",
            date_start: "2026-01-01",
            platform: "youtube",
            stream_url: "https://www.youtube.com/@x",
          },
        ],
        channels: [],
      })
    );
    let events = await fetchTvEvents();
    let channels = await fetchTvChannels();
    expect(events.map((e) => e.id)).toEqual(["e1"]);
    expect(channels).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
