import {
  Box,
  Checkbox,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow
} from "@mui/material";
import type { ReactNode } from "react";

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
  return (
    <TablePagination
      component="div"
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
  );
}
export function AdminTable<Row>({
  columns,
  rows,
  rowId,
  loading,
  minWidth,
  pagination,
  selection
}: {
  columns: AdminColumn<Row>[];
  rows: Row[];
  rowId: (row: Row) => string;
  loading?: boolean;
  minWidth?: number;
  selection?: {
    ids: string[];
    onChange: (ids: string[]) => void;
    disabled?: (row: Row) => boolean;
    label?: (row: Row) => string;
  };
  pagination?: AdminPaginationProps;
}) {
  const selectableIds = rows
    .filter((row) => !selection?.disabled?.(row))
    .map(rowId);
  const selectedCount = selectableIds.filter((id) =>
    selection?.ids.includes(id)
  ).length;
  const stickyStyle = (index: number) => {
    const column = columns[index]!;
    if (!column.sticky) return {};
    const adjacent =
      column.sticky === "left"
        ? columns.slice(0, index)
        : columns.slice(index + 1);
    const offset =
      (column.sticky === "left" && selection ? 48 : 0) +
      adjacent
        .filter((item) => item.sticky === column.sticky)
        .reduce((sum, item) => sum + (item.width ?? 0), 0);
    return {
      position: "sticky" as const,
      [column.sticky]: offset,
      zIndex: 1,
      bgcolor: "background.paper"
    };
  };
  return (
    <Box aria-busy={loading}>
      <Box sx={{ height: 4 }}>{loading && <LinearProgress />}</Box>
      <TableContainer>
        <Table sx={{ minWidth }}>
          <TableHead>
            <TableRow>
              {selection && (
                <TableCell
                  padding="checkbox"
                  sx={{
                    position: "sticky",
                    left: 0,
                    bgcolor: "background.paper",
                    zIndex: 2,
                    width: 48,
                    minWidth: 48
                  }}
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
                  <TableCell
                    padding="checkbox"
                    sx={{
                      position: "sticky",
                      left: 0,
                      bgcolor: "background.paper",
                      zIndex: 2,
                      width: 48
                    }}
                  >
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
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (selection ? 1 : 0)}
                  align="center"
                >
                  暂无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {pagination && <AdminPagination {...pagination} />}
    </Box>
  );
}
