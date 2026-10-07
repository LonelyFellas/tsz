import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Flex,
  Input,
  Modal,
  Spin,
  Tag,
  Typography,
  theme
} from "antd";
import { useState } from "react";
import type { AdminPermissions, UnifiedPermissionCatalog } from "@tsz/types";
import { api } from "@/lib/auth";
import { PermissionChangeDialog } from "./PermissionChangeDialog";
import { MODULE_LABELS } from "./labels";
import { tagTextColor } from "./tagColors";

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
  const { token } = theme.useToken();
  const labels = Object.fromEntries(
    catalog.permissions.map((p) => [p.key, p.label])
  );
  const modules = [...new Set(catalog.permissions.map((p) => p.module_key))];
  const [selected, setSelected] = useState<string[]>(snapshot.permissions);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTagIds, setPickerTagIds] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [activeModule, setActiveModule] = useState(
    modules.find((module) =>
      catalog.permissions.some(
        (permission) =>
          permission.module_key === module &&
          snapshot.permissions.includes(permission.key)
      )
    ) ??
      modules[0] ??
      ""
  );
  const [previewing, setPreviewing] = useState(false);
  const activePermissions = catalog.permissions.filter(
    (permission) => permission.module_key === activeModule
  );
  const availableTags = catalog.tags.filter(
    (tag) => tag.permissions.length > 0
  );
  const selectedTags = availableTags.filter((tag) =>
    selectedTagIds.includes(tag.id)
  );
  const applyTagSelection = (nextTagIds: string[]) => {
    const removedKeys = new Set(
      selectedTags
        .filter((tag) => !nextTagIds.includes(tag.id))
        .flatMap((tag) => tag.permissions)
    );
    const retainedKeys = availableTags
      .filter((tag) => nextTagIds.includes(tag.id))
      .flatMap((tag) => tag.permissions);
    setSelected((current) => [
      ...new Set([
        ...current.filter((key) => !removedKeys.has(key)),
        ...retainedKeys
      ])
    ]);
    setSelectedTagIds(nextTagIds);
  };
  const grant = selected.filter((key) => !snapshot.permissions.includes(key));
  const revoke = snapshot.permissions.filter((key) => !selected.includes(key));
  return (
    <Flex vertical gap={16} style={{ height: "100%", minHeight: 0 }}>
      <Flex justify="space-between" align="center" gap={16}>
        <Flex vertical gap={2}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            授权对象
          </Typography.Text>
          <Typography.Text strong style={{ fontSize: 16 }}>
            {displayName}
          </Typography.Text>
        </Flex>
        <Flex vertical align="end" gap={2}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            已选权限
          </Typography.Text>
          <Typography.Text strong style={{ whiteSpace: "nowrap" }}>
            {selected.length} / {catalog.permissions.length}
          </Typography.Text>
        </Flex>
      </Flex>
      <Flex
        vertical
        gap={10}
        style={{
          padding: 12,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadiusLG,
          background: token.colorFillAlter,
          flexShrink: 0
        }}
      >
        <Flex justify="space-between" align="center">
          <Typography.Text strong>权限标签</Typography.Text>
          <Flex align="center" gap={10}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              已选 {selectedTags.length} 项
            </Typography.Text>
            <Button
              size="small"
              aria-label="标签池"
              icon={<PlusOutlined />}
              disabled={availableTags.length === 0}
              onClick={() => {
                setPickerTagIds(selectedTagIds);
                setTagSearch("");
                setPickerOpen(true);
              }}
            >
              标签池
            </Button>
          </Flex>
        </Flex>
        <Flex
          wrap
          gap={6}
          role="group"
          aria-label="已选权限标签"
          style={{ maxHeight: 96, overflowY: "auto", alignContent: "start" }}
        >
          {selectedTags.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {availableTags.length === 0 ? "暂无可用标签" : "未选择标签"}
            </Typography.Text>
          ) : (
            selectedTags.map((tag) => (
              <Tag
                key={tag.id}
                color={tag.color === "default" ? undefined : tag.color}
                style={{
                  marginInlineEnd: 0,
                  padding: "1px 5px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  color: tagTextColor(tag.color)
                }}
              >
                <button
                  type="button"
                  aria-label={`${tag.name}：查看权限`}
                  onClick={() =>
                    setActiveModule(
                      catalog.permissions.find(
                        (permission) => permission.key === tag.permissions[0]
                      )?.module_key ?? activeModule
                    )
                  }
                  style={{
                    padding: "0 2px",
                    border: 0,
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    fontSize: 12,
                    lineHeight: "20px"
                  }}
                >
                  {tag.name}
                </button>
                <button
                  type="button"
                  aria-label={`${tag.name}：移除权限`}
                  title={`移除${tag.name}权限`}
                  onClick={() =>
                    applyTagSelection(
                      selectedTagIds.filter((id) => id !== tag.id)
                    )
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 18,
                    height: 18,
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer"
                  }}
                >
                  <CloseOutlined style={{ fontSize: 10 }} />
                </button>
              </Tag>
            ))
          )}
        </Flex>
      </Flex>
      <Flex vertical gap={10} style={{ flex: 1, minHeight: 0 }}>
        <Typography.Text strong>权限项</Typography.Text>
        <Flex
          style={{
            flex: 1,
            minHeight: 0,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusLG,
            overflow: "hidden"
          }}
        >
          <Flex
            vertical
            gap={4}
            role="group"
            aria-label="权限模块"
            style={{
              width: 184,
              flexShrink: 0,
              padding: 8,
              overflowY: "auto",
              background: token.colorFillAlter,
              borderRight: `1px solid ${token.colorBorderSecondary}`
            }}
          >
            {modules.map((module) => {
              const permissions = catalog.permissions.filter(
                (permission) => permission.module_key === module
              );
              const count = permissions.filter((permission) =>
                selected.includes(permission.key)
              ).length;
              return (
                <Button
                  key={module}
                  block
                  type={activeModule === module ? "primary" : "text"}
                  aria-pressed={activeModule === module}
                  onClick={() => setActiveModule(module)}
                  style={{ textAlign: "left", height: 40 }}
                >
                  <Flex justify="space-between" gap={8}>
                    <span>{MODULE_LABELS[module] ?? module}</span>
                    <span>
                      {count}/{permissions.length}
                    </span>
                  </Flex>
                </Button>
              );
            })}
          </Flex>
          <Flex
            vertical
            role="region"
            aria-label="权限明细"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "16px 20px",
              overflowY: "auto"
            }}
          >
            <Flex justify="space-between" align="center" gap={12}>
              <Typography.Text strong style={{ fontSize: 15 }}>
                {MODULE_LABELS[activeModule] ?? activeModule}
              </Typography.Text>
              <Typography.Text type="secondary">
                已选{" "}
                {
                  activePermissions.filter((permission) =>
                    selected.includes(permission.key)
                  ).length
                }{" "}
                / {activePermissions.length} 项
              </Typography.Text>
            </Flex>
            <Divider style={{ margin: "12px 0 4px" }} />
            {activePermissions.map((permission) => (
              <Flex
                key={permission.key}
                style={{
                  padding: "12px 0",
                  borderBottom: `1px solid ${token.colorBorderSecondary}`
                }}
              >
                <Checkbox
                  checked={selected.includes(permission.key)}
                  onChange={(event) => {
                    setSelected((current) =>
                      event.target.checked
                        ? [...new Set([...current, permission.key])]
                        : current.filter((key) => key !== permission.key)
                    );
                    if (!event.target.checked)
                      setSelectedTagIds((current) =>
                        current.filter(
                          (id) =>
                            !availableTags
                              .find((tag) => tag.id === id)
                              ?.permissions.includes(permission.key)
                        )
                      );
                  }}
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
              </Flex>
            ))}
          </Flex>
        </Flex>
      </Flex>
      <Flex
        justify="space-between"
        align="center"
        gap={12}
        wrap
        style={{
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          paddingTop: 14
        }}
      >
        <Flex vertical gap={2}>
          <Typography.Text strong>待提交变更</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {grant.length || revoke.length
              ? `开通 ${grant.length} 项 · 取消 ${revoke.length} 项`
              : "无变更"}
          </Typography.Text>
        </Flex>
        <Button
          type="primary"
          disabled={!grant.length && !revoke.length}
          onClick={() => setPreviewing(true)}
        >
          预览变更
        </Button>
      </Flex>
      <Modal
        open={pickerOpen}
        title="标签池"
        width={560}
        okText="确认选择"
        cancelText="取消"
        okButtonProps={{
          disabled:
            pickerTagIds.length === selectedTagIds.length &&
            pickerTagIds.every((id) => selectedTagIds.includes(id))
        }}
        onCancel={() => setPickerOpen(false)}
        onOk={() => {
          const firstAdded = availableTags.find(
            (tag) =>
              pickerTagIds.includes(tag.id) && !selectedTagIds.includes(tag.id)
          );
          if (firstAdded) {
            const focusKey =
              firstAdded.permissions.find((key) => !selected.includes(key)) ??
              firstAdded.permissions[0];
            setActiveModule(
              catalog.permissions.find(
                (permission) => permission.key === focusKey
              )?.module_key ?? activeModule
            );
          }
          applyTagSelection(pickerTagIds);
          setPickerOpen(false);
        }}
      >
        <Flex vertical gap={12}>
          <Input
            aria-label="搜索标签"
            placeholder="搜索标签"
            allowClear
            value={tagSearch}
            onChange={(event) => setTagSearch(event.target.value)}
          />
          <Flex
            vertical
            gap={4}
            role="group"
            aria-label="可用标签"
            style={{ maxHeight: 360, overflowY: "auto" }}
          >
            {availableTags
              .filter((tag) => tag.name.includes(tagSearch.trim()))
              .map((tag) => (
                <Checkbox
                  key={tag.id}
                  aria-label={`${tag.name}，${tag.permissions.length} 项权限`}
                  checked={pickerTagIds.includes(tag.id)}
                  onChange={(event) =>
                    setPickerTagIds((current) =>
                      event.target.checked
                        ? [...current, tag.id]
                        : current.filter((id) => id !== tag.id)
                    )
                  }
                  style={{ padding: "8px 10px" }}
                >
                  <Tag
                    color={tag.color === "default" ? undefined : tag.color}
                    style={{
                      marginInlineEnd: 0,
                      color: tagTextColor(tag.color)
                    }}
                  >
                    {tag.name}
                  </Tag>
                  <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                    {tag.permissions.length} 项权限
                  </Typography.Text>
                </Checkbox>
              ))}
            {availableTags.filter((tag) => tag.name.includes(tagSearch.trim()))
              .length === 0 && (
              <Typography.Text type="secondary">无匹配标签</Typography.Text>
            )}
          </Flex>
        </Flex>
      </Modal>
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
      title="权限配置"
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
