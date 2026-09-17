/**
 * Wird von Next.js einmal beim Serverstart ausgeführt – der richtige Ort für
 * die Ersteinrichtung. Der Import liegt bewusst in der Funktion, damit die
 * Datenbank nicht in die Edge-Laufzeit gezogen wird.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootstrap } = await import("./lib/bootstrap");
  await bootstrap();
}
