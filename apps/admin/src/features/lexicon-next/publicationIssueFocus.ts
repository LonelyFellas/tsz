import { localeLabels } from "./model";
import { regionalVariants } from "@tsz/shared";
import type {
  NextDraft,
  NextPublicationIssue,
  WordCreationStep
} from "@tsz/types";

export function publicationIssueLocation(
  draft: NextDraft,
  issue: NextPublicationIssue,
  target: string
) {
  const sense = draft.senses.find(
    (s) =>
      s.id === issue.node_id ||
      s.definitions.some((d) => d.id === issue.node_id)
  );
  const definition = sense?.definitions.find((d) => d.id === issue.node_id);
  const grammar = draft.grammar_structures?.find(
    (g) =>
      g.id === issue.node_id || g.variants.some((v) => v.id === issue.node_id)
  );
  const variant = grammar?.variants.find((v) => !v.content.text.trim());
  const editor = draft.form_editor;
  const pos = editor?.pos.find(
    (p) =>
      p.pos_id === issue.node_id ||
      p.form_groups.some(
        (g) =>
          g.id === issue.node_id ||
          g.members.some((m) => m.id === issue.node_id)
      ) ||
      p.forms.some(
        (f) =>
          f.id === issue.node_id ||
          regionalVariants(f.regional_bindings).some(
            (v) =>
              typeof v === "object" &&
              v &&
              (v.id === issue.node_id ||
                v.pronunciations.some((p) => p.id === issue.node_id))
          )
      )
  );
  const content = editor?.contents.find(
    (c) =>
      c.id === issue.node_id ||
      regionalVariants(c.regional_variants).some(
        (v) =>
          typeof v === "object" &&
          v &&
          (v.id === issue.node_id ||
            v.pronunciations.some((p) => p.id === issue.node_id))
      )
  );
  const form = editor?.pos
    .flatMap((p) => p.forms)
    .find(
      (f) =>
        f.id === issue.node_id ||
        f.content_id === content?.id ||
        regionalVariants(f.regional_bindings).some(
          (v) =>
            v.id === issue.node_id ||
            v.pronunciations.some((p) => p.id === issue.node_id)
        )
    );
  const binding =
    form &&
    regionalVariants(form.regional_bindings).find(
      (v) =>
        v.id === issue.node_id ||
        v.pronunciations.some((p) => p.id === issue.node_id)
    );
  const focusNodeId =
    binding?.pronunciations.find((p) => p.id === issue.node_id)
      ?.content_slot_id ??
    binding?.content_slot_id ??
    issue.node_id;
  const formPos =
    pos ?? editor?.pos.find((p) => p.forms.some((f) => f.id === form?.id));
  const formIssue =
    !!formPos ||
    !!content ||
    ["forms", "form_editor", "form_groups", "members"].includes(issue.field);
  return {
    issue,
    focusNodeId,
    step: (formIssue
      ? "forms"
      : issue.field === "headword"
        ? "preview"
        : "meanings") as WordCreationStep,
    pos: sense?.part_of_speech ?? grammar?.part_of_speech ?? formPos?.pos,
    senseId: sense?.id,
    formId: form?.id,
    locale:
      /en-(GB|US)/.exec(issue.message)?.[0] ??
      (definition?.locale.startsWith("en-")
        ? definition.locale
        : variant?.locale.startsWith("en-")
          ? variant.locale
          : target)
  };
}

export type PublicationIssueLocation = ReturnType<
  typeof publicationIssueLocation
>;

export function focusPublicationIssue(
  location: PublicationIssueLocation,
  signal: AbortSignal,
  onDone: () => void
) {
  let frame = 0;
  let opened = false;
  const attempt = () => {
    if (signal.aborted) return;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-v3-node-id]")
    );
    const scopes = nodes.filter(
      (node) =>
        node.dataset.v3NodeId === location.focusNodeId &&
        !node.closest("[hidden], [inert]")
    );
    const scope =
      scopes.find((node) => node.dataset.v3Field === location.issue.field) ??
      scopes[0];
    const controlSelector =
      'input:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [role="combobox"], button:not([disabled])';
    if (!opened && location.formId) {
      const trigger = Array.from(
        document.querySelectorAll<HTMLElement>("[data-v3-open-content]")
      ).find((node) => node.dataset.v3OpenContent === location.formId);
      if (trigger && !trigger.closest("[hidden], [inert]")) {
        trigger.click();
        opened = true;
      }
    }
    const region =
      location.issue.field === "definitions"
        ? Array.from(
            scope?.querySelectorAll<HTMLElement>('[role="region"]') ?? []
          ).find(
            (node) =>
              node.getAttribute("aria-label") ===
              `${localeLabels[location.locale]}释义`
          )
        : undefined;
    region
      ?.querySelector<HTMLElement>(
        '.word-sense-section-title[aria-expanded="false"]'
      )
      ?.click();
    const field =
      (region ?? scope)?.querySelector<HTMLElement>(
        `[data-v3-field="${location.issue.field.replace(/[^a-z_]/g, "")}"]`
      ) ??
      scope ??
      (location.step === "forms"
        ? document.querySelector<HTMLElement>('[aria-label="添加基本词性"]')
        : location.issue.field === "headword"
          ? document.querySelector<HTMLElement>(
              'input[data-v3-field="headword"]'
            )
          : undefined);
    const control = field?.matches(controlSelector)
      ? field
      : field?.querySelector<HTMLElement>(controlSelector);
    if (
      control &&
      !control.closest('[hidden], [inert], [aria-hidden="true"]')
    ) {
      control.scrollIntoView({ block: "center" });
      control.focus();
      onDone();
      return;
    }
    if (frame++ < 10) requestAnimationFrame(attempt);
    else onDone();
  };
  requestAnimationFrame(attempt);
}
