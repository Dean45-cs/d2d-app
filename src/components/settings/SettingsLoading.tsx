import { ListLabel, SkeletonHeader, SkeletonList } from "@/components/ui";

/**
 * Platzhalter einer Einstellungsseite: der echte Kopf, dann die Gruppen.
 * Die Einstellungen liegen auf dem Geraet - es fehlt nur der Seitenwechsel.
 */
export function SettingsLoading({
  title,
  back = true,
  groups,
}: {
  title: string;
  back?: boolean;
  /** Ueberschrift und Zeilen je Gruppe. */
  groups: Array<[label: string, rows: number]>;
}) {
  return (
    <div className="page-narrow" aria-busy="true" aria-label={`${title} wird geladen`}>
      <SkeletonHeader
        title={title}
        subtitle={false}
        back={back ? { href: "/einstellungen", label: "Einstellungen" } : undefined}
      />
      {groups.map(([label, rows], index) => (
        <div key={label || index}>
          {label ? <ListLabel>{label}</ListLabel> : null}
          <SkeletonList rows={rows} icon="glyph" subtitle />
        </div>
      ))}
    </div>
  );
}
