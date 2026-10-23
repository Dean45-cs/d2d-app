/** Client-safe catalog; authorization itself lives in permissions.ts. */
export const PERMISSIONS = [
  { key: "territories.create", group: "Gebiete", label: "Gebiete erstellen", description: "Eigene Gebiete zeichnen und aufteilen. Automatisch ab einer aktiven Person in der eigenen Struktur." },
  { key: "territories.view_all", group: "Gebiete", label: "Alle Teamgebiete sehen", description: "Zugriff auf alle Gebiete des Teams, auch beim Klinken." },
  { key: "territories.edit", group: "Gebiete", label: "Gebiete und Straßen bearbeiten", description: "Flächen, Angaben und Straßen in zugänglichen Gebieten pflegen. Standardmäßig mit dem Erstellrecht erlaubt." },
  { key: "territories.assign", group: "Gebiete", label: "Gebiete zuteilen", description: "Zugängliche Gebiete an sich oder die eigene Struktur zuteilen. Mit Zugriff auf alle Teamgebiete an das ganze Team." },
  { key: "territories.delete", group: "Gebiete", label: "Gebiete löschen", description: "Zugängliche Gebiete mit ihren Straßen löschen. Standardmäßig mit dem Erstellrecht erlaubt." },
  { key: "visits.correct", group: "Vertrieb", label: "Besuche korrigieren", description: "Auch ältere oder fremde Besuche im Team rückgängig machen." },
  { key: "doors.unblock", group: "Vertrieb", label: "Türsperren aufheben", description: "Sperren in zugänglichen Gebieten aufheben." },
  { key: "appointments.team", group: "Vertrieb", label: "Teamtermine verwalten", description: "Termine aller Teammitglieder sehen, verschieben und abhaken." },
  { key: "customers.manage", group: "Vertrieb", label: "Kundenliste pflegen", description: "Den Aufträgen des Teams Kunden mit Telefonnummer und Vertragsende zuordnen, auslaufende Verträge zur Umberatung sehen und die Liste exportieren." },
  { key: "reports.team", group: "Auswertung", label: "Teamauswertung sehen", description: "Übersicht und Auswertungen des gesamten Teams einschließlich Besuchsdetails sehen." },
  { key: "team.manage", group: "Verwaltung", label: "Mitglieder verwalten", description: "Mitglieder anlegen, bearbeiten, deaktivieren und Passwörter setzen. Im Vertrieb auf die eigene Struktur begrenzt." },
  { key: "team.roles", group: "Verwaltung", label: "Rollen ändern", description: "Teamleitungen ernennen oder zurückstufen. Dieses Recht gilt ausschließlich für Teamleitungen." },
  { key: "structure.manage", group: "Verwaltung", label: "Struktur ändern", description: "Direkte Führungskräfte zuordnen. Im Vertrieb innerhalb der eigenen Struktur." },
  { key: "permissions.manage", group: "Verwaltung", label: "Berechtigungen vergeben", description: "Eigene Rechte an andere vergeben oder entziehen. Automatisch für Strukturverantwortliche, auf ihre Struktur begrenzt." },
  { key: "invitations.create", group: "Einladungen", label: "Personen einladen", description: "Persönliche Einladungslinks erstellen. Standardmäßig für alle erlaubt." },
  { key: "invitations.approve", group: "Einladungen", label: "Beitritte freigeben", description: "Beitritte als direkte Führungskraft des Einladenden freigeben oder ablehnen. Standardmäßig erlaubt." },
  { key: "energy.manage", group: "Energiekarte", label: "Preise pflegen", description: "Teampreise erfassen, importieren, exportieren und löschen." },
  { key: "energy.reference", group: "Energiekarte", label: "Vergleichswerte ändern", description: "Referenzwerte für die Preisbewertung des Teams ändern." },
  { key: "energy.refresh", group: "Energiekarte", label: "Tagesquelle aktualisieren", description: "Die gemeinsame Tagesquelle der Energiekarte manuell abrufen." },
  { key: "settings.reasons", group: "Einstellungen", label: "Ablehnungsgründe pflegen", description: "Ablehnungsgründe des Teams anlegen und ändern." },
  { key: "community.moderate", group: "Community", label: "Feed moderieren", description: "Fremde Beiträge und Kommentare im Team löschen." },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export type PermissionSet = Record<Permission, boolean>;
export type PermissionOverrides = Partial<Record<Permission, boolean>>;
export function isPermission(value: string): value is Permission {
  return PERMISSIONS.some((permission) => permission.key === value);
}
