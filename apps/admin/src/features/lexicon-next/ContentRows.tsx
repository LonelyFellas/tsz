import { Button, Space } from "@tsz/ui/admin/display";
import { Input, Select } from "@tsz/ui/admin/forms";
import { Trash2, Plus } from "lucide-react";
import type { NextDefinition, NextEquivalent } from "@tsz/types";

type Row = NextEquivalent | NextDefinition;
export function ContentRows({
  rows,
  locale,
  label,
  definition = false,
  disabled,
  onChange
}: {
  rows: Row[];
  locale: string;
  label: string;
  definition?: boolean;
  disabled: boolean;
  onChange: (rows: Row[]) => void;
}) {
  const visible = rows.filter((row) => row.locale === locale);
  return (
    <section className="lexicon-next-rows" aria-label={label}>
      <h4>{label}</h4>
      {!visible.length && <p className="lexicon-next-muted">尚无{label}</p>}
      {visible.map((row, index) => (
        <div key={row.id} className="lexicon-next-row">
          {definition ? (
            <Input.TextArea
              aria-label={`${label} ${index + 1}`}
              value={row.text}
              disabled={disabled}
              autoSize={{ minRows: 2, maxRows: 8 }}
              onChange={(e) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id
                      ? { ...item, text: e.target.value }
                      : item
                  )
                )
              }
            />
          ) : (
            <Input
              aria-label={`${label} ${index + 1}`}
              value={row.text}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  rows.map((item) =>
                    item.id === row.id
                      ? { ...item, text: e.target.value }
                      : item
                  )
                )
              }
            />
          )}
          <Space>
            {"style" in row && (
              <Select
                aria-label={`${label} ${index + 1} 格式`}
                value={row.style}
                disabled={disabled}
                options={[
                  { value: "definition", label: "定义" },
                  { value: "sentence", label: "整句释义" }
                ]}
                onChange={(style) =>
                  onChange(
                    rows.map((item) =>
                      item.id === row.id ? { ...item, style } : item
                    )
                  )
                }
              />
            )}
            <Button
              aria-label={`删除${label} ${index + 1}`}
              icon={<Trash2 aria-hidden="true" />}
              disabled={disabled}
              onClick={() =>
                onChange(rows.filter((item) => item.id !== row.id))
              }
            />
          </Space>
        </div>
      ))}
      <Button
        icon={<Plus aria-hidden="true" />}
        disabled={disabled}
        onClick={() =>
          onChange([
            ...rows,
            {
              id: crypto.randomUUID(),
              locale,
              text: "",
              ...(definition ? { style: "definition" as const } : {})
            }
          ])
        }
      >
        添加{label}
      </Button>
    </section>
  );
}
