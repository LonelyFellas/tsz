"use client";
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
    imageAlt: "俯瞰蓝色海洋，白色海浪涌向浅色沙岸",
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
    imageAlt: "近距离看一道卷起的蓝色海浪，浪尖溅起白色水花",
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
    imageAlt: "平静海水与浅色沙滩交接，海岸线向远处延伸",
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
    <section className={styles.preview} aria-label={uiText("词汇预览")}>
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
          <span>{uiText("词汇预览")}</span>
          <span
            className="tabular-nums"
            aria-label={uiText("第 {{v0}} 个，共 {{v1}} 个示例单词", {
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
              aria-label={uiText("上一个单词")}
              onClick={() => changeWord(-1)}
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-primary"
              aria-label={uiText("下一个单词")}
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
                {uiText("先想一想，这个单词是什么意思？")}
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
            {showDefinition ? uiText("隐藏释义") : uiText("查看释义")}
          </Button>
        </div>
        <p className="sr-only" role="status">
          {uiText("词汇预览：{{v0}}，第 {{v1}} 个，共 {{v2}} 个示例单词。", {
            v0: current.word,
            v1: index + 1,
            v2: WORDS.length
          })}
        </p>
      </div>
    </section>
  );
}
