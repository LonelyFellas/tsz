import {
  Box,
  Button,
  Checkbox,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography
} from "@mui/material";
import InboxOutlined from "@mui/icons-material/InboxOutlined";
import SearchOffOutlined from "@mui/icons-material/SearchOffOutlined";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface AdminColumn<Row> {
  id: string;
  label: string;
  width?: number;
  sticky?: "left" | "right";
  render: (row: Row) => ReactNode;
}
export interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  pageSizes?: number[];
  onChange: (page: number, pageSize: number) => void;
}
export function AdminPagination(pagination: AdminPaginationProps) {
  if (pagination.total === 0) return null;
  return (
    <Box
      sx={{
        minWidth: 0,
        containerType: "inline-size",
        containerName: "admin-pagination"
      }}
    >
      <TablePagination
        component="div"
        sx={{
          "@container admin-pagination (max-width: 600px)": {
            "& .MuiTablePagination-toolbar": {
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: 1,
              px: 1,
              py: 1
            },
            "& .MuiTablePagination-spacer": { display: "none" },
            "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows":
              { my: 0 },
            "& .MuiTablePagination-input": { mr: 1 },
            "& .MuiTablePagination-actions": { ml: 0 }
          }
        }}
        count={pagination.total}
        page={pagination.page - 1}
        rowsPerPage={pagination.pageSize}
        rowsPerPageOptions={pagination.pageSizes ?? []}
        onPageChange={(_, page) =>
          pagination.onChange(page + 1, pagination.pageSize)
        }
        onRowsPerPageChange={(event) =>
          pagination.onChange(1, Number(event.target.value))
        }
        labelDisplayedRows={({ count }) => `共 ${count} 条`}
      />
    </Box>
  );
}
export function AdminTable<Row>({
  columns,
  rows,
  rowId,
  loading,
  minWidth,
  pagination,
  selection,
  emptyMessage = "暂无数据",
  filtered = false,
  onResetFilters
}: {
  columns: AdminColumn<Row>[];
  rows: Row[];
  rowId: (row: Row) => string;
  loading?: boolean;
  minWidth?: number;
  emptyMessage?: string;
  filtered?: boolean;
  onResetFilters?: () => void;
  selection?: {
    ids: string[];
    onChange: (ids: string[]) => void;
    disabled?: (row: Row) => boolean;
    label?: (row: Row) => string;
  };
  pagination?: AdminPaginationProps;
}) {
  const selectionHeader = useRef<HTMLTableCellElement>(null);
  const [selectionWidth, setSelectionWidth] = useState(48);
  const hasSelection = !!selection;
  useLayoutEffect(() => {
    const cell = selectionHeader.current;
    if (!cell) return;
    // 自动表格布局可能分配额外宽度，固定列偏移必须跟随实际渲染结果。
    const measure = () => setSelectionWidth(cell.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [hasSelection]);
  const selectableIds = rows
    .filter((row) => !selection?.disabled?.(row))
    .map(rowId);
  const selectedCount = selectableIds.filter((id) =>
    selection?.ids.includes(id)
  ).length;
  const selectionCellSx = {
    position: "sticky",
    left: 0,
    bgcolor: "background.paper",
    zIndex: 2,
    boxSizing: "border-box",
    textAlign: "center",
    width: 48,
    minWidth: 48,
    maxWidth: 48,
    "&.MuiTableCell-paddingCheckbox": { width: 48, p: 0 }
  } as const;
  const stickyStyle = (index: number) => {
    const column = columns[index]!;
    if (!column.sticky) return {};
    const adjacent =
      column.sticky === "left"
        ? columns.slice(0, index)
        : columns.slice(index + 1);
    const offset =
      (column.sticky === "left" && selection ? selectionWidth : 0) +
      adjacent
        .filter((item) => item.sticky === column.sticky)
        .reduce((sum, item) => sum + (item.width ?? 0), 0);
    return {
      position: "sticky" as const,
      [column.sticky]: offset,
      zIndex: 1,
      bgcolor: "background.paper",
      "@container admin-table (max-width: 900px)": {
        position: "static",
        left: "auto",
        right: "auto",
        zIndex: "auto"
      }
    };
  };
  return (
    <Box
      aria-busy={loading}
      sx={{
        minWidth: 0,
        containerType: "inline-size",
        containerName: "admin-table"
      }}
    >
      <Box sx={{ height: 4 }}>{loading && <LinearProgress />}</Box>
      <TableContainer>
        <Table sx={{ minWidth }}>
          <TableHead>
            <TableRow>
              {selection && (
                <TableCell
                  padding="checkbox"
                  sx={selectionCellSx}
                  ref={selectionHeader}
                >
                  <Checkbox
                    slotProps={{
                      input: {
                        "aria-label": "选择本页",
                        "aria-checked":
                          selectedCount > 0 &&
                          selectedCount < selectableIds.length
                            ? "mixed"
                            : !!selectableIds.length &&
                              selectedCount === selectableIds.length
                      }
                    }}
                    checked={
                      !!selectableIds.length &&
                      selectedCount === selectableIds.length
                    }
                    indeterminate={
                      selectedCount > 0 && selectedCount < selectableIds.length
                    }
                    disabled={!selectableIds.length}
                    onChange={(_, checked) =>
                      selection.onChange(
                        checked
                          ? [...new Set([...selection.ids, ...selectableIds])]
                          : selection.ids.filter(
                              (id) => !selectableIds.includes(id)
                            )
                      )
                    }
                  />
                </TableCell>
              )}
              {columns.map((column, index) => (
                <TableCell
                  key={column.id}
                  sx={{
                    width: column.width,
                    minWidth: column.width,
                    ...stickyStyle(index)
                  }}
                >
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowId(row)} data-row-id={rowId(row)}>
                {selection && (
                  <TableCell padding="checkbox" sx={selectionCellSx}>
                    <Checkbox
                      slotProps={{
                        input: {
                          "aria-label": `选择 ${selection.label?.(row) ?? rowId(row)}`
                        }
                      }}
                      disabled={selection.disabled?.(row)}
                      checked={selection.ids.includes(rowId(row))}
                      onChange={(_, checked) =>
                        selection.onChange(
                          checked
                            ? [...new Set([...selection.ids, rowId(row)])]
                            : selection.ids.filter((id) => id !== rowId(row))
                        )
                      }
                    />
                  </TableCell>
                )}
                {columns.map((column, index) => (
                  <TableCell key={column.id} sx={stickyStyle(index)}>
                    {column.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {rows.length === 0 && (
        <Stack
          role="status"
          alignItems="center"
          justifyContent="center"
          spacing={1}
          sx={{ minHeight: 240, p: 3, boxSizing: "border-box" }}
        >
          {!loading &&
            (filtered ? (
              <SearchOffOutlined
                sx={{ fontSize: 40, color: "text.disabled" }}
              />
            ) : (
              <InboxOutlined sx={{ fontSize: 40, color: "text.disabled" }} />
            ))}
          <Typography color="text.secondary" align="center">
            {loading
              ? "正在加载…"
              : filtered
                ? "未找到符合条件的数据"
                : emptyMessage}
          </Typography>
          {!loading && filtered && onResetFilters && (
            <Button onClick={onResetFilters}>重置筛选</Button>
          )}
        </Stack>
      )}
      {pagination && <AdminPagination {...pagination} />}
    </Box>
  );
}
