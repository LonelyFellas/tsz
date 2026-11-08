import {
  useAccessTranslation,
  AccessText,
  accessLabel,
  accessLabelSearchText
} from "./i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
import { XIcon, PlusIcon, RotateCwIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Drawer, Modal } from "@tsz/ui/admin/overlays";
import {
  Alert,
  Breadcrumb,
  PageHeader,
  Button,
  Card,
  Flex,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import {
  Checkbox,
  ColorPicker,
  DatePicker,
  Form,
  Input,
  Radio,
  Select
} from "@tsz/ui/admin/forms";
import { Pagination } from "@tsz/ui/admin/table";
import type { Dayjs } from "dayjs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HttpError } from "@tsz/api-client";
import type { PermissionTag, UnifiedPermissionCatalog } from "@tsz/types";
import { CopyableText } from "@/components/CopyableText";
import { api } from "@/lib/auth";
import { PermissionChangeDialog } from "./PermissionChangeDialog";
import { MODULE_LABELS, permissionModules } from "./labels";
import { tagTextColor } from "./tagColors";
const KIND_LABELS: Record<string, string> = {
  page: "页面",
  action: "操作",
  scope: "范围"
};
const RISK_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高"
};
const RISK_COLORS: Record<string, string> = {
  low: "green",
  medium: "orange",
  high: "red"
};
const TAG_COLORS = [
  { value: "default", label: "默认" },
  { value: "blue", label: "蓝色" },
  { value: "cyan", label: "青色" },
  { value: "green", label: "绿色" },
  { value: "gold", label: "黄色" },
  { value: "orange", label: "橙色" },
  { value: "red", label: "红色" },
  { value: "purple", label: "紫色" }
] as const;

function GrantedAdmins({
  permissionKey,
  onClose
}: {
  permissionKey: string;
  onClose: () => void;
}) {
  const { t } = useAccessTranslation();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["permission-system", "granted", permissionKey, page],
    queryFn: () => api.permissionSystem.grantedAdmins(permissionKey, page)
  });
  return (
    <Drawer
      open
      size={640}
      title={t("administrators_with_access")}
      onClose={onClose}
    >
      {query.isError && <Alert type="error" title={query.error.message} />}
      <Table
        tableId="permission-admins"
        locale={{
          emptyText: (
            <TableEmptyState message={t("no_administrators_have_access")} />
          )
        }}
        rowKey="admin_id"
        loading={query.isFetching}
        dataSource={query.data?.items ?? []}
        columns={[
          { title: t("administrator"), dataIndex: "display_name" },
          {
            title: t("account_id"),
            dataIndex: "admin_id",
            render: (id: string) => <CopyableText value={id} />
          },
          { title: t("permission_version"), dataIndex: "permission_version" }
        ]}
        pagination={{
          current: page,
          pageSize: 20,
          total: query.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage
        }}
      />
    </Drawer>
  );
}

