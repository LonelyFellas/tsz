import { useState } from "react";
import type { EntryAnnotationGroup } from "@tsz/types";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import dayjs from "dayjs";
import { usePartOfSpeechLabel } from "./part-of-speech/PartOfSpeechLabels";
import "./EntryAnnotationModal.css";

export interface AnnotationRow {
  key: string;
  label: string;
  annotation: string | null;
  posLabels?: string[];
  glossPreviews?: string[];
  createdByName?: string;
  updatedAt?: string;
  referenceCount?: number;
  href?: string;
  incoming?: boolean;
  readOnly?: boolean;
  /** 只读的理由；不给就只剩一个没有解释的灰输入框。 */
  readOnlyHint?: string;
}

export function annotationErrors(
  rows: AnnotationRow[],
  values: Record<string, string>,
  groups: EntryAnnotationGroup[],
  required: boolean
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const row of rows) {
    if (row.readOnly) continue;
    const value = (values[row.key] ?? "").trim();
    if (!value && required) errors[row.key] = "请输入标注";
    else if (value && !/^[0-9]+$/.test(value))
      errors[row.key] = "标注只能输入数字";
    else if (value.length > 20) errors[row.key] = "标注最多 20 位数字";
  }
  for (const group of groups) {
    const members = rows.filter(
      (row) => row.incoming || group.entry_ids.includes(row.key)
    );
    for (const row of members) {
      if (row.readOnly || errors[row.key]) continue;
      const value = (values[row.key] ?? "").trim().toLowerCase();
      if (
        value &&
        members.some(
          (other) =>
            other.key !== row.key &&
            (values[other.key] ?? "").trim().toLowerCase() === value
        )
      )
        errors[row.key] = "同组标注不能相同";
    }
  }
  return errors;
}

/** Each opening mounts a fresh edit session; failed requests keep this session. */
export function EntryAnnotationModal({
  rows,
  groups,
  creating = false,
  busy = false,
  frozen = false,
  error,
  onSave,
  onClose
}: {
  rows: AnnotationRow[];
  groups: EntryAnnotationGroup[];
  creating?: boolean;
  busy?: boolean;
  frozen?: boolean;
  error?: string;
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const posLabel = usePartOfSpeechLabel();
  const existingRows = rows.filter((row) => !row.incoming);
  const incomingRows = rows.filter((row) => row.incoming);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.key, row.annotation ?? ""]))
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const errors = annotationErrors(
    rows,
    values,
    groups,
    creating || groups.length > 0
  );
  const renderRow = (row: AnnotationRow, index: number) => {
    const fieldError = errors[row.key];
    const showError =
      fieldError && (touched[row.key] || values[row.key]?.trim());
    return (
      <div key={row.key} className="entry-annotation-row" data-annotation-row>
        <div className="entry-annotation-details">
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
            <Typography component="span" className="tsz-words" fontWeight={600}>
              {row.label}
            </Typography>
            {!row.incoming ? <Chip label={`已有词条 ${index + 1}`} /> : null}
            {row.readOnly && row.readOnlyHint ? (
              <Chip label={row.readOnlyHint} />
            ) : null}
          </Stack>
          {!row.incoming ? (
            <>
              {row.posLabels?.length ? (
                <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5}>
                  {row.posLabels.map((pos) => (
                    <Chip
                      key={pos}
                      label={/^[a-z_]+$/.test(pos) ? posLabel(pos) : pos}
                    />
                  ))}
                </Stack>
              ) : null}
              <Typography component="span" color="text.secondary">
                {row.glossPreviews?.length
                  ? row.glossPreviews.join("；")
                  : row.posLabels?.length
                    ? "暂无释义"
                    : "暂无词性、释义"}
              </Typography>
              {row.referenceCount ? (
                <Typography component="span" color="text.secondary">
                  关联引用：{row.referenceCount} 处
                </Typography>
              ) : null}
              {row.createdByName || row.updatedAt || row.href ? (
                <div className="entry-annotation-meta">
                  {row.createdByName ? (
                    <Typography
                      component="span"
                      color="text.secondary"
                      className="entry-annotation-creator"
                      title={`创建人：${row.createdByName}`}
                    >
                      {row.createdByName}
                    </Typography>
                  ) : null}
                  {row.updatedAt ? (
                    <Typography
                      component="span"
                      color="text.secondary"
                      className="entry-annotation-updated"
                    >
                      <time
                        dateTime={row.updatedAt}
                        title={`更新于 ${dayjs(row.updatedAt).format("YYYY-MM-DD HH:mm")}`}
                      >
                        {dayjs(row.updatedAt).format("MM-DD HH:mm")}
                      </time>
                    </Typography>
                  ) : null}
                  {row.href ? (
                    <Button
                      variant="text"
                      size="small"
                      className="entry-annotation-view"
                      aria-label={`查看词条 ${row.label}`}
                      href={row.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      查看
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <TextField
          label="数字标注"
          required={!row.readOnly && (creating || groups.length > 0)}
          error={!!showError}
          helperText={showError ? fieldError : undefined}
          placeholder={row.readOnly ? "未标注" : "例如 001"}
          slotProps={{
            htmlInput: {
              "aria-label": `${row.incoming ? "新建词条" : row.label}标注`,
              inputMode: "numeric",
              className: "entry-annotation-input"
            }
          }}
          value={values[row.key] ?? ""}
          disabled={busy || frozen || row.readOnly}
          onBlur={() =>
            setTouched((current) => ({ ...current, [row.key]: true }))
          }
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              [row.key]: event.target.value
            }))
          }
        />
      </div>
    );
  };
  return (
    <Dialog
      open
      fullWidth
      maxWidth="md"
      aria-labelledby="entry-annotation-title"
      onClose={() => {
        if (!busy && !frozen) onClose();
      }}
    >
      <DialogTitle id="entry-annotation-title">
        {creating ? "设置词条标注" : "编辑词条标注"}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <div className="entry-annotation-content">
          <div className="entry-annotation-intro">
            <Typography component="span" color="text.secondary">
              同原形词条需使用不同的数字标注，最多 20 位。
            </Typography>
          </div>
          {existingRows.length > 0 ? (
            <section aria-label="已有词条">
              <Typography
                component="span"
                fontWeight={600}
                className="entry-annotation-section-title"
              >
                已有词条 · {existingRows.length} 条
              </Typography>
              <Paper variant="outlined">{existingRows.map(renderRow)}</Paper>
            </section>
          ) : null}
          {incomingRows.length > 0 ? (
            <section aria-label="本次新建">
              <Typography
                component="span"
                fontWeight={600}
                className="entry-annotation-section-title"
              >
                本次新建
              </Typography>
              <Paper variant="outlined" className="entry-annotation-incoming">
                {incomingRows.map(renderRow)}
              </Paper>
            </section>
          ) : null}
        </div>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy || frozen} onClick={onClose}>
          取消
        </Button>
        <Button
          variant="contained"
          disabled={Object.keys(errors).length > 0}
          loading={busy}
          onClick={() => {
            if (busy || Object.keys(errors).length) return;
            onSave(
              Object.fromEntries(
                Object.entries(values).map(([id, value]) => [id, value.trim()])
              )
            );
          }}
        >
          {creating ? "保存标注并创建" : "保存标注"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
