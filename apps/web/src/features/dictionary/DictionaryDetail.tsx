"use client";
import { useWebText } from "@/i18n/client";
import { webDictionary } from "@/i18n/messages/dictionary";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@tsz/ui/components";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { useUserStore } from "@/stores/user";
import { api } from "@/lib/request";
import { phoneticDelimiters, selectTexts } from "@/features/wordlist/reading";
import { dictionaryDefinition, dictionarySpellings, POS_ABBR } from "./reading";
import { TargetAudio, Texts } from "./Content";

export function DictionaryDetail({
  id,
  back = "/dictionary"
}: {
  id: string;
  back?: string;
}) {
  const uiText = useWebText(webDictionary);
  const userId = useUserStore((s) => s.user?.id);
  const result = useQuery({
    queryKey: ["dictionary", userId, "entry", id],
    enabled: !!userId,
    queryFn: ({ signal }) => api.dictionary.get(id, { signal }),
    staleTime: 0
  });
  const profile = useQuery({
    queryKey: ["student-home", userId, "profile"],
    enabled: !!userId,
    queryFn: ({ signal }) => api.auth.me({ signal }),
    refetchOnMount: "always"
  });
  const item = result.data;
  const variant = profile.data?.learning_settings?.english_variant ?? null;
  const level = profile.data?.learning_settings?.cefr_level ?? "C2";
  return (
    <div className="animate-in mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <Button asChild variant="ghost" className="mb-6">
        <Link href={back}>
          {uiText("webDictionary:back_to_search_results")}
        </Link>
      </Button>
      {(result.isPending || profile.isPending) && (
        <p role="status">{uiText("webDictionary:loading_entry_details")}</p>
      )}
      {(result.isError || profile.isError) && (
        <div role="alert">
          <h1 className="text-3xl font-semibold">
            {uiText("webDictionary:entry_details_unavailable")}
          </h1>
          <p className="mt-3 text-sm text-foreground-muted">
            {uiText(
              "webDictionary:the_entry_may_have_been_withdrawn_or_the_network_is_unavailable"
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => {
              void result.refetch();
              void profile.refetch();
            }}
          >
            {uiText("webDictionary:retry")}
          </Button>
        </div>
      )}
      {result.isSuccess && profile.isSuccess && item && (
        <>
          <h1 className="tsz-words break-words text-3xl font-semibold tracking-tight">
            {dictionarySpellings(item.content, variant).primary}
          </h1>
          {dictionarySpellings(item.content, variant).alternate && (
            <p className="mt-2 text-sm text-foreground-muted">
              {uiText("webDictionary:other_spellings_v0", {
                v0: dictionarySpellings(item.content, variant).alternate
              })}
            </p>
          )}
          <div className="mt-8 space-y-6">
            {item.content.pos.map((pos) => (
              <section
                key={pos.pos_id}
                className="rounded-3xl border border-border bg-surface p-6 sm:p-8"
              >
                <h2 className="mb-4 text-xl font-semibold">
                  {POS_ABBR[pos.pos] ?? pos.label ?? pos.pos}
                </h2>
                <div className="space-y-2">
                  {(pos.forms ?? [])
                    .filter((f) => f.form_type === "base")
                    .flatMap((f) => selectTexts(f.variants, variant))
                    .map((v) => (
                      <div key={v.id} className="text-sm">
                        <span className="mr-3 text-foreground-muted">
                          {v.dialect === "uk"
                            ? uiText("webDictionary:british")
                            : v.dialect === "us"
                              ? uiText("webDictionary:american")
                              : uiText("webDictionary:common")}{" "}
                          · {v.spelling}
                        </span>
                        <TargetAudio
                          entryId={id}
                          audio={item.audio}
                          targetId={v.id}
                          sourceDialects={[v.dialect]}
                          variant={variant}
                          label={uiText("webDictionary:play_v0_spelling", {
                            v0: v.spelling
                          })}
                        />
                        {v.pronunciations.map((p) => {
                          const [left, right] = phoneticDelimiters(
                            p.dict_phonetic
                          );
                          return (
                            <div
                              key={p.id}
                              className="mr-3 inline-flex items-center gap-1"
                            >
                              {p.dict_phonetic && (
                                <span className="tsz-phonetics">
                                  {left}
                                  {p.dict_phonetic_rich ? (
                                    <RichTextReadOnly
                                      value={p.dict_phonetic_rich}
                                    />
                                  ) : (
                                    p.dict_phonetic
                                  )}
                                  {right}
                                </span>
                              )}
                              <TargetAudio
                                entryId={id}
                                audio={item.audio}
                                targetId={p.id}
                                sourceDialects={
                                  v.dialect === "common"
                                    ? [
                                        "common",
                                        ...(variant === "BrE"
                                          ? ["uk" as const]
                                          : variant === "AmE"
                                            ? ["us" as const]
                                            : ["uk" as const, "us" as const])
                                      ]
                                    : [v.dialect]
                                }
                                variant={variant}
                                label={uiText(
                                  "webDictionary:play_v0_pronunciation",
                                  {
                                    v0: v.spelling
                                  }
                                )}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                </div>
                <div className="mt-5 space-y-6">
                  {pos.senses.map((sense, index) => {
                    const definition = dictionaryDefinition(
                      sense.definitions,
                      level
                    );
                    const grammar = pos.grammar_structures.find(
                      (g) => g.id === definition?.grammar_structure_id
                    );
                    const examples = item.examples.filter(
                      (e) => e.sense_id === sense.id
                    );
                    return (
                      <div
                        key={sense.id}
                        className="border-t border-border pt-5 text-sm leading-7"
                      >
                        <h3 className="mb-2 font-medium">
                          {uiText("webDictionary:meaning_v0", {
                            v0: index + 1
                          })}
                          {sense.sub_pos_label && ` · ${sense.sub_pos_label}`}
                        </h3>
                        {definition ? (
                          <>
                            <span className="mb-2 inline-block rounded-full bg-primary-muted px-2 text-xs text-primary">
                              {definition.level}
                            </span>
                            <Texts
                              texts={definition.texts}
                              variant={variant}
                              textRole="definition"
                            />
                            <TargetAudio
                              entryId={id}
                              audio={item.audio}
                              targetId={definition.id}
                              sourceDialects={selectTexts(
                                definition.texts,
                                variant
                              ).map((text) => text.dialect)}
                              variant={variant}
                              label={uiText(
                                "webDictionary:play_english_definition"
                              )}
                            />
                          </>
                        ) : (
                          <p className="text-foreground-muted">
                            {uiText("webDictionary:no_definitions_yet")}
                          </p>
                        )}
                        {grammar && (
                          <div className="mt-4 rounded-2xl bg-muted p-4">
                            <h4 className="mb-1 font-medium">
                              {uiText("webDictionary:grammar_structures")}
                            </h4>
                            <Texts texts={grammar.variants} variant={variant} />
                            <TargetAudio
                              entryId={id}
                              audio={item.audio}
                              targetId={grammar.id}
                              sourceDialects={selectTexts(
                                grammar.variants,
                                variant
                              ).map((text) => text.dialect)}
                              variant={variant}
                              label={uiText(
                                "webDictionary:play_grammar_structure"
                              )}
                            />
                          </div>
                        )}
                        {examples.length > 0 && (
                          <div className="mt-4 space-y-4">
                            <h4 className="font-medium">
                              {uiText("webDictionary:sentences")}
                            </h4>
                            {examples.map((e) => (
                              <div key={e.id}>
                                <Texts
                                  texts={e.texts}
                                  variant={variant}
                                  textRole="example"
                                />
                                <TargetAudio
                                  entryId={id}
                                  audio={item.audio}
                                  targetId={e.id}
                                  sourceDialects={selectTexts(
                                    e.texts,
                                    variant
                                  ).map((text) => text.dialect)}
                                  variant={variant}
                                  label={uiText("webDictionary:play_example")}
                                />
                                <div className="mt-1 text-foreground-muted">
                                  <RichTextReadOnly
                                    value={e.translation}
                                    textRole="example"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
