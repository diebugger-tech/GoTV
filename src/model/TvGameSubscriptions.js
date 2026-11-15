// @flow
import type { AppState, KgsMessage } from "./types";

// TV viewers share channel subscriptions without changing Watch/Play navigation.
export class TvGameSubscriptions {
  _getState: () => AppState;
  _send: (KgsMessage) => any;
  _entries: { [number]: { count: number, owned: boolean } } = {};
  _released: { [number]: boolean } = {};
  _pendingUnjoins: { [number]: boolean } = {};

  constructor(getState: () => AppState, send: (KgsMessage) => any) {
    this._getState = getState;
    this._send = send;
  }

  _online(): boolean {
    let state = this._getState();
    return !!(
      state.currentUser &&
      state.clientState.status === "loggedIn" &&
      state.clientState.network === "online"
    );
  }

  _inUse(gameId: number): boolean {
    let state = this._getState();
    return (
      state.watchGameId === gameId ||
      state.playGameId === gameId ||
      state.reviewGameId === gameId
    );
  }

  sync() {
    if (!this._online()) {
      return;
    }
    for (let key of Object.keys(this._pendingUnjoins)) {
      let gameId = Number(key);
      delete this._pendingUnjoins[gameId];
      if (!this._entries[gameId] && !this._inUse(gameId)) {
        this._send({ type: "UNJOIN_REQUEST", channelId: gameId });
      }
    }
  }

  observe(gameId: number): () => void {
    if (!this._online()) {
      return () => {};
    }
    let entry = this._entries[gameId];
    if (!entry) {
      let membership = this._getState().channelMembership[gameId];
      let owned =
        !this._inUse(gameId) &&
        (!membership || membership.stale || !!this._released[gameId]);
      entry = { count: 0, owned };
      this._entries[gameId] = entry;
      delete this._released[gameId];
      delete this._pendingUnjoins[gameId];
      if (owned) {
        this._send({ type: "JOIN_REQUEST", channelId: gameId });
      }
    }
    entry.count++;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      entry.count--;
      if (entry.count === 0) {
        delete this._entries[gameId];
        if (entry.owned && !this._inUse(gameId)) {
          // A quick reopen must JOIN even before the old UNJOIN is received.
          this._released[gameId] = true;
          if (this._online()) {
            this._send({ type: "UNJOIN_REQUEST", channelId: gameId });
          } else {
            this._pendingUnjoins[gameId] = true;
          }
        }
      }
    };
  }
}
