// 管理员管理（super_admin 专属）：列表、筛选、验证码建号，以及行操作（启禁用 / 重置密码）。
// 全对接真实接口；超管账号不可被互操作（后端 403），整行操作按钮前端先置灰。
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag
} from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import type { Admin, AdminLevel, AdminListQuery } from "@tsz/types";
import { GatedButton } from "@/components/GatedButton";
import { useAdminList, useResetAdminPassword, useSetAdminStatus } from "./api";
import { CreateAdminModal } from "./CreateAdminModal";
import {
  ADMIN_LEVEL_LABEL,
  ADMIN_LEVEL_OPTIONS,
  adminActionError
} from "./labels";
import { ResetPasswordResult } from "./ResetPasswordResult";

interface FilterValues {
  role?: AdminLevel;
  phone?: string;
  display_name?: string;
}

export function AdminManagement() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FilterValues>();

  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [resetResult, setResetResult] = useState<{
    password: string;
    name: string;
  } | null>(null);

  const query: AdminListQuery = {
    ...filters,
    page,
    page_size: pageSize
  };
  const listQuery = useAdminList(query);
  const setStatus = useSetAdminStatus();
  const resetPassword = useResetAdminPassword();

  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.pagination.total ?? 0;

  // 建号与重置密码都产出一次性临时密码，且共用同一个 ResetPasswordResult 弹窗展示。
  // 两条流程交错时后 resolve 的 setResetResult 会覆盖前一个，让尚未复制的那枚永久丢失。
  // 故：有临时密码正在生成（重置请求在飞）或已展示待确认（resetResult 未清）时，
  // 禁掉全部「建号 / 重置密码」入口，把秘密的产生串行化。
  const secretBusy =
    createPending || resetPassword.isPending || resetResult !== null;

  const applyFilters = (values: FilterValues) => {
    setFilters(values);
    setPage(1);
  };

  // 启禁用不即时踢线：后端接受一个 access-token TTL 的延迟，文案别承诺「立即下线」。
  const confirmToggleStatus = (record: Admin) => {
    const next = record.status === "active" ? "disabled" : "active";
    const verb = next === "disabled" ? "禁用" : "启用";
    modal.confirm({
      title: `${verb}管理员「${record.display_name}」`,
      content:
        next === "disabled"
          ? "禁用后该管理员无法再登录后台；已登录的会话不会立即断开，最长在一个访问令牌有效期内失效。确认禁用？"
          : "启用后该管理员可以重新登录后台。确认启用？",
      okText: verb,
      okButtonProps: { danger: next === "disabled" },
      cancelText: "取消",
      onOk: () =>
        setStatus
          .mutateAsync({ id: record.id, status: next })
          .then(() =>
            message.success(next === "disabled" ? "已禁用" : "已启用")
          )
          .catch((err: unknown) =>
            message.error(adminActionError(err, "status", "操作失败"))
          )
    });
  };

  // 重置会先吊销目标全部会话、再产出仅显示一次的临时密码，误点代价高，二次确认。
  const confirmResetPassword = (record: Admin) => {
    modal.confirm({
      title: `重置「${record.display_name}」的密码`,
      content:
        "重置会立即吊销该管理员的全部登录会话，并生成一个只显示一次的临时密码，对方下次登录须改密。确认重置？",
      okText: "重置",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () =>
        resetPassword
          .mutateAsync(record.id)
          .then((res) =>
            setResetResult({
              password: res.temporary_password,
              name: record.display_name
            })
          )
          .catch((err: unknown) =>
            message.error(adminActionError(err, "reset", "重置失败"))
          )
    });
  };

  const columns: TableColumnsType<Admin> = [
    { title: "手机号", dataIndex: "phone", width: 140, fixed: "left" },
    { title: "昵称", dataIndex: "display_name", width: 160 },
    {
      title: "权限等级",
      dataIndex: "role",
      width: 130,
      render: (lv: AdminLevel) => (
        <Tag color={lv === "super_admin" ? "purple" : "blue"}>
          {ADMIN_LEVEL_LABEL[lv]}
        </Tag>
      )
    },
    {
      title: "创建人",
      dataIndex: "created_by",
      width: 150,
      render: (creator: Admin["created_by"]) =>
        creator?.display_name ?? "系统 / 历史数据"
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (s: Admin["status"]) => (
        <Badge
          status={s === "active" ? "success" : "default"}
          text={s === "active" ? "正常" : "已禁用"}
        />
      )
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      width: 160,
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: "操作",
      key: "action",
      width: 200,
      fixed: "right",
      render: (_: unknown, record) => {
        // 超管拥有最高权限，超管账号不允许被互操作（含超管操作自己）：整行按钮置灰。
        // 启禁用 / 重置密码只针对普通管理员；后端同样以 403 兜底。
        const isSuper = record.role === "super_admin";
        return (
          <Space size={4} wrap>
            <GatedButton
              type="link"
              size="small"
              // 禁用是破坏性动作，置红警示；启用是恢复性动作，保持常规蓝。
              danger={record.status === "active"}
              reason="超级管理员不可操作"
              disabled={isSuper}
              loading={
                setStatus.isPending && setStatus.variables?.id === record.id
              }
              onClick={() => confirmToggleStatus(record)}
            >
              {record.status === "active" ? "禁用" : "启用"}
            </GatedButton>
            {/* 重置会产出一次性临时密码：超管不可重置，且另一条秘密流程进行中时也禁用。 */}
            <GatedButton
              type="link"
              size="small"
              reason={isSuper ? "超级管理员不可操作" : "请先处理上一条临时密码"}
              disabled={isSuper || secretBusy}
              loading={
                resetPassword.isPending && resetPassword.variables === record.id
              }
              onClick={() => confirmResetPassword(record)}
            >
              重置密码
            </GatedButton>
          </Space>
        );
      }
    }
  ];

  return (
    <Flex vertical gap={16}>
      <Breadcrumb items={[{ title: "用户管理" }, { title: "管理员管理" }]} />

      <Card size="small" styles={{ body: { paddingBottom: 8 } }}>
        <Form
          form={form}
          layout="inline"
          onFinish={applyFilters}
          style={{
            rowGap: 12,
            columnGap: 8,
            display: "flex",
            flexWrap: "wrap"
          }}
        >
          <Form.Item name="phone" label="手机号">
            <Input placeholder="手机号包含" allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="display_name" label="昵称">
            <Input placeholder="昵称包含" allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="role" label="权限等级">
            <Select
              placeholder="全部"
              allowClear
              style={{ width: 150 }}
              options={ADMIN_LEVEL_OPTIONS}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                htmlType="submit"
              >
                搜索
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  form.resetFields();
                  applyFilters({});
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card size="small">
        <Flex
          justify="space-between"
          align="center"
          style={{ marginBottom: 12 }}
        >
          <GatedButton
            type="primary"
            icon={<PlusOutlined />}
            reason="请先处理上一条临时密码"
            disabled={secretBusy}
            onClick={() => setCreateOpen(true)}
          >
            新建管理员
          </GatedButton>
        </Flex>

        {listQuery.isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title="管理员列表加载失败"
            description={listQuery.error.message}
            action={
              <Button size="small" onClick={() => void listQuery.refetch()}>
                重试
              </Button>
            }
          />
        )}

        <Table<Admin>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isPending}
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            pageSizeOptions: [10, 20, 50],
            onChange: (nextPage, nextSize) => {
              setPage(nextSize !== pageSize ? 1 : nextPage);
              setPageSize(nextSize);
            }
          }}
        />
      </Card>

      <CreateAdminModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onPendingChange={setCreatePending}
        onCreated={(result) => setResetResult(result)}
      />
      <ResetPasswordResult
        password={resetResult?.password ?? null}
        adminName={resetResult?.name}
        onClose={() => setResetResult(null)}
      />
    </Flex>
  );
}
