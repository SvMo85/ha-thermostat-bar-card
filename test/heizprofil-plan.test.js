import { test } from "node:test";
import assert from "node:assert/strict";
import {
  neuerZeitraum, schaltpunkteVon, temperaturGeschaltet, zeitGesetzt, zeitraumAbschnitte
} from "../src/heizprofil/plan.js";

const P = (starttime, endtime, temperature) => ({ starttime, endtime, temperature });

// Echter Werktag des Kinderzimmers aus schedule_data
const kinderzimmerWerktag = () => ({
  base_temperature: 18.5,
  periods: [P("06:00", "06:45", 19), P("06:45", "09:00", 19.5), P("09:00", "15:00", 17),
    P("15:00", "15:30", 18), P("15:30", "16:00", 19), P("16:00", "19:00", 19.5)]
});

const GRENZEN = { min: 5, max: 30.5, schritt: 0.5 };

// ------------------------------------------------------------ Schaltpunkte

test("Wenn sechs Zeitraeume lueckenlos mit Grundtemperatur davor und danach dann 8 Schaltpunkte", () => {
  // 00:00-06:00 Grund, sechs Zeitraeume, 19:00-24:00 Grund
  const anzahl = schaltpunkteVon(kinderzimmerWerktag());
  assert.equal(anzahl, 8);
});

test("Wenn keine Zeitraeume dann ein Schaltpunkt fuer den ganzen Tag", () => {
  const anzahl = schaltpunkteVon({ base_temperature: 17, periods: [] });
  assert.equal(anzahl, 1);
});

test("Wenn ein Zeitraum bis 24:00 reicht dann kostet der Rest keinen Schaltpunkt", () => {
  // 00:00-06:00 Zeitraum, 06:00-19:00 Grund, 19:00-24:00 Zeitraum
  const anzahl = schaltpunkteVon({ base_temperature: 19.5, periods: [P("00:00", "06:00", 18.5), P("19:00", "24:00", 18.5)] });
  assert.equal(anzahl, 3);
});

test("Wenn Zeitraeume ungeordnet vorliegen dann ordnen die Abschnitte nach Uhrzeit und behalten den Index", () => {
  const abschnitte = zeitraumAbschnitte({ base_temperature: 18, periods: [P("20:00", "21:00", 21), P("06:00", "07:00", 20)] });
  // Grund, 06-07 (Index 1), Grund, 20-21 (Index 0), Grund
  assert.deepEqual(abschnitte.map((a) => a.index), [null, 1, null, 0, null]);
  assert.deepEqual(abschnitte.map((a) => a.von), [0, 360, 420, 1200, 1260]);
});

// ------------------------------------------------------------- Temperatur

test("Wenn waermer geschaltet wird dann steigt die Temperatur um eine Stufe", () => {
  assert.equal(temperaturGeschaltet(19, 1, GRENZEN), 19.5);
});

test("Wenn die Hoechsttemperatur erreicht ist dann bleibt sie dort", () => {
  assert.equal(temperaturGeschaltet(30.5, 1, GRENZEN), 30.5);
});

test("Wenn die Temperatur nicht auf dem Raster liegt dann rastet sie ein", () => {
  // 19,2 plus 0,5 ergibt 19,7, gerastet 19,5
  assert.equal(temperaturGeschaltet(19.2, 1, GRENZEN), 19.5);
});

// ---------------------------------------------------------------- Uhrzeit

test("Wenn ein Ende mit 12 Minuten gewaehlt wird dann wird es auf 5 Minuten gerundet", () => {
  const tag = { base_temperature: 18, periods: [P("19:00", "20:00", 19)] };
  // 20:12 ergibt 20:10
  const zeiten = zeitGesetzt(tag, 0, "bis", 20 * 60 + 12);
  assert.deepEqual(zeiten, { starttime: "19:00", endtime: "20:10" });
});

test("Wenn der Beginn in den vorigen Zeitraum geschoben wird dann endet er an dessen Ende", () => {
  const tag = kinderzimmerWerktag();
  // Zeitraum 06:45-09:00 auf 06:00 ziehen, der vorige endet um 06:45
  const zeiten = zeitGesetzt(tag, 1, "von", 6 * 60);
  assert.equal(zeiten.starttime, "06:45");
});

test("Wenn das Ende vor den Beginn gelegt wird dann bleiben 5 Minuten Dauer", () => {
  const tag = { base_temperature: 18, periods: [P("19:00", "20:00", 19)] };
  const zeiten = zeitGesetzt(tag, 0, "bis", 18 * 60);
  assert.equal(zeiten.endtime, "19:05");
});

test("Wenn als Ende 24:00 gewaehlt wird dann ist 24:00 erlaubt", () => {
  const tag = { base_temperature: 18, periods: [P("22:00", "23:00", 17)] };
  const zeiten = zeitGesetzt(tag, 0, "bis", 1440);
  assert.equal(zeiten.endtime, "24:00");
});

test("Wenn eine Uhrzeit gesetzt wird dann bleibt der Plan selbst unveraendert", () => {
  const tag = { base_temperature: 18, periods: [P("19:00", "20:00", 19)] };
  zeitGesetzt(tag, 0, "bis", 21 * 60);
  assert.equal(tag.periods[0].endtime, "20:00");
});

// ------------------------------------------------------- Neuer Zeitraum

test("Wenn nach dem letzten Zeitraum Platz ist dann beginnt der neue direkt danach fuer eine Stunde", () => {
  const neu = neuerZeitraum(kinderzimmerWerktag(), 30.5);
  // letzter Zeitraum endet 19:00, Grundtemperatur 18,5 plus 1
  assert.deepEqual(neu, P("19:00", "20:00", 19.5));
});

test("Wenn die letzte Luecke kuerzer als eine Stunde ist dann fuellt der neue sie genau", () => {
  const tag = { base_temperature: 18, periods: [P("00:00", "23:30", 20)] };
  const neu = neuerZeitraum(tag, 30.5);
  assert.deepEqual(neu, P("23:30", "24:00", 19));
});

test("Wenn alle 13 Schaltpunkte belegt sind dann gibt es keinen neuen Zeitraum", () => {
  // 13 lueckenlose Zeitraeume ueber den ganzen Tag
  const grenzen = [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 1440];
  const periods = grenzen.slice(0, -1).map((von, i) => P(`${String(von / 60).padStart(2, "0")}:00`,
    i === 12 ? "24:00" : `${String(grenzen[i + 1] / 60).padStart(2, "0")}:00`, 18 + (i % 2)));
  const neu = neuerZeitraum({ base_temperature: 17, periods }, 30.5);
  assert.equal(neu, null);
});

test("Wenn die Grundtemperatur an der Hoechstgrenze liegt dann bekommt der neue Zeitraum die Hoechstgrenze", () => {
  const neu = neuerZeitraum({ base_temperature: 30.5, periods: [] }, 30.5);
  assert.equal(neu.temperature, 30.5);
});
