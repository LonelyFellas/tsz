import { useContentEditPermissions } from "../../contentEditPermissions";
import Add from "@mui/icons-material/Add";
import { MenuItem, TextField } from "@mui/material";
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
  const { edit: canEditContent } = useContentEditPermissions();
  const usedPosCodes = new Set(forms.pos.map((pos) => pos.pos));
  // 挂错一侧后端会以 part_of_speech_kind_mismatch 拒绝，不放进候选。
  const availableItems = (catalog?.items ?? []).filter(
    (item) =>
      !usedPosCodes.has(item.code) && (!entryKind || item.kind === entryKind)
  );

  return (
    <TextField
      select
      label="添加基本词性"
      className="word-add-basic-pos-select"
      disabled={!canEditContent || isError || isPending}
      value=""
      sx={{ width: 190 }}
      slotProps={{ select: { IconComponent: Add } }}
      onChange={(event) => {
        const item = availableItems.find(
          (candidate) => candidate.code === event.target.value
        );
        if (item) onAdd(item);
      }}
    >
      {availableItems.map((item) => (
        <MenuItem key={item.code} value={item.code}>
          {item.name_zh}
        </MenuItem>
      ))}
    </TextField>
  );
}
