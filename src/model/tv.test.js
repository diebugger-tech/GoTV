import {
  getLiveGames,
  getLiveEventGames,
  getLiveEventForGame,
  getLiveBroadcasts,
  getBroadcastForStream,
  getLiveWindow,
  hasVideoStream,
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
  hasOgsBoard,
  isWatchable,
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

  it("keeps real games only - no lectures or reviews, no rank threshold", () => {
    let event = (id, type, rank) => ({
      ...makeGame(id, makeUser("a", rank), makeUser("b", rank), false),
      type,
      event: true,
    });
    let games = [
      event(1, "ranked", -5),
      event(2, "free", 3),
      event(3, "tournament", 11),
      event(4, "demonstration", 11),
      event(5, "review", 11),
      event(6, "teaching", 11),
    ];
    expect(getLiveEventGames(games).map((g) => g.id)).toEqual([1, 2, 3]);
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

describe("live window (start + duration)", () => {
  let timed = (extra) =>
    validateTvEvent({
      id: "evening",
      name: "Evening broadcast",
      date_start: "2026-06-15",
      start: "2026-06-15T19:00:00",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@x",
      ...extra,
    });
  let at = (time) => new Date("2026-06-15T" + time);

  it("is not live in the morning of a 19:00 broadcast, but upcoming", () => {
    let groups = groupEventsByTime([timed()], at("10:00:00"));
    expect(groups.today).toEqual([]);
    expect(groups.upcoming.map((e) => e.id)).toEqual(["evening"]);
  });

  it("goes live 15 min before start (pre-show)", () => {
    expect(getLiveEvents([timed()], at("18:44:00"))).toEqual([]);
    expect(getLiveEvents([timed()], at("18:46:00")).length).toBe(1);
  });

  it("ends after the default 4 h and then counts as past", () => {
    expect(getLiveEvents([timed()], at("22:59:00")).length).toBe(1);
    let groups = groupEventsByTime([timed()], at("23:01:00"));
    expect(groups.today).toEqual([]);
    expect(groups.past.map((e) => e.id)).toEqual(["evening"]);
  });

  it("uses duration_minutes when given", () => {
    let short = timed({ duration_minutes: 90 });
    expect(getLiveEvents([short], at("20:29:00")).length).toBe(1);
    expect(getLiveEvents([short], at("20:31:00"))).toEqual([]);
  });

  it("keeps whole days for multi-day events even with a start time", () => {
    let multi = timed({ date_end: "2026-06-16" });
    expect(getLiveEvents([multi], at("10:00:00")).length).toBe(1);
    expect(getLiveEvents([multi], new Date("2026-06-16T21:00:00")).length).toBe(
      1
    );
  });

  it("rejects an invalid duration_minutes", () => {
    expect(timed({ duration_minutes: 0 })).toBe(null);
    expect(timed({ duration_minutes: "90" })).toBe(null);
    expect(timed({ duration_minutes: 100000 })).toBe(null);
  });

  it("exposes the window via getLiveWindow", () => {
    let { start, end } = getLiveWindow(timed({ duration_minutes: 60 }));
    expect(start.getTime()).toBe(at("18:45:00").getTime());
    expect(end.getTime()).toBe(at("20:00:00").getTime());
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
  let liveToday = (id, name, extra) =>
    validateTvEvent({
      id,
      name,
      date_start: "2026-06-15",
      platform: "youtube",
      stream_url: "https://www.youtube.com/@x",
      ...extra,
    });
  let eventGame = (extra) => ({
    ...makeGame(1, makeUser("goplayer", 3), makeUser("otherplayer", 3), false),
    event: true,
    ...extra,
  });

  it("returns null for games that aren't KGS server events", () => {
    let game = makeGame(1, makeUser("a", 3), makeUser("b", 3), false);
    let events = [liveToday("e1", "Event", { kgs_players: ["a"] })];
    expect(getLiveEventForGame(game, events, {}, now)).toBe(null);
  });

  it("returns null when nothing is live", () => {
    expect(getLiveEventForGame(eventGame(), [], {}, now)).toBe(null);
  });

  it("does not guess: a single live event without kgs fields is no match", () => {
    let events = [liveToday("e1", "Some Cup")];
    expect(getLiveEventForGame(eventGame(), events, {}, now)).toBe(null);
  });

  it("matches the game's room name exactly via kgs_room", () => {
    let roomsById = { 42: { id: 42, name: "LG Cup" } };
    let events = [
      liveToday("other", "Other Cup", { kgs_room: "Other Room" }),
      liveToday("match", "LG Cup 2026 round 3", { kgs_room: "lg cup" }),
    ];
    let game = eventGame({ roomId: 42 });
    expect(getLiveEventForGame(game, events, roomsById, now).id).toBe("match");
  });

  it("matches a player's KGS name via kgs_players", () => {
    let events = [
      liveToday("other", "Other Cup", { kgs_players: ["nobody"] }),
      liveToday("match", "Finals", { kgs_players: ["GoPlayer"] }),
    ];
    expect(getLiveEventForGame(eventGame(), events, {}, now).id).toBe("match");
  });

  it("ignores a matching event without a video channel", () => {
    let events = [
      validateTvEvent({
        id: "page",
        name: "Turnierseite",
        date_start: "2026-06-15",
        platform: "other",
        stream_url: "https://example.com/turnier",
        kgs_players: ["goplayer"],
      }),
    ];
    expect(getLiveEventForGame(eventGame(), events, {}, now)).toBe(null);
  });
});

describe("validateTvEvent kgs fields", () => {
  let base = {
    id: "e",
    name: "E",
    date_start: "2026-06-15",
    platform: "youtube",
    stream_url: "https://www.youtube.com/@x",
  };

  it("keeps trimmed kgs_room and kgs_players", () => {
    let event = validateTvEvent({
      ...base,
      kgs_room: " LG Cup ",
      kgs_players: [" a ", "b"],
    });
    expect(event.kgs_room).toBe("LG Cup");
    expect(event.kgs_players).toEqual(["a", "b"]);
  });

  it("rejects malformed kgs fields", () => {
    expect(validateTvEvent({ ...base, kgs_room: "" })).toBe(null);
    expect(validateTvEvent({ ...base, kgs_room: 7 })).toBe(null);
    expect(validateTvEvent({ ...base, kgs_players: "a" })).toBe(null);
    expect(validateTvEvent({ ...base, kgs_players: ["a", ""] })).toBe(null);
  });

  it("keeps a positive integer OGS game ID and rejects malformed IDs", () => {
    expect(validateTvEvent({ ...base, ogs_game_id: 123 }).ogs_game_id).toBe(
      123
    );
    expect(validateTvEvent({ ...base, ogs_game_id: "123" })).toBe(null);
    expect(validateTvEvent({ ...base, ogs_game_id: 0 })).toBe(null);
    expect(validateTvEvent({ ...base, ogs_game_id: 1.5 })).toBe(null);
  });

  it("keeps trimmed OGS player names and rejects malformed lists", () => {
    let event = validateTvEvent({ ...base, ogs_players: [" Surma ", "Ovsi"] });
    expect(event.ogs_players).toEqual(["Surma", "Ovsi"]);
    expect(validateTvEvent({ ...base, ogs_players: "Surma" })).toBe(null);
    expect(validateTvEvent({ ...base, ogs_players: ["Surma", ""] })).toBe(null);
  });

  it("counts an event as watchable with a video channel or a linked board", () => {
    let noVideo = { ...base, platform: "other" };
    expect(isWatchable(validateTvEvent(base))).toBe(true);
    expect(isWatchable(validateTvEvent(noVideo))).toBe(false);
    expect(isWatchable(validateTvEvent({ ...noVideo, kgs_room: "EGF" }))).toBe(
      true
    );
    expect(
      isWatchable(validateTvEvent({ ...noVideo, kgs_players: ["a"] }))
    ).toBe(true);
    expect(
      isWatchable(validateTvEvent({ ...noVideo, ogs_players: ["a"] }))
    ).toBe(true);
    expect(isWatchable(validateTvEvent({ ...noVideo, ogs_game_id: 5 }))).toBe(
      true
    );
  });

  it("knows whether a broadcast is linked to an OGS board", () => {
    expect(hasOgsBoard(validateTvEvent(base))).toBe(false);
    expect(hasOgsBoard(validateTvEvent({ ...base, ogs_game_id: 5 }))).toBe(
      true
    );
    expect(
      hasOgsBoard(validateTvEvent({ ...base, ogs_players: ["Surma"] }))
    ).toBe(true);
  });
});

describe("hasVideoStream", () => {
  it("is true for YouTube/Twitch or a live channel, false for a plain page", () => {
    expect(hasVideoStream({ platform: "youtube" })).toBe(true);
    expect(hasVideoStream({ platform: "twitch" })).toBe(true);
    expect(
      hasVideoStream({
        platform: "other",
        channel: { platform: "youtube", id: "UC1" },
      })
    ).toBe(true);
    expect(hasVideoStream({ platform: "other" })).toBe(false);
  });
});

describe("getLiveBroadcasts", () => {
  let now = new Date("2026-06-15T12:00:00");
  let live = (id, extra) =>
    validateTvEvent({
      id,
      name: id,
      date_start: "2026-06-15",
      platform: "twitch",
      stream_url: "https://www.twitch.tv/somechannel",
      ...extra,
    });
  let game = (id, black, white, extra) => ({
    ...makeGame(id, makeUser(black, 5), makeUser(white, 5), false),
    type: "tournament",
    event: true,
    ...extra,
  });

  it("lists every live event that has a video channel or linked boards", () => {
    let games = [
      game(1, "a", "b"),
      game(2, "c", "d"),
      game(3, "x", "y"),
      game(4, "p", "q"), // event game without broadcast -> not in Live
    ];
    let pageOnly = {
      name: "Turnierseite",
      date_start: "2026-06-15",
      platform: "other",
      stream_url: "https://example.com",
    };
    let events = [
      live("cup", { kgs_players: ["a", "c"] }),
      live("youtube-only"), // international, no KGS boards
      // Big tournament without a stream: listed for its boards.
      validateTvEvent({ ...pageOnly, id: "boards-only", kgs_players: ["x"] }),
      // Neither stream nor boards: calendar only.
      validateTvEvent({ ...pageOnly, id: "page-only" }),
    ];
    let result = getLiveBroadcasts(games, events, {}, now);
    expect(result.map((b) => [b.event.id, b.games.map((g) => g.id)])).toEqual([
      ["cup", [1, 2]],
      ["youtube-only", []],
      ["boards-only", [3]],
    ]);
  });

  it("never lists lectures as boards", () => {
    let games = [game(1, "a", "b", { type: "demonstration" })];
    let events = [live("cup", { kgs_players: ["a"] })];
    expect(getLiveBroadcasts(games, events, {}, now)[0].games).toEqual([]);
  });

  it("keeps finished boards for status display while the broadcast is live", () => {
    let games = [
      game(1, "a", "b"),
      game(2, "a", "c", { over: true }),
      game(3, "a", "d", { over: true, event: false }),
      game(4, "a", "e", { over: true, deletedTime: 1 }),
      game(5, "a", "f", { over: true, type: "demonstration" }),
      game(6, "a", "g", { players: { black: makeUser("a", 5) } }),
    ];
    let events = [live("cup", { kgs_players: ["a"] })];
    expect(
      getLiveBroadcasts(games, events, {}, now)[0].games.map((g) => g.id)
    ).toEqual([1, 2]);
    expect(getLiveEventGames(games).some((g) => g.over)).toBe(false);
  });

  it("is empty when nothing is live", () => {
    expect(
      getLiveBroadcasts([], [live("cup")], {}, new Date("2026-01-01T12:00:00"))
    ).toEqual([]);
  });
});

describe("getBroadcastForStream", () => {
  it.each([
    [
      "https://twitch.tv/SomeChannel",
      "https://www.twitch.tv/somechannel",
      "twitch",
    ],
    [
      "https://youtu.be/abcdef12345?t=20",
      "https://www.youtube.com/watch?v=abcdef12345",
      "youtube",
    ],
  ])(
    "matches stream identity across alternate URLs: %s",
    (url, stream_url, platform) => {
      let broadcast = { event: { stream_url, platform }, games: [] };
      expect(getBroadcastForStream([broadcast], url)).toBe(broadcast);
      expect(
        getBroadcastForStream([broadcast], "https://twitch.tv/unrelated")
      ).toBe(null);
    }
  );
});

describe("fetchTvEvents", () => {
  let originalFetch;
  let originalApiUrl;

  function okResponse(body) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
  }

  beforeEach(() => {
    originalFetch = global.fetch;
    originalApiUrl = process.env.REACT_APP_API_URL;
    _resetTvEventsCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiUrl === undefined) {
      delete process.env.REACT_APP_API_URL;
    } else {
      process.env.REACT_APP_API_URL = originalApiUrl;
    }
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

  it("uses the timer-updated local calendar on desktop and refreshes it after five minutes", async () => {
    process.env.REACT_APP_API_URL = "/json/access";
    let clock = jest.spyOn(Date, "now").mockReturnValue(0);
    global.fetch = jest.fn(() => okResponse({ events: [] }));
    await fetchTvEvents();
    expect(global.fetch.mock.calls[0][0]).toBe("/tv/events.json");
    clock.mockReturnValue(5 * 60 * 1000);
    await fetchTvEvents();
    expect(global.fetch).toHaveBeenCalledTimes(2);
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
