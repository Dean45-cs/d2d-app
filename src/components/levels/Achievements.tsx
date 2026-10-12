"use client";

import { useState } from "react";
import {
  ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_TIERS, achievementTier, sortAchievements,
  type Achievement, type AchievementCategory, type AchievementTier,
} from "@/lib/levels";
import {
  IconBolt, IconCalendar, IconChat, IconCheck, IconCheckCircle, IconDoor,
  IconFlame, IconLayers, IconTarget, IconTrendUp, IconTrophy,
} from "@/components/icons";
import styles from "./Achievements.module.css";

const number = (value: number) => value.toLocaleString("de-DE");
const ICONS = {
  doors: IconDoor, met: IconChat, appointments: IconCalendar, sales: IconTrophy,
  stromSales: IconBolt, gasSales: IconFlame, dualSales: IconLayers,
  completedAppointments: IconCheckCircle, activeDays: IconCalendar,
  saleDays: IconTrendUp, bestDaySales: IconTarget,
};

type Status = "all" | "open" | "unlocked";

export function Achievements({ achievements }: { achievements: Achievement[] }) {
  const [tier, setTier] = useState<AchievementTier | "all">("all");
  const [category, setCategory] = useState<AchievementCategory | "all">("all");
  const [status, setStatus] = useState<Status>("all");
  const ordered = sortAchievements(achievements);
  const unlocked = ordered.filter((entry) => entry.unlocked).length;
  const completion = achievements.length ? Math.round(unlocked / achievements.length * 100) : 0;
  const next = ordered.filter((entry) => !entry.unlocked)
    .sort((a, b) => b.current / b.target - a.current / a.target)[0];
  const shown = ordered.filter((entry) =>
    (tier === "all" || entry.tier === tier) &&
    (category === "all" || entry.category === category) &&
    (status === "all" || (status === "unlocked" ? entry.unlocked : !entry.unlocked)),
  );

  function reset() { setTier("all"); setCategory("all"); setStatus("all"); }

  return (
    <section id="abzeichen" className={styles.collection} aria-labelledby="achievement-heading">
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div>
            <p className={styles.eyebrow}>DEINE ERFOLGSSAMMLUNG</p>
            <h2 id="achievement-heading">Kleine Schritte. Große Erfolge.</h2>
            <p className={styles.intro}>Von der ersten Tür bis zum Energieprofi. Entdecke deinen nächsten Meilenstein.</p>
          </div>
          <div className={styles.collectionCount} aria-label={`${unlocked} von ${achievements.length} Erfolgen freigeschaltet`}>
            <strong>{unlocked}<span> / {achievements.length}</span></strong>
            <span>freigeschaltet</span>
          </div>
        </div>
        <div className={styles.collectionTrack} role="progressbar" aria-label="Erfolgssammlung" aria-valuemin={0} aria-valuemax={achievements.length} aria-valuenow={unlocked}>
          <span style={{ width: `${completion}%` }} />
        </div>
        <div className={styles.heroFooter}>
          <span>{completion} % deiner Sammlung entdeckt</span>
          <span>5 Schwierigkeitsstufen · leicht → schwer</span>
        </div>
      </header>

      {next ? (
        <div className={`${styles.next} ${styles.theme}`} data-tier={next.tier}>
          <Medal achievement={next} small />
          <div className={styles.nextText}>
            <p className={styles.eyebrow}>DEIN NÄCHSTER MEILENSTEIN</p>
            <p><strong>{next.title}</strong><span> · {achievementTier(next.tier).label}</span></p>
            <p className="muted text-xs">Noch {number(Math.max(0, next.target - next.current))} {next.unit}</p>
          </div>
          <button type="button" className="btn btn-tinted btn-sm" onClick={() => {
            setTier(next.tier); setCategory(next.category); setStatus("open");
          }}>Ansehen</button>
        </div>
      ) : (
        <p className={styles.complete}><IconCheckCircle /> Sammlung komplett. Alle {achievements.length} Erfolge gehören dir.</p>
      )}

      <div className={styles.filters}>
        <div className={styles.tiers} role="group" aria-label="Schwierigkeit filtern">
          <button type="button" className={styles.tierButton} aria-pressed={tier === "all"} onClick={() => setTier("all")}>Alle Stufen</button>
          {ACHIEVEMENT_TIERS.map((entry) => {
            const badges = achievements.filter((badge) => badge.tier === entry.id);
            return (
              <button key={entry.id} type="button" data-tier={entry.id} className={`${styles.tierButton} ${styles.theme}`}
                aria-pressed={tier === entry.id} onClick={() => setTier(entry.id)}
                title={`${entry.label}: ${entry.difficulty}`}>
                <span className={styles.tierDot} aria-hidden />{entry.label}
                <span className={styles.tierCount}>{badges.filter((badge) => badge.unlocked).length}/{badges.length}</span>
              </button>
            );
          })}
        </div>
        <div className={styles.selects}>
          <label>Bereich
            <select className="input" value={category} onChange={(event) => setCategory(event.target.value as AchievementCategory | "all")}>
              <option value="all">Alle Bereiche</option>
              {ACHIEVEMENT_CATEGORIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </label>
          <label>Status
            <select className="input" value={status} onChange={(event) => setStatus(event.target.value as Status)}>
              <option value="all">Alle Erfolge</option><option value="open">Noch offen</option><option value="unlocked">Freigeschaltet</option>
            </select>
          </label>
          <p aria-live="polite" aria-atomic="true">{shown.length} {shown.length === 1 ? "Erfolg" : "Erfolge"} · nach Schwierigkeit</p>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className={styles.empty}>
          <IconTarget className="mx-auto mb-3 h-8 w-8 text-tint" />
          <h3>Hier ist noch Platz für Erfolge.</h3>
          <p>Für diese Auswahl gibt es gerade keine passenden Abzeichen.</p>
          <button className="btn btn-tinted btn-sm mt-3" type="button" onClick={reset}>Alle Erfolge anzeigen</button>
        </div>
      ) : ACHIEVEMENT_TIERS.map((entry) => {
        const badges = shown.filter((badge) => badge.tier === entry.id);
        if (!badges.length) return null;
        return (
          <section key={entry.id} className={`${styles.tierSection} ${styles.theme}`} data-tier={entry.id} aria-labelledby={`tier-${entry.id}`}>
            <div className={styles.tierHeading}>
              <span className={styles.tierNumber} aria-hidden>0{entry.order}</span>
              <div><h3 id={`tier-${entry.id}`}>{entry.label}<span>{entry.difficulty}</span></h3><p>{entry.description}</p></div>
              <span className={styles.difficulty} aria-label={`Schwierigkeit ${entry.order} von 5`}>
                {[1, 2, 3, 4, 5].map((value) => <i key={value} data-on={value <= entry.order} />)}
              </span>
            </div>
            <div className={styles.grid}>
              {badges.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} />)}
            </div>
          </section>
        );
      })}
      <footer className={styles.notes}>
        <p>Strom + Gas bei einem Besuch zählt für beide Produkterfolge und als ein Kombiabschluss. Die Gesamtzahl der Abschlüsse und die XP werden dabei nicht verdoppelt.</p>
        <p>Tage werden in Berliner Zeit gezählt. Bestehende Einträge zählen mit; Korrekturen können Erfolge wieder zurücknehmen. Abzeichen vergeben keine zusätzlichen XP.</p>
        <details>
          <summary>Wie sind die Ziele eingeordnet?</summary>
          <p>Die fünf Stufen sind Motivationsziele dieser App, keine branchenüblichen Leistungsvorgaben. Tagesbestwerte von 3, 5 und 10 Abschlüssen sind persönliche Herausforderungen. Gezählt werden erfasste Abschlüsse, keine bestätigten Lieferstarts oder ausgezahlten Provisionen.</p>
          <p>Produktbereiche orientieren sich am Direktvertrieb von <a href="https://www.swm.de/lp/sp/vertriebspartner" target="_blank" rel="noreferrer">SWM</a> und <a href="https://www.enercity.de/geschaeftskunden/partner/direktvertriebspartner" target="_blank" rel="noreferrer">enercity</a>. <a href="https://weeenergie.de/" target="_blank" rel="noreferrer">weeenergie</a> zeigt beispielsweise 8 Abschlüsse pro Woche als unverbindliche Rechnung, nicht als Durchschnitt. Recherche: 01.10.2026.</p>
        </details>
      </footer>
    </section>
  );
}

