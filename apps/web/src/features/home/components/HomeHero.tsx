"use client";

import { useWebText } from "@/i18n/client";
import { webHomeLanding as webHome } from "@/i18n/messages/home/landing";
import { HeroCTA } from "./HeroCTA";
import { HeroVisual } from "./HeroVisual";
import styles from "./home.module.css";

export function HomeHero() {
  const uiText = useWebText(webHome);
  return (
    <section aria-labelledby="home-title" className={styles.hero}>
      <div className={styles.heroCopy}>
        <h1 id="home-title" className={styles.headline}>
          {uiText("记住单词。")}
          <br />
          {uiText("看见更大的世界。")}
        </h1>
        <p className={styles.heroDescription}>
          {uiText("从词表到练习，让每一次复习都有方向。")}
        </p>
        <div className="mt-6 flex justify-center">
          <HeroCTA />
        </div>
      </div>
      <HeroVisual />
    </section>
  );
}
