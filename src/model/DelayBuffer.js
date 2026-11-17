// @flow
// Holds timestamped snapshots so a view can show the state as it was
// delayMs ago - used to keep a live board in step with a video stream that
// lags behind the game server.
export class DelayBuffer<T> {
  _items: Array<{ at: number, value: T }> = [];

  push(value: T, at: number) {
    this._items.push({ at, value });
  }

  latest(): ?T {
    let items = this._items;
    return items.length ? items[items.length - 1].value : null;
  }

  size(): number {
    return this._items.length;
  }

  // The newest value that is at least delayMs old. Until one is, the oldest
  // value shows, so a freshly opened board is never empty. Older values than
  // the returned one are dropped.
  get(now: number, delayMs: number): ?T {
    let items = this._items;
    if (!items.length) {
      return null;
    }
    let index = 0;
    while (index + 1 < items.length && items[index + 1].at <= now - delayMs) {
      index++;
    }
    if (index > 0) {
      items.splice(0, index);
    }
    return items[0].value;
  }
}
