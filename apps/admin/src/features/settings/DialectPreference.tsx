import { useState } from "react";
import {
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Typography
} from "@mui/material";
import { useFeedback } from "@/components/FeedbackProvider";
import type { AdminDialectPreference } from "@tsz/shared";
import { useDialectPreference } from "./useDialectPreference";

const OPTION_LABEL: Record<AdminDialectPreference, string> = {
  uk: "英式（BrE）",
  us: "美式（AmE）"
};

/**
 * 个人设置 → 英语方言偏好（A1）。偏好持久化在服务端（`PATCH /admin/profile/preferences`），
 * 因此换浏览器、换设备都还在。显示值取服务端落库后的那个值，保存失败时不更新，
 * 界面自动停在原值——不做乐观更新，避免「看着改了其实没存」。
 */
export function DialectPreference() {
  const { preference, savePreference } = useDialectPreference();
  const notify = useFeedback();
  const [saving, setSaving] = useState(false);

  const change = async (value: AdminDialectPreference) => {
    if (value === preference || saving) return;
    setSaving(true);
    try {
      await savePreference(value);
      notify(`已保存英语方言偏好：${OPTION_LABEL[value]}`, "success");
    } catch (error) {
      notify(
        error instanceof Error
          ? `方言偏好未能保存：${error.message}`
          : "方言偏好未能保存",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ maxWidth: 720, p: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        英语方言偏好
      </Typography>
      <Stack spacing={1.5}>
        <Typography color="text.secondary">
          决定你录入与查看英文内容的默认口径，试听发音人也按此选择。
          词条自身的英美拼写由内置词典决定，不受影响。
        </Typography>
        <RadioGroup
          row
          value={preference}
          onChange={(event) => {
            void change(event.target.value as AdminDialectPreference);
          }}
        >
          <FormControlLabel
            value="uk"
            disabled={saving}
            control={<Radio />}
            label={OPTION_LABEL.uk}
          />
          <FormControlLabel
            value="us"
            disabled={saving}
            control={<Radio />}
            label={OPTION_LABEL.us}
          />
        </RadioGroup>
      </Stack>
    </Paper>
  );
}
