// @flow
import React, { PureComponent as Component } from "react";
import BoardContainer from "../board/BoardContainer";
import GameChat from "../game/GameChat";
import GamePlayersList from "../game/GamePlayersList";
import { getGameChatSections, getGameLine } from "../../model/game";
import type { GameChannel, User, Index, AppActions } from "../../model";

type Props = {
  game: GameChannel,
  currentUser: User,
  usersByName: Index<User>,
  actions: AppActions,
  connectionKey?: string,
};

// Always follows activeNode locally, even if the same game is rewound in Watch.
export default class TvGamePanel extends Component<Props> {
  _release: ?() => void;
  _chat: ?HTMLElement;

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
    this._release = this.props.actions.onObserveTvGame(this.props.game.id);
  };

  _scrollChat = () => {
    if (this._chat) {
      this._chat.scrollTop = this._chat.scrollHeight;
    }
  };

  _setChatRef = (ref: HTMLElement | null) => {
    this._chat = ref;
  };

  render() {
    let { game, currentUser, usersByName, actions } = this.props;
    let tree = game.tree;
    let liveGame = tree
      ? {
          ...game,
          tree: {
            ...tree,
            currentNode: tree.activeNode,
            currentLine: getGameLine(tree, tree.activeNode),
          },
        }
      : game;
    let sections = getGameChatSections(game);
    return (
      <div className="TvGamePanel">
        <GamePlayersList players={game.players} />
        {game.accessDenied ? (
          <div className="TvGamePanel-notice">{game.accessDenied}</div>
        ) : tree ? (
          <div className="TvGamePanel-board">
            <BoardContainer game={liveGame} embedded />
          </div>
        ) : (
          <div className="TvGamePanel-notice">Brett wird von KGS geladen …</div>
        )}
        <div className="TvGamePanel-chat-title">KGS-Partiechat</div>
        <div className="TvGamePanel-chat" ref={this._setChatRef}>
          {sections.length ? (
            <GameChat
              currentUser={currentUser}
              chatSections={sections}
              usersByName={usersByName}
              onUserDetail={actions.onUserDetail}
              onOpenTv={actions.onOpenTvStream}
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
