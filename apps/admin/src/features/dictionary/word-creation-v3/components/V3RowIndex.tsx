/** 行内及编辑器标题共用的圆形序号，index 从 0 开始。 */
export function V3RowIndex({ index }: { index: number }) {
  return <span className="word-grammar-index">{index + 1}</span>;
}
