import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Drawer,
  Flex,
  Select,
  Spin,
  Typography
} from "antd";
import { useState } from "react";
import type { AdminPermissions, UnifiedPermissionCatalog } from "@tsz/types";
import { api } from "@/lib/auth";
import { PermissionChangeDialog } from "./PermissionChangeDialog";
import { MODULE_LABELS } from "./labels";

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
  const modules = [...new Set(catalog.permissions.map((p) => p.module_key))];
  const hasAvailableTags = catalog.tags.some(
    (tag) => tag.permissions.length > 0
  );
  const [selected, setSelected] = useState<string[]>(snapshot.permissions);
  const [previewing, setPreviewing] = useState(false);
  const grant = selected.filter((key) => !snapshot.permissions.includes(key));
  const revoke = snapshot.permissions.filter((key) => !selected.includes(key));
  return (
    <Flex vertical gap={16} style={{ height: "100%", minHeight: 0 }}>
      <Typography.Text type="secondary">
        勾选权限后，确认变更再保存。
      </Typography.Text>
      <Flex vertical gap={8} style={{ flexShrink: 0 }}>
        <Typography.Text>按标签添加</Typography.Text>
        <Select<string>
          aria-label="按标签添加"
          value={null}
          disabled={!hasAvailableTags}
          placeholder={
            hasAvailableTags ? "选择标签，将权限加入勾选" : "暂无可用标签"
          }
          showSearch={{ optionFilterProp: "label" }}
          style={{ width: "100%" }}
          options={catalog.tags.map((tag) => ({
            value: tag.id,
            label: `${tag.name}（${tag.permissions.length} 项）`,
            disabled: tag.permissions.length === 0
          }))}
          onSelect={(id) => {
            const tag = catalog.tags.find((item) => item.id === id);
            if (tag)
              setSelected((current) => [
                ...new Set([...current, ...tag.permissions])
              ]);
          }}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          只追加权限，可继续逐项调整，确认后才会保存。
        </Typography.Text>
      </Flex>
      {snapshot.permissions.length === 0 && (
        <Typography.Text type="secondary">当前尚未分配权限</Typography.Text>
      )}
      <Checkbox.Group
        value={selected}
        onChange={(values) => setSelected(values as string[])}
        style={{
          display: "block",
          width: "100%",
          flex: 1,
          minHeight: 0,
          overflowY: "auto"
        }}
      >
        <Collapse
          size="small"
          defaultActiveKey={[]}
          expandIconPlacement="end"
          items={modules.map((module) => {
            const permissions = catalog.permissions.filter(
              (p) => p.module_key === module
            );
            return {
              key: module,
              label: (
                <Flex justify="space-between" align="center" gap={12}>
                  <Typography.Text>
                    {MODULE_LABELS[module] ?? module}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    已选{" "}
                    {permissions.filter((p) => selected.includes(p.key)).length}{" "}
                    / {permissions.length} 项
                  </Typography.Text>
                </Flex>
              ),
              // 未展开的选项也需注册，否则 Checkbox.Group 会丢失隐藏模块的已选权限。
              forceRender: true,
              children: (
                <Flex vertical gap={16}>
                  {permissions.map((permission) => (
                    <Checkbox
                      key={permission.key}
                      value={permission.key}
                      style={{ width: "100%", alignItems: "flex-start" }}
                    >
                      <Flex vertical gap={4}>
                        <Typography.Text>{permission.label}</Typography.Text>
                        {permission.description !== permission.label && (
                          <Typography.Text type="secondary">
                            {permission.description}
                          </Typography.Text>
                        )}
                        {permission.requires.length > 0 && (
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: 12 }}
                          >
                            前置权限：
                            {permission.requires
                              .map((key) => labels[key] ?? key)
                              .join("、")}
                          </Typography.Text>
                        )}
                      </Flex>
                    </Checkbox>
                  ))}
                </Flex>
              )
            };
          })}
        />
      </Checkbox.Group>
      <Divider style={{ margin: 0 }} />
      <Flex justify="space-between" align="center" gap={12} wrap>
        <Typography.Text type="secondary">
          已选 {selected.length} 项权限
        </Typography.Text>
        <Button
          type="primary"
          disabled={!grant.length && !revoke.length}
          onClick={() => setPreviewing(true)}
        >
          下一步：确认权限变更
        </Button>
      </Flex>
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
    </Flex>
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
      styles={{ body: { overflow: "hidden" } }}
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
