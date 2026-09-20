export interface PausePosition {
  x: number;
  rowTop: number;
}

/** 按相邻标记中线分配命中区，符号中心与正文位置不动。 */
export function pauseHitWidths(
  positions: PausePosition[],
  rowTolerance: number,
  preferredWidth = 22,
  gutter = 2
): number[] {
  const widths = positions.map(() => preferredWidth);
  const ordered = positions
    .map((position, index) => ({ ...position, index }))
    .sort((a, b) => a.rowTop - b.rowTop || a.x - b.x);
  const rows: (typeof ordered)[] = [];
  for (const position of ordered) {
    const row = rows.at(-1);
    if (!row || Math.abs(position.rowTop - row[0]!.rowTop) > rowTolerance)
      rows.push([position]);
    else row.push(position);
  }
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    row.forEach((position, index) => {
      const previous = row[index - 1];
      const next = row[index + 1];
      widths[position.index] = Math.max(
        1,
        Math.min(
          preferredWidth,
          previous ? position.x - previous.x - gutter : Infinity,
          next ? next.x - position.x - gutter : Infinity
        )
      );
    });
  }
  return widths;
}

/** 停顿是绝对定位元素：调整命中区不会改变词距、换行或输入层度量。 */
export function fitPauseHitAreas(container: Element): void {
  const chips = Array.from(
    container.querySelectorAll<HTMLElement>(".tsz-ve-pause-chip")
  );
  if (!chips.length) return;
  const positions = chips.map((chip) => {
    const box = chip.getBoundingClientRect();
    const gap = chip.closest(".tsz-ve-gap")?.getBoundingClientRect();
    return { x: (box.left + box.right) / 2, rowTop: gap?.top ?? box.top };
  });
  const fontSize =
    Number.parseFloat(getComputedStyle(container).fontSize) || 26;
  // 已添加停顿与灰色插入位同宽，留在词间，不覆盖相邻字母。
  const widths = pauseHitWidths(positions, fontSize * 0.5, 4);
  chips.forEach((chip, index) => {
    chip.style.width = `${widths[index]!.toFixed(2)}px`;
  });
}
