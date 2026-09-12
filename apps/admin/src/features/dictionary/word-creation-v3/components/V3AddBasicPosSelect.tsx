import { PlusOutlined } from "@ant-design/icons";
import { Select } from "antd";
import type {
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  PartOfSpeechCatalogResponse,
  WordEntryKindV3
} from "@tsz/types";

export interface V3AddBasicPosSelectProps {
  catalog?: PartOfSpeechCatalogResponse;
  /** 词条自身是单词还是短语；给定时候选只列同一侧的词性。 */
  entryKind?: WordEntryKindV3;
  forms: DraftFormsStepContentV3;
  isError?: boolean;
  isPending?: boolean;
  onAdd: (item: PartOfSpeechCatalogItem) => void;
}

export function V3AddBasicPosSelect({
  catalog,
  entryKind,
  forms,
  isError = false,
  isPending = false,
  onAdd
}: V3AddBasicPosSelectProps) {
  const usedPosCodes = new Set(forms.pos.map((pos) => pos.pos));
  // 挂错一侧后端会以 part_of_speech_kind_mismatch 拒绝，不放进候选。
  const availableItems = (catalog?.items ?? []).filter(
    (item) =>
      !usedPosCodes.has(item.code) && (!entryKind || item.kind === entryKind)
  );

  return (
    <Select
      aria-label="添加基本词性"
      className="word-add-basic-pos-select"
      disabled={isError || isPending}
      loading={isPending}
      onChange={(code) => {
        const item = availableItems.find(
          (candidate) => candidate.code === code
        );
        if (item) onAdd(item);
      }}
      options={availableItems.map((item) => ({
        value: item.code,
        label: item.short_name_zh
      }))}
      placeholder="添加基本词性"
      style={{ width: 190 }}
      suffixIcon={<PlusOutlined />}
      value={undefined}
    />
  );
}
