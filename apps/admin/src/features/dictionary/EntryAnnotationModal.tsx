import { useState } from "react";
import type { EntryAnnotationGroup } from "@tsz/types";
import { Alert, Form, Input, Modal, Space, Table, Tag, Typography } from "antd";

export interface AnnotationRow {
  key: string;
  label: string;
  annotation: string | null;
  gloss?: string;
  incoming?: boolean;
  readOnly?: boolean;
}

export function annotationErrors(
  rows: AnnotationRow[],
  values: Record<string, string>,
  groups: EntryAnnotationGroup[],
  required: boolean
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const row of rows) {
    if (row.readOnly) continue;
    const value = (values[row.key] ?? "").trim();
    if (!value && required) errors[row.key] = "请输入标注";
    else if (value && !/^[0-9]+$/.test(value))
      errors[row.key] = "标注只能输入数字";
    else if (value.length > 20) errors[row.key] = "标注最多 20 位数字";
  }
  for (const group of groups) {
    const members = rows.filter(
      (row) => row.incoming || group.entry_ids.includes(row.key)
    );
    for (const row of members) {
      if (row.readOnly || errors[row.key]) continue;
      const value = (values[row.key] ?? "").trim().toLowerCase();
      if (
        value &&
        members.some(
          (other) =>
            other.key !== row.key &&
            (values[other.key] ?? "").trim().toLowerCase() === value
        )
      )
        errors[row.key] = "同组标注不能相同";
    }
  }
  return errors;
}

/** Each opening mounts a fresh edit session; failed requests keep this session. */
export function EntryAnnotationModal({
  rows,
  groups,
  creating = false,
  busy = false,
  frozen = false,
  error,
  onSave,
  onClose
}: {
  rows: AnnotationRow[];
  groups: EntryAnnotationGroup[];
  creating?: boolean;
  busy?: boolean;
  frozen?: boolean;
  error?: string;
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.key, row.annotation ?? ""]))
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const errors = annotationErrors(
    rows,
    values,
    groups,
    creating || groups.length > 0
  );
  return (
    <Modal
      title="词条标注"
      cancelText="取消"
      open
      width={640}
      onCancel={onClose}
      closable={!busy && !frozen}
      maskClosable={!busy && !frozen}
      keyboard={!busy && !frozen}
      cancelButtonProps={{ disabled: busy || frozen }}
      onOk={() => {
        if (Object.keys(errors).length) return;
        onSave(
          Object.fromEntries(
            Object.entries(values).map(([id, value]) => [id, value.trim()])
          )
        );
      }}
      okText={creating ? "保存标注并创建" : "保存标注"}
      confirmLoading={busy}
      okButtonProps={{ disabled: Object.keys(errors).length > 0 }}
      destroyOnHidden
    >
      {error ? (
        <Alert
          showIcon
          type="error"
          title={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Table<AnnotationRow>
        size="small"
        tableLayout="fixed"
        pagination={false}
        dataSource={rows}
        columns={[
          {
            title: "词条",
            key: "entry",
            width: "52%",
            onCell: () => ({
              style: { verticalAlign: "top", paddingBlock: 12 }
            }),
            render: (_, row) => (
              <Space orientation="vertical" size={0} style={{ width: "100%" }}>
                <Space size={8} wrap style={{ minHeight: 32 }}>
                  <Typography.Text
                    strong
                    style={{ fontSize: 15, overflowWrap: "anywhere" }}
                  >
                    {row.label}
                  </Typography.Text>
                  <Tag>{row.incoming ? "新建" : "已有"}</Tag>
                </Space>
                {row.gloss ? (
                  <Typography.Text
                    type="secondary"
                    style={{ fontSize: 12, lineHeight: "20px" }}
                  >
                    {row.gloss}
                  </Typography.Text>
                ) : null}
              </Space>
            )
          },
          {
            title: "标注",
            key: "annotation",
            onCell: () => ({
              style: { verticalAlign: "top", paddingBlock: 12 }
            }),
            render: (_, row) => {
              const error = errors[row.key];
              const showError =
                error && (touched[row.key] || values[row.key]?.trim());
              return (
                <Form.Item
                  style={{ marginBottom: 0, maxWidth: 240 }}
                  validateStatus={showError ? "error" : undefined}
                  help={showError ? error : undefined}
                >
                  <Input
                    aria-label={`${row.incoming ? "新建词条" : row.label}标注`}
                    placeholder="请输入标注"
                    inputMode="numeric"
                    style={{
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                      fontSize: 14,
                      fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "0.04em"
                    }}
                    value={values[row.key] ?? ""}
                    disabled={busy || frozen || row.readOnly}
                    onBlur={() =>
                      setTouched((current) => ({ ...current, [row.key]: true }))
                    }
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [row.key]: event.target.value
                      }))
                    }
                  />
                </Form.Item>
              );
            }
          }
        ]}
      />
    </Modal>
  );
}
