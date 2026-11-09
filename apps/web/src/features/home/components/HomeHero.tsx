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
          {uiText("webHomeLanding:remember_words")}
          <br />
          {uiText("webHomeLanding:explore_a_wider_world")}
        </h1>
        <p className={styles.heroDescription}>
          {uiText(
            "webHomeLanding:from_word_lists_to_practice_give_every_review_a_purpose"
          )}
        </p>
        <div className="mt-6 flex justify-center">
          <HeroCTA />
        </div>
      </div>
      <HeroVisual />
    </section>
  );
}
