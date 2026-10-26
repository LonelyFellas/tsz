import type {
  AdminWordV3,
  DraftFormsStepContentV3,
  FormContentVariantV3,
  FormsStepRepresentationV3,
  FormVariantBindingV3,
  SharedFormsStepContentV3,
  WordFormGroupV3
} from "@tsz/types";

export function isSharedForms(
  forms: FormsStepRepresentationV3
): forms is SharedFormsStepContentV3 {
  return "forms_format" in forms;
}

/** Read projection only. Reference IDs belong to the binding, never the content slot. */
export function expandFormContents(
  forms: FormsStepRepresentationV3
): DraftFormsStepContentV3 {
  if (!isSharedForms(forms)) return forms;
  const contents = new Map(
    forms.contents.map((content) => [content.id, content])
  );
  return {
    pos: forms.pos.map((pos) => ({
      ...pos,
      forms: pos.forms.map((binding) => {
        const content = contents.get(binding.content_id);
        if (!content)
          throw new Error(`Missing form content: ${binding.content_id}`);
        const expand = (
          variant: FormContentVariantV3,
          reference: FormVariantBindingV3,
          dialect: "common" | "uk" | "us"
        ) => {
          if (variant.id !== reference.content_slot_id)
            throw new Error(
              `Invalid content slot: ${reference.content_slot_id}`
            );
          const references = new Map(
            reference.pronunciations.map((row) => [row.content_slot_id, row.id])
          );
          if (
            references.size !== variant.pronunciations.length ||
            references.size !== reference.pronunciations.length
          )
            throw new Error(
              `Incomplete pronunciation mapping: ${reference.id}`
            );
          return {
            ...variant,
            id: reference.id,
            dialect,
            is_regular: reference.is_regular,
            ...(reference.component_usages === undefined
              ? {}
              : { component_usages: reference.component_usages }),
            pronunciations: variant.pronunciations.map((row) => {
              const id = references.get(row.id);
              if (!id)
                throw new Error(`Missing pronunciation binding: ${row.id}`);
              return { ...row, id };
            })
          };
        };
        const source = content.regional_variants;
        const refs = binding.regional_bindings;
        if (source.mode === "common" && refs.mode === "common") {
          return {
            id: binding.id,
            form_type: binding.form_type,
            regional_variants: {
              mode: "common" as const,
              common: {
                ...expand(source.common, refs.common, "common"),
                dialect: "common" as const
              }
            }
          };
        }
        if (source.mode !== "uk_us" || refs.mode !== "uk_us")
          throw new Error(`Inconsistent regional binding: ${binding.id}`);
        return {
          id: binding.id,
          form_type: binding.form_type,
          regional_variants: {
            mode: "uk_us" as const,
            uk: { ...expand(source.uk, refs.uk, "uk"), dialect: "uk" as const },
            us: { ...expand(source.us, refs.us, "us"), dialect: "us" as const }
          }
        };
      }),
      form_groups: pos.form_groups.map((group): WordFormGroupV3 => ({
        ...group,
        // Legacy readers need a group field; authoring always uses content.dialect_rules.
        dialect_rules: contents.get(
          pos.forms.find((form) => form.id === group.members[0]?.form_id)
            ?.content_id ?? ""
        )?.dialect_rules ?? {
          spelling_mode: "unified",
          phonetic_mode: "unified"
        }
      }))
    }))
  };
}

export type ExpandedAdminWordV3 = Omit<AdminWordV3, "forms"> & {
  forms: DraftFormsStepContentV3;
};
