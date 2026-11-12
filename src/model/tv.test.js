import {
  getLiveGames,
  sortGamesByStrength,
  getWeakerPlayerRankVal,
  isDanRankVal,
  validateTvEvent,
  getYouTubeVideoId,
  getTwitchChannel,
  getEmbedUrlForEvent,
  groupEventsByTime,
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

describe("getWeakerPlayerRankVal", () => {
  it("returns the weaker player's rankVal", () => {
    let game = makeGame(1, makeUser("strong", 13), makeUser("weak", -5));
    expect(getWeakerPlayerRankVal(game)).toBe(-5);
  });

  it("handles missing players", () => {
    expect(getWeakerPlayerRankVal(makeGame(1, null, makeUser("w", 3)))).toBe(3);
    expect(getWeakerPlayerRankVal(makeGame(2, null, null))).toBe(null);
  });
});

describe("isDanRankVal", () => {
  it("treats dan and pro as dan, kyu and below as not", () => {
    expect(isDanRankVal(1)).toBe(true);
    expect(isDanRankVal(9)).toBe(true);
    expect(isDanRankVal(11)).toBe(true);
    expect(isDanRankVal(0)).toBe(false);
    expect(isDanRankVal(-1)).toBe(false);
  });
});

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

describe("sortGamesByStrength", () => {
  it("sorts dan before kyu, by weaker player's rank", () => {
    let games = [
      makeGame(1, makeUser("a", 13), makeUser("b", 9)), // weaker 9d
      makeGame(2, makeUser("c", 3), makeUser("d", -12)), // weaker 12k
      makeGame(3, makeUser("e", 11), makeUser("f", 13)), // weaker 1p
      makeGame(4, makeUser("g", 7), makeUser("h", 7)), // weaker 7d
    ];
    expect(sortGamesByStrength(games).map((g) => g.id)).toEqual([3, 1, 4, 2]);
  });

  it("puts games with unknown strength last", () => {
    let games = [
      makeGame(1, makeUser("a", 1), makeUser("b", 1)),
      makeGame(2, null, null),
    ];
    expect(sortGamesByStrength(games).map((g) => g.id)).toEqual([1, 2]);
  });

  it("does not mutate the input array", () => {
    let games = [makeGame(1, makeUser("a", 1), makeUser("b", 1))];
    sortGamesByStrength(games);
    expect(games.length).toBe(1);
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
