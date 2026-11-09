"use client";
import { localText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webHomeLanding as webHome } from "@/i18n/messages/home/landing";

import Image from "next/image";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { cn } from "@tsz/ui/lib/cn";
import { HOME_IMAGES } from "./hero-images";
import styles from "./home.module.css";

const IMAGE_SIZES =
  "(min-width: 1200px) 629px, (min-width: 768px) calc((100vw - 48px) * 6 / 11), calc(100vw - 40px)";

const WORDS = [
  {
    word: "ocean",
    image: HOME_IMAGES.ocean,
    imageAlt: localText(
      webHome,
      "webHomeLanding:a_blue_ocean_seen_from_above_with_white_waves_reaching_a_pale_sandy_shor"
    ),
    phonetic: "/ˈəʊʃən/",
    definition: "海洋",
    exampleBefore: "The ",
    exampleWord: "ocean",
    exampleAfter: " connects us all.",
    translation: "海洋将我们紧密相连。"
  },
  {
    word: "wave",
    image: HOME_IMAGES.wave,
    imageAlt: localText(
      webHome,
      "webHomeLanding:a_curling_blue_wave_seen_close_up_with_white_spray_at_its_crest"
    ),
    phonetic: "/weɪv/",
    definition: "海浪；波浪",
    exampleBefore: "A ",
    exampleWord: "wave",
    exampleAfter: " rolls onto the beach.",
    translation: "一道海浪涌向沙滩。"
  },
  {
    word: "shore",
    image: HOME_IMAGES.shore,
    imageAlt: localText(
      webHome,
      "webHomeLanding:calm_water_meets_pale_sand_with_the_shoreline_stretching_into_the_distan"
    ),
    phonetic: "/ʃɔː/",
    definition: "岸；滨",
    exampleBefore: "We walked along the ",
    exampleWord: "shore",
    exampleAfter: ".",
    translation: "我们沿着岸边散步。"
  }
] as const;

export function HeroVisual() {
  const uiText = useWebText(webHome);
  const [{ index, requestedIndices }, setPreview] = useState({
    index: 0,
    requestedIndices: [0]
  });
  const [showDefinition, setShowDefinition] = useState(true);
  const [firstImageSettled, setFirstImageSettled] = useState(false);
  const current = WORDS[index]!;

  function changeWord(direction: number) {
    setPreview((value) => {
      const nextIndex = (value.index + direction + WORDS.length) % WORDS.length;
      return {
        index: nextIndex,
        requestedIndices: value.requestedIndices.includes(nextIndex)
          ? value.requestedIndices
          : [...value.requestedIndices, nextIndex]
      };
    });
    setShowDefinition(true);
  }

  return (
    <section
      className={styles.preview}
      aria-label={uiText("webHomeLanding:vocabulary_preview")}
    >
      <div className={styles.picture}>
        {WORDS.map((word, wordIndex) => (
          <picture
            key={word.word}
            className={styles.wordPicture}
            data-active={wordIndex === index}
          >
            {(firstImageSettled || requestedIndices.includes(wordIndex)) && (
              <>
                <source
                  type="image/avif"
                  srcSet={word.image.avif}
                  sizes={IMAGE_SIZES}
                />
                <source
                  type="image/webp"
                  srcSet={word.image.webp}
                  sizes={IMAGE_SIZES}
                />
                <Image
                  src={word.image.fallback}
                  alt={uiText(word.imageAlt)}
                  aria-hidden={wordIndex !== index}
                  fill
                  unoptimized
                  placeholder="blur"
                  loading="eager"
                  fetchPriority={
                    wordIndex === 0 || wordIndex === index ? "high" : "low"
                  }
                  onLoad={
                    wordIndex === 0
                      ? () => setFirstImageSettled(true)
                      : undefined
                  }
                  onError={
                    wordIndex === 0
                      ? () => setFirstImageSettled(true)
                      : undefined
                  }
                  className={styles.wordImage}
                />
              </>
            )}
          </picture>
        ))}
      </div>
      <div className={styles.wordPanel}>
        <div className="flex items-center justify-between gap-4 text-xs text-foreground-muted">
          <span>{uiText("webHomeLanding:vocabulary_preview")}</span>
          <span
            className="tabular-nums"
            aria-label={uiText("webHomeLanding:example_word_v0_of_v1", {
              v0: index + 1,
              v1: WORDS.length
            })}
          >
            {index + 1} / {WORDS.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={uiText("webHomeLanding:previous_word")}
              onClick={() => changeWord(-1)}
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-primary"
              aria-label={uiText("webHomeLanding:next_word")}
              onClick={() => changeWord(1)}
            >
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div key={current.word} className={styles.wordContent}>
          <h2 className={cn("tsz-words", styles.specimenWord)} lang="en">
            {current.word}
          </h2>
          <p className={cn("tsz-phonetics", styles.phonetic)}>
            {current.phonetic}
          </p>
          <div className={styles.definitionSpace}>
            <div id="home-word-definition" hidden={!showDefinition}>
              <p className={styles.definition}>
                <span className="text-foreground-muted">n.</span>{" "}
                {current.definition}
              </p>
              <div className={styles.example}>
                <p lang="en">
                  {current.exampleBefore}
                  <strong className="font-semibold text-primary">
                    {current.exampleWord}
                  </strong>
                  {current.exampleAfter}
                </p>
                <p className="mt-2 text-sm leading-6 text-foreground-muted">
                  {current.translation}
                </p>
              </div>
            </div>
            {!showDefinition && (
              <p className={styles.recallHint}>
                {uiText("webHomeLanding:what_do_you_think_this_word_means")}
              </p>
            )}
          </div>
        </div>
        <div className={styles.previewControls}>
          <Button
            type="button"
            variant="ghost"
            size="compact"
            aria-expanded={showDefinition}
            aria-controls="home-word-definition"
            onClick={() => setShowDefinition((value) => !value)}
          >
            {showDefinition ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
            {showDefinition
              ? uiText("webHomeLanding:hide_meaning")
              : uiText("webHomeLanding:show_meaning")}
          </Button>
        </div>
        <p className="sr-only" role="status">
          {uiText(
            "webHomeLanding:vocabulary_preview_v0_example_word_v1_of_v2",
            {
              v0: current.word,
              v1: index + 1,
              v2: WORDS.length
            }
          )}
        </p>
      </div>
    </section>
  );
}