function Medal({ achievement, small = false }: { achievement: Achievement; small?: boolean }) {
  const Icon = ICONS[achievement.kind];
  const difficulty = achievementTier(achievement.tier).order;
  return (
    <div className={`${styles.medal} ${small ? styles.smallMedal : ""}`} data-unlocked={achievement.unlocked} aria-hidden="true">
      <div className={styles.medalFace}><Icon className="h-7 w-7" /></div>
      <span className={styles.medalStars}>{"✦".repeat(difficulty)}</span>
      {achievement.unlocked && <span className={styles.medalCheck}><IconCheck className="h-3 w-3" /></span>}
    </div>
  );
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const current = Math.min(achievement.current, achievement.target);
  const percent = Math.floor(current / achievement.target * 100);
  return (
    <article className={styles.badgeCard} data-unlocked={achievement.unlocked} aria-labelledby={`badge-${achievement.id}`}>
      <div className={styles.cardTop}>
        <Medal achievement={achievement} />
        <span className={styles.state}>{achievement.unlocked ? <><IconCheck className="h-3.5 w-3.5" />Freigeschaltet</> : percent > 0 ? "In Arbeit" : "Noch offen"}</span>
      </div>
      <p className={styles.category}>{ACHIEVEMENT_CATEGORIES.find((entry) => entry.id === achievement.category)!.label}</p>
      <h4 id={`badge-${achievement.id}`}>{achievement.title}</h4>
      <p className={styles.description}>{achievement.description}</p>
      <div className={styles.cardBottom}>
        <div className={styles.progressLabel}><span>{number(current)} <span>/ {number(achievement.target)}</span></span><span>{achievement.unlocked ? "Geschafft" : `${percent} %`}</span></div>
        <div className={styles.progress} role="progressbar" aria-label={achievement.title} aria-valuemin={0} aria-valuemax={achievement.target} aria-valuenow={current} aria-valuetext={`${number(current)} von ${number(achievement.target)} ${achievement.unit}`}>
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>
    </article>
  );
}
