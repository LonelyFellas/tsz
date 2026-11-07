import RcCollapse, {
  type CollapseProps as RcCollapseProps
} from "@rc-component/collapse";
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
  cloneElement,
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ComponentProps,
  type ReactElement
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
      locale={{ dropdownAriaLabel: "更多标签页" }}
      more={{ icon: <Ellipsis size={18} aria-hidden="true" /> }}
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

const icons = {
  close: <X size={20} aria-label="关闭预览" role="img" />,
  prev: <ChevronLeft size={20} aria-label="上一张" role="img" />,
  next: <ChevronRight size={20} aria-label="下一张" role="img" />,
  flipX: <FlipHorizontal size={20} aria-label="水平翻转" role="img" />,
  flipY: <FlipVertical size={20} aria-label="垂直翻转" role="img" />,
  rotateLeft: <RotateCcw size={20} aria-label="向左旋转" role="img" />,
  rotateRight: <RotateCw size={20} aria-label="向右旋转" role="img" />,
  zoomOut: <ZoomOut size={20} aria-label="缩小" role="img" />,
  zoomIn: <ZoomIn size={20} aria-label="放大" role="img" />
};

// 图片组原语只把 src 传给大图回调。保留缩略图的可及名称，便于区分证书与身份材料。
const GroupImageLabels = createContext<Map<string, string> | null>(null);

export function Image({ preview, alt, src, ...props }: ImageProps) {
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
          : { icons, ...(typeof preview === "object" ? preview : {}) }
      }
    />
  );
}

Image.PreviewGroup = function PreviewGroup({
  preview,
  ...props
}: ComponentProps<typeof RcImage.PreviewGroup>) {
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
                alt: "图片预览",
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
