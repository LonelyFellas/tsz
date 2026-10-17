import { Typography } from "@mui/material";
import { useState } from "react";
import { AdminTable } from "@/components/AdminTable";

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
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
  return (
    <section aria-label="草稿差异">
      <Typography sx={{ mb: 2 }}>
        本地输入与服务端最新草稿的差异；未自动合并。请核对后调整输入，再保存。
      </Typography>
      {rows.length ? (
        <AdminTable
          rows={rows.slice((currentPage - 1) * 20, currentPage * 20)}
          rowId={(row) => row.path}
          minWidth={640}
          pagination={
            rows.length > 20
              ? {
                  page: currentPage,
                  pageSize: 20,
                  total: rows.length,
                  onChange: setPage
                }
              : undefined
          }
          columns={[
            {
              id: "path",
              label: "字段路径",
              width: 220,
              render: (row) => row.path
            },
            {
              id: "local",
              label: "本地输入",
              render: (row) => (
                <span
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {valueText(row.local)}
                </span>
              )
            },
            {
              id: "remote",
              label: "服务端最新内容",
              render: (row) => (
                <span
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {valueText(row.remote)}
                </span>
              )
            }
          ]}
        />
      ) : (
        <Typography>本地输入与服务端内容相同。</Typography>
      )}
    </section>
  );
}
