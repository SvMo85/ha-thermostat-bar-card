import { test } from "node:test";
import assert from "node:assert/strict";
import {
  naechsterSchaltpunkt, tagesabschnitte, uhrzeitInMinuten, verlaufsabschnitte, wertUm, wochentemperaturen
} from "../src/tagesplan/plan.js";

const P = (starttime, endtime, temperature) => ({ starttime, endtime, temperature });

test("Wenn 24:00 gelesen wird dann sind es 1440 Minuten", () => {
  assert.equal(uhrzeitInMinuten("24:00"), 1440);
});

test("Wenn die Uhrzeit kein Format HH:MM hat dann ist sie null", () => {
  assert.equal(uhrzeitInMinuten("6 Uhr"), null);
});

test("Wenn ein Tag eine Periode hat dann fuellt die Grundtemperatur davor und danach", () => {
  const abschnitte = tagesabschnitte({ base_temperature: 18, periods: [P("06:00", "08:00", 21)] });
  assert.deepEqual(abschnitte, [
    { von: 0, bis: 360, temp: 18 },
    { von: 360, bis: 480, temp: 21 },
    { von: 480, bis: 1440, temp: 18 }
  ]);
});

test("Wenn sich Perioden ueberlappen dann beginnt die spaetere am Ende der frueheren", () => {
  const abschnitte = tagesabschnitte({ base_temperature: 18, periods: [P("06:00", "08:00", 21), P("07:00", "09:00", 20)] });
  assert.deepEqual(abschnitte[2], { von: 480, bis: 540, temp: 20 });
});

test("Wenn um 07:00 gefragt wird dann gilt der Wert der Periode 06 bis 08 Uhr", () => {
  const abschnitte = tagesabschnitte({ base_temperature: 18, periods: [P("06:00", "08:00", 21)] });
  assert.equal(wertUm(abschnitte, 420), 21);
});

test("Wenn um 07:00 der naechste Schaltpunkt gesucht wird dann ist es 08:00", () => {
  const abschnitte = tagesabschnitte({ base_temperature: 18, periods: [P("06:00", "08:00", 21)] });
  assert.equal(naechsterSchaltpunkt(abschnitte, 420), 480);
});

test("Wenn nach dem letzten Schaltpunkt gesucht wird dann ist es Mitternacht", () => {
  const abschnitte = tagesabschnitte({ base_temperature: 18, periods: [P("06:00", "08:00", 21)] });
  assert.equal(naechsterSchaltpunkt(abschnitte, 600), 1440);
});

test("Wenn der Verlauf von Heizen zu Ruhe wechselt dann teilt er sich und die Teile beruehren sich", () => {
  const punkte = [{ m: 0, heizt: true }, { m: 10, heizt: true }, { m: 20, heizt: false }, { m: 30, heizt: false }];
  const abschnitte = verlaufsabschnitte(punkte, (p) => (p.heizt ? "rot" : "blau"));
  // Der rote Teil endet auf dem ersten blauen Punkt
  assert.deepEqual(abschnitte.map((a) => [a.farbe, a.punkte.map((p) => p.m)]), [["rot", [0, 10, 20]], ["blau", [20, 30]]]);
});

test("Wenn der letzte Punkt allein eine neue Farbe hat dann entsteht dafuer kein eigener Teil", () => {
  const punkte = [{ m: 0, heizt: false }, { m: 10, heizt: false }, { m: 20, heizt: true }];
  const abschnitte = verlaufsabschnitte(punkte, (p) => (p.heizt ? "rot" : "blau"));
  assert.deepEqual(abschnitte.map((a) => a.farbe), ["blau"]);
});

test("Wenn die Woche gelesen wird dann zaehlen Grundtemperaturen und Perioden", () => {
  const werte = wochentemperaturen({
    MONDAY: { base_temperature: 18, periods: [P("06:00", "08:00", 21)] },
    TUESDAY: { base_temperature: 17, periods: [] }
  });
  assert.deepEqual(werte, [18, 21, 17]);
});
