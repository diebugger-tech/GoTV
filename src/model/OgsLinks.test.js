import {
  applyOgsLinks,
  loadOgsLinks,
  parseOgsGameLink,
  saveOgsLinks,
} from "./OgsLinks";

describe("parseOgsGameLink", () => {
  it("reads the game id from OGS game links and plain numbers", () => {
    expect(parseOgsGameLink("https://online-go.com/game/92121029")).toBe(
      92121029
    );
    expect(parseOgsGameLink(" online-go.com/game/view/55?x=1 ")).toBe(55);
    expect(parseOgsGameLink("https://online-go.com/api/v1/games/77/sgf")).toBe(
      77
    );
    expect(parseOgsGameLink("92121029")).toBe(92121029);
  });

  it("rejects everything else", () => {
    expect(parseOgsGameLink("")).toBe(null);
    expect(parseOgsGameLink("https://example.org/game/5")).toBe(null);
    expect(parseOgsGameLink("https://online-go.com/player/5")).toBe(null);
    expect(parseOgsGameLink("0")).toBe(null);
    expect(parseOgsGameLink("12abc")).toBe(null);
  });
});

describe("stored OGS links", () => {
  let store;
  let storage;

  beforeEach(() => {
    store = {};
    storage = {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = String(value);
      },
    };
  });

  it("keeps links per event across sessions", () => {
    expect(loadOgsLinks(storage)).toEqual({});
    saveOgsLinks({ cup: 123 }, storage);
    expect(loadOgsLinks(storage)).toEqual({ cup: 123 });
  });

  it("ignores broken or foreign storage content", () => {
    store["gotv.ogsLinks"] = "{not json";
    expect(loadOgsLinks(storage)).toEqual({});
    store["gotv.ogsLinks"] = JSON.stringify({ cup: 5, bad: "x", zero: 0 });
    expect(loadOgsLinks(storage)).toEqual({ cup: 5 });
    expect(loadOgsLinks(null)).toEqual({});
    expect(() =>
      saveOgsLinks(
        { cup: 1 },
        {
          setItem: () => {
            throw new Error("full");
          },
        }
      )
    ).not.toThrow();
  });

  it("lets a manual link win over the calendar without touching other events", () => {
    let events = [
      { id: "cup", name: "Cup", ogs_game_id: 1, ogs_players: ["a", "b"] },
      { id: "other", name: "Other" },
    ];
    let result = applyOgsLinks(events, { cup: 99 });
    expect(result[0]).toEqual({ id: "cup", name: "Cup", ogs_game_id: 99 });
    expect(result[1]).toBe(events[1]);
    expect(events[0].ogs_game_id).toBe(1);
    expect(applyOgsLinks(events, {})).toBe(events);
  });
});
