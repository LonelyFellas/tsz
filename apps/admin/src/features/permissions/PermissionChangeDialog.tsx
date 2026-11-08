import { AdminRequestError } from "@/components/AdminRequestError";
import { useAccessTranslation, AccessText } from "./i18n";
import { AdminTable as Table } from "@/components/AdminTable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Modal } from "@tsz/ui/admin/overlays";
import { Alert, Button, Flex, Space, Typography } from "@tsz/ui/admin/display";
import { useEffect, useRef, useState } from "react";
import { HttpError } from "@tsz/api-client";
import type { PermissionPreviewResponse } from "@tsz/types";
import { api } from "@/lib/auth";

/** 单人和批量共用服务端展开的精确差异；前端不私自补依赖或整集覆盖。 */
export function permissionCommitFromPreview(
  preview: PermissionPreviewResponse
) {
  return {
    catalog_version: preview.catalog_version,
    targets: preview.targets.map(
      ({ admin_id, expected_version, grant, revoke }) => ({
        admin_id,
        expected_version,
        grant,
        revoke
      })
    )
  };
}

export function PermissionChangeDialog({
  catalogVersion,
  adminIds,
  adminNames,
  permissionLabels,
  expectedVersions,
  grant,
  revoke,
  onClose,
  onCommitted
}: {
  catalogVersion: string;
  adminIds: string[];
  adminNames?: Record<string, string>;
  permissionLabels?: Record<string, string>;
  expectedVersions?: Record<string, number>;
  grant: string[];
  revoke: string[];
  onClose: () => void;
  onCommitted: () => void;
}) {
  const { t } = useAccessTranslation();
  const { message } = App.useApp();
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const recoveryStarted = useRef(false);
  const [recovery, setRecovery] = useState<"reading" | "read" | "failed">();
  const conflict = recovery !== undefined;
  const [current, setCurrent] = useState<PermissionPreviewResponse>();
  const preview = useQuery({
    queryKey: [
      "permission-preview",
      catalogVersion,
      adminIds,
      expectedVersions,
      grant,
      revoke
    ],
    queryFn: () =>
      api.permissionSystem.preview({
        catalog_version: catalogVersion,
        targets: adminIds.map((admin_id) => ({
          admin_id,
          expected_version: expectedVersions?.[admin_id]
        })),
        grant,
        revoke
      }),
    retry: false,
    staleTime: 0
  });

  // 提交结果未知或版本冲突后只回读事实，不复用旧 expected_version 再次提交。
  // 不带增删和预期版本的 preview 是批量只读快照，无需逐人再发请求。
  const reread = async () => {
    setCurrent(undefined);
    setRecovery("reading");
    try {
      const catalog = await api.permissionSystem.catalog();
      const snapshot = await api.permissionSystem.preview({
        catalog_version: catalog.catalog_version,
        targets: adminIds.map((admin_id) => ({ admin_id })),
        grant: [],
        revoke: []
      });
      setCurrent(snapshot);
      setRecovery("read");
    } catch {
      setRecovery("failed");
    }
  };
  useEffect(() => {
    if (
      preview.error instanceof HttpError &&
      preview.error.status === 409 &&
      !recoveryStarted.current
    ) {
      recoveryStarted.current = true;
      void reread();
    }
    // 仅响应本次预览的确定性冲突，不随父级数组引用变化重复回读。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.error]);

  const close = () => {
    if (saving || recovery === "reading") return;
    if (conflict)
      void client.invalidateQueries({ queryKey: ["permission-system"] });
    onClose();
  };
  const commit = async () => {
    if (!preview.data || conflict || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await api.permissionSystem.commit(
        permissionCommitFromPreview(preview.data)
      );
      await client.invalidateQueries({ queryKey: ["permission-system"] });
      message.success(<AccessText message="permissions_saved" />);
      onCommitted();
    } catch (error) {
      if (
        !(error instanceof HttpError) ||
        error.status >= 500 ||
        error.status === 409
      ) {
        recoveryStarted.current = true;
        await reread();
      } else {
        message.error(<AdminRequestError error={error} />);
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const describePermissions = (keys: string[]) =>
    keys
      .map((key) => permissionLabels?.[key] ?? key)
      .join(t("list_separator")) || t("none");
  const renderChanges = (
    keys: string[],
    dependencies: string[],
    automaticKind: "grant" | "revoke"
  ) => {
    const direct = keys.filter((key) => !dependencies.includes(key));
    return (
      <Flex vertical gap={4}>
        {(direct.length > 0 || dependencies.length === 0) && (
          <span title={direct.join(t("list_separator"))}>
            {describePermissions(direct)}
          </span>
        )}
        {dependencies.length > 0 && (
          <Typography.Text
            title={dependencies.join(t("list_separator"))}
            type={automaticKind === "grant" ? "warning" : "danger"}
            style={{ fontSize: 12 }}
          >
            {t("automatic_permissions", {
              action: t(
                automaticKind === "grant"
                  ? "automatically_added"
                  : "automatically_removed"
              ),
              permissions: describePermissions(dependencies)
            })}
          </Typography.Text>
        )}
      </Flex>
    );
  };
  const adminColumn = {
    key: "管理员",
    title: t("administrator"),
    render: (_: unknown, row: PermissionPreviewResponse["targets"][number]) => (
      <Typography.Text title={row.admin_id}>
        {adminNames?.[row.admin_id] ?? row.admin_id}
      </Typography.Text>
    )
  };

  return (
    <Modal
      open
      title={t("preview_permission_changes")}
      width={720}
      closable={!saving && recovery !== "reading"}
      onCancel={close}
      footer={
        <Space>
          <Button disabled={saving || recovery === "reading"} onClick={close}>
            {t("cancel")}
          </Button>
          {conflict ? (
            <Button disabled={saving || recovery === "reading"} onClick={close}>
              {t("return_to_review")}
            </Button>
          ) : (
            <Button
              type="primary"
              disabled={!preview.data || preview.isFetching || preview.isError}
              loading={saving}
              onClick={() => void commit()}
            >
              {t("save_changes")}
            </Button>
          )}
        </Space>
      }
    >
      {recovery === "reading" && (
        <Alert
          type="info"
          title={t("checking_current_permissions_do_not_save_again")}
        />
      )}
      {recovery === "read" && (
        <Alert
          type="warning"
          showIcon
          title={t(
            "current_permissions_have_been_reloaded_review_them_then_return_to"
          )}
        />
      )}
      {recovery === "failed" && (
        <Alert
          type="warning"
          showIcon
          title={t(
            "the_save_result_cannot_be_confirmed_reload_before_making_changes"
          )}
          action={<Button onClick={() => void reread()}>{t("reload")}</Button>}
        />
      )}
      {preview.isError && !conflict && (
        <Alert
          type="error"
          title={<AdminRequestError error={preview.error} />}
          action={
            <Button onClick={() => void preview.refetch()}>
              {t("reload")}
            </Button>
          }
        />
      )}
      {conflict ? (
        current && (
          <Table
            tableId="permission-conflict"
            loading={recovery === "reading"}
            rowKey="admin_id"
            pagination={false}
            dataSource={current?.targets ?? []}
            columns={[
              adminColumn,
              {
                key: "当前权限",
                title: t("current_permissions"),
                render: (_, row) => (
                  <span title={row.after.join(t("list_separator"))}>
                    {describePermissions(row.after)}
                  </span>
                )
              }
            ]}
          />
        )
      ) : (
        <Table
          tableId="permission-change-preview"
          loading={preview.isFetching}
          rowKey="admin_id"
          pagination={false}
          dataSource={preview.data?.targets ?? []}
          columns={[
            adminColumn,
            {
              key: "开通",
              title: t("grant"),
              render: (_, row) =>
                renderChanges(row.grant, row.dependency_grants, "grant")
            },
            {
              key: "取消",
              title: t("revoke"),
              render: (_, row) =>
                renderChanges(row.revoke, row.dependency_revocations, "revoke")
            }
          ]}
        />
      )}
    </Modal>
  );
}
