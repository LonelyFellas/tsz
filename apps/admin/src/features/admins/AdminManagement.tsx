// 管理员管理（super_admin 专属）：列表 + 新建 + 启禁用 + 重置密码。全对接真实接口。
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
  level?: AdminLevel;
  q?: string;
}

export function AdminManagement() {
  const { message } = App.useApp();
  const [form] = Form.useForm<FilterValues>();

  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
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
  const total = listQuery.data?.page.total ?? 0;

  // 一次性临时密码在「重置密码 / 建号」两条流程间共用同一个 ResetPasswordResult 弹窗展示，
  // 且临时密码仅此一次返回、不可再取。若两条流程交错触发，后 resolve 的 setResetResult
  // 会覆盖前一个、令尚未复制的那个永久丢失。故：有临时密码正在生成（重置请求在飞）或
  // 已展示待确认（resetResult 未清）时，禁掉全部「建号 / 重置密码」入口，串行化秘密的产生。
  const secretBusy = resetPassword.isPending || resetResult !== null;

  const applyFilters = (values: FilterValues) => {
    setFilters(values);
    setPage(1);
  };

  const toggleStatus = (record: Admin) => {
    const next = record.status === "active" ? "disabled" : "active";
    setStatus
      .mutateAsync({ id: record.id, status: next })
      .then(() => message.success(next === "disabled" ? "已禁用" : "已启用"))
      .catch((err: unknown) => {
        // 409 = 不能禁用最后一个 active super_admin，映射为中文提示（不直接抛后端英文原文）。
        message.error(adminActionError(err, "操作失败"));
      });
  };

  const doResetPassword = (record: Admin) => {
    resetPassword
      .mutateAsync(record.id)
      .then((res) =>
        setResetResult({
          password: res.temporary_password,
          name: record.display_name
        })
      )
      .catch((err: unknown) =>
        message.error(adminActionError(err, "重置失败"))
      );
  };

  const columns: TableColumnsType<Admin> = [
    { title: "手机号", dataIndex: "phone", width: 140, fixed: "left" },
    { title: "昵称", dataIndex: "display_name", width: 160 },
    {
      title: "邮箱",
      dataIndex: "email",
      width: 200,
      render: (e?: string) => e || "-"
    },
    {
      title: "权限等级",
      dataIndex: "level",
      width: 130,
      render: (lv: AdminLevel) => (
        <Tag color={lv === "super_admin" ? "purple" : "blue"}>
          {ADMIN_LEVEL_LABEL[lv]}
        </Tag>
      )
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
        // 超管拥有最高权限，超管账号不允许被互操作：整行操作按钮置灰。
        // 启禁用/重置密码只针对普通管理员。
        const isSuper = record.level === "super_admin";
        return (
          <Space size={4} wrap>
            <GatedButton
              type="link"
              size="small"
              reason="超级管理员不可操作"
              disabled={isSuper}
              loading={
                setStatus.isPending && setStatus.variables?.id === record.id
              }
              onClick={() => toggleStatus(record)}
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
              onClick={() => doResetPassword(record)}
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
          <Form.Item name="q" label="关键字">
            <Input
              placeholder="手机 / 邮箱 / 昵称"
              allowClear
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item name="level" label="权限等级">
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
          scroll={{ x: 1000 }}
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
