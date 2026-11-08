import RcCollapse, {
  type CollapseProps as RcCollapseProps
} from "@rc-component/collapse";
import { useInterfaceTranslation } from "@tsz/shared/i18n/react";
import RcImage, { type ImageProps } from "@rc-component/image";
import RcTabs, { type TabsProps as RcTabsProps } from "@rc-component/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useLayoutEffect,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode
} from "react";
import "@rc-component/image/assets/index.css";
import "./disclosure.css";

interface TabsProps extends RcTabsProps {
  size?: "small" | "middle" | "large";
  tabPlacement?: "top" | "start" | "bottom" | "end";
}

export function Tabs({
  size = "middle",
  tabPlacement = "top",
  className,
  ...props
}: TabsProps) {
  const { t } = useInterfaceTranslation();
  const position =
    tabPlacement === "start"
      ? "left"
      : tabPlacement === "end"
        ? "right"
        : tabPlacement;
  return (
    <RcTabs
      {...props}
      prefixCls="ui-tabs"
      tabPosition={position}
      className={[`ui-tabs-${size}`, className].filter(Boolean).join(" ")}
      animated={false}
      locale={{ dropdownAriaLabel: t("controls.moreTabs"), ...props.locale }}
      more={{
        icon: (
          <Ellipsis size={18} role="img" aria-label={t("controls.moreTabs")} />
        ),
        ...props.more
      }}
    />
  );
}

interface CollapseProps extends Omit<RcCollapseProps, "onChange"> {
  onChange?: (keys: string[]) => void;
  size?: "small" | "middle" | "large";
  ghost?: boolean;
}
export function Collapse({
  size = "middle",
  ghost,
  onChange,
  className,
  ...props
}: CollapseProps) {
  return (
    <RcCollapse
      {...props}
      prefixCls="ui-collapse"
      onChange={onChange && ((keys) => onChange(keys.map(String)))}
      className={[
        `ui-collapse-${size}`,
        ghost && "ui-collapse-ghost",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      expandIcon={() => <ChevronRight size={14} aria-hidden="true" />}
    />
  );
}

function usePreviewIcons() {
  const { t } = useInterfaceTranslation();
  return {
    close: <X size={20} aria-label={t("controls.closePreview")} role="img" />,
    prev: (
      <ChevronLeft
        size={20}
        aria-label={t("controls.imagePrevious")}
        role="img"
      />
    ),
    next: (
      <ChevronRight size={20} aria-label={t("controls.imageNext")} role="img" />
    ),
    flipX: (
      <FlipHorizontal
        size={20}
        aria-label={t("controls.flipHorizontal")}
        role="img"
      />
    ),
    flipY: (
      <FlipVertical
        size={20}
        aria-label={t("controls.flipVertical")}
        role="img"
      />
    ),
    rotateLeft: (
      <RotateCcw size={20} aria-label={t("controls.rotateLeft")} role="img" />
    ),
    rotateRight: (
      <RotateCw size={20} aria-label={t("controls.rotateRight")} role="img" />
    ),
    zoomOut: (
      <ZoomOut size={20} aria-label={t("controls.zoomOut")} role="img" />
    ),
    zoomIn: <ZoomIn size={20} aria-label={t("controls.zoomIn")} role="img" />
  };
}

function usePreviewActions() {
  const { t } = useInterfaceTranslation();
  const labels: Record<string, string> = {
    flipX: t("controls.flipHorizontal"),
    flipY: t("controls.flipVertical"),
    rotateLeft: t("controls.rotateLeft"),
    rotateRight: t("controls.rotateRight"),
    zoomOut: t("controls.zoomOut"),
    zoomIn: t("controls.zoomIn")
  };
  return (original: ReactElement) => {
    const actions = original as ReactElement<{ children?: ReactNode }>;
    return cloneElement(
      actions,
      {},
      Children.map(actions.props.children, (child) => {
        if (!isValidElement<{ "aria-label"?: string }>(child)) return child;
        const label = labels[child.props["aria-label"] ?? ""];
        return label ? cloneElement(child, { "aria-label": label }) : child;
      })
    );
  };
}

// 图片组原语只把 src 传给大图回调。保留缩略图的可及名称，便于区分证书与身份材料。
const GroupImageLabels = createContext<Map<string, string> | null>(null);

export function Image({ preview, alt, src, ...props }: ImageProps) {
  const icons = usePreviewIcons();
  const actionsRender = usePreviewActions();
  const labels = useContext(GroupImageLabels);
  useLayoutEffect(() => {
    if (!labels || !src || !alt) return;
    labels.set(src, alt);
    return () => {
      labels.delete(src);
    };
  }, [labels, src, alt]);
  return (
    <RcImage
      {...props}
      src={src}
      alt={alt}
      preview={
        preview === false
          ? false
          : {
              icons,
              actionsRender,
              ...(typeof preview === "object" ? preview : {})
            }
      }
    />
  );
}

Image.PreviewGroup = function PreviewGroup({
  preview,
  ...props
}: ComponentProps<typeof RcImage.PreviewGroup>) {
  const icons = usePreviewIcons();
  const actionsRender = usePreviewActions();
  const { t } = useInterfaceTranslation();
  const [labels] = useState(() => new Map<string, string>());
  return (
    <GroupImageLabels.Provider value={labels}>
      <RcImage.PreviewGroup
        {...props}
        icons={icons}
        preview={
          preview === false
            ? false
            : {
                alt: t("controls.imagePreview"),
                actionsRender,
                imageRender: (node, { image }) =>
                  cloneElement(node as ReactElement<{ alt?: string }>, {
                    alt: labels.get(image.url) ?? image.alt
                  }),
                ...(typeof preview === "object" ? preview : {})
              }
        }
      />
    </GroupImageLabels.Provider>
  );
};
