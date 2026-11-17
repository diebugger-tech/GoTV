// @flow
import React, { PureComponent as Component } from "react";
import BoardContainer from "../board/BoardContainer";
import BoardNav from "../board/BoardNav";
import GameChat from "../game/GameChat";
import GameInfo from "../game/GameInfo";
import GameMoreMenu from "../game/GameMoreMenu";
import GamePlayersInfo from "../game/GamePlayersInfo";
import ChatMessageBar from "../chat/ChatMessageBar";
import UserList from "../user/UserList";
import TvSourceBadge from "./TvSourceBadge";
import { A } from "../common";
import {
  formatGameScore,
  getGameChatSections,
  getGameLine,
} from "../../model/game";
import { sortUsers } from "../../model/user";
import type { GameChannel, Room, User, Index, AppActions } from "../../model";

type Props = {
  game: GameChannel,
  currentUser?: ?User,
  usersByName: Index<User>,
  roomsById?: Index<Room>,
  actions?: AppActions,
  connectionKey?: string,
};

type State = {
  // null follows the newest move; a number keeps a locally rewound position.
  currentNode: ?number,
  tab: "chat" | "info" | "users",
};

export default class TvGamePanel extends Component<Props, State> {
  _release: ?() => void;
  _chat: ?HTMLElement;
  state = { currentNode: null, tab: "chat" };

  componentDidMount() {
    this._subscribe();
    this._scrollChat();
  }

  getSnapshotBeforeUpdate(): boolean {
    let chat = this._chat;
    return !chat || chat.scrollHeight - chat.scrollTop - chat.clientHeight < 32;
  }

  componentDidUpdate(prevProps: Props, prevState: mixed, followChat: boolean) {
    if (prevProps.connectionKey !== this.props.connectionKey) {
      if (this._release) {
        this._release();
      }
      this._subscribe();
    }
    if (followChat) {
      this._scrollChat();
    }
  }

  componentWillUnmount() {
    if (this._release) {
      this._release();
    }
  }

  _subscribe = () => {
    let { actions, game } = this.props;
    if (game.tvSource !== "ogs" && actions) {
      this._release = actions.onObserveTvGame(game.id);
    }
  };

  _scrollChat = () => {
    if (this._chat) {
      this._chat.scrollTop = this._chat.scrollHeight;
    }
  };

  _setChatRef = (ref: HTMLElement | null) => {
    this._chat = ref;
  };

  _onChangeCurrentNode = (nodeId: number) => {
    let tree = this.props.game.tree;
    this.setState({
      currentNode: tree && nodeId === tree.activeNode ? null : nodeId,
    });
  };

  _onSelectTab = (tab: "chat" | "info" | "users") => {
    this.setState({ tab });
  };

  _onUserDetail = (user: User) => {
    if (this.props.actions) {
      this.props.actions.onUserDetail(user.name);
    }
  };

  _onChat = (body: string) => {
    let { actions, game } = this.props;
    if (actions && game.tvSource !== "ogs") {
      actions.onSendGameChat(body, game.id);
    }
  };

  render() {
    let { game, currentUser, usersByName, roomsById, actions } = this.props;
    let { tab } = this.state;
    let tree = game.tree;
    let source = game.tvSource === "ogs" ? "OGS" : "KGS";
    let currentNode = tree ? tree.activeNode : null;
    let selectedNode = this.state.currentNode;
    if (tree && typeof selectedNode === "number" && tree.nodes[selectedNode]) {
      currentNode = selectedNode;
    }
    let currentLine =
      tree && typeof currentNode === "number"
        ? getGameLine(tree, currentNode)
        : null;
    let liveGame =
      tree && typeof currentNode === "number" && currentLine
        ? {
            ...game,
            tree: { ...tree, currentNode, currentLine },
          }
        : game;
    let sections = getGameChatSections(game);
    let users = game.users
      ? game.users.map((name) => usersByName[name]).filter(Boolean)
      : [];
    sortUsers(users);
    return (
      <div className="TvGamePanel">
        <div className="TvGamePanel-game-header">
          <TvSourceBadge game={game} />
          <div className="TvGamePanel-game-score">
            {game.over || game.score
              ? (game.over ? "Game Over" : "") +
                (game.score ? ": " + formatGameScore(game.score) : "")
              : game.name || ""}
          </div>
          <GameMoreMenu game={liveGame} roomsById={roomsById || {}} />
        </div>
        {game.accessDenied ? (
          <div className="TvGamePanel-notice">{game.accessDenied}</div>
        ) : tree && typeof currentNode === "number" && currentLine ? (
          <div className="TvGamePanel-board-section">
            <div className="TvGamePanel-board">
              <BoardContainer game={liveGame} embedded />
            </div>
            <div className="TvGamePanel-board-nav">
              <BoardNav
                nodeId={currentNode}
                currentLine={currentLine}
                onChangeCurrentNode={this._onChangeCurrentNode}
              />
            </div>
          </div>
        ) : (
          <div className="TvGamePanel-notice">
            Brett wird von {source} geladen …
          </div>
        )}
        <div className="TvGamePanel-players">
          <GamePlayersInfo game={liveGame} onUserDetail={this._onUserDetail} />
        </div>
        <div className="TvGamePanel-tabs">
          <A
            className={
              "TvGamePanel-tab" +
              (tab === "chat" ? " TvGamePanel-tab-active" : "")
            }
            onClick={this._onSelectTab.bind(this, "chat")}>
            Chat
          </A>
          <A
            className={
              "TvGamePanel-tab" +
              (tab === "info" ? " TvGamePanel-tab-active" : "")
            }
            onClick={this._onSelectTab.bind(this, "info")}>
            Info
          </A>
          <A
            className={
              "TvGamePanel-tab" +
              (tab === "users" ? " TvGamePanel-tab-active" : "")
            }
            onClick={this._onSelectTab.bind(this, "users")}>
            {users.length} Observers
          </A>
        </div>
        <div className="TvGamePanel-chat-title">
          {tab === "info"
            ? "Partieinfo"
            : tab === "users"
            ? "Beobachter"
            : source + "-Partiechat"}
        </div>
        <div className="TvGamePanel-chat" ref={this._setChatRef}>
          {tab === "info" ? (
            <GameInfo game={liveGame} roomsById={roomsById || {}} />
          ) : tab === "users" ? (
            <UserList users={users} onSelectUser={this._onUserDetail} />
          ) : sections.length ? (
            <GameChat
              currentUser={currentUser || { name: "" }}
              chatSections={sections}
              usersByName={usersByName}
              onUserDetail={actions ? actions.onUserDetail : () => {}}
              onOpenTv={actions ? actions.onOpenTvStream : () => {}}
            />
          ) : (
            <div className="TvGamePanel-notice">
              {tree ? "Noch keine Chatnachrichten." : "Chat wird geladen …"}
            </div>
          )}
        </div>
        {tab === "chat" ? (
          <ChatMessageBar
            conversation={{
              id: 0,
              messages: [],
              status: "created",
              chatsDisabled: !tree || game.tvSource === "ogs" || !actions,
            }}
            onSubmit={this._onChat}
          />
        ) : null}
      </div>
    );
  }
}
