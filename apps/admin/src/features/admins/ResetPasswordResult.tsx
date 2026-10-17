import ContentCopy from "@mui/icons-material/ContentCopy";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from "@mui/material";
import { useFeedback } from "@/components/FeedbackProvider";
import { copyText } from "@/lib/clipboard";

export function ResetPasswordResult({
  password,
  adminName,
  onClose
}: {
  password: string | null;
  adminName?: string;
  onClose: () => void;
}) {
  const notify = useFeedback();
  const handleCopy = async () => {
    if (!password) return;
    if (await copyText(password)) notify("已复制临时密码", "success");
    else notify("复制失败，请手动选中下方密码复制", "warning");
  };
  return (
    <Dialog
      open={!!password}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="temporary-password-title"
    >
      <DialogTitle id="temporary-password-title">临时密码已生成</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          此密码仅显示一次
          <Typography>
            请复制后线下转交{adminName ? `「${adminName}」` : "该管理员"}
            ，对方下次登录须修改。关闭后无法再次查看。
          </Typography>
        </Alert>
        {password && (
          <>
            <Typography
              sx={{
                fontSize: 18,
                fontFamily: "monospace",
                p: 1.5,
                bgcolor: "action.hover",
                borderRadius: 1,
                mb: 1.5,
                userSelect: "all"
              }}
            >
              {password}
            </Typography>
            <Button
              startIcon={<ContentCopy />}
              onClick={() => void handleCopy()}
            >
              复制密码
            </Button>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          我已复制
        </Button>
      </DialogActions>
    </Dialog>
  );
}
