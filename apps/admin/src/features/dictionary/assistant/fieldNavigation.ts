import type {
  FormsStepRepresentationV3,
  DraftMeaningsStepContentWritableV3
} from "@tsz/types";
import { expandFormContents } from "@tsz/shared";
import {
  dropEmptySentenceTranslations,
  stripBlankRelations
} from "../word-creation-v3/meaningsModel";
import type { V3IssueNavigationTarget } from "../word-creation-v3/issueNavigation";

/** Resolve the readable snapshot path locally; node identities never go through the model. */
export function assistantFieldTarget(
  path: string,
  forms: FormsStepRepresentationV3,
  meanings: DraftMeaningsStepContentWritableV3
): V3IssueNavigationTarget | undefined {
  const section = /^(forms|meanings)\.([a-z_]+)$/.exec(path);
  if (section)
    return {
      step: section[1] as "forms" | "meanings",
      node_id: "",
      field: section[2]!
    };
  const match = /^(forms|meanings)\.(.+)\.([a-z_]+)$/.exec(path);
  if (!match) return;
  const step = match[1] as "forms" | "meanings";
  let value: unknown =
    step === "forms"
      ? expandFormContents(forms)
      : stripBlankRelations(dropEmptySentenceTranslations(meanings));
  let nodeId: string | undefined;
  let posId: string | undefined;
  let formId: string | undefined;
  let groupId: string | undefined;
  let variantId: string | undefined;
  let pronunciationId: string | undefined;
  let dialect: "common" | "uk" | "us" | undefined;
  const ancestors: string[] = [];
  const tokens = match[2]!.match(/[a-z_]+|\d+/g) ?? [];
  for (const token of tokens) {
    if (!value || typeof value !== "object") return;
    value = (value as Record<string, unknown>)[token];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const node = value as Record<string, unknown>;
      if (typeof node.pos_id === "string") posId = node.pos_id;
      const id = node.id ?? node.pos_id;
      if (typeof id === "string") {
        nodeId = id;
        ancestors.push(id);
      }
      if (typeof node.form_type === "string" && typeof node.id === "string")
        formId = node.id;
      if (Array.isArray(node.members) && typeof node.id === "string")
        groupId = node.id;
      if (
        (node.dialect === "common" ||
          node.dialect === "uk" ||
          node.dialect === "us") &&
        typeof node.id === "string"
      ) {
        variantId = node.id;
        dialect = node.dialect;
      }
      if (node.dict_phonetic !== undefined && typeof node.id === "string")
        pronunciationId = node.id;
    }
  }
  if (!nodeId) return;
  return {
    step,
    node_id: nodeId,
    field: match[3] === "spelling_rich" ? "spelling" : match[3]!,
    pos_id: posId,
    form_id: formId,
    form_group_id: groupId,
    variant_id: variantId,
    pronunciation_id: pronunciationId,
    dialect,
    ancestor_node_ids: ancestors
  };
}
