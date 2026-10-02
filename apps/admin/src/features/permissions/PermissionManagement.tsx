import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Alert,
  Button,
  DatePicker,
  Drawer,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { HttpError } from "@tsz/api-client";
import type { PermissionTag, UnifiedPermissionCatalog } from "@tsz/types";
import { api } from "@/lib/auth";
import { PermissionChangeDialog } from "./PermissionChangeDialog";

const MODULE_LABELS: Record<string, string> = {
  words: "智能词库",
  sentences: "多维例句",
  users: "用户管理",
  teacherapply: "教师认证",
  lexicon_settings: "词性设置",
  speech: "语音生成"
};
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
    <Drawer
      open
      size={640}
      title={`管理员名单 · ${permissionKey}`}
      onClose={onClose}
    >
      {query.data?.super_admins_are_implicit && (
        <Alert
          type="info"
          title="超级管理员无需单独分配权限，因此不在名单中。"
        />
      )}
      {query.isError && <Alert type="error" title={query.error.message} />}
      <Table
        rowKey="admin_id"
        loading={query.isFetching}
        dataSource={query.data?.items ?? []}
        columns={[
          { title: "管理员", dataIndex: "display_name" },
          { title: "账号 ID", dataIndex: "admin_id" },
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
        action === "grant" ? "批量开通 · 选择管理员" : "批量取消 · 选择管理员"
      }
      onClose={onClose}
    >
      <Typography.Paragraph title={keys.join("、")}>
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
      />
      {query.isError && <Alert type="error" title={query.error.message} />}
      <Table
        rowKey="id"
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
          getCheckboxProps: (row) => ({ disabled: row.role === "super_admin" })
        }}
        columns={[
          { title: "管理员", dataIndex: "display_name" },
          { title: "手机号", dataIndex: "phone" },
          { title: "状态", dataIndex: "status" }
        ]}
        pagination={{
          current: page,
          pageSize: 20,
          total: query.data?.pagination.total ?? 0,
          showSizeChanger: false,
          onChange: setPage
        }}
      />
      <Space>
        <Typography.Text>
          已选 {selected.length} 人（最多 100 人）
        </Typography.Text>
        <Button
          type="primary"
          disabled={!selected.length || selected.length > 100}
          onClick={() => setPreviewing(true)}
        >
          查看调整
        </Button>
      </Space>
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
        setEditingTag(undefined);
        message.warning("标签已被更新，请重新查看后再保存");
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
      remove
        ? "标签已移除，标签本身和管理员权限不变"
        : "标签已添加，管理员权限未改变"
    );
  };
  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={3}>权限管理</Typography.Title>
      <Alert
        showIcon
        type="info"
        title="为管理员分配权限。标签用于整理，不影响已分配的权限。"
      />
      {catalog.isError && (
        <Alert
          type="error"
          title={catalog.error.message}
          action={<Button onClick={() => void catalog.refetch()}>重试</Button>}
        />
      )}
      <Space wrap>
        <Input
          placeholder="搜索权限名称或标识"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="业务模块"
          allowClear
          placeholder="业务模块"
          value={module}
          onChange={setModule}
          style={{ width: 160 }}
          options={[
            ...new Set(catalog.data?.permissions.map((p) => p.module_key) ?? [])
          ].map((value) => ({ value, label: MODULE_LABELS[value] ?? value }))}
        />
        <Select
          aria-label="标签筛选"
          mode="multiple"
          allowClear
          placeholder="标签筛选"
          value={tagFilter}
          onChange={setTagFilter}
          style={{ minWidth: 200 }}
          options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
        />
        <Button
          disabled={!selected.length}
          onClick={() => setBatchAction("grant")}
        >
          批量开通
        </Button>
        <Button
          danger
          disabled={!selected.length}
          onClick={() => setBatchAction("revoke")}
        >
          批量取消
        </Button>
        <Button onClick={() => setAudits(true)}>变更记录</Button>
      </Space>
      <Table
        rowKey="key"
        loading={catalog.isFetching}
        dataSource={rows}
        rowSelection={{
          selectedRowKeys: selected,
          preserveSelectedRowKeys: true,
          onChange: (keys) => setSelected(keys as string[])
        }}
        columns={[
          {
            title: "权限",
            render: (_, p) => (
              <>
                <div>{p.label}</div>
                <Typography.Text type="secondary">{p.key}</Typography.Text>
              </>
            )
          },
          {
            title: "所属功能 / 类型",
            render: (_, p) =>
              `${MODULE_LABELS[p.module_key] ?? p.module_key} / ${KIND_LABELS[p.kind] ?? p.kind}`
          },
          {
            title: "需要同时开通",
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
            dataIndex: "risk_level",
            render: (risk: string) => RISK_LABELS[risk] ?? risk
          },
          {
            title: "标签",
            render: (_, p) =>
              tags
                .filter((tag) => tag.permissions.includes(p.key))
                .map((tag) => <Tag key={tag.id}>{tag.name}</Tag>)
          },
          {
            title: "管理员",
            render: (_, p) => (
              <Button type="link" onClick={() => setGrantedKey(p.key)}>
                查看管理员
              </Button>
            )
          }
        ]}
        pagination={false}
      />
      <Space wrap>
        <Typography.Text>已选 {selected.length} 项权限</Typography.Text>
        <Select
          aria-label="批量标签"
          mode="multiple"
          placeholder="选择标签"
          value={tagIds}
          onChange={setTagIds}
          style={{ minWidth: 220 }}
          options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
        />
        <Button
          loading={busy}
          disabled={!selected.length || !tagIds.length}
          onClick={() => changeTags(false)}
        >
          批量打标签
        </Button>
        <Button
          loading={busy}
          disabled={!selected.length || !tagIds.length}
          onClick={() => changeTags(true)}
        >
          移除标签
        </Button>
        <Button
          onClick={() => {
            setEditingTag("new");
            setTagName("");
          }}
        >
          新建标签
        </Button>
      </Space>
      <Typography.Text type="secondary">
        移除标签只清除所选权限的标记，不会删除标签，也不会修改管理员权限。
      </Typography.Text>
      <Space wrap>
        {tags.map((tag) => (
          <Space key={tag.id}>
            <Tag>{tag.name}</Tag>
            <Button
              type="link"
              onClick={() => {
                setEditingTag(tag);
                setTagName(tag.name);
              }}
            >
              重命名
            </Button>
            <Popconfirm
              title="删除标签？管理员已分配的权限不受影响。"
              onConfirm={() =>
                mutateTags(
                  () => api.permissionSystem.deleteTag(tag.id, tag.version),
                  "标签已删除，管理员权限未改变"
                )
              }
            >
              <Button type="link" danger disabled={busy}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ))}
      </Space>
      <Modal
        open={editingTag !== undefined}
        title={editingTag === "new" ? "新建标签" : "重命名标签"}
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
    </Space>
  );
}
