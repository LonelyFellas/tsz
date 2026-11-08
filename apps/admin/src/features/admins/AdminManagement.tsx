import {
  useAccessTranslation,
  AccessText,
  accessLabel
} from "../permissions/i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { TableEmptyState } from "@/components/TableEmptyState";
// 管理员管理（super_admin 专属）：列表、筛选、验证码建号，以及行操作（启禁用 / 重置密码）。
// 全对接真实接口；超管账号不可被互操作（后端 403），整行操作按钮前端先置灰。
import { PlusIcon, RotateCwIcon, SearchIcon } from "lucide-react";
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Flex,
  PageHeader,
  Space,
  Tag
} from "@tsz/ui/admin/display";
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Form, Input, Select } from "@tsz/ui/admin/forms";
import { type TableColumnsType } from "@tsz/ui/admin/table";
import dayjs from "dayjs";
import { useState } from "react";
import type { Admin, AdminLevel, AdminListQuery } from "@tsz/types";
import { GatedButton } from "@/components/GatedButton";
import {
  useAdminList,
  useUpdateAdmin,
  useResetAdminPassword,
  useSetAdminStatus
} from "./api";
import { AdminPermissionEditor } from "@/features/permissions/AdminPermissionEditor";
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
  const { t } = useAccessTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm<FilterValues>();
  const [editForm] = Form.useForm<{ display_name: string }>();
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [permissionAdmin, setPermissionAdmin] = useState<Admin | null>(null);
  const updateAdmin = useUpdateAdmin();

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

  const [confirmation, setConfirmation] = useState<{
    kind: "status" | "reset";
    record: Admin;
  }>();
  const [actionError, setActionError] = useState<{ cause: unknown }>();
  const actionPending = setStatus.isPending || resetPassword.isPending;
  const statusVerb =
    confirmation?.record.status === "active" ? t("disable") : t("enable");
  const confirmAction = async () => {
    if (
      !confirmation ||
      actionPending ||
      confirmation.record.role === "super_admin"
    )
      return;
    const { kind, record } = confirmation;
    setActionError(undefined);
    try {
      if (kind === "status") {
        const status = record.status === "active" ? "disabled" : "active";
        await setStatus.mutateAsync({ id: record.id, status });
        void message.success(
          status === "disabled" ? (
            <AccessText message="disabled" />
          ) : (
            <AccessText message="enabled" />
          )
        );
      } else {
        if (secretBusy) return;
        const result = await resetPassword.mutateAsync(record.id);
        setResetResult({
          password: result.temporary_password,
          name: record.display_name
        });
      }
      setConfirmation(undefined);
    } catch (err) {
      setActionError({ cause: err });
    }
  };
  const confirmToggleStatus = (record: Admin) => {
    setActionError(undefined);
    setConfirmation({ kind: "status", record });
  };
  const confirmResetPassword = (record: Admin) => {
    setActionError(undefined);
    setConfirmation({ kind: "reset", record });
  };

  const columns: TableColumnsType<Admin> = [
    { title: t("phone_number"), dataIndex: "phone", width: 140, fixed: "left" },
    {
      title: t("display_name"),
      dataIndex: "display_name",
      width: 160,
      ellipsis: true
    },
    {
      title: t("business_permissions"),
      key: "permissions",
      width: 140,
      render: (_, record) =>
        record.role === "super_admin" ? (
          <Tag>{t("all_permissions")}</Tag>
        ) : (
          <Button
            type="link"
            style={{ paddingInline: 0 }}
            onClick={() => setPermissionAdmin(record)}
          >
            {t("configure_permissions")}
          </Button>
        )
    },
    {
      title: t("access_level"),
      dataIndex: "role",
      width: 130,
      render: (lv: AdminLevel) => (
        <Tag color={lv === "super_admin" ? "purple" : "blue"}>
          {accessLabel(ADMIN_LEVEL_LABEL[lv], t)}
        </Tag>
      )
    },
    {
      title: t("created_by"),
      dataIndex: "created_by",
      width: 150,
      render: (creator: Admin["created_by"]) =>
        creator?.display_name ?? t("system_legacy_data")
    },
    {
      title: t("status"),
      dataIndex: "status",
      width: 100,
      render: (s: Admin["status"]) => (
        <Badge
          status={s === "active" ? "success" : "default"}
          text={s === "active" ? t("active") : t("disabled")}
        />
      )
    },
    {
      title: t("created_at"),
      dataIndex: "created_at",
      width: 160,
      render: (t: string) => dayjs(t).format("YYYY-MM-DD HH:mm")
    },
    {
      title: t("actions"),
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
              reason={t("super_administrators_cannot_be_modified")}
              disabled={isSuper}
              onClick={() => {
                editForm.setFieldsValue({ display_name: record.display_name });
                setEditingAdmin(record);
              }}
            >
              {t("edit")}
            </GatedButton>
            <GatedButton
              type="link"
              size="small"
              // 禁用是破坏性动作，置红警示；启用是恢复性动作，保持常规蓝。
              danger={record.status === "active"}
              reason={t("super_administrators_cannot_be_modified")}
              disabled={isSuper}
              loading={
                setStatus.isPending && setStatus.variables?.id === record.id
              }
              onClick={() => confirmToggleStatus(record)}
            >
              {record.status === "active" ? t("disable") : t("enable")}
            </GatedButton>
            {/* 重置会产出一次性临时密码：超管不可重置，且另一条秘密流程进行中时也禁用。 */}
            <GatedButton
              type="link"
              size="small"
              reason={
                isSuper
                  ? t("super_administrators_cannot_be_modified")
                  : t("handle_the_previous_temporary_password_first")
              }
              disabled={isSuper || secretBusy}
              loading={
                resetPassword.isPending && resetPassword.variables === record.id
              }
              onClick={() => confirmResetPassword(record)}
            >
              {t("reset_password")}
            </GatedButton>
          </Space>
        );
      }
    }
  ];

  return (
    <Flex vertical gap={16}>
      {confirmation && (
        <Modal
          open
          title={
            confirmation.kind === "reset"
              ? t("reset_admin_title", {
                  name: confirmation.record.display_name
                })
              : t(
                  confirmation.record.status === "active"
                    ? "disable_admin_title"
                    : "enable_admin_title",
                  { name: confirmation.record.display_name }
                )
          }
          okText={confirmation.kind === "reset" ? t("reset") : statusVerb}
          cancelText={t("cancel")}
          confirmLoading={actionPending}
          cancelButtonProps={{ disabled: actionPending }}
          okButtonProps={{
            danger:
              confirmation.kind === "reset" ||
              confirmation.record.status === "active"
          }}
          closable={!actionPending}
          keyboard={!actionPending}
          mask={{ closable: !actionPending }}
          onCancel={() => {
            if (!actionPending) setConfirmation(undefined);
          }}
          onOk={() => void confirmAction()}
        >
          <p>
            {confirmation.kind === "reset"
              ? t(
                  "resetting_revokes_all_of_this_administrator_s_sessions_and_genera"
                )
              : confirmation.record.status === "active"
                ? t(
                    "disabling_prevents_this_administrator_from_signing_in_or_accessin"
                  )
                : t(
                    "enabling_lets_this_administrator_sign_in_again_enable_the_account"
                  )}
          </p>
          {actionError && (
            <Alert
              type="error"
              title={adminActionError(
                actionError.cause,
                confirmation.kind,
                t(
                  confirmation.kind === "status"
                    ? "operation_failed"
                    : "reset_failed"
                ),
                t
              )}
            />
          )}
        </Modal>
      )}

      <PageHeader
        title={t("administrators")}
        breadcrumb={<Breadcrumb items={[{ title: t("user_management") }]} />}
      />

      <Card className="admin-filter-card" size="small">
        <Form
          className="admin-filter-form"
          colon={false}
          form={form}
          layout="inline"
          onFinish={applyFilters}
        >
          <Form.Item name="phone" label={t("phone_number")}>
            <Input
              placeholder={t("phone_number_contains")}
              allowClear
              style={{ width: 160 }}
            />
          </Form.Item>
          <Form.Item name="display_name" label={t("display_name")}>
            <Input
              placeholder={t("display_name_contains")}
              allowClear
              style={{ width: 160 }}
            />
          </Form.Item>
          <Form.Item name="role" label={t("access_level")}>
            <Select
              placeholder={t("all")}
              allowClear
              style={{ width: 150 }}
              options={ADMIN_LEVEL_OPTIONS.map((option) => ({
                ...option,
                label: accessLabel(option.label, t)
              }))}
            />
          </Form.Item>
          <Form.Item className="admin-filter-actions">
            <Space>
              <Button type="primary" icon={<SearchIcon />} htmlType="submit">
                {t("search")}
              </Button>
              <Button
                icon={<RotateCwIcon />}
                onClick={() => {
                  form.resetFields();
                  applyFilters({});
                }}
              >
                {t("reset")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card size="small">
        {listQuery.isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            title={t("could_not_load_administrators")}
            description={listQuery.error.message}
            action={
              <Button size="small" onClick={() => void listQuery.refetch()}>
                {t("try_again")}
              </Button>
            }
          />
        )}

        <Table<Admin>
          toolbar={
            <GatedButton
              type="primary"
              icon={<PlusIcon />}
              reason={t("handle_the_previous_temporary_password_first")}
              disabled={secretBusy}
              onClick={() => setCreateOpen(true)}
            >
              {t("create_administrator")}
            </GatedButton>
          }

          tableId="admins"
          locale={{
            emptyText: (
              <TableEmptyState
                message={t("no_administrators_yet")}
                filtered={
                  !!(
                    filters.role ||
                    filters.phone?.trim() ||
                    filters.display_name?.trim()
                  )
                }
                onResetFilters={() => {
                  form.resetFields();
                  applyFilters({});
                }}
              />
            )
          }}
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
            showTotal: (count) => t("records_count", { count }),
            pageSizeOptions: [10, 20, 50],
            onChange: (nextPage, nextSize) => {
              setPage(nextSize !== pageSize ? 1 : nextPage);
              setPageSize(nextSize);
            }
          }}
        />
      </Card>

      <Modal
        title={t("edit_administrator")}
        open={editingAdmin !== null}
        onCancel={() => !updateAdmin.isPending && setEditingAdmin(null)}
        onOk={() => editForm.submit()}
        okText={t("save")}
        cancelText={t("cancel")}
        confirmLoading={updateAdmin.isPending}
        cancelButtonProps={{ disabled: updateAdmin.isPending }}
        closable={!updateAdmin.isPending}
      >
        <Form
          name="admin-edit"
          form={editForm}
          layout="vertical"
          disabled={updateAdmin.isPending}
          onFinish={(values) => {
            if (!editingAdmin || updateAdmin.isPending) return;
            void updateAdmin
              .mutateAsync({
                id: editingAdmin.id,
                input: { display_name: values.display_name.trim() }
              })
              .then(() => {
                setEditingAdmin(null);
                void message.success(
                  <AccessText message="administrator_updated" />
                );
              })
              .catch(() =>
                message.error(
                  <AccessText message="could_not_update_the_administrator_try_again" />
                )
              );
          }}
        >
          <Form.Item label={t("phone_number")}>
            <Input value={editingAdmin?.phone ?? ""} disabled />
          </Form.Item>
          <Form.Item
            name="display_name"
            label={t("display_name")}
            rules={[
              {
                required: true,
                whitespace: true,
                message: <AccessText message="enter_a_display_name" />
              },
              {
                max: 50,
                message: (
                  <AccessText message="display_names_must_be_at_most_50_characters" />
                )
              },
              {
                message: (
                  <AccessText message="display_names_cannot_contain_special_or_control_characters" />
                ),
                validator: (_, value: string) =>
                  value && /[<>\p{Cc}\p{Cf}]/u.test(value)
                    ? Promise.reject(new Error("invalid_display_name"))
                    : Promise.resolve()
              }
            ]}
          >
            <Input maxLength={50} />
          </Form.Item>
        </Form>
      </Modal>

      {permissionAdmin && (
        <AdminPermissionEditor
          adminId={permissionAdmin.id}
          displayName={permissionAdmin.display_name}
          onClose={() => setPermissionAdmin(null)}
        />
      )}
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
