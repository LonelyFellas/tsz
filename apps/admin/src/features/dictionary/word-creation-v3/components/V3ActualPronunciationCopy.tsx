import { IconButton as MuiIconButton } from "@mui/material";
import { Alert as MuiAlert, Typography as MuiTypography } from "@mui/material";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from "@mui/material";
import SwapOutlined from "@mui/icons-material/SwapHoriz";
import UndoOutlined from "@mui/icons-material/Undo";
import type { Dialect, WordPronunciationV3 } from "@tsz/types";
import { convertDictionaryToUnified } from "@tsz/shared";
export function V3ActualPronunciationCopy({
  pronunciation,
  spelling,
  dialect,
  onChange
}: {
  pronunciation: WordPronunciationV3;
  spelling: string;
  dialect: Dialect;
  onChange: (patch: Partial<WordPronunciationV3>) => void;
}) {
  const [pending, setPending] = useState<{
    source: string;
    previous: string;
    value: string;
    notices: string[];
  }>();
  const [diagnostic, setDiagnostic] = useState<string>();
  const [history, setHistory] = useState<{
    value: string;
    rich: WordPronunciationV3["actual_pron_rich"];
    applied: string;
  }>();
  const hasAnnotations =
    pronunciation.actual_pron_rich &&
    (!("annotations" in pronunciation.actual_pron_rich) ||
      pronunciation.actual_pron_rich.annotations.length > 0);
  const source = JSON.stringify([
    pronunciation.dict_phonetic,
    spelling,
    dialect,
    pronunciation.style
  ]);
  const previous = JSON.stringify([
    pronunciation.actual_pron,
    pronunciation.actual_pron_rich
  ]);
  const apply = (value: string) => {
    setHistory({
      value: pronunciation.actual_pron,
      rich: pronunciation.actual_pron_rich,
      applied: value
    });
    onChange({
      actual_pron: value,
      actual_pron_rich: {
        version: 2,
        text: value,
        annotations: []
      }
    });
    setPending(undefined);
  };
  return (
    <>
      <MuiIconButton
        aria-label="从字典音标填入实际发音"
        title="按天生之统一音标规则转换，使用当前口音与读法"
        disabled={!pronunciation.dict_phonetic.trim()}
        onClick={() => {
          const result = convertDictionaryToUnified(
            pronunciation.dict_phonetic,
            spelling,
            dialect,
            pronunciation.style
          );
          if (!result.ok) {
            setDiagnostic(result.message);
            return;
          }
          if (
            pronunciation.actual_pron ||
            hasAnnotations ||
            result.notices.length
          )
            setPending({
              source,
              previous,
              value: result.value,
              notices: result.notices
            });
          else apply(result.value);
        }}
      >
        <SwapOutlined fontSize="inherit" />
      </MuiIconButton>
      {history &&
        history.applied === pronunciation.actual_pron &&
        !hasAnnotations && (
          <MuiIconButton
            aria-label="撤销实际发音填入"
            onClick={() => {
              onChange({
                actual_pron: history.value,
                actual_pron_rich: history.rich ?? {
                  version: 2,
                  text: history.value,
                  annotations: []
                }
              });
              setHistory(undefined);
            }}
          >
            <UndoOutlined fontSize="inherit" />
          </MuiIconButton>
        )}
      <ConfirmDialog
        title="替换实际发音？"
        open={Boolean(pending)}
        confirmText="应用"
        cancelText="取消"
        onClose={() => setPending(undefined)}
        onConfirm={() => {
          if (pending?.source === source && pending.previous === previous)
            apply(pending.value);
          else {
            setPending(undefined);
            setDiagnostic("来源、口音、读法或目标内容已变化，请重新转换");
          }
        }}
      >
        <MuiTypography component="p" paragraph>
          将按天生之统一音标规则填入以下结果，并清除原实际发音上的标注；应用后可以撤销。
        </MuiTypography>
        <MuiTypography component="span">{pending?.value}</MuiTypography>
        {pending?.notices.map((notice) => (
          <MuiAlert key={notice} severity={"warning"}>
            {notice}
          </MuiAlert>
        ))}
      </ConfirmDialog>
      <Dialog
        open={Boolean(diagnostic)}
        onClose={() => setDiagnostic(undefined)}
        aria-labelledby="pronunciation-conversion-diagnostic"
      >
        <DialogTitle id="pronunciation-conversion-diagnostic">
          音标转换提示
        </DialogTitle>
        <DialogContent>
          <MuiTypography component="p">{diagnostic}</MuiTypography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiagnostic(undefined)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
