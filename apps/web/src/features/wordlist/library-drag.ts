import type { LibrarySpace } from "@tsz/types";
export const LIBRARY_DRAG_TYPE = "application/x-tsz-library";
export function libraryDragIds(
  data: DataTransfer,
  space: LibrarySpace
): string[] {
  try {
    const value = JSON.parse(data.getData(LIBRARY_DRAG_TYPE)) as {
      space?: unknown;
      ids?: unknown;
    };
    return value.space === space &&
      Array.isArray(value.ids) &&
      value.ids.length <= 100 &&
      value.ids.every((id) => typeof id === "string")
      ? value.ids
      : [];
  } catch {
    return [];
  }
}
