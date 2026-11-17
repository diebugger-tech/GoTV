// @flow
import React, { PureComponent as Component } from "react";
import BoardContainer from "../board/BoardContainer";
import BoardNav from "../board/BoardNav";
import GameChat from "../game/GameChat";
import GamePlayersList from "../game/GamePlayersList";
import { getGameChatSections, getGameLine } from "../../model/game";
import type { GameChannel, User, Index, AppActions } from "../../model";

type Props = {
  game: GameChannel,
  currentUser?: ?User,
  usersByName: Index<User>,
  actions?: AppActions,
  connectionKey?: string,
};

type State = {
  // null follows the newest move; a number keeps a locally rewound position.
  currentNode: ?number,
};

export default class TvGamePanel extends Component<Props, State> {
  _release: ?() => void;
  _chat: ?HTMLElement;
  state = { currentNode: null };

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

  render() {
    let { game, currentUser, usersByName, actions } = this.props;
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
    return (
      <div className="TvGamePanel">
        <GamePlayersList players={game.players} />
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
        <div className="TvGamePanel-chat-title">{source}-Partiechat</div>
        <div className="TvGamePanel-chat" ref={this._setChatRef}>
          {sections.length ? (
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
      </div>
    );
  }
}
