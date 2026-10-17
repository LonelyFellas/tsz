import { Button, Tooltip } from "@mui/material";
import type { ButtonProps } from "@mui/material";

export function PermissionButton({
  reason,
  disabled,
  ...props
}: ButtonProps & { reason?: string }) {
  return (
    <Tooltip describeChild title={disabled ? (reason ?? "") : ""}>
      <span>
        <Button {...props} disabled={disabled} />
      </span>
    </Tooltip>
  );
}
