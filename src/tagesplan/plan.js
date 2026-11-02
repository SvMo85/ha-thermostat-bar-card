import { TAGESMINUTEN } from "../konstanten.js";

/** "06:45" -> 405, "24:00" -> 1440 */
export function uhrzeitInMinuten(text) {
  const teile = /^(\d{1,2}):(\d{2})$/.exec(String(text));
  if (!teile) return null;
  return Number(teile[1]) * 60 + Number(teile[2]);
}

export function wertUm(abschnitte, minute) {
  const abschnitt = abschnitte.find((a) => minute >= a.von && minute < a.bis);
  return abschnitt ? abschnitt.temp : null;
}

export function naechsterSchaltpunkt(abschnitte, minute) {
  const abschnitt = abschnitte.find((a) => a.von > minute);
  return abschnitt ? abschnitt.von : TAGESMINUTEN;
}

/**
 * Ein Wochentag aus schedule_data als lueckenlose Abschnitte von 0 bis 1440
 * Minuten. Die Grundtemperatur gilt ueberall, wo keine Periode liegt.
 */
export function tagesabschnitte(tagesplan) {
  if (!tagesplan) return [];
  const basis = Number(tagesplan.base_temperature);
  const perioden = (tagesplan.periods || [])
    .map((p) => ({
      von: uhrzeitInMinuten(p.starttime),
      bis: uhrzeitInMinuten(p.endtime),
      temp: Number(p.temperature)
    }))
    .filter((p) => p.von !== null && p.bis !== null && p.bis > p.von && Number.isFinite(p.temp))
    .sort((a, b) => a.von - b.von);

  const abschnitte = [];
  let position = 0;
  perioden.forEach((p) => {
    if (p.von > position && Number.isFinite(basis)) {
      abschnitte.push({ von: position, bis: p.von, temp: basis });
    }
    const von = Math.max(p.von, position);
    if (p.bis > von) abschnitte.push({ von, bis: p.bis, temp: p.temp });
    position = Math.max(position, p.bis);
  });
  if (position < TAGESMINUTEN && Number.isFinite(basis)) {
    abschnitte.push({ von: position, bis: TAGESMINUTEN, temp: basis });
  }
  return abschnitte;
}

/**
 * Teilt die Punkte des Verlaufs an jedem Farbwechsel. Jeder Abschnitt endet
 * auf dem ersten Punkt des naechsten, damit die Linie durchgehend bleibt.
 */
export function verlaufsabschnitte(punkte, farbeVon) {
  const abschnitte = [];
  punkte.forEach((p) => {
    const farbe = farbeVon(p);
    const letzter = abschnitte[abschnitte.length - 1];
    if (letzter && letzter.farbe === farbe) {
      letzter.punkte.push(p);
      return;
    }
    if (letzter) letzter.punkte.push(p);
    abschnitte.push({ farbe, punkte: [p] });
  });
  return abschnitte.filter((a) => a.punkte.length >= 2);
}

/** Letzter Messpunkt bis zum Zeitpunkt; null, wenn der Verlauf erst spaeter beginnt. Punkte aufsteigend sortiert. */
export function verlaufspunktUm(punkte, zeit) {
  let treffer = null;
  for (const p of punkte) {
    if (p.zeit > zeit) break;
    treffer = p;
  }
  return treffer;
}

/** Alle Temperaturen der Woche, fuer eine Hoehenskala, die nicht taeglich springt. */
export function wochentemperaturen(planDaten) {
  return Object.values(planDaten || {}).flatMap((tag) => [
    Number(tag.base_temperature),
    ...(tag.periods || []).map((p) => Number(p.temperature))
  ]).filter(Number.isFinite);
}
