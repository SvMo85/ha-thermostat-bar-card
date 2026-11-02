import { TAGESMINUTEN } from "../konstanten.js";

export const WOCHENTAGE = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
export const WERKTAGE = WOCHENTAGE.slice(0, 5);
export const WOCHENENDE = WOCHENTAGE.slice(5);

// Belegt: OpenCCU rundet Uhrzeiten auf 5 Minuten; aiohomematic schreibt je
// Tag 13 Schaltpunkte.
export const PROFIL_RASTER_MIN = 5;
export const PROFIL_MAX_SCHALTPUNKTE = 13;
export const PROFIL_NEU_DAUER_MIN = 60;
export const PROFIL_MELDUNG_MS = 2500;

export const kopie = (wert) => JSON.parse(JSON.stringify(wert));
export const minutenAus = (text) => {
  const [h, m] = String(text).split(":").map(Number);
  return h * 60 + m;
};
export const uhrzeitAus = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Lueckenlose Abschnitte 0 bis 1440; Luecken tragen die Grundtemperatur und index null. */
export function zeitraumAbschnitte(tag) {
  const liste = [];
  let position = 0;
  (tag.periods || [])
    .map((p, index) => ({ von: minutenAus(p.starttime), bis: minutenAus(p.endtime), temp: Number(p.temperature), index }))
    .sort((a, b) => a.von - b.von)
    .forEach((p) => {
      if (p.von > position) liste.push({ von: position, bis: p.von, temp: Number(tag.base_temperature), index: null });
      liste.push(p);
      position = p.bis;
    });
  if (position < TAGESMINUTEN) {
    liste.push({ von: position, bis: TAGESMINUTEN, temp: Number(tag.base_temperature), index: null });
  }
  return liste;
}

/**
 * So belegt aiohomematic die Schaltpunkte: jeder Zeitraum einen, jede Luecke
 * davor oder dazwischen einen, ein Rest bis 24:00 noch einen.
 */
export const schaltpunkteVon = (tag) => zeitraumAbschnitte(tag).length;

/** Eine Stufe waermer oder kaelter, gerastet und in den Grenzen des Geraets. */
export function temperaturGeschaltet(temperatur, richtung, { min, max, schritt }) {
  const roh = Math.round((Number(temperatur) + richtung * schritt) / schritt) * schritt;
  return Math.min(max, Math.max(min, roh));
}

/** Grenzen eines Zeitraums: Ende des vorigen und Beginn des naechsten. */
export function nachbargrenzen(tag, index) {
  const p = tag.periods[index];
  const andere = tag.periods.filter((_, i) => i !== index);
  return {
    frueheste: Math.max(0, ...andere.map((q) => minutenAus(q.endtime)).filter((m) => m <= minutenAus(p.starttime))),
    spaeteste: Math.min(TAGESMINUTEN, ...andere.map((q) => minutenAus(q.starttime)).filter((m) => m >= minutenAus(p.endtime)))
  };
}

/**
 * Beginn oder Ende eines Zeitraums nach einer gewaehlten Uhrzeit: auf 5
 * Minuten gerundet, ohne die Nachbarn zu ueberlappen, mindestens 5 Minuten lang.
 * Liefert starttime und endtime, aendert den Plan nicht.
 */
export function zeitGesetzt(tag, index, kante, minute) {
  const p = tag.periods[index];
  const { frueheste, spaeteste } = nachbargrenzen(tag, index);
  const von = minutenAus(p.starttime);
  const bis = minutenAus(p.endtime);
  const gerundet = Math.round(minute / PROFIL_RASTER_MIN) * PROFIL_RASTER_MIN;
  if (kante === "von") {
    return { starttime: uhrzeitAus(Math.min(bis - PROFIL_RASTER_MIN, Math.max(frueheste, gerundet))), endtime: p.endtime };
  }
  return { starttime: p.starttime, endtime: uhrzeitAus(Math.max(von + PROFIL_RASTER_MIN, Math.min(spaeteste, gerundet))) };
}

/**
 * Vorschlag fuer einen neuen Zeitraum: eine Stunde direkt nach dem letzten,
 * damit er unten in der Liste erscheint, wo der Knopf ist. Sonst die
 * naechstfruehere Luecke. Null, wenn die Schaltpunkte nicht reichen.
 */
export function neuerZeitraum(tag, maxTemp) {
  const temperatur = Math.min(maxTemp, Number(tag.base_temperature) + 1);
  return zeitraumAbschnitte(tag)
    .filter((a) => a.index === null && a.bis - a.von >= PROFIL_RASTER_MIN)
    .reverse()
    .map((l) => ({
      starttime: uhrzeitAus(l.von),
      endtime: uhrzeitAus(l.von + Math.min(PROFIL_NEU_DAUER_MIN, l.bis - l.von)),
      temperature: temperatur
    }))
    .find((p) => schaltpunkteVon({ ...tag, periods: [...tag.periods, p] }) <= PROFIL_MAX_SCHALTPUNKTE) || null;
}
