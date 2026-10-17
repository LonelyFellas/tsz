import { AnchoredPanel } from "@/components/AnchoredPanel";
import { IconButton as MuiIconButton } from "@mui/material";
import {
  Box as MuiBox,
  Checkbox as MuiCheckbox,
  FormControlLabel as MuiFormControlLabel
} from "@mui/material";
import {
  Button as MuiButton,
  Chip as MuiChip,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";
import QuestionCircleOutlined from "@mui/icons-material/HelpOutline";
import WarningFilled from "@mui/icons-material/Warning";

import { useState } from "react";
import type {
  WordFormGroupV3,
  WordPosFormsV3,
  WordSenseWritableV3
} from "@tsz/types";
import { boundFormGroupIds, definitionSummary } from "../meaningsModel";

export function V3FormGroupSenseEditor({
  pos,
  group,
  senses: allSenses,
  savedSenseIds,
  onConfirm,
  onCancel,
  onGoToMeanings,
  onRestoreGeneral
}: {
  pos: WordPosFormsV3;
  group: WordFormGroupV3;
  senses: readonly WordSenseWritableV3[];
  savedSenseIds?: ReadonlySet<string>;
  onConfirm: (senseIds: string[]) => void;
  onCancel: () => void;
  onGoToMeanings?: () => void;
  onRestoreGeneral?: () => void;
}) {
  const senses = allSenses.filter(
    (sense) =>
      savedSenseIds?.has(sense.id) ||
      boundFormGroupIds(sense).length > 0 ||
      definitionSummary(sense) !== "待填写释义"
  );
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState(() =>
    senses
      .filter((sense) => boundFormGroupIds(sense).includes(group.id))
      .map((sense) => sense.id)
  );
  const available = senses.filter(
    (sense) => !savedSenseIds || savedSenseIds.has(sense.id)
  );
  const validIds = selected.filter((id) =>
    available.some((sense) => sense.id === id)
  );
  const editing = group.scope === "dedicated";
  return (
    <section
      className="v3-group-sense-editor"
      aria-label={`第 ${pos.form_groups.findIndex((item) => item.id === group.id) + 1} 组适用词义编辑`}
    >
      <MuiStack
        direction="row"
        spacing={1}
        alignItems={"center"}
        justifyContent={"space-between"}
        useFlexGap
        flexWrap="wrap"
      >
        <MuiStack direction="row" spacing={0.5} alignItems={"center"}>
          <MuiTypography component="span" fontWeight={600}>
            适配专用词义
          </MuiTypography>
          <>
            <MuiIconButton
              onClick={(event) =>
                setHelpAnchor(helpAnchor ? null : event.currentTarget)
              }
              aria-haspopup="dialog"
              aria-expanded={!!helpAnchor}
              size="small"
              aria-label="查看适配专用词义说明"
            >
              <QuestionCircleOutlined fontSize="inherit" />
            </MuiIconButton>
            <AnchoredPanel
              open={!!helpAnchor}
              anchor={helpAnchor}
              label="适配专用词义说明"
              onClose={() => setHelpAnchor(null)}
              placement="bottom-start"
            >
              <MuiBox sx={{ p: 0 }}>
                <MuiTypography
                  style={{
                    maxWidth: "min(360px, calc(100vw - 48px))",
                    marginBottom: 0
                  }}
                  component="p"
                  paragraph
                  color="text.secondary"
                >
                  <MuiTypography component="span" color="warning.main">
                    <WarningFilled fontSize="inherit" aria-hidden="true" />
                  </MuiTypography>{" "}
                  注意：该词形仅适配少量词义，请准确识别正确的词义。适配之后，该词形专属于适配词义，不用于其他词义。
                  <br />
                  适配条件：1）至少选一项词义才能适配，可多选。2）只可适配同一词性下的词义。
                </MuiTypography>
              </MuiBox>
            </AnchoredPanel>
          </>
        </MuiStack>
        <MuiTypography component="span" color="text.secondary">
          已选 {validIds.length} 项
        </MuiTypography>
      </MuiStack>
      <MuiStack direction="column" spacing={2}>
        {senses.length === 0 ? (
          <MuiStack spacing={1}>
            <MuiTypography color="text.secondary">
              当前基本词性还没有词义，请先添加词义。
            </MuiTypography>
            {onGoToMeanings && (
              <MuiButton variant="contained" onClick={onGoToMeanings}>
                前往添加词义
              </MuiButton>
            )}
          </MuiStack>
        ) : (
          <MuiStack
            className="v3-group-sense-options"
            direction="column"
            spacing={1}
          >
            {senses.map((sense, index) => {
              const unsaved = savedSenseIds && !savedSenseIds.has(sense.id);
              return (
                <MuiFormControlLabel
                  key={sense.id}
                  control={
                    <MuiCheckbox
                      checked={validIds.includes(sense.id)}
                      disabled={Boolean(unsaved)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...validIds, sense.id]
                            : validIds.filter((id) => id !== sense.id)
                        )
                      }
                    />
                  }
                  label={
                    <>
                      <span className="v3-group-sense-option">
                        <span>
                          <MuiChip label={<>{sense.level}</>} />
                          {index + 1}. {definitionSummary(sense)}
                        </span>
                        {unsaved ? (
                          <MuiTypography
                            component="span"
                            color="text.secondary"
                          >
                            尚未保存，请先保存词义
                          </MuiTypography>
                        ) : null}
                      </span>
                    </>
                  }
                />
              );
            })}
          </MuiStack>
        )}
        {savedSenseIds &&
        senses.some((sense) => !savedSenseIds.has(sense.id)) &&
        onGoToMeanings ? (
          <MuiButton onClick={onGoToMeanings} variant="text">
            前往保存词义
          </MuiButton>
        ) : null}
        {editing && validIds.length === 0 ? (
          <MuiTypography component="span" color="warning.main">
            专用组至少保留一个词义，或选择“恢复适用全部词义”解除限制。
          </MuiTypography>
        ) : null}
      </MuiStack>
      <MuiStack
        className="v3-group-sense-editor-actions"
        direction="row"
        spacing={1}
        alignItems={"center"}
        justifyContent={"space-between"}
        useFlexGap
        flexWrap="wrap"
      >
        {editing && onRestoreGeneral ? (
          <MuiButton onClick={onRestoreGeneral} variant="text">
            恢复适用全部词义
          </MuiButton>
        ) : (
          <span />
        )}
        <MuiStack direction="row" spacing={1}>
          <MuiButton onClick={onCancel}>取消</MuiButton>
          <MuiButton
            disabled={validIds.length === 0}
            onClick={() => onConfirm(validIds)}
            variant="contained"
          >
            确认选择
          </MuiButton>
        </MuiStack>
      </MuiStack>
    </section>
  );
}