function BatchTargets({
  catalog,
  keys,
  action,
  onClose
}: {
  catalog: UnifiedPermissionCatalog;
  keys: string[];
  action: "grant" | "revoke";
  onClose: () => void;
}) {
  const { t } = useAccessTranslation();
  const [page, setPage] = useState(1);
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [page, search]);
  const query = useQuery({
    queryKey: ["permission-system", "targets", page, search],
    queryFn: () =>
      api.admins.list({
        role: "admin",
        display_name: search || undefined,
        page,
        page_size: 20
      })
  });
  return (
    <Drawer
      open
      size={760}
      title={
        action === "grant"
          ? t("grant_access_in_bulk_select_administrators")
          : t("revoke_access_select_administrators")
      }
      onClose={onClose}
      styles={{
        body: { display: "flex", flexDirection: "column", overflow: "hidden" }
      }}
      footer={
        <Flex vertical gap={12}>
          <Flex justify="flex-end">
            <Pagination
              size="small"
              current={page}
              pageSize={20}
              total={query.data?.pagination.total ?? 0}
              showSizeChanger={false}
              showTotal={(total) => t("people_count", { count: total })}
              onChange={setPage}
            />
          </Flex>
          <Flex justify="space-between" align="center" gap={12} wrap>
            <Typography.Text>
              {t("selected_people_limit", { count: selected.length })}
            </Typography.Text>
            <Button
              type="primary"
              disabled={!selected.length || selected.length > 100}
              onClick={() => setPreviewing(true)}
            >
              {t("next_confirm_permission_changes")}
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Flex vertical gap={16} style={{ flex: 1, minHeight: 0 }}>
        <Typography.Paragraph
          style={{
            marginBottom: 0,
            flexShrink: 0,
            maxHeight: "20%",
            overflowY: "auto"
          }}
        >
          {t("selected_permissions", {
            permissions: keys
              .map((key) =>
                accessLabel(
                  catalog.permissions.find((p) => p.key === key)?.label ?? key,
                  t
                )
              )
              .join(t("list_separator"))
          })}
        </Typography.Paragraph>
        <Input.Search
          key={filterResetKey}
          placeholder={t("search_administrator_names")}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          allowClear
          style={{ flexShrink: 0 }}
        />
        {query.isError && <Alert type="error" title={query.error.message} />}
        <div ref={listRef} style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <Table
            tableId="permission-admin-picker"
            locale={{
              emptyText: (
                <TableEmptyState
                  message={t("no_administrators_available")}
                  filtered={!!search.trim()}
                  onResetFilters={() => {
                    setSearch("");
                    setPage(1);
                    setFilterResetKey((key) => key + 1);
                  }}
                />
              )
            }}
            rowKey="id"
            size="middle"
            sticky
            loading={query.isFetching}
            dataSource={query.data?.items ?? []}
            rowSelection={{
              selectedRowKeys: selected,
              preserveSelectedRowKeys: true,
              onChange: (rows) => {
                setSelected(rows as string[]);
                setAdminNames((previous) => ({
                  ...previous,
                  ...Object.fromEntries(
                    (query.data?.items ?? []).map((admin) => [
                      admin.id,
                      admin.display_name
                    ])
                  )
                }));
              },
              getCheckboxProps: (row) => ({
                disabled: row.role === "super_admin"
              })
            }}
            columns={[
              { title: t("administrator"), dataIndex: "display_name" },
              {
                title: t("phone_number"),
                dataIndex: "phone",
                render: (phone: string) =>
                  phone.length > 7
                    ? `${phone.slice(0, 3)}****${phone.slice(-4)}`
                    : "****"
              },
              {
                title: t("status"),
                dataIndex: "status",
                render: (status: "active" | "disabled") => (
                  <Tag color={status === "active" ? "green" : "default"}>
                    {status === "active" ? t("enabled") : t("disabled")}
                  </Tag>
                )
              }
            ]}
            pagination={false}
          />
        </div>
      </Flex>
      {previewing && (
        <PermissionChangeDialog
          catalogVersion={catalog.catalog_version}
          adminIds={selected}
          adminNames={adminNames}
          permissionLabels={Object.fromEntries(
            catalog.permissions.map((p) => [p.key, accessLabel(p.label, t)])
          )}
          grant={action === "grant" ? keys : []}
          revoke={action === "revoke" ? keys : []}
          onClose={() => setPreviewing(false)}
          onCommitted={onClose}
        />
      )}
    </Drawer>
  );
}

