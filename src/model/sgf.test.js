import fs from "fs";
import path from "path";
import {
  parseSgf,
  getSgfRootProp,
  getSgfPlayerNames,
  SgfParseError,
} from "./sgf";

const FIXTURES = path.join(__dirname, "__fixtures__");

function loadFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

function firstMoveProps(tree) {
  let firstNode = tree.nodes[tree.rootNode].children[0];
  return tree.nodes[firstNode].props;
}

describe("parseSgf - AlphaGo vs Lee Sedol 2016 game 1 (19x19, with variation)", () => {
  let tree;
  beforeAll(() => {
    tree = parseSgf(loadFixture("alphago-lee-sedol-2016-game1.sgf"));
  });

  it("defaults to a 19x19 board when SZ is missing", () => {
    let root = tree.nodes[tree.rootNode];
    let rulesProp = root.props.find((p) => p.name === "RULES");
    expect(rulesProp.size).toBe(19);
    expect(tree.computedState[tree.rootNode].board.length).toBe(19);
  });

  it("reads komi from KM", () => {
    let root = tree.nodes[tree.rootNode];
    let rulesProp = root.props.find((p) => p.name === "RULES");
    expect(rulesProp.komi).toBe(7.5);
  });

  it("reads player names from PB/PW", () => {
    expect(getSgfPlayerNames(tree)).toEqual({
      black: "Lee Sedol",
      white: "AlphaGo",
    });
    expect(getSgfRootProp(tree, "RE")).toBe("W+R");
  });

  it("parses the first move qd to board coordinates (15,15)", () => {
    let props = firstMoveProps(tree);
    let move = props.find((p) => p.name === "MOVE");
    expect(move.color).toBe("black");
    expect(move.loc).toEqual({ x: 15, y: 15 });
  });

  it("keeps the variation after move 10 as a second child", () => {
    // node 0 = root, node 10 = W[qc] (move 10)
    let node10 = tree.nodes[10];
    expect(node10.children.length).toBe(2);
    let variantNode = tree.nodes[node10.children[1]];
    let variantMove = variantNode.props.find((p) => p.name === "MOVE");
    expect(variantMove.color).toBe("black");
    expect(variantMove.loc).toEqual({ x: 14, y: 16 }); // pc
  });

  it("computes board state for the whole main line", () => {
    let computed = Object.keys(tree.computedState).length;
    expect(computed).toBeGreaterThan(180);
    let lastLineNode = tree.currentLine[tree.currentLine.length - 1];
    let state = tree.computedState[lastLineNode];
    expect(state.board.length).toBe(19);
  });
});

describe("parseSgf - Yasuda vs Ito 1840 (19x19, 3-stone handicap)", () => {
  let tree;
  beforeAll(() => {
    tree = parseSgf(loadFixture("yasuda-ito-1840-3handicap.sgf"));
  });

  it("reads handicap and places AB stones on the root node", () => {
    let root = tree.nodes[tree.rootNode];
    let rulesProp = root.props.find((p) => p.name === "RULES");
    expect(rulesProp.handicap).toBe(3);
    expect(rulesProp.size).toBe(19);
    expect(rulesProp.komi).toBe(6.5); // no KM in file -> default

    let stones = root.props.filter((p) => p.name === "ADDSTONE");
    expect(stones.length).toBe(3);
    expect(
      stones.every((p) => p.color === "black" && typeof p.loc === "object")
    ).toBe(true);
    expect(stones[0].loc).toEqual({ x: 3, y: 15 }); // dd
  });

  it("shows handicap stones on the initial board", () => {
    let board = tree.computedState[tree.rootNode].board;
    let stones = 0;
    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board.length; x++) {
        if (board[y][x] === "black") {
          stones++;
        }
      }
    }
    expect(stones).toBe(3);
  });

  it("has captures somewhere in the game (ko fight)", () => {
    let hasCaptures = Object.keys(tree.computedState).some(
      (id) =>
        tree.computedState[id].blackCaptures > 0 ||
        tree.computedState[id].whiteCaptures > 0
    );
    expect(hasCaptures).toBe(true);
  });
});

describe("parseSgf - Takao vs So 2014 (13x13)", () => {
  let tree;
  beforeAll(() => {
    tree = parseSgf(loadFixture("takao-so-2014-13x13.sgf"));
  });

  it("reads the 13x13 board size and komi", () => {
    let root = tree.nodes[tree.rootNode];
    let rulesProp = root.props.find((p) => p.name === "RULES");
    expect(rulesProp.size).toBe(13);
    expect(rulesProp.komi).toBe(6.5);
    expect(tree.computedState[tree.rootNode].board.length).toBe(13);
  });

  it("parses the first move jd to (8,9)", () => {
    let props = firstMoveProps(tree);
    let move = props.find((p) => p.name === "MOVE");
    expect(move.loc).toEqual({ x: 8, y: 9 });
  });
});

describe("parseSgf - passes and errors", () => {
  it("supports standard SGF coordinates without skipping i", () => {
    let tree = parseSgf("(;SZ[19];B[ij])", { skipI: false });
    let firstNode = tree.nodes[tree.rootNode].children[0];
    let move = tree.nodes[firstNode].props.find((p) => p.name === "MOVE");
    expect(move.loc).toEqual({ x: 8, y: 9 });
  });

  it("treats empty and tt values as pass", () => {
    let tree = parseSgf("(;GM[1]SZ[19];B[aa];W[];B[tt])");
    let node1 = tree.nodes[tree.rootNode].children[0];
    let move1 = tree.nodes[node1].props.find((p) => p.name === "MOVE");
    expect(move1.loc).toEqual({ x: 0, y: 18 });
    let node2 = tree.nodes[node1].children[0];
    let move2 = tree.nodes[node2].props.find((p) => p.name === "MOVE");
    expect(move2.loc).toBe("PASS");
    let node3 = tree.nodes[node2].children[0];
    let move3 = tree.nodes[node3].props.find((p) => p.name === "MOVE");
    expect(move3.loc).toBe("PASS");
  });

  it("throws SgfParseError on broken input", () => {
    expect(() => parseSgf("")).toThrow(SgfParseError);
    expect(() => parseSgf("(;GM[1]")).toThrow(SgfParseError);
    expect(() => parseSgf("(;GM[1];B[zz])")).toThrow(SgfParseError);
  });
});
