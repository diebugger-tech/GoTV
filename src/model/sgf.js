// @flow
import { GameNode } from "./types";
import type { GameTree, SgfProp, SgfColor, SgfLoc, GameRuleSet } from "./types";
import { computeGameNodeStates, getGameLine } from "./game/tree";

export class SgfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SgfParseError";
  }
}

// SGF uses letters a-z without 'i' for coordinates
function sgfCharToIndex(c: string): number {
  let idx = c.toLowerCase().charCodeAt(0) - "a".charCodeAt(0);
  if (c.toLowerCase() > "i") {
    idx -= 1;
  }
  return idx;
}

function parseLoc(value: string, size: number): SgfLoc {
  let trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "tt") {
    return "PASS";
  }
  if (trimmed.length < 2) {
    throw new SgfParseError("Invalid coordinate: " + JSON.stringify(value));
  }
  let x = sgfCharToIndex(trimmed[0]);
  let y = size - 1 - sgfCharToIndex(trimmed[1]);
  if (x < 0 || x >= size || y < 0 || y >= size) {
    throw new SgfParseError(
      "Coordinate out of range for board size " + size + ": " + value
    );
  }
  return { x, y };
}

const MARK_PROP_NAMES = {
  TR: "TRIANGLE",
  SQ: "SQUARE",
  CR: "CIRCLE",
  MA: "CROSS",
};

const VALID_RULESETS: { [string]: GameRuleSet } = {
  japanese: "japanese",
  chinese: "chinese",
  aga: "aga",
  new_zealand: "new_zealand",
};

type RawProp = {
  name: string,
  values: Array<string>,
};

type RawNode = {
  props: Array<RawProp>,
  children: Array<number>,
  parent: ?number,
};

class SgfParser {
  _text: string;
  _pos: number;
  _nodes: Array<RawNode>;
  _size: number;
  _komi: number;
  _handicap: ?number;
  _rules: GameRuleSet;

  constructor(text: string) {
    this._text = text;
    this._pos = 0;
    this._nodes = [];
    this._size = 19;
    this._komi = 6.5;
    this._handicap = null;
    this._rules = "japanese";
  }

  parse(): GameTree {
    this._skipWhitespace();
    this._parseTree(null);
    this._skipWhitespace();
    if (this._pos < this._text.length) {
      throw new SgfParseError(
        "Unexpected content after end of SGF at position " + this._pos
      );
    }
    if (!this._nodes.length) {
      throw new SgfParseError("SGF contains no nodes");
    }
    return this._buildTree();
  }

  _peek(): ?string {
    return this._text[this._pos];
  }

  _expect(char: string, what: string) {
    if (this._text[this._pos] !== char) {
      throw new SgfParseError("Expected " + what + " at position " + this._pos);
    }
    this._pos++;
  }

