/**
 * Thermostat Bar Card
 *
 * Waagerechte Thermostat-Karte fuer Home Assistant: Die Fuellung zeigt die
 * Ist-Temperatur, die Flaeche bis zur Markierung die Heizanforderung.
 *
 * Die Leiste in der Karte ist reine Anzeige, damit senkrechtes Scrollen auf
 * Telefonen nie versehentlich einen Wert verstellt. Ein Halten von 600 ms
 * oeffnet den Bearbeitungsmodus, der dieselbe Leiste noch einmal zeigt,
 * dort ziehbar und mit grossen Plus- und Minus-Flaechen.
 *
 * Ueber der Leiste zeigt die Karte auf Wunsch den Tagesplan des Heizprofils
 * als Kurve, dazu Abweichungen vom Plan und den gemessenen Verlauf bis jetzt.
 * Der Plan stammt aus dem Attribut schedule_data, das Homematic(IP) Local an
 * jeder Klima-Entitaet bereitstellt.
 *
 * Der Betriebsmodus wird beim Verstellen bewusst nicht geaendert. Homematic IP
 * behaelt einen im Automatikbetrieb gesetzten Wert bis zum naechsten
 * Schaltzeitpunkt des Heizprofils bei; das ist gewolltes Verhalten.
 */

import { ThermostatBarCardEditor } from "./editor.js";
import { ThermostatHeizprofilBlatt } from "./heizprofil/blatt.js";
import { ThermostatBarCard } from "./karte/karte.js";
import { CARD_VERSION } from "./konstanten.js";

console.info(
  `%c THERMOSTAT-BAR-CARD %c ${CARD_VERSION} `,
  "color: #16181a; background: #e8a33d; font-weight: 700;",
  "color: #e8a33d; background: #16181a;"
);

customElements.define("thermostat-bar-card", ThermostatBarCard);
customElements.define("thermostat-bar-card-editor", ThermostatBarCardEditor);
customElements.define("thermostat-bar-card-heizprofil", ThermostatHeizprofilBlatt);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "thermostat-bar-card",
  name: "Thermostat Bar Card",
  description:
    "Waagerechte Thermostat-Karte mit Ist-Füllung, Heizanforderung, Tagesplan und Bearbeitungsmodus.",
  preview: true,
  documentationURL: "https://github.com/SvMo85/ha-thermostat-bar-card"
});