function PermissionAudits({ onClose }: { onClose: () => void }) {
  const { t } = useAccessTranslation();
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [page, setPage] = useState(1);
  const [adminId, setAdminId] = useState("");
  const [key, setKey] = useState("");
  const [dates, setDates] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const since = dates?.[0]?.startOf("day").toISOString();
  const until = dates?.[1]?.endOf("day").toISOString();
  const query = useQuery({
    queryKey: ["permission-system", "audits", page, adminId, key, since, until],
    queryFn: () =>
      api.permissionSystem.audits({
        page,
        page_size: 20,
        admin_id: adminId || undefined,
        permission_key: key || undefined,
        since,
        until
      })
  });
  return (
    <Drawer
      open
      size={960}
      title={t("permission_and_tag_change_history")}
      onClose={onClose}
    >
      {query.isError && <Alert type="error" title={query.error.message} />}
      <Table
        toolbar={
          <Space wrap key={filterResetKey}>
            <Input.Search
              key={filterResetKey}
              placeholder={t("administrator_id")}
              onSearch={(value) => {
                setAdminId(value);
                setPage(1);
              }}
            />
            <Input.Search
              key={filterResetKey}
              placeholder={t("permission_key")}
              onSearch={(value) => {
                setKey(value);
                setPage(1);
              }}
            />
            <DatePicker.RangePicker
              value={dates}
              onChange={(value) => {
                setDates(value);
                setPage(1);
              }}
            />
          </Space>
        }

        tableId="permission-audits"
        locale={{
          emptyText: (
            <TableEmptyState
              message={t("no_changes_recorded")}
              filtered={!!(adminId || key || dates)}
              onResetFilters={() => {
                setAdminId("");
                setKey("");
                setDates(null);
                setPage(1);
                setFilterResetKey((key) => key + 1);
              }}
            />
          )
        }}
        rowKey="id"
        loading={query.isFetching}
        dataSource={query.data?.items ?? []}
        columns={[
          { title: t("time"), dataIndex: "occurred_at" },
          { title: t("actor"), dataIndex: "actor_admin_id" },
          { title: t("actions"), dataIndex: "action" },
          { title: t("target"), dataIndex: "resource_id" },
          { title: t("request"), dataIndex: "request_id" },
          {
            key: "调整内容",
            title: t("change_details"),
            render: (_, row) => JSON.stringify(row.metadata)
          }
        ]}
        pagination={{
          current: page,
          pageSize: 20,
          total: query.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage
        }}
      />
    </Drawer>
  );
}

