import ChevronRight from "@mui/icons-material/ChevronRight";
import {
  Box,
  CircularProgress,
  List,
  ListItemButton,
  Paper
} from "@mui/material";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

export interface CandidateOption<Node> {
  value: string;
  label: ReactNode;
  children?: Node[];
  isLeaf?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

/** 领域候选多列面板：父项只展开，只有合法叶子提交。 */
export function CandidatePanel<Node extends CandidateOption<Node>>({
  options,
  value,
  onChange,
  onExpand,
  className,
  renderLabel
}: {
  options: Node[];
  value?: readonly string[];
  onChange: (path: Node[]) => void;
  onExpand?: (path: Node[]) => void;
  className?: string;
  renderLabel?: (option: Node) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<readonly string[]>(value ?? []);
  const panel = useRef<HTMLDivElement>(null);
  const columns: Node[][] = [options];
  const ancestors: Node[] = [];
  for (let depth = 0; depth < expanded.length; depth++) {
    const option = columns[depth]?.find(
      (item) => item.value === expanded[depth]
    );
    if (!option) break;
    ancestors.push(option);
    if (!option.children?.length) break;
    columns.push(option.children);
  }
  const activate = (option: Node, depth: number) => {
    if (option.disabled) return;
    const path = [...ancestors.slice(0, depth), option];
    setExpanded(path.map((item) => item.value));
    if (option.isLeaf === false || option.children?.length) onExpand?.(path);
    else onChange(path);
  };
  const focusAt = (depth: number, index: number) =>
    queueMicrotask(() => {
      const buttons = panel.current?.querySelectorAll<HTMLDivElement>(
        `[data-candidate-column="${depth}"] [data-candidate-option]:not([aria-disabled="true"])`
      );
      if (buttons?.length)
        buttons[Math.max(0, Math.min(index, buttons.length - 1))]?.focus();
    });
  return (
    <Paper
      ref={panel}
      variant="outlined"
      className={className}
      sx={{ display: "flex", maxWidth: "100%", overflowX: "auto" }}
      aria-label="关联候选"
    >
      {columns.map((column, depth) => (
        <List
          key={depth}
          data-candidate-column={depth}
          aria-label={`第 ${depth + 1} 级候选`}
          sx={{
            minWidth: 160,
            maxWidth: 320,
            maxHeight: 320,
            overflowY: "auto",
            borderRight: depth < columns.length - 1 ? 1 : 0,
            borderColor: "divider",
            flexShrink: 0
          }}
        >
          {column.map((option) => {
            const branch = option.isLeaf === false || !!option.children?.length;
            return (
              <ListItemButton
                key={option.value}
                data-candidate-option={option.value}
                component="div"
                role="button"
                tabIndex={0}
                disabled={option.disabled}
                selected={value?.[depth] === option.value}
                aria-pressed={value?.[depth] === option.value}
                aria-expanded={
                  branch ? expanded[depth] === option.value : undefined
                }
                onClick={() => activate(option, depth)}
                onKeyDown={(event) => {
                  const buttons = Array.from(
                    event.currentTarget.parentElement!.querySelectorAll<HTMLDivElement>(
                      '[data-candidate-option]:not([aria-disabled="true"])'
                    )
                  );
                  const index = buttons.indexOf(event.currentTarget);
                  if (
                    [
                      "ArrowDown",
                      "ArrowUp",
                      "ArrowRight",
                      "ArrowLeft",
                      "Home",
                      "End"
                    ].includes(event.key)
                  )
                    event.preventDefault();
                  if (event.key === "ArrowDown") focusAt(depth, index + 1);
                  if (event.key === "ArrowUp") focusAt(depth, index - 1);
                  if (event.key === "Home") focusAt(depth, 0);
                  if (event.key === "End") focusAt(depth, buttons.length - 1);
                  if (event.key === "ArrowLeft" && depth > 0) {
                    setExpanded(expanded.slice(0, depth));
                    focusAt(depth - 1, 0);
                  }
                  if (event.key === "ArrowRight" && branch) {
                    activate(option, depth);
                    focusAt(depth + 1, 0);
                  }
                }}
                sx={{ gap: 1, overflowWrap: "anywhere" }}
              >
                <Box sx={{ flex: 1 }}>
                  {renderLabel ? renderLabel(option) : option.label}
                </Box>
                {option.loading ? (
                  <CircularProgress size={14} />
                ) : branch ? (
                  <ChevronRight fontSize="small" />
                ) : null}
              </ListItemButton>
            );
          })}
        </List>
      ))}
    </Paper>
  );
}
