import { Table, Typography } from "antd";

type Difference = { path: string; local: unknown; remote: unknown };

function differences(
  local: unknown,
  remote: unknown,
  path = "内容"
): Difference[] {
  if (Object.is(local, remote)) return [];
  if (
    local !== null &&
    remote !== null &&
    typeof local === "object" &&
    typeof remote === "object" &&
    Array.isArray(local) === Array.isArray(remote)
  ) {
    const left = local as Record<string, unknown>;
    const right = remote as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(
      (key) => differences(left[key], right[key], `${path}.${key}`)
    );
  }
  return [{ path, local, remote }];
}

function valueText(value: unknown) {
  if (value === undefined) return "（不存在）";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function DraftComparison({
  local,
  remote
}: {
  local: unknown;
  remote: unknown;
}) {
  const rows = differences(local, remote);
  return (
    <section aria-label="草稿差异">
      <Typography.Paragraph>
        本地输入与服务端最新草稿的差异；未自动合并。请核对后调整输入，再保存。
      </Typography.Paragraph>
      {rows.length ? (
        <Table<Difference>
          size="small"
          rowKey="path"
          dataSource={rows}
          pagination={
            rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false
          }
          scroll={{ x: 640 }}
          columns={[
            { title: "字段路径", dataIndex: "path", width: 220 },
            {
              title: "本地输入",
              dataIndex: "local",
              render: (value: unknown) => (
                <span
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {valueText(value)}
                </span>
              )
            },
            {
              title: "服务端最新内容",
              dataIndex: "remote",
              render: (value: unknown) => (
                <span
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {valueText(value)}
                </span>
              )
            }
          ]}
        />
      ) : (
        <Typography.Text>本地输入与服务端内容相同。</Typography.Text>
      )}
    </section>
  );
}
