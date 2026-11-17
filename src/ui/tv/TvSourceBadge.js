// @flow
import React from "react";
import type { GameChannel } from "../../model";

type Props = {
  game: GameChannel,
};

// Marks which Go server a board comes from. Games parsed by KgsClient carry
// no tvSource, so everything that is not explicitly OGS is a KGS board.
export default function TvSourceBadge({ game }: Props) {
  let isOgs = game.tvSource === "ogs";
  return (
    <span
      className={"TvSourceBadge TvSourceBadge-" + (isOgs ? "ogs" : "kgs")}
      title={
        isOgs ? "Brett von online-go.com (OGS)" : "Brett vom KGS Go Server"
      }>
      {isOgs ? "OGS" : "KGS"}
    </span>
  );
}
