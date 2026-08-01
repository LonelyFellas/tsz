// 管理员管理（super_admin 专属）：按 tsz-rust 当前契约提供列表、筛选与验证码建号。
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
  Alert,
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
import { useAdminList } from "./api";
import { CreateAdminModal } from "./CreateAdminModal";
import { ADMIN_LEVEL_LABEL, ADMIN_LEVEL_OPTIONS } from "./labels";
import { ResetPasswordResult } from "./ResetPasswordResult";

interface FilterValues {
  role?: AdminLevel;
  phone?: string;
  display_name?: string;
}

export function AdminManagement() {
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

  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.pagination.total ?? 0;

  // 建号临时密码仅返回一次；展示期间禁止再次建号，避免新结果覆盖尚未复制的密码。
  const secretBusy = createPending || resetResult !== null;

  const applyFilters = (values: FilterValues) => {
    setFilters(values);
    setPage(1);
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
