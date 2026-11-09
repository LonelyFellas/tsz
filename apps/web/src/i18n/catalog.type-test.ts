// 此文件由原生 tsc 编译；移除任一类型约束会让 @ts-expect-error 变成错误。
import { createInterfaceI18n } from "@tsz/shared/i18n";
import { localText, originalText, webText } from "./catalog";
import { webTask } from "./messages/task";
import { webPreferences } from "./messages/preferences";

function assertWebTypes() {
  const text = webText(createInterfaceI18n(), webTask);
  text("webTask:my_tasks");
  text("webTask:v0_practice", { v0: "原文 {{v0}}" });
  text(localText(webTask, "webTask:v0_practice", { v0: "{{nested}}" }));
  text(originalText("webTask:my_tasks"));
  // @ts-expect-error 未登记的键
  text("webTask:does_not_exist");
  // @ts-expect-error 中文原句不再是翻译入口
  text("我的任务");
  // @ts-expect-error 该模块未装配的命名空间
  text("webPreferences:language");
  // @ts-expect-error 缺少模板必填参数
  text("webTask:v0_practice");
  // @ts-expect-error 布尔值不能冒充文本参数
  text("webTask:v0_practice", { v0: true });
  // @ts-expect-error 不接受任意对象作为插值
  text("webTask:v0_practice", { v0: { value: "word" } });
  // @ts-expect-error 无参数消息不接受额外模板参数
  text("webTask:my_tasks", { v0: "word" });
  // @ts-expect-error 本地通知也必须提供模板参数
  localText(webTask, "webTask:v0_practice");
  // @ts-expect-error 复数需要原始数量，不能从展示文字猜测
  text("webTask:v0_entries", { v0: "1,000" });
  const preferences = webText(createInterfaceI18n(), webPreferences);
  const conditionalKey = Math.random()
    ? "webPreferences:language"
    : "webPreferences:fallback";
  // @ts-expect-error 不确定是否为模板的键也不能漏掉参数
  preferences(conditionalKey);
  // @ts-expect-error 普通文本参数类型错误
  preferences("webPreferences:fallback", { language: false });
}
void assertWebTypes;
