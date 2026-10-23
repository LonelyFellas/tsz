import { CaretDownFilled, CaretUpFilled } from "@ant-design/icons";
import { Button, Tag, Typography } from "antd";
import type { ReactNode } from "react";

export function SenseSectionTitle({
  label,
  count,
  unit,
  collapsed,
  onToggle,
  extra
}: {
  label: string;
  count: number;
  unit: string;
  collapsed: boolean;
  onToggle: () => void;
  extra?: ReactNode;
}) {
  return (
    <div
      aria-expanded={!collapsed}
      aria-label={`切换${label}`}
      className="word-sense-section-title is-interactive"
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggle();
      }}
      role="button"
      tabIndex={0}
    >
      <Typography.Text strong>{label}</Typography.Text>
      <div className="word-sense-section-title-actions">
        {extra}
        <Tag>{`${count} ${unit}`}</Tag>
        <Button
          aria-label={`${collapsed ? "展开" : "收起"}${label}`}
          className="word-sense-section-collapse"
          icon={collapsed ? <CaretDownFilled /> : <CaretUpFilled />}
          iconPlacement="end"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          size="small"
          type="text"
        >
          {collapsed ? "展开" : "收起"}
        </Button>
      </div>
    </div>
  );
}

export function SenseSectionBody({
  collapsed,
  children
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden={collapsed}
      className={`word-sense-section-body${collapsed ? " is-collapsed" : ""}`}
      inert={collapsed}
    >
      <div className="word-sense-section-body-inner">{children}</div>
    </div>
  );
}
