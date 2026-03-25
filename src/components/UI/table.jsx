import React from "react";
import { cn } from "../../lib/utils";

function resolveValue(row, key) {
  if (!key) return undefined;
  if (!key.includes(".")) return row?.[key];

  return key.split(".").reduce((acc, part) => acc?.[part], row);
}

function getCellTextAlign(align) {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}

function getHeaderTextAlign(align) {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}

export function DataTable({
  columns = [],
  rows = [],
  keyField = "id",
  loading = false,
  emptyMessage = "No data available.",
  striped = true,
  compact = false,
  rowHover = true,
  stickyHeader = false,
  maxHeight,
  className = "",
  tableClassName = "",
  onRowClick,
  getRowClassName,
  caption,
}) {
  const rowHeight = compact ? "h-10" : "h-11";
  const containerStyle = maxHeight ? { maxHeight } : undefined;

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm",
        className
      )}
    >
      <div className="w-full overflow-x-auto" style={containerStyle}>
        <table className={cn("min-w-full table-auto", tableClassName)}>
          {caption && (
            <caption className="px-4 py-3 text-left text-xs text-slate-500">
              {caption}
            </caption>
          )}

          <thead className={cn("bg-slate-50", stickyHeader && "sticky top-0 z-10")}>
            <tr>
              {columns.map((column) => {
                const align = getHeaderTextAlign(column?.align);
                return (
                  <th
                    key={column?.key || column?.header}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500",
                      align,
                      column?.headerClassName
                    )}
                    style={column?.width ? { width: column.width } : undefined}
                  >
                    {column?.header}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {loading && (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  Loading...
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row, rowIndex) => {
                const rowKey = row?.[keyField] ?? `${rowIndex}`;
                const clickable = typeof onRowClick === "function";
                const baseRowClass = cn(
                  rowHeight,
                  striped && rowIndex % 2 === 1 && "bg-slate-50",
                  clickable && "cursor-pointer",
                  clickable && rowHover && "transition-colors hover:bg-indigo-50",
                  getRowClassName?.(row, rowIndex)
                );

                return (
                  <tr
                    key={rowKey}
                    className={baseRowClass}
                    onClick={clickable ? () => onRowClick(row, rowIndex) : undefined}
                  >
                    {columns.map((column) => {
                      const raw = resolveValue(row, column?.key);
                      const rendered = column?.render
                        ? column.render(raw, row, rowIndex)
                        : raw;
                      const align = getCellTextAlign(column?.align);

                      return (
                        <td
                          key={`${rowKey}-${column?.key || column?.header}`}
                          className={cn(
                            "px-4 py-2 align-middle text-sm text-slate-700",
                            align,
                            column?.cellClassName
                          )}
                        >
                          {rendered ?? "-"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
