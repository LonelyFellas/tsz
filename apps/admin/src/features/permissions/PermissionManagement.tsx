import { ReloadOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Alert,
  Breadcrumb,
  Button,
  Card,
  DatePicker,
  Drawer,
  Flex,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
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
                  `${phone.slice(0, 3)}****${phone.slice(-4)}`
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
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [managingTags, setManagingTags] = useState(false);
  const [settingTags, setSettingTags] = useState(false);
  const [editingTag, setEditingTag] = useState<PermissionTag | "new">();
  const [tagName, setTagName] = useState("");
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
        setTagIds([]);
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
  const changeTags = (remove: boolean) => {
    if (!catalog.data || !selected.length || !tagIds.length) return;
    void mutateTags(
      () =>
        api.permissionSystem.changeTags({
          catalog_version: catalog.data!.catalog_version,
          targets: tags
            .filter((tag) => tagIds.includes(tag.id))
            .map((tag) => ({
              tag_id: tag.id,
              expected_version: tag.version,
              add: remove ? [] : selected,
              remove: remove ? selected : []
            }))
        }),
      remove ? "标签已移除" : "标签已添加"
    ).then((ok) => {
      if (ok) setSettingTags(false);
    });
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
            {selected.length > 0 && (
              <Button
                onClick={() => {
                  setTagIds([]);
                  setSettingTags(true);
                }}
              >
                设置标签
              </Button>
            )}
          </Space>
          <Space>
            <Button onClick={() => setManagingTags(true)}>管理标签</Button>
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
          scroll={{ x: 1400 }}
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
              width: 180,
              render: (_, p) =>
                tags
                  .filter((tag) => tag.permissions.includes(p.key))
                  .map((tag) => <Tag key={tag.id}>{tag.name}</Tag>)
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
      <Modal
        open={settingTags}
        title="设置标签"
        closable={!busy}
        mask={{ closable: !busy }}
        keyboard={!busy}
        onCancel={() => setSettingTags(false)}
        footer={
          <Space>
            <Button disabled={busy} onClick={() => setSettingTags(false)}>
              取消
            </Button>
            <Button
              loading={busy}
              disabled={!tagIds.length}
              onClick={() => changeTags(true)}
            >
              移除标签
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={!tagIds.length}
              onClick={() => changeTags(false)}
            >
              添加标签
            </Button>
          </Space>
        }
      >
        <Flex vertical gap={12}>
          <Typography.Text>已选 {selected.length} 项权限</Typography.Text>
          <Typography.Text type="secondary">
            标签仅用于分类，不影响管理员权限。
          </Typography.Text>
          {tags.length ? (
            <Select
              aria-label="批量标签"
              mode="multiple"
              placeholder="选择标签"
              value={tagIds}
              onChange={setTagIds}
              disabled={busy}
              style={{ width: "100%" }}
              options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
            />
          ) : (
            <Typography.Text type="secondary">
              暂无标签，请先在“管理标签”中新建标签。
            </Typography.Text>
          )}
        </Flex>
      </Modal>
      <Drawer
        open={managingTags}
        title="管理标签"
        size={560}
        onClose={() => setManagingTags(false)}
      >
        <Flex vertical gap={16}>
          <Typography.Text type="secondary">
            标签仅用于分类，不影响管理员权限。
          </Typography.Text>
          <div>
            <Button
              type="primary"
              disabled={busy}
              onClick={() => {
                setEditingTag("new");
                setTagName("");
              }}
            >
              新建标签
            </Button>
          </div>
          <Table<PermissionTag>
            rowKey="id"
            size="middle"
            dataSource={tags}
            pagination={false}
            locale={{ emptyText: "暂无标签，可点击“新建标签”添加。" }}
            columns={[
              { title: "标签名称", dataIndex: "name" },
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
                      }}
                    >
                      重命名
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
        open={editingTag !== undefined}
        title={editingTag === "new" ? "新建标签" : "重命名标签"}
        okText="保存"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => setEditingTag(undefined)}
        onOk={() => {
          if (!editingTag || !tagName.trim()) return;
          void mutateTags(
            () =>
              editingTag === "new"
                ? api.permissionSystem.createTag(tagName.trim())
                : api.permissionSystem.renameTag(
                    editingTag.id,
                    tagName.trim(),
                    editingTag.version
                  ),
            "标签已保存"
          ).then((ok) => {
            if (ok) setEditingTag(undefined);
          });
        }}
      >
        <Input
          aria-label="标签名称"
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          maxLength={50}
        />
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
