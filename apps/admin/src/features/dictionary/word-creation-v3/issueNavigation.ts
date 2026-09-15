import type {
  Dialect,
  PersistedWordStep,
  V3DraftValidationIssue
} from "@tsz/types";

export interface V3IssueNavigationTarget {
  step: PersistedWordStep;
  node_id: string;
  field: string;
  ancestor_node_ids?: string[];
  pos_id?: string;
  form_group_id?: string;
  membership_id?: string;
  form_id?: string;
  variant_id?: string;
  dialect?: Dialect;
  pronunciation_id?: string;
}

type MaybePromise = void | Promise<void>;

export interface V3IssueNavigationAdapter {
  activateStep(target: V3IssueNavigationTarget): MaybePromise;
  activatePos?(target: V3IssueNavigationTarget): MaybePromise;
  expandGroup?(target: V3IssueNavigationTarget): MaybePromise;
  revealForm?(target: V3IssueNavigationTarget): MaybePromise;
  revealVariant?(target: V3IssueNavigationTarget): MaybePromise;
  revealPronunciation?(target: V3IssueNavigationTarget): MaybePromise;
  focusField(target: V3IssueNavigationTarget): MaybePromise;
}

export function v3IssueNavigationTarget(
  issue: V3DraftValidationIssue
): V3IssueNavigationTarget {
  const location = issue.node_location;
  const node_id =
    issue.step === "meanings"
      ? issue.node_id
      : (location.pronunciation_id ??
        location.variant_id ??
        location.form_id ??
        location.membership_id ??
        location.form_group_id ??
        location.pos_id ??
        issue.node_id);
  return {
    step: issue.step,
    node_id,
    field: issue.field,
    ancestor_node_ids: [...location.ancestor_node_ids],
    ...(location.pos_id ? { pos_id: location.pos_id } : {}),
    ...(location.form_group_id
      ? { form_group_id: location.form_group_id }
      : {}),
    ...(location.membership_id
      ? { membership_id: location.membership_id }
      : {}),
    ...(location.form_id ? { form_id: location.form_id } : {}),
    ...(location.variant_id ? { variant_id: location.variant_id } : {}),
    ...(location.dialect ? { dialect: location.dialect } : {}),
    ...(location.pronunciation_id
      ? { pronunciation_id: location.pronunciation_id }
      : {})
  };
}

/** Applies stateful containers outside-in, then delegates the exact DOM focus. */
export async function navigateToV3Issue(
  issue: V3DraftValidationIssue,
  adapter: V3IssueNavigationAdapter
): Promise<V3IssueNavigationTarget> {
  return navigateToV3Target(v3IssueNavigationTarget(issue), adapter);
}

/** 同一套定位，但目标不来自校验问题（引用跳转、深链定位）。 */
export async function navigateToV3Target(
  target: V3IssueNavigationTarget,
  adapter: V3IssueNavigationAdapter
): Promise<V3IssueNavigationTarget> {
  await adapter.activateStep(target);
  if (target.pos_id) await adapter.activatePos?.(target);
  if (target.form_group_id) await adapter.expandGroup?.(target);
  if (target.form_id) await adapter.revealForm?.(target);
  if (target.variant_id) await adapter.revealVariant?.(target);
  if (target.pronunciation_id) await adapter.revealPronunciation?.(target);
  await adapter.focusField(target);
  return target;
}

/**
 * 定位滚动：比半屏还高的节点（展开的词义卡片常有一千多像素）居中会把卡片头推出视口上方，
 * 改成顶端对齐；吸顶导航栏的高度由 v3-layout.css 给定位锚点的 scroll-margin-top 让出。
 */
export function scrollV3TargetIntoView(element: HTMLElement): void {
  const tall = element.getBoundingClientRect().height > window.innerHeight / 2;
  element.scrollIntoView?.({ block: tall ? "start" : "center" });
}
