import { lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
import type { AudioAssetV3, PhonemeLocaleV3 } from "@tsz/types";
import { UploadIcon } from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
import { Popover } from "@tsz/ui/admin/overlays";
import { usePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { adminAudioUploadAdapter } from "../../voice-editor/dataSource";
import { useContentEditPermissions } from "../../contentEditPermissions";
import { useLexiconEditorTranslation } from "../../i18n/editor";
import { useVoiceAudioTasks } from "../voiceSaveContext";

const VoiceEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceEditor
  }))
);
const emptyText = { version: 2 as const, text: "", annotations: [] };

export function V3PronunciationAudioUpload({
  nodeId,
  locale,
  label,
  assets,
  onChange
}: {
  nodeId: string;
  locale?: PhonemeLocaleV3;
  label: string;
  assets: AudioAssetV3[];
  onChange: (assets: AudioAssetV3[]) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const { edit } = useContentEditPermissions();
  const allowed = usePermission("speech.upload_audio");
  const [open, setOpen] = useState(false);
  const ready = useRef(true);
  const tasks = useVoiceAudioTasks();
  useLayoutEffect(() => {
    if (!tasks) return;
    const key = `${nodeId}:${locale ?? "common"}:upload`;
    tasks.set(key, async () => ready.current);
    return () => {
      tasks.delete(key);
    };
  }, [nodeId, locale, tasks]);
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(next) => {
        if (next || ready.current) setOpen(next);
      }}
      content={
        <div className="word-pronunciation-upload">
          <Suspense fallback={t("creation_loading_audio_upload")}>
            <VoiceEditor
              key={`${nodeId}:${locale}`}
              mode="audio-upload"
              contextLabel={label}
              locale={locale}
              readOnly={!edit}
              value={emptyText}
              onChange={() => {}}
              audioUploadAdapter={
                env.VOICE_AUDIO_UPLOAD ? adminAudioUploadAdapter : undefined
              }
              audioUploadAllowed={allowed}
              audioAssets={assets}
              onAudioAssetsChange={onChange}
              onValidationChange={(valid) => {
                ready.current = valid;
              }}
            />
          </Suspense>
        </div>
      }
    >
      <Button size="small" icon={<UploadIcon />} aria-label={label}>
        {t("creation_upload_audio")}
      </Button>
    </Popover>
  );
}
