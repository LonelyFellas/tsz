/** 行内及编辑器标题共用的圆形序号，index 从 0 开始。 */
export function V3RowIndex({
  index,
  label
}: {
  index: number;
  label?: string;
}) {
  return (
    <span className="word-grammar-index" aria-label={label}>
      {index + 1}
    </span>
  );
}
