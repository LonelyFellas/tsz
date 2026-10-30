"use client";

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
  const [index, setIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(true);
  const [firstImageSettled, setFirstImageSettled] = useState(false);
  const current = WORDS[index]!;

  function changeWord(direction: number) {
    setIndex((value) => (value + direction + WORDS.length) % WORDS.length);
    setShowDefinition(true);
  }

  return (
    <section className={styles.preview} aria-label="词汇预览">
      <div className={styles.picture}>
        {WORDS.map((word, wordIndex) => (
          <picture
            key={word.word}
            className={styles.wordPicture}
            data-active={wordIndex === index}
          >
            {(wordIndex === 0 || firstImageSettled || wordIndex === index) && (
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
                  alt={word.imageAlt}
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
          <span>词汇预览</span>
          <span
            className="tabular-nums"
            aria-label={`第 ${index + 1} 个，共 ${WORDS.length} 个示例单词`}
          >
            {index + 1} / {WORDS.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="上一个单词"
              onClick={() => changeWord(-1)}
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-primary"
              aria-label="下一个单词"
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
                先想一想，这个单词是什么意思？
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
            {showDefinition ? "隐藏释义" : "查看释义"}
          </Button>
        </div>
        <p
          className="sr-only"
          role="status"
        >{`词汇预览：${current.word}，第 ${index + 1} 个，共 ${WORDS.length} 个示例单词。`}</p>
      </div>
    </section>
  );
}
