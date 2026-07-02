/** 422 完整性检查(HttpError.details)的逐条展示,保存/发布/列表页发布共用。 */
export function DetailsList({ details }: { details: string[] }) {
  return (
    <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
      {details.map((d) => (
        <li key={d}>{d}</li>
      ))}
    </ul>
  );
}
