import Close from "@mui/icons-material/Close";
import { Box, ButtonBase, Chip, IconButton } from "@mui/material";
import type { PermissionTag } from "@tsz/types";

const PRESET_BACKGROUNDS: Record<string, string> = {
  default: "#f2f3f5",
  blue: "#e6f0ff",
  cyan: "#d5f5f6",
  green: "#e3f4df",
  gold: "#fff2cc",
  orange: "#ffead6",
  red: "#ffe2e0",
  purple: "#f0e2ff"
};
export function permissionTagBackground(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color)
    ? color
    : (PRESET_BACKGROUNDS[color] ?? PRESET_BACKGROUNDS.default);
}
export function PermissionTagChip({
  tag,
  onClick,
  onDelete
}: {
  tag: Pick<PermissionTag, "name" | "color">;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const style = {
    backgroundColor: permissionTagBackground(tag.color),
    color: "#000"
  };
  if (!onClick && !onDelete)
    return (
      <Chip
        data-permission-tag={tag.name}
        label={tag.name}
        size="small"
        style={style}
      />
    );
  return (
    <Box
      data-permission-tag={tag.name}
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 1,
        px: 0.5,
        ...style
      }}
    >
      <ButtonBase
        aria-label={`${tag.name}：查看权限`}
        onClick={onClick}
        sx={{ px: 0.5, fontSize: 12, minHeight: 28 }}
      >
        {tag.name}
      </ButtonBase>
      {onDelete && (
        <IconButton
          size="small"
          aria-label={`${tag.name}：移除权限`}
          title={`移除${tag.name}权限`}
          onClick={onDelete}
        >
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Box>
  );
}
