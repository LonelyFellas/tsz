import { useWorkspaceTranslation } from "@/features/dictionary/i18n/workspace";
import { useState } from "react";
import { Button, Space } from "@tsz/ui/admin/display";
import { Modal } from "@tsz/ui/admin/overlays";
import { useBlocker } from "react-router-dom";

export function WordNavigationGuard({
  dirty,
  busy,
  wordId,
  requestSentenceLeave
}: {
  dirty: boolean;
  busy: boolean;
  wordId: string;
  requestSentenceLeave?: () => Promise<boolean>;
}) {
  const { t } = useWorkspaceTranslation();
  const [leaving, setLeaving] = useState(false);
  const prefix = `/words/${wordId}/v3/wizard/`;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (dirty || busy) &&
      !(
        currentLocation.pathname.startsWith(prefix) &&
        nextLocation.pathname.startsWith(prefix)
      )
  );
  return blocker.state === "blocked" ? (
    <Modal
      open
      title={t("leave_title")}
      zIndex={2000}
      closable={!leaving}
      onCancel={() => {
        if (!leaving) blocker.reset();
      }}
      footer={
        <Space>
          <Button disabled={leaving} onClick={() => blocker.reset()}>
            {t("continue_editing")}
          </Button>
          <Button
            disabled={busy}
            loading={leaving}
            onClick={async () => {
              setLeaving(true);
              try {
                if (!requestSentenceLeave || (await requestSentenceLeave()))
                  blocker.proceed();
              } finally {
                setLeaving(false);
              }
            }}
          >
            {t("leave_page")}
          </Button>
        </Space>
      }
    >
      {t("leave_help")}
    </Modal>
  ) : null;
}