export function PermissionManagement() {
  const { t } = useAccessTranslation();
  const { message } = App.useApp();
  const client = useQueryClient();
  const catalog = useQuery({
    queryKey: ["permission-system", "catalog"],
    queryFn: api.permissionSystem.catalog
  });
  const [search, setSearch] = useState("");
  const [module, setModule] = useState<string>();
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [batchAction, setBatchAction] = useState<"grant" | "revoke">();
  const [grantedKey, setGrantedKey] = useState<string>();
  const [managingTags, setManagingTags] = useState(false);
  const [tagTargetKey, setTagTargetKey] = useState<string>();
  const [tagSearch, setTagSearch] = useState("");
  const [pendingTagChange, setPendingTagChange] = useState<{
    tag: PermissionTag;
    keys: string[];
    checked: boolean;
  }>();
  const [deletingTag, setDeletingTag] = useState<PermissionTag>();
  const [editingTag, setEditingTag] = useState<PermissionTag | "new">();
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("default");
  const [customColor, setCustomColor] = useState("#2053FF");
  const [busy, setBusy] = useState(false);
  const [audits, setAudits] = useState(false);
  const reload = () =>
    client.invalidateQueries({ queryKey: ["permission-system"] });
  const mutateTags = async (
    operation: () => Promise<unknown>,
    success: ReactNode
  ) => {
    setBusy(true);
    try {
      await operation();
      await reload();
      message.success(success);
      return true;
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        await reload();
        setPendingTagChange(undefined);
        const current = client.getQueryData<UnifiedPermissionCatalog>([
          "permission-system",
          "catalog"
        ]);
        const duplicateName = current?.tags.some(
          (tag) =>
            tag.name === tagName.trim() &&
            (editingTag === "new" || tag.id !== editingTag?.id)
        );
        const versionUnchanged =
          editingTag === "new" ||
          (editingTag &&
            current?.tags.find((tag) => tag.id === editingTag.id)?.version ===
              editingTag.version);
        if (editingTag && duplicateName && versionUnchanged) {
          message.warning(
            <AccessText message="this_tag_name_already_exists_use_another_name" />
          );
        } else {
          setEditingTag(undefined);
          message.warning(
            <AccessText message="this_tag_has_changed_reload_it_before_saving" />
          );
        }
      } else if (error instanceof HttpError && error.status === 404) {
        await reload();
        setPendingTagChange(undefined);
        setEditingTag(undefined);
        message.warning(
          <AccessText message="this_tag_has_been_deleted_select_another_tag" />
        );
      } else {
        message.error(
          error instanceof Error ? (
            error.message
          ) : (
            <AccessText message="operation_failed" />
          )
        );
      }
      return false;
    } finally {
      setBusy(false);
    }
  };
  const permissionLabels = Object.fromEntries(
    (catalog.data?.permissions ?? []).map((p) => [
      p.key,
      accessLabel(p.label, t)
    ])
  );
  const tags = catalog.data?.tags ?? [];
  const tagTargets = tagTargetKey ? [tagTargetKey] : selected;
  const changeTagMembers = (
    tag: PermissionTag,
    keys: string[],
    checked: boolean
  ) => {
    if (!catalog.data || !keys.length) return Promise.resolve(false);
    const add = checked
      ? keys.filter((key) => !tag.permissions.includes(key))
      : [];
    const remove = checked
      ? []
      : keys.filter((key) => tag.permissions.includes(key));
    if (!add.length && !remove.length) return Promise.resolve(false);
    return mutateTags(
      () =>
        api.permissionSystem.changeTags({
          catalog_version: catalog.data!.catalog_version,
          targets: [
            { tag_id: tag.id, expected_version: tag.version, add, remove }
          ]
        }),
      checked ? (
        <AccessText message="permissions_added_to_tag" />
      ) : (
        <AccessText message="permissions_removed_from_tag" />
      )
    );
  };
  const queueTagChange = (
    tag: PermissionTag,
    keys: string[],
    checked: boolean
  ) => {
    const changed = keys.some(
      (key) => tag.permissions.includes(key) !== checked
    );
    if (changed) setPendingTagChange({ tag, keys, checked });
  };
  const affectedTagKeys =
    pendingTagChange?.keys.filter(
      (key) =>
        pendingTagChange.tag.permissions.includes(key) !==
        pendingTagChange.checked
    ) ?? [];
  const rows = (catalog.data?.permissions ?? []).filter(
    (permission) =>
      (!module || permissionModules(permission).includes(module)) &&
      (!search ||
        `${permission.key} ${accessLabelSearchText(permission.label)} ${accessLabelSearchText(permission.description)}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!tagFilter.length ||
        tags.some(
          (tag) =>
            tagFilter.includes(tag.id) &&
            tag.permissions.includes(permission.key)
        ))
  );
  const openTagManager = (permissionKey?: string) => {
    setTagTargetKey(permissionKey);
    setTagSearch("");
    setManagingTags(true);
  };
  return (
    <Flex vertical gap={16}>
      <PageHeader
        title={t("permission_management")}
        breadcrumb={<Breadcrumb items={[{ title: t("user_management") }]} />}
      />
      <Card className="admin-filter-card" size="small">
        <Form className="admin-filter-form" colon={false} layout="inline">
          <Form.Item label={t("keyword")}>
            <Input
              placeholder={t("permission_name_description")}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 240 }}
            />
          </Form.Item>
          <Form.Item label={t("module")}>
            <Select
              aria-label={t("module")}
              allowClear
              placeholder={t("all")}
              value={module}
              onChange={setModule}
              style={{ width: 160 }}
              options={[
                ...new Set(
                  catalog.data?.permissions.flatMap(permissionModules) ?? []
                )
              ].map((value) => ({
                value,
                label: accessLabel(MODULE_LABELS[value] ?? value, t)
              }))}
            />
          </Form.Item>
          <Form.Item label={t("permission_tags")}>
            <Select
              aria-label={t("permission_tags")}
              mode="multiple"
              allowClear
              placeholder={t("all")}
              value={tagFilter}
              onChange={setTagFilter}
              style={{ width: 200 }}
              options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
            />
          </Form.Item>
          <Form.Item className="admin-filter-actions">
            <Button
              icon={<RotateCwIcon />}
              onClick={() => {
                setSearch("");
                setModule(undefined);
                setTagFilter([]);
              }}
            >
              {t("reset")}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Card size="small">
        {catalog.isError && (
          <Alert
            type="error"
            showIcon
            title={t("could_not_load_permissions_9d864c")}
            description={catalog.error.message}
            style={{ marginBottom: 12 }}
            action={
              <Button size="small" onClick={() => void catalog.refetch()}>
                {t("try_again")}
              </Button>
            }
          />
        )}
        <Table
          toolbar={
            <Space wrap>
              <Typography.Text type="secondary">
                {t("selected_count", { count: selected.length })}
              </Typography.Text>
              <Button
                type="primary"
                disabled={!selected.length}
                onClick={() => setBatchAction("grant")}
              >
                {t("grant_access_in_bulk")}
              </Button>
              <Button
                danger
                disabled={!selected.length}
                onClick={() => setBatchAction("revoke")}
              >
                {t("revoke_access")}
              </Button>
              <Button onClick={() => openTagManager()}>
                {t("manage_tags")}
              </Button>
            </Space>
          }
          toolbarExtra={
            <Space>
              <Button onClick={() => setAudits(true)}>
                {t("change_history")}
              </Button>
            </Space>
          }

          tableId="permission-catalog"
          locale={{
            emptyText: (
              <TableEmptyState
                message={t("no_permissions")}
                filtered={!!(search.trim() || module || tagFilter.length)}
                onResetFilters={() => {
                  setSearch("");
                  setModule(undefined);
                  setTagFilter([]);
                }}
              />
            )
          }}
          rowKey="key"
          size="middle"
          scroll={{ x: 1480 }}
          loading={catalog.isFetching}
          dataSource={rows}
          rowSelection={{
            fixed: true,
            selectedRowKeys: selected,
            preserveSelectedRowKeys: true,
            onChange: (keys) => setSelected(keys as string[])
          }}
          columns={[
            {
              title: t("permission_name"),
              width: 220,
              fixed: "left",
              dataIndex: "label",
              render: (label: string) => accessLabel(label, t)
            },
            {
              title: t("description_b110d4"),
              dataIndex: "description",
              render: (description: string) => accessLabel(description, t),
              width: 340
            },
            {
              key: "所属板块",
              title: t("module"),
              width: 140,
              render: (_, p) => (
                <>
                  <div>
                    {permissionModules(p)
                      .map((key) => accessLabel(MODULE_LABELS[key] ?? key, t))
                      .join(" / ")}
                  </div>
                  <Typography.Text type="secondary">
                    {p.kind === "action"
                      ? t("permission_kind_action")
                      : accessLabel(KIND_LABELS[p.kind] ?? p.kind, t)}
                  </Typography.Text>
                </>
              )
            },
            {
              key: "前置权限",
              title: t("required_permissions_label"),
              width: 240,
              render: (_, p) => (
                <span title={p.requires.join(t("list_separator"))}>
                  {p.requires
                    .map((key) => permissionLabels[key] ?? key)
                    .join(t("list_separator")) || t("none")}
                </span>
              )
            },
            {
              title: t("risk"),
              width: 80,
              dataIndex: "risk_level",
              render: (risk: string) => (
                <Tag color={RISK_COLORS[risk]}>
                  {accessLabel(RISK_LABELS[risk] ?? risk, t)}
                </Tag>
              )
            },
            {
              key: "标签",
              title: t("tags"),
              width: 260,
              render: (_, p) => {
                const rowTags = tags.filter((tag) =>
                  tag.permissions.includes(p.key)
                );
                const orderedTags = [
                  ...rowTags.filter((tag) => tagFilter.includes(tag.id)),
                  ...rowTags.filter((tag) => !tagFilter.includes(tag.id))
                ];
                const visibleTags = orderedTags.slice(0, 2);
                const remainingTags = orderedTags.slice(2);
                return (
                  <Flex
                    align="center"
                    gap={4}
                    wrap={false}
                    style={{ minWidth: 0, whiteSpace: "nowrap" }}
                  >
                    {visibleTags.map((tag) => (
                      <Tag
                        key={tag.id}
                        color={tag.color === "default" ? undefined : tag.color}
                        style={{
                          marginInlineEnd: 0,
                          maxWidth: visibleTags.length === 2 ? 94 : 180,
                          minWidth: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          color: tagTextColor(tag.color)
                        }}
                      >
                        <span
                          title={tag.name}
                          style={{
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {tag.name}
                        </span>
                        <button
                          type="button"
                          aria-label={t("remove_permission_tag", {
                            tag: tag.name,
                            permission: accessLabel(p.label, t)
                          })}
                          title={t("remove_permission_tag_title", {
                            tag: tag.name,
                            permission: accessLabel(p.label, t)
                          })}
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation();
                            queueTagChange(tag, [p.key], false);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            width: 16,
                            height: 16,
                            padding: 0,
                            border: 0,
                            background: "transparent",
                            color: "inherit",
                            cursor: busy ? "not-allowed" : "pointer"
                          }}
                        >
                          <XIcon style={{ fontSize: 10 }} />
                        </button>
                      </Tag>
                    ))}
                    {remainingTags.length > 0 ? (
                      <Button
                        type="text"
                        size="small"
                        aria-label={t("remaining_permission_tags", {
                          permission: accessLabel(p.label, t),
                          count: remainingTags.length
                        })}
                        title={remainingTags
                          .map((tag) => tag.name)
                          .join(t("list_separator"))}
                        disabled={busy}
                        onClick={() => openTagManager(p.key)}
                        style={{ paddingInline: 2 }}
                      >
                        +{remainingTags.length}
                      </Button>
                    ) : (
                      <Button
                        type="text"
                        size="small"
                        icon={<PlusIcon />}
                        aria-label={t("configure_permission_tags", {
                          permission: accessLabel(p.label, t)
                        })}
                        title={t("configure_permission_tags", {
                          permission: accessLabel(p.label, t)
                        })}
                        disabled={busy}
                        onClick={() => openTagManager(p.key)}
                        style={{ paddingInline: 2, minWidth: 24 }}
                      />
                    )}
                  </Flex>
                );
              }
            },
            {
              key: "已授权管理员",
              title: t("administrators_with_access_845c88"),
              width: 160,
              render: (_, p) => (
                <Button type="link" onClick={() => setGrantedKey(p.key)}>
                  {t("view_administrators")}
                </Button>
              )
            }
          ]}
          pagination={false}
        />
      </Card>
      <Drawer
        open={managingTags}
        title={t("manage_tags")}
        size={640}
        onClose={() => {
          setManagingTags(false);
          setTagTargetKey(undefined);
        }}
      >
        <Flex vertical gap={16}>
          <Typography.Text type="secondary">
            {t(
              "tags_only_categorize_permissions_and_do_not_change_administrator_"
            )}
          </Typography.Text>
          {tagTargets.length > 0 && (
            <Flex justify="space-between" align="center" gap={12} wrap>
              <Typography.Text strong>
                {tagTargetKey
                  ? t("configure_tags_title", {
                      permission: permissionLabels[tagTargetKey] ?? tagTargetKey
                    })
                  : t("selected_permission_count", { count: selected.length })}
              </Typography.Text>
              <Typography.Text type="secondary">
                {t("select_then_confirm")}
              </Typography.Text>
            </Flex>
          )}

          <Input
            aria-label={t("search_tags")}
            placeholder={t("search_tags")}
            allowClear
            value={tagSearch}
            onChange={(event) => setTagSearch(event.target.value)}
          />
          <Table<PermissionTag>
            toolbar={
              <>
                <Typography.Text strong>{t("tags_183f96")}</Typography.Text>
                <Button
                  type="primary"
                  disabled={busy}
                  onClick={() => {
                    setEditingTag("new");
                    setTagName("");
                    setTagColor("default");
                    setCustomColor("#2053FF");
                  }}
                >
                  {t("create_tag")}
                </Button>
              </>
            }

            tableId="permission-tags"
            locale={{
              emptyText: (
                <TableEmptyState
                  message={t("no_tags_yet")}
                  filtered={!!tagSearch.trim()}
                  onResetFilters={() => setTagSearch("")}
                />
              )
            }}
            rowKey="id"
            size="middle"
            dataSource={tags.filter((tag) =>
              tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase())
            )}
            pagination={false}

            columns={[
              {
                key: "标签名称",
                title: t("tag_name"),
                render: (_, tag) => {
                  const matched = tagTargets.filter((key) =>
                    tag.permissions.includes(key)
                  ).length;
                  return tagTargets.length ? (
                    <Checkbox
                      checked={matched === tagTargets.length}
                      indeterminate={matched > 0 && matched < tagTargets.length}
                      disabled={busy}
                      onChange={(event) =>
                        queueTagChange(tag, tagTargets, event.target.checked)
                      }
                    >
                      <Tag
                        color={tag.color === "default" ? undefined : tag.color}
                        style={{
                          marginInlineStart: 4,
                          marginInlineEnd: 0,
                          color: tagTextColor(tag.color)
                        }}
                      >
                        {tag.name}
                      </Tag>
                      {tagTargets.length > 1 && (
                        <Typography.Text
                          type="secondary"
                          style={{ marginLeft: 8 }}
                        >
                          {matched}/{tagTargets.length}
                        </Typography.Text>
                      )}
                    </Checkbox>
                  ) : (
                    <Tag
                      color={tag.color === "default" ? undefined : tag.color}
                      style={{ color: tagTextColor(tag.color) }}
                    >
                      {tag.name}
                    </Tag>
                  );
                }
              },
              {
                key: "操作",
                title: t("actions"),
                width: 160,
                render: (_, tag) => (
                  <Space size={4}>
                    <Button
                      type="link"
                      size="small"
                      disabled={busy}
                      onClick={() => {
                        setEditingTag(tag);
                        setTagName(tag.name);
                        setTagColor(tag.color ?? "default");
                        setCustomColor(
                          tag.color?.startsWith("#") ? tag.color : "#2053FF"
                        );
                      }}
                    >
                      {t("edit")}
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      danger
                      disabled={busy}
                      onClick={() => setDeletingTag(tag)}
                    >
                      {t("delete")}
                    </Button>
                  </Space>
                )
              }
            ]}
          />
        </Flex>
      </Drawer>
      <Modal
        open={pendingTagChange !== undefined}
        title={
          pendingTagChange?.checked
            ? t("confirm_adding_to_tag")
            : t("confirm_removal_from_tag")
        }
        okText={
          pendingTagChange?.checked
            ? t("confirm_addition")
            : t("confirm_removal")
        }
        okButtonProps={{ danger: !pendingTagChange?.checked }}
        cancelText={t("cancel")}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        mask={{ closable: !busy }}
        keyboard={!busy}
        confirmLoading={busy}
        onCancel={() => {
          if (!busy) setPendingTagChange(undefined);
        }}
        onOk={() => {
          if (!pendingTagChange) return;
          void changeTagMembers(
            pendingTagChange.tag,
            pendingTagChange.keys,
            pendingTagChange.checked
          ).then((ok) => {
            if (ok) setPendingTagChange(undefined);
          });
        }}
      >
        {pendingTagChange && (
          <Typography.Text>
            {t(
              pendingTagChange.checked
                ? "add_to_tag_confirmation"
                : "remove_from_tag_confirmation",
              {
                permissions:
                  affectedTagKeys.length === 1
                    ? t("quoted_permission", {
                        permission:
                          permissionLabels[affectedTagKeys[0]!] ??
                          affectedTagKeys[0]!
                      })
                    : t("permission_count", { count: affectedTagKeys.length }),
                tag: pendingTagChange.tag.name
              }
            )}
          </Typography.Text>
        )}
      </Modal>
      {deletingTag && (
        <Modal
          open
          title={t(
            "delete_this_tag_assigned_administrator_permissions_are_unaffected"
          )}
          okText={t("delete")}
          cancelText={t("cancel")}
          confirmLoading={busy}
          okButtonProps={{ danger: true }}
          cancelButtonProps={{ disabled: busy }}
          closable={!busy}
          keyboard={!busy}
          mask={{ closable: !busy }}
          onCancel={() => {
            if (!busy) setDeletingTag(undefined);
          }}
          onOk={() => {
            if (busy) return;
            void mutateTags(
              () =>
                api.permissionSystem.deleteTag(
                  deletingTag.id,
                  deletingTag.version
                ),
              <AccessText message="tag_deleted_administrator_permissions_are_unchanged" />
            ).then((ok) => {
              if (ok) setDeletingTag(undefined);
            });
          }}
        >
          {t("delete_tag_confirmation", { tag: deletingTag.name })}
        </Modal>
      )}
      <Modal
        open={editingTag !== undefined}
        title={editingTag === "new" ? t("create_tag") : t("edit_tag")}
        okText={t("save")}
        cancelText={t("cancel")}
        confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        mask={{ closable: !busy }}
        keyboard={!busy}
        onCancel={() => {
          if (!busy) setEditingTag(undefined);
        }}
        onOk={() => {
          if (busy || !editingTag || !tagName.trim()) return;
          void mutateTags(
            () =>
              editingTag === "new"
                ? api.permissionSystem.createTag(tagName.trim(), tagColor)
                : api.permissionSystem.updateTag(
                    editingTag.id,
                    tagName.trim(),
                    tagColor,
                    editingTag.version
                  ),
            <AccessText message="tag_saved" />
          ).then((ok) => {
            if (ok) setEditingTag(undefined);
          });
        }}
      >
        <Flex vertical gap={16}>
          <Input
            aria-label={t("tag_name")}
            disabled={busy}
            placeholder={t("tag_name")}
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            maxLength={50}
          />
          <Flex vertical gap={8}>
            <Typography.Text>{t("tag_color")}</Typography.Text>
            <Radio.Group
              aria-label={t("tag_color")}
              disabled={busy}
              value={tagColor.startsWith("#") ? "custom" : tagColor}
              onChange={(event) =>
                setTagColor(
                  event.target.value === "custom"
                    ? customColor
                    : event.target.value
                )
              }
            >
              <Flex wrap gap={8}>
                {TAG_COLORS.map((color) => (
                  <Radio
                    key={color.value}
                    value={color.value}
                    style={{ width: 108, marginInlineEnd: 0 }}
                  >
                    <Tag
                      color={
                        color.value === "default" ? undefined : color.value
                      }
                      style={{ marginInlineEnd: 0 }}
                    >
                      {accessLabel(color.label, t)}
                    </Tag>
                  </Radio>
                ))}
                <Flex align="center" gap={8} style={{ width: "100%" }}>
                  <Radio value="custom" style={{ marginInlineEnd: 0 }}>
                    {t("custom")}
                  </Radio>
                  <ColorPicker
                    aria-label={t("custom_color")}
                    disabled={busy}
                    value={customColor}
                    format="hex"
                    disabledFormat
                    disabledAlpha
                    showText={(color) => color.toHexString().toUpperCase()}
                    onOpenChange={(open) => {
                      if (open) setTagColor(customColor);
                    }}
                    onChange={(color) => {
                      const hex = color.toHexString().toUpperCase();
                      setCustomColor(hex);
                      setTagColor(hex);
                    }}
                  />
                </Flex>
              </Flex>
            </Radio.Group>
          </Flex>
        </Flex>
      </Modal>
      {batchAction && catalog.data && (
        <BatchTargets
          catalog={catalog.data}
          keys={selected}
          action={batchAction}
          onClose={() => setBatchAction(undefined)}
        />
      )}
      {grantedKey && (
        <GrantedAdmins
          permissionKey={grantedKey}
          onClose={() => setGrantedKey(undefined)}
        />
      )}
      {audits && <PermissionAudits onClose={() => setAudits(false)} />}
    </Flex>
  );
}
