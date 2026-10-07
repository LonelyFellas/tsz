import { CloseOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Alert,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  ColorPicker,
  DatePicker,
  Drawer,
  Flex,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import type { Dayjs } from "dayjs";
import { useEffect, useRef, useState } from "react";
import { HttpError } from "@tsz/api-client";
import type { PermissionTag, UnifiedPermissionCatalog } from "@tsz/types";
import { CopyableText } from "@/components/CopyableText";
import { api } from "@/lib/auth";
import { PermissionChangeDialog } from "./PermissionChangeDialog";
import { MODULE_LABELS } from "./labels";
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
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["permission-system", "granted", permissionKey, page],
    queryFn: () => api.permissionSystem.grantedAdmins(permissionKey, page)
  });
  return (
    <Drawer open size={640} title="管理员名单" onClose={onClose}>
      {query.isError && <Alert type="error" title={query.error.message} />}
      <Table
        rowKey="admin_id"
        loading={query.isFetching}
        dataSource={query.data?.items ?? []}
        columns={[
          { title: "管理员", dataIndex: "display_name" },
          {
            title: "账号 ID",
            dataIndex: "admin_id",
            render: (id: string) => <CopyableText value={id} />
          },
          { title: "权限版本", dataIndex: "permission_version" }
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
  const [page, setPage] = useState(1);
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
        action === "grant" ? "批量授权 · 选择管理员" : "撤销授权 · 选择管理员"
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
              showTotal={(total) => `共 ${total} 人`}
              onChange={setPage}
            />
          </Flex>
          <Flex justify="space-between" align="center" gap={12} wrap>
            <Typography.Text>
              已选 {selected.length} 人（单次最多选择 100 人）
            </Typography.Text>
            <Button
              type="primary"
              disabled={!selected.length || selected.length > 100}
              onClick={() => setPreviewing(true)}
            >
              下一步：确认权限变更
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
          所选权限：
          {keys
            .map(
              (key) =>
                catalog.permissions.find((p) => p.key === key)?.label ?? key
            )
            .join("、")}
        </Typography.Paragraph>
        <Input.Search
          placeholder="搜索管理员名称"
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
              { title: "管理员", dataIndex: "display_name" },
              {
                title: "手机号",
                dataIndex: "phone",
                render: (phone: string) =>
                  phone.length > 7
                    ? `${phone.slice(0, 3)}****${phone.slice(-4)}`
                    : "****"
              },
              {
                title: "状态",
                dataIndex: "status",
                render: (status: "active" | "disabled") => (
                  <Tag color={status === "active" ? "green" : "default"}>
                    {status === "active" ? "已启用" : "已禁用"}
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
            catalog.permissions.map((p) => [p.key, p.label])
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
    <Drawer open size={960} title="权限与标签变更记录" onClose={onClose}>
      <Space wrap>
        <Input.Search
          placeholder="管理员 ID"
          onSearch={(value) => {
            setAdminId(value);
            setPage(1);
          }}
        />
        <Input.Search
          placeholder="权限标识"
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
      {query.isError && <Alert type="error" title={query.error.message} />}
      <Table
        rowKey="id"
        loading={query.isFetching}
        dataSource={query.data?.items ?? []}
        columns={[
          { title: "时间", dataIndex: "occurred_at" },
          { title: "操作者", dataIndex: "actor_admin_id" },
          { title: "操作", dataIndex: "action" },
          { title: "对象", dataIndex: "resource_id" },
          { title: "请求", dataIndex: "request_id" },
          {
            title: "调整内容",
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
    success: string
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
          message.warning("标签名称已存在，请使用其他名称");
        } else {
          setEditingTag(undefined);
          message.warning("标签已被更新，请重新查看后再保存");
        }
      } else if (error instanceof HttpError && error.status === 404) {
        await reload();
        setPendingTagChange(undefined);
        setEditingTag(undefined);
        message.warning("标签已被删除，请重新选择");
      } else {
        message.error(error instanceof Error ? error.message : "操作失败");
      }
      return false;
    } finally {
      setBusy(false);
    }
  };
  const permissionLabels = Object.fromEntries(
    (catalog.data?.permissions ?? []).map((p) => [p.key, p.label])
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
      checked ? "权限已加入标签" : "权限已从标签移除"
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
      (!module || module === permission.module_key) &&
      (!search ||
        `${permission.key} ${permission.label} ${permission.description}`
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
      <Breadcrumb items={[{ title: "用户管理" }, { title: "权限管理" }]} />
      <Card size="small" styles={{ body: { paddingBottom: 8 } }}>
        <Form
          layout="inline"
          style={{
            rowGap: 12,
            columnGap: 8,
            display: "flex",
            flexWrap: "wrap"
          }}
        >
          <Form.Item label="关键词">
            <Input
              placeholder="权限名称 / 说明"
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 240 }}
            />
          </Form.Item>
          <Form.Item label="所属模块">
            <Select
              aria-label="所属模块"
              allowClear
              placeholder="全部"
              value={module}
              onChange={setModule}
              style={{ width: 160 }}
              options={[
                ...new Set(
                  catalog.data?.permissions.map((p) => p.module_key) ?? []
                )
              ].map((value) => ({
                value,
                label: MODULE_LABELS[value] ?? value
              }))}
            />
          </Form.Item>
          <Form.Item label="权限标签">
            <Select
              aria-label="权限标签"
              mode="multiple"
              allowClear
              placeholder="全部"
              value={tagFilter}
              onChange={setTagFilter}
              style={{ width: 200 }}
              options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
            />
          </Form.Item>
          <Form.Item>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setSearch("");
                setModule(undefined);
                setTagFilter([]);
              }}
            >
              重置
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Card size="small">
        <Flex
          justify="space-between"
          align="center"
          gap={12}
          wrap
          style={{ marginBottom: 12 }}
        >
          <Space wrap>
            <Typography.Text type="secondary">
              已选 {selected.length} 项
            </Typography.Text>
            <Button
              type="primary"
              disabled={!selected.length}
              onClick={() => setBatchAction("grant")}
            >
              批量授权
            </Button>
            <Button
              danger
              disabled={!selected.length}
              onClick={() => setBatchAction("revoke")}
            >
              撤销授权
            </Button>
            <Button onClick={() => openTagManager()}>标签管理</Button>
          </Space>
          <Space>
            <Button onClick={() => setAudits(true)}>变更记录</Button>
          </Space>
        </Flex>
        {catalog.isError && (
          <Alert
            type="error"
            showIcon
            title="权限列表加载失败"
            description={catalog.error.message}
            style={{ marginBottom: 12 }}
            action={
              <Button size="small" onClick={() => void catalog.refetch()}>
                重试
              </Button>
            }
          />
        )}
        <Table
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
              title: "权限",
              width: 220,
              fixed: "left",
              dataIndex: "label"
            },
            {
              title: "范围 / 说明",
              dataIndex: "description",
              width: 340
            },
            {
              title: "所属模块",
              width: 140,
              render: (_, p) => (
                <>
                  <div>{MODULE_LABELS[p.module_key] ?? p.module_key}</div>
                  <Typography.Text type="secondary">
                    {KIND_LABELS[p.kind] ?? p.kind}
                  </Typography.Text>
                </>
              )
            },
            {
              title: "前置权限",
              width: 240,
              render: (_, p) => (
                <span title={p.requires.join("、")}>
                  {p.requires
                    .map((key) => permissionLabels[key] ?? key)
                    .join("、") || "无"}
                </span>
              )
            },
            {
              title: "风险",
              width: 80,
              dataIndex: "risk_level",
              render: (risk: string) => (
                <Tag color={RISK_COLORS[risk]}>{RISK_LABELS[risk] ?? risk}</Tag>
              )
            },
            {
              title: "标签",
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
                          aria-label={`从${tag.name}移除${p.label}`}
                          title={`仅从“${p.label}”移除“${tag.name}”标签`}
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
                          <CloseOutlined style={{ fontSize: 10 }} />
                        </button>
                      </Tag>
                    ))}
                    {remainingTags.length > 0 ? (
                      <Button
                        type="text"
                        size="small"
                        aria-label={`查看${p.label}其余${remainingTags.length}个标签`}
                        title={remainingTags.map((tag) => tag.name).join("、")}
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
                        icon={<PlusOutlined />}
                        aria-label={`设置${p.label}标签`}
                        title={`设置${p.label}标签`}
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
              title: "已授权管理员",
              width: 160,
              render: (_, p) => (
                <Button type="link" onClick={() => setGrantedKey(p.key)}>
                  查看管理员
                </Button>
              )
            }
          ]}
          pagination={false}
        />
      </Card>
      <Drawer
        open={managingTags}
        title="标签管理"
        size={640}
        onClose={() => {
          setManagingTags(false);
          setTagTargetKey(undefined);
        }}
      >
        <Flex vertical gap={16}>
          <Typography.Text type="secondary">
            标签仅用于权限分类，不影响管理员授权。
          </Typography.Text>
          {tagTargets.length > 0 && (
            <Flex justify="space-between" align="center" gap={12} wrap>
              <Typography.Text strong>
                {tagTargetKey
                  ? `设置标签 · ${permissionLabels[tagTargetKey] ?? tagTargetKey}`
                  : `已选 ${selected.length} 项权限`}
              </Typography.Text>
              <Typography.Text type="secondary">勾选后确认</Typography.Text>
            </Flex>
          )}
          <Flex justify="space-between" align="center">
            <Typography.Text strong>标签列表</Typography.Text>
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
              新建标签
            </Button>
          </Flex>
          <Input
            aria-label="搜索标签"
            placeholder="搜索标签"
            allowClear
            value={tagSearch}
            onChange={(event) => setTagSearch(event.target.value)}
          />
          <Table<PermissionTag>
            rowKey="id"
            size="middle"
            dataSource={tags.filter((tag) =>
              tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase())
            )}
            pagination={false}
            locale={{ emptyText: "暂无标签，可点击“新建标签”添加。" }}
            columns={[
              {
                title: "标签名称",
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
                title: "操作",
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
                      编辑
                    </Button>
                    <Popconfirm
                      title="删除标签？管理员已分配的权限不受影响。"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() =>
                        mutateTags(
                          () =>
                            api.permissionSystem.deleteTag(tag.id, tag.version),
                          "标签已删除，管理员权限未改变"
                        )
                      }
                    >
                      <Button type="link" size="small" danger disabled={busy}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                )
              }
            ]}
          />
        </Flex>
      </Drawer>
      <Modal
        open={pendingTagChange !== undefined}
        title={pendingTagChange?.checked ? "确认添加至标签" : "确认从标签移除"}
        okText={pendingTagChange?.checked ? "确认添加" : "确认移除"}
        okButtonProps={{ danger: !pendingTagChange?.checked }}
        cancelText="取消"
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
            将
            {affectedTagKeys.length === 1
              ? `“${permissionLabels[affectedTagKeys[0]!] ?? affectedTagKeys[0]}”`
              : `${affectedTagKeys.length} 项权限`}
            {pendingTagChange.checked ? "添加至" : "从"}“
            {pendingTagChange.tag.name}”标签
            {pendingTagChange.checked ? "" : "移除"}？
          </Typography.Text>
        )}
      </Modal>
      <Modal
        open={editingTag !== undefined}
        title={editingTag === "new" ? "新建标签" : "编辑标签"}
        okText="保存"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => setEditingTag(undefined)}
        onOk={() => {
          if (!editingTag || !tagName.trim()) return;
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
            "标签已保存"
          ).then((ok) => {
            if (ok) setEditingTag(undefined);
          });
        }}
      >
        <Flex vertical gap={16}>
          <Input
            aria-label="标签名称"
            placeholder="标签名称"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            maxLength={50}
          />
          <Flex vertical gap={8}>
            <Typography.Text>标签颜色</Typography.Text>
            <Radio.Group
              aria-label="标签颜色"
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
                      {color.label}
                    </Tag>
                  </Radio>
                ))}
                <Flex align="center" gap={8} style={{ width: "100%" }}>
                  <Radio value="custom" style={{ marginInlineEnd: 0 }}>
                    自定义
                  </Radio>
                  <ColorPicker
                    aria-label="自定义颜色"
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
