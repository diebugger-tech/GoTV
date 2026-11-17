// @flow
import React, { PureComponent as Component } from "react";
import BoardContainer from "../board/BoardContainer";
import BoardNav from "../board/BoardNav";
import { Button } from "../common";
import {
  parseSgf,
  SgfParseError,
  getSgfPlayerNames,
  getSgfRootProp,
} from "../../model/sgf";
import { computeGameNodeStates, getGameLine } from "../../model/game/tree";
import type { GameTree } from "../../model";

type Props = {
  initialUrl?: ?string,
  initialTree?: ?GameTree,
  compact?: boolean,
};

type State = {
  status: "empty" | "ready" | "error",
  error: ?string,
  tree: ?GameTree,
  currentNode: number,
  input: string,
};

const CORS_ERROR_MESSAGE =
  "SGF konnte nicht geladen werden. Wahrscheinlich blockiert der Server " +
  "direkte Anfragen (CORS). Lade die Datei direkt hoch oder füge den SGF-Text ein.";

export default class SgfReplayView extends Component<Props, State> {
  state = {
    status: "empty",
    error: null,
    tree: null,
    currentNode: 0,
    input: "",
  };

  _fileInput: ?HTMLInputElement;

  componentDidMount() {
    if (this.props.initialTree) {
      this._applyTree(this.props.initialTree);
    } else if (this.props.initialUrl) {
      this._loadUrl(this.props.initialUrl);
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (
      this.props.initialTree &&
      this.props.initialTree !== prevProps.initialTree
    ) {
      this._applyTree(this.props.initialTree);
    } else if (
      this.props.initialUrl &&
      this.props.initialUrl !== prevProps.initialUrl
    ) {
      this._loadUrl(this.props.initialUrl);
    }
  }

  // A tree that's already in memory (e.g. a game just watched to the end) -
  // no fetch, no SGF (re-)parsing. Always starts the replay at the root,
  // regardless of where the live view's currentNode happened to be.
  _applyTree = (tree: GameTree) => {
    this.setState({
      status: "ready",
      error: null,
      tree,
      currentNode: tree.rootNode,
    });
  };

  _loadUrl = (url: string) => {
    this.setState({ status: "empty", error: null });
    fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }
        return res.text();
      })
      .then((text) => this._loadSgf(text))
      .catch((err) => {
        console.warn("[tv] Failed to load SGF from " + url + ":", err);
        this.setState({
          status: "error",
          error: this.props.compact
            ? "Finalpartie konnte nicht geladen werden. Schließe das Beispiel und öffne es erneut."
            : CORS_ERROR_MESSAGE,
        });
      });
  };

  _loadSgf = (text: string) => {
    try {
      let tree = parseSgf(text);
      this.setState({
        status: "ready",
        error: null,
        tree,
        currentNode: tree.rootNode,
      });
    } catch (err) {
      if (err instanceof SgfParseError) {
        this.setState({
          status: "error",
          error: "SGF konnte nicht gelesen werden: " + err.message,
          tree: null,
        });
      } else {
        throw err;
      }
    }
  };

  render() {
    let { status, error, tree, currentNode, input } = this.state;
    return (
      <div
        className={
          "SgfReplay" + (this.props.compact ? " SgfReplay-compact" : "")
        }>
        {this.props.compact ? null : (
          <div className="SgfReplay-sources">
            <div className="SgfReplay-source">
              <div className="SgfReplay-source-label">SGF-Datei:</div>
              <input
                ref={this._setFileInput}
                type="file"
                accept=".sgf,.SGF,text/plain,application/x-go-sgf"
                onChange={this._onFileChange}
              />
            </div>
            <div className="SgfReplay-source">
              <div className="SgfReplay-source-label">SGF einfügen:</div>
              <textarea
                className="SgfReplay-input"
                value={input}
                placeholder="(;GM[1]SZ[19]...)"
                onChange={this._onInputChange}
              />
              <Button
                small
                onClick={this._onLoadInput}
                disabled={!input.trim()}>
                Laden
              </Button>
            </div>
          </div>
        )}
        {this.props.compact && status === "empty" ? (
          <div className="TvGamePanel-notice">Finalpartie wird geladen …</div>
        ) : null}
        {status === "error" ? (
          <div className="SgfReplay-error">{error || "Unbekannter Fehler"}</div>
        ) : null}
        {status === "ready" && tree
          ? this._renderReplay(tree, currentNode)
          : null}
      </div>
    );
  }

  _renderReplay(tree: GameTree, currentNode: number) {
    let line = tree.currentLine;
    let moveNum = line.indexOf(currentNode);
    let computed = tree.computedState[currentNode];
    let playerNames = getSgfPlayerNames(tree);
    let result = getSgfRootProp(tree, "RE");
    let rulesProp = tree.nodes[tree.rootNode].props.find(
      (p) => p.name === "RULES"
    );
    // The RULES prop carries board size beyond the SgfProp type
    let boardSize =
      rulesProp && typeof (rulesProp: any).size === "number"
        ? (rulesProp: any).size
        : "?";
    let currentNodeProps = tree.nodes[currentNode].props;
    let commentProp = currentNodeProps.find((p) => p.name === "COMMENT");
    // BoardContainer only reads game.tree - the rest of GameChannel is unused
    let game: any = {
      type: "review",
      tree,
    };

    return (
      <div className="SgfReplay-game">
        <div className="SgfReplay-info">
          {playerNames.black && playerNames.white ? (
            <span className="SgfReplay-players">
              {playerNames.black} (B) vs. {playerNames.white} (W)
            </span>
          ) : null}
          {result && (!this.props.compact || moveNum === line.length - 1) ? (
            <span className="SgfReplay-result"> · {result}</span>
          ) : null}
          <span className="SgfReplay-size">
            {" "}
            · {boardSize}×{boardSize}
          </span>
        </div>
        <div className="SgfReplay-board-container">
          <BoardContainer
            game={game}
            embedded={this.props.compact}
            onClickPoint={this._noopClick}
          />
        </div>
        <div className="SgfReplay-nav">
          <BoardNav
            nodeId={currentNode}
            currentLine={line}
            onChangeCurrentNode={this._onChangeCurrentNode}
          />
        </div>
        <div className="SgfReplay-captures">
          {computed ? (
            <span>
              Zug {moveNum} · Gefangene: Schwarz {computed.blackCaptures}, Weiß{" "}
              {computed.whiteCaptures}
            </span>
          ) : null}
        </div>
        {commentProp && typeof commentProp.text === "string" ? (
          <div className="SgfReplay-comment">
            <div className="SgfReplay-comment-title">Kommentar:</div>
            <div className="SgfReplay-comment-text">{commentProp.text}</div>
          </div>
        ) : null}
      </div>
    );
  }

  _noopClick = () => {};

  _onChangeCurrentNode = (nodeId: number) => {
    let { tree } = this.state;
    if (!tree) {
      return;
    }
    let nextTree: GameTree = { ...tree };
    if (!nextTree.computedState[nodeId]) {
      nextTree.computedState = computeGameNodeStates(nextTree, nodeId);
    }
    if (nextTree.currentLine.indexOf(nodeId) === -1) {
      nextTree.currentLine = getGameLine(nextTree, nodeId);
    }
    nextTree.currentNode = nodeId;
    this.setState({ tree: nextTree, currentNode: nodeId });
  };

  _setFileInput = (ref: HTMLInputElement | null) => {
    this._fileInput = ref;
  };

  _onFileChange = (e: Object) => {
    let file = e.target.files && e.target.files[0];
    if (!file) {
      return;
    }
    let reader = new FileReader();
    reader.onload = () => {
      let text = typeof reader.result === "string" ? reader.result : "";
      this._loadSgf(text);
    };
    reader.readAsText(file);
    // Reset so selecting the same file again re-triggers onChange
    if (this._fileInput) {
      this._fileInput.value = "";
    }
  };

  _onInputChange = (e: Object) => {
    this.setState({ input: e.target.value });
  };

  _onLoadInput = () => {
    this._loadSgf(this.state.input);
  };
}
