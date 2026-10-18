import { useState } from "react";
import { Button, Modal, Space } from "antd";
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
      title="词条还有未保存的修改"
      closable={!leaving}
      onCancel={() => {
        if (!leaving) blocker.reset();
      }}
      footer={
        <Space>
          <Button disabled={leaving} onClick={() => blocker.reset()}>
            继续编辑
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
            离开页面
          </Button>
        </Space>
      }
    >
      请先保存当前修改。离开后只能恢复已成功写入的本地备份，未上传媒体需单独保留。
    </Modal>
  ) : null;
}
