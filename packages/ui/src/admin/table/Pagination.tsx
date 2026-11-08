import RcPagination from "@rc-component/pagination";
import type { PaginationProps as RcPaginationProps } from "@rc-component/pagination";
import zhCN from "@rc-component/pagination/es/locale/zh_CN";
import zhTW from "@rc-component/pagination/es/locale/zh_TW";
import enGB from "@rc-component/pagination/es/locale/en_GB";
import enUS from "@rc-component/pagination/es/locale/en_US";
import { resolveInterfaceLocale } from "@tsz/shared/i18n";
import { useInterfaceTranslation } from "@tsz/shared/i18n/react";
import "./table.css";

export interface PaginationProps extends RcPaginationProps {
  size?: "small" | "middle" | "default";
}

export function Pagination({
  size,
  className,
  itemRender,
  ...props
}: PaginationProps) {
  const { t, i18n } = useInterfaceTranslation();
  const locale = {
    "zh-Hans": zhCN,
    "zh-Hant": zhTW,
    "en-GB": enGB,
    "en-US": enUS
  }[resolveInterfaceLocale(i18n.language)];
  return (
    <RcPagination
      {...props}
      className={[size === "small" && "ui-pagination-small", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("controls.pagination")}
      itemRender={(page, type, original) => {
        const button =
          type === "page" ? (
            <button
              aria-label={t("pagination.page", { page })}
              aria-current={page === props.current ? "page" : undefined}
              type="button"
              tabIndex={-1}
              disabled={props.disabled}
            >
              {page}
            </button>
          ) : (
            original
          );
        return itemRender ? itemRender(page, type, button) : button;
      }}
      locale={locale}
      prefixCls="ui-pagination"
      prevIcon={
        <button type="button" aria-label={t("controls.previous")}>
          ‹
        </button>
      }
      nextIcon={
        <button type="button" aria-label={t("controls.next")}>
          ›
        </button>
      }
      jumpPrevIcon={<span aria-hidden="true">…</span>}
      jumpNextIcon={<span aria-hidden="true">…</span>}
      sizeChangerRender={({
        size: value,
        options,
        disabled,
        onSizeChange,
        className: selectClass
      }) => (
        <select
          aria-label={t("controls.perPage")}
          className={selectClass}
          disabled={disabled}
          value={value}
          onChange={(event) => onSizeChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    />
  );
}
