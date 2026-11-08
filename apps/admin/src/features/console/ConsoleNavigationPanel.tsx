import { useAdminTranslation } from "@/i18n";
import { ArrowRightIcon, CheckIcon, ChevronRightIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

export interface ConsoleNavigationItem {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  children?: ConsoleNavigationItem[];
}

export function ConsoleNavigationPanel({
  items,
  selectedKey,
  onNavigate
}: {
  items: ConsoleNavigationItem[];
  selectedKey: string;
  onNavigate?: () => void;
}) {
  const { t } = useAdminTranslation();
  const headingId = useId();
  const currentGroup = items.find((item) =>
    item.children?.some((child) => child.key === selectedKey)
  );
  const [groupKey, setGroupKey] = useState(currentGroup?.key);
  const activeGroup =
    items.find((item) => item.key === groupKey && item.children) ??
    currentGroup ??
    items.find((item) => item.children);

  return (
    <div className="console-navigation-browser">
      <nav
        className="console-navigation-categories"
        aria-label={t("nav_categories")}
      >
        {items.map((item) =>
          item.children ? (
            <button
              type="button"
              key={item.key}
              className="console-navigation-category"
              aria-pressed={item.key === activeGroup?.key}
              onClick={() => setGroupKey(item.key)}
            >
              <span className="console-navigation-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
              <ChevronRightIcon
                className="console-navigation-category-arrow"
                size={14}
                aria-hidden="true"
              />
            </button>
          ) : (
            <Link
              key={item.key}
              to={item.key}
              className="console-navigation-category"
              aria-current={item.key === selectedKey ? "page" : undefined}
              onClick={onNavigate}
            >
              <span className="console-navigation-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          )
        )}
      </nav>
      {activeGroup && (
        <nav
          className="console-navigation-destinations"
          aria-labelledby={headingId}
        >
          <div className="console-navigation-section-heading">
            <span
              className="console-navigation-section-icon"
              aria-hidden="true"
            >
              {activeGroup.icon}
            </span>
            <h3 id={headingId}>{activeGroup.label}</h3>
          </div>
          <div className="console-navigation-links">
            {activeGroup.children?.map((item) =>
              item.disabled ? (
                <button
                  key={item.key}
                  type="button"
                  className="console-navigation-destination"
                  disabled
                >
                  <span>{item.label}</span>
                  <span className="console-navigation-unavailable">
                    {t("nav_unavailable")}
                  </span>
                </button>
              ) : (
                <Link
                  key={item.key}
                  to={item.key}
                  className="console-navigation-destination"
                  aria-current={item.key === selectedKey ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <span>{item.label}</span>
                  {item.key === selectedKey ? (
                    <CheckIcon size={16} aria-hidden="true" />
                  ) : (
                    <ArrowRightIcon size={16} aria-hidden="true" />
                  )}
                </Link>
              )
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
