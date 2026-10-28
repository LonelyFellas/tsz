import { HeroCTA } from "./HeroCTA";
import { HeroVisual } from "./HeroVisual";
import styles from "./home.module.css";

export function HomeHero() {
  return (
    <section aria-labelledby="home-title" className={styles.hero}>
      <div className={styles.heroCopy}>
        <h1 id="home-title" className={styles.headline}>
          记住单词。
          <br />
          看见更大的世界。
        </h1>
        <p className={styles.heroDescription}>
          从词表到练习，让每一次复习都有方向。
        </p>
        <div className="mt-6 flex justify-center">
          <HeroCTA />
        </div>
      </div>
      <HeroVisual />
    </section>
  );
}
