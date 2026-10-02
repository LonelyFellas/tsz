import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Checkbox, Drawer, Space, Spin, Typography } from "antd";
import { useState } from "react";
import type { AdminPermissions, UnifiedPermissionCatalog } from "@tsz/types";
import { api } from "@/lib/auth";
import { PermissionChangeDialog } from "./PermissionChangeDialog";

function PermissionSelection({
  snapshot,
  catalog,
  displayName,
  onClose
}: {
  snapshot: AdminPermissions;
  catalog: UnifiedPermissionCatalog;
  displayName: string;
  onClose: () => void;
}) {
  const labels = Object.fromEntries(
    catalog.permissions.map((p) => [p.key, p.label])
  );
  const [selected, setSelected] = useState<string[]>(snapshot.permissions);
  const [previewing, setPreviewing] = useState(false);
  const grant = selected.filter((key) => !snapshot.permissions.includes(key));
  const revoke = snapshot.permissions.filter((key) => !selected.includes(key));
  return (
    <>
      <Alert
        showIcon
        type="info"
        title="选择这位管理员可以使用的功能，查看调整后再保存。"
      />
      {snapshot.permissions.length === 0 && (
        <Typography.Paragraph type="secondary">
          当前尚未分配权限
        </Typography.Paragraph>
      )}
      <Checkbox.Group
        value={selected}
        onChange={(values) => setSelected(values as string[])}
        style={{ width: "100%" }}
      >
        <Space
          orientation="vertical"
          style={{ width: "100%", marginBlock: 16 }}
        >
          {catalog.permissions.map((permission) => (
            <Checkbox key={permission.key} value={permission.key}>
              {permission.label}{" "}
              <Typography.Text type="secondary">
                {permission.key}
                {permission.requires.length > 0 && (
                  <>
                    {" "}
                    · 需要同时开通：
                    {permission.requires
                      .map((key) => labels[key] ?? key)
                      .join("、")}
                  </>
                )}
              </Typography.Text>
            </Checkbox>
          ))}
        </Space>
      </Checkbox.Group>
      <Button
        type="primary"
        disabled={!grant.length && !revoke.length}
        onClick={() => setPreviewing(true)}
      >
        查看调整
      </Button>
      {previewing && (
        <PermissionChangeDialog
          catalogVersion={catalog.catalog_version}
          adminIds={[snapshot.admin_id]}
          adminNames={{ [snapshot.admin_id]: displayName }}
          permissionLabels={labels}
          expectedVersions={{
            [snapshot.admin_id]: snapshot.permission_version
          }}
          grant={grant}
          revoke={revoke}
          onClose={() => setPreviewing(false)}
          onCommitted={onClose}
        />
      )}
    </>
  );
}

export function AdminPermissionEditor({
  adminId,
  displayName,
  onClose
}: {
  adminId: string;
  displayName: string;
  onClose: () => void;
}) {
  const catalog = useQuery({
    queryKey: ["permission-system", "catalog"],
    queryFn: api.permissionSystem.catalog
  });
  const snapshot = useQuery({
    queryKey: ["permission-system", "admin", adminId],
    queryFn: () => api.permissionSystem.forAdmin(adminId)
  });
  return (
    <Drawer
      open
      size={720}
      title={`设置权限 · ${displayName}`}
      onClose={onClose}
    >
      {catalog.isPending || snapshot.isPending ? (
        <Spin />
      ) : catalog.isError || snapshot.isError ? (
        <Alert
          type="error"
          title="无法读取权限"
          action={
            <Button
              onClick={() => {
                void catalog.refetch();
                void snapshot.refetch();
              }}
            >
              重试
            </Button>
          }
        />
      ) : (
        <PermissionSelection
          key={`${snapshot.data.permission_version}:${catalog.data.catalog_version}`}
          snapshot={snapshot.data}
          catalog={catalog.data}
          displayName={displayName}
          onClose={onClose}
        />
      )}
    </Drawer>
  );
}
