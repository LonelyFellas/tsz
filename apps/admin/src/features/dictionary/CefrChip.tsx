import { Chip } from "@mui/material";
import { getContrastRatio } from "@mui/material/styles";
import type { CefrLevel } from "@tsz/types";
import { cefrColor } from "./labels";
const LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
export function CefrChip({ level }: { level: string }) {
  const background = LEVELS.has(level)
    ? cefrColor(level as CefrLevel)
    : undefined;
  return (
    <Chip
      label={level}
      sx={
        background
          ? {
              bgcolor: background,
              color:
                getContrastRatio(background, "#000") >=
                getContrastRatio(background, "#fff")
                  ? "#000"
                  : "#fff"
            }
          : undefined
      }
    />
  );
}
