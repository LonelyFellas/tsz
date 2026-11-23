import type { ComponentProps } from "react";
import { SortableDragHandle } from "./SortableDragHandle";
import { V3RowIndex } from "./V3RowIndex";

export function V3SortableRowIndex({
  indexLabel,
  ...handle
}: ComponentProps<typeof SortableDragHandle> & { indexLabel: string }) {
  return (
    <span className="word-sort-leading">
      <SortableDragHandle {...handle} />
      <V3RowIndex index={handle.index} label={indexLabel} />
    </span>
  );
}