  _skipWhitespace() {
    while (this._pos < this._text.length) {
      let c = this._text[this._pos];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") {
        this._pos++;
      } else {
        break;
      }
    }
  }

  // Parses "(<sequence>...)" and returns the id of its first node
  _parseTree(parentId: ?number): number {
    this._expect("(", "'('");
    let firstNodeId = this._parseSequence(parentId);
    this._skipWhitespace();
    this._expect(")", "')'");
    return firstNodeId;
  }

  // Parses one or more nodes (";" ...) until ")" or EOF.
  // Returns the id of the first node (or -1 if the sequence is empty).
  _parseSequence(parentId: ?number): number {
    let firstNodeId = -1;
    let prevNodeId = parentId;
    this._skipWhitespace();
    while (this._pos < this._text.length && this._text[this._pos] === ";") {
      let nodeId = this._parseNode(prevNodeId);
      if (firstNodeId === -1) {
        firstNodeId = nodeId;
      }
      prevNodeId = nodeId;
      this._skipWhitespace();
      // Variations: each following "(...)" is a subtree of this node
      while (this._pos < this._text.length && this._text[this._pos] === "(") {
        this._parseTree(nodeId);
        this._skipWhitespace();
      }
    }
    if (firstNodeId === -1) {
      throw new SgfParseError("Empty node sequence at position " + this._pos);
    }
    return firstNodeId;
  }

  _parseNode(parentId: ?number): number {
    this._expect(";", "';'");
    let props: Array<RawProp> = [];
    this._skipWhitespace();
    while (
      this._pos < this._text.length &&
      this._text[this._pos] !== ";" &&
      this._text[this._pos] !== "(" &&
      this._text[this._pos] !== ")"
    ) {
      props.push(this._parseProp());
      this._skipWhitespace();
    }
    let nodeId = this._nodes.length;
    this._nodes.push({ props, children: [], parent: parentId });
    if (parentId !== null && parentId !== undefined) {
      this._nodes[parentId].children.push(nodeId);
    }
    return nodeId;
  }

  _parseProp(): RawProp {
    let name = "";
    while (this._pos < this._text.length) {
      let c = this._text[this._pos];
      if (c >= "A" && c <= "Z") {
        name += c;
        this._pos++;
      } else {
        break;
      }
    }
    if (!name) {
      throw new SgfParseError(
        "Expected property name at position " + this._pos
      );
    }
    let values: Array<string> = [];
    while (this._pos < this._text.length && this._text[this._pos] === "[") {
      values.push(this._parseValue());
    }
    if (!values.length) {
      throw new SgfParseError(
        "Property " + name + " has no value at position " + this._pos
      );
    }
    return { name, values };
  }

  _parseValue(): string {
    this._expect("[", "'['");
    let value = "";
    while (this._pos < this._text.length) {
      let c = this._text[this._pos];
      if (c === "]") {
        this._pos++;
        return value;
      }
      if (c === "\\") {
        this._pos++;
        if (this._pos < this._text.length) {
          let next = this._text[this._pos];
          if (next === "\n" || next === "\r") {
            // Soft line break - swallow the newline too
            this._pos++;
            if (next === "\r" && this._text[this._pos] === "\n") {
              this._pos++;
            }
          } else {
            value += next;
            this._pos++;
          }
        }
      } else {
        value += c;
        this._pos++;
      }
    }
    throw new SgfParseError(
      "Unterminated property value at position " + this._pos
    );
  }

  // Collect game info from the root node and convert raw props to SgfProps
  _buildTree(): GameTree {
    let root = this._nodes[0];
    for (let raw of root.props) {
      if (raw.name === "SZ" && raw.values[0]) {
        let size = parseInt(raw.values[0], 10);
        if (size >= 2 && size <= 38) {
          this._size = size;
        }
      } else if (raw.name === "KM" && raw.values[0]) {
        let komi = parseFloat(raw.values[0]);
        if (!isNaN(komi)) {
          this._komi = komi;
        }
      } else if (raw.name === "HA" && raw.values[0]) {
        let handicap = parseInt(raw.values[0], 10);
        if (!isNaN(handicap) && handicap >= 2) {
          this._handicap = handicap;
        }
      } else if (raw.name === "RU" && raw.values[0]) {
        let rules = VALID_RULESETS[raw.values[0].toLowerCase()];
        if (rules) {
          this._rules = rules;
        }
      }
    }

    let nodes: { [nodeId: number]: GameNode } = {};
    for (let i = 0; i < this._nodes.length; i++) {
      let raw = this._nodes[i];
      let props: Array<SgfProp> = [];
      for (let rawProp of raw.props) {
        props.push(...this._convertProp(rawProp));
      }
      if (i === 0) {
        // Root node carries the game rules
        let rulesProp: Object = {
          name: "RULES",
          size: this._size,
          komi: this._komi,
          rules: this._rules,
        };
        if (this._handicap !== null && this._handicap !== undefined) {
          rulesProp.handicap = this._handicap;
        }
        props.unshift((rulesProp: any));
      }
      nodes[i] = new GameNode(props, [...raw.children], raw.parent);
    }

    let tree: GameTree = {
      nodes,
      computedState: {},
      messages: {},
      rootNode: 0,
      activeNode: 0,
      currentNode: 0,
      currentLine: [],
    };
    tree.computedState = computeGameNodeStates(tree, 0);
    tree.currentLine = getGameLine(tree, 0);
    return tree;
  }

  _convertProp(raw: RawProp): Array<SgfProp> {
    let { name, values } = raw;
    let size = this._size;
    if (name === "B" || name === "W") {
      let color: SgfColor = name === "B" ? "black" : "white";
      return values.map((value) => ({
        name: "MOVE",
        color,
        loc: parseLoc(value, size),
      }));
    }
    if (name === "AB" || name === "AW" || name === "AE") {
      let color: SgfColor =
        name === "AB" ? "black" : name === "AW" ? "white" : "empty";
      return values.map((value) => ({
        name: "ADDSTONE",
        color,
        loc: parseLoc(value, size),
      }));
    }
    if (name === "C") {
      return values.map((value) => ({ name: "COMMENT", text: value }));
    }
    if (name === "LB") {
      return values.map((value) => {
        let sep = value.indexOf(":");
        if (sep === -1) {
          throw new SgfParseError("Invalid label property: " + value);
        }
        return {
          name: "LABEL",
          loc: parseLoc(value.slice(0, sep), size),
          text: value.slice(sep + 1),
        };
      });
    }
    let markName = MARK_PROP_NAMES[name];
    if (markName) {
      return values.map((value) => ({
        name: markName,
        loc: parseLoc(value, size),
      }));
    }
    // Everything else (PB, PW, RE, DT, EV, ...) - keep as text props
    return values.map((value) => ({ name, text: value }));
  }
}

export function parseSgf(sgf: string): GameTree {
  return new SgfParser(sgf).parse();
}

// Convenience accessors for game info props on the root node
export function getSgfRootProp(tree: GameTree, name: string): ?string {
  let root = tree.nodes[tree.rootNode];
  let prop = root.props.find((p) => p.name === name);
  return prop && typeof prop.text === "string" ? prop.text : null;
}

export function getSgfPlayerNames(
  tree: GameTree
): { black: ?string, white: ?string } {
  return {
    black: getSgfRootProp(tree, "PB"),
    white: getSgfRootProp(tree, "PW"),
  };
}
