import { localizedCatalogName } from "../../part-of-speech/catalog";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { CirclePlusIcon, PlusIcon } from "lucide-react";
import { Button } from "@tsz/ui/admin/display";
import { Select } from "@tsz/ui/admin/forms";
import { Dropdown } from "@tsz/ui/admin/overlays";
import { useAdminDisabled } from "@tsz/ui/admin/context";
import type {
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  PartOfSpeechCatalogResponse,
  WordEntryKindV3
} from "@tsz/types";

export interface V3AddBasicPosSelectProps {
  compact?: boolean;
  buttonTrigger?: boolean;
  catalog?: PartOfSpeechCatalogResponse;
  /** 词条自身是单词还是短语；给定时候选只列同一侧的词性。 */
  entryKind?: WordEntryKindV3;
  forms: DraftFormsStepContentV3;
  isError?: boolean;
  isPending?: boolean;
  onAdd: (item: PartOfSpeechCatalogItem) => void;
}

export function V3AddBasicPosSelect({
  compact = false,
  buttonTrigger = false,
  catalog,
  entryKind,
  forms,
  isError = false,
  isPending = false,
  onAdd
}: V3AddBasicPosSelectProps) {
  const { t, i18n } = useLexiconEditorTranslation();
  const adminDisabled = useAdminDisabled();
  const disabled = adminDisabled || isError || isPending;
  const usedPosCodes = new Set(forms.pos.map((pos) => pos.pos));
  // 挂错一侧后端会以 part_of_speech_kind_mismatch 拒绝，不放进候选。
  const availableItems = (catalog?.items ?? []).filter(
    (item) =>
      !usedPosCodes.has(item.code) && (!entryKind || item.kind === entryKind)
  );

  if (buttonTrigger) {
    const label = t("add_pos_button");
    const buttonDisabled = disabled || availableItems.length === 0;
    return (
      <Dropdown
        classNames={{ root: "word-add-basic-pos-dropdown" }}
        disabled={buttonDisabled}
        placement="bottomLeft"
        trigger={["click"]}
        menu={{
          "aria-label": label,
          items: availableItems.map((item) => ({
            key: item.code,
            label: localizedCatalogName(item, i18n.language),
            onClick: () => onAdd(item)
          }))
        }}
      >
        <Button
          className="word-add-basic-pos-button"
          type="dashed"
          disabled={buttonDisabled}
          ghost
          icon={<PlusIcon />}
          loading={isPending}
        >
          {label}
        </Button>
      </Dropdown>
    );
  }

  return (
    <Select
      aria-label={t("add_pos")}
      className="word-add-basic-pos-select"
      disabled={disabled}
      loading={isPending}
      onChange={(code) => {
        const item = availableItems.find(
          (candidate) => candidate.code === code
        );
        if (item) onAdd(item);
      }}
      options={availableItems.map((item) => ({
        value: item.code,
        label: localizedCatalogName(item, i18n.language)
      }))}
      placeholder={t("add_pos")}
      style={{ width: compact ? 24 : 190 }}
      popupMatchSelectWidth={190}
      styles={
        compact
          ? {
              root: { padding: 0 },
              content: { marginInlineEnd: 0, width: "100%", height: "100%" },
              input: { width: "100%", height: "100%" },
              placeholder: { display: "none" },
              suffix: {
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                color:
                  isError || isPending ? undefined : "var(--ui-color-primary)",
                pointerEvents: "none"
              }
            }
          : undefined
      }
      variant={compact ? "borderless" : undefined}
      suffixIcon={compact ? <CirclePlusIcon /> : <PlusIcon />}
      value={null}
    />
  );
}
