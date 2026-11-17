import { DelayBuffer } from "./DelayBuffer";

describe("DelayBuffer", () => {
  it("shows the newest value that is old enough", () => {
    let buffer = new DelayBuffer();
    expect(buffer.get(1000, 10000)).toBe(null);
    buffer.push("a", 1000);
    buffer.push("b", 3000);
    buffer.push("c", 9000);
    // Nothing is 10 s old yet: the first value shows instead of nothing.
    expect(buffer.get(9500, 10000)).toBe("a");
    expect(buffer.get(11000, 10000)).toBe("a");
    expect(buffer.get(13000, 10000)).toBe("b");
    expect(buffer.get(18999, 10000)).toBe("b");
    expect(buffer.get(19000, 10000)).toBe("c");
    expect(buffer.get(99000, 10000)).toBe("c");
  });

  it("forgets what is older than the shown value", () => {
    let buffer = new DelayBuffer();
    buffer.push("a", 1000);
    buffer.push("b", 2000);
    buffer.push("c", 3000);
    buffer.get(12500, 10000);
    expect(buffer.size()).toBe(2);
    expect(buffer.latest()).toBe("c");
  });

  it("knows the last pushed value, to skip repeated pushes", () => {
    let buffer = new DelayBuffer();
    expect(buffer.latest()).toBe(null);
    buffer.push("a", 1);
    expect(buffer.latest()).toBe("a");
  });
});
