import { uhrzeitAus } from "../heizprofil/plan.js";
import { TAGESMINUTEN } from "../konstanten.js";
import { tagesabschnitte, verlaufspunktUm, wertUm } from "./plan.js";

/**
 * Hinweis beim Ueberfahren des Tagesplans mit der Maus: Uhrzeit, Soll, Ist
 * und Heizstatus an dieser Stelle. Vergangenes kommt aus dem Verlauf,
 * Kommendes aus dem Plan; Touch zeigt nichts, dort gehoert das Halten dem Profil.
 */
export class TagesplanHinweisTeil {
  _hinweisBinden(plan) {
    plan.addEventListener("pointermove", (ereignis) => {
      if (ereignis.pointerType !== "mouse" || ereignis.buttons) {
        this._hinweisVerbergen();
        return;
      }
      this._hinweisZeigen(ereignis.clientX);
    });
    plan.addEventListener("pointerleave", () => this._hinweisVerbergen());
    plan.addEventListener("pointerdown", () => this._hinweisVerbergen());
  }

  _hinweisZeigen(clientX) {
    const plan = this._el && this._el.plan;
    if (!plan || !this._zustand || !this._tagesplanSichtbar) return;
    const rahmen = plan.getBoundingClientRect();
    if (!rahmen.width) return;

    const anteil = Math.min(1, Math.max(0, (clientX - rahmen.left) / rahmen.width));
    const minute = Math.min(TAGESMINUTEN - 1, Math.floor(anteil * TAGESMINUTEN));
    const linie = plan.querySelector(".tp-hover");
    const hinweis = plan.querySelector(".tp-hinweis");

    hinweis.innerHTML = this._hinweisHtml(this._hinweisWerte(minute));
    linie.style.left = `${anteil * 100}%`;
    linie.hidden = false;
    hinweis.hidden = false;

    const breite = hinweis.offsetWidth;
    const x = anteil * rahmen.width;
    hinweis.style.left = `${Math.min(rahmen.width - breite, Math.max(0, x - breite / 2))}px`;
  }

  _hinweisVerbergen() {
    const plan = this._el && this._el.plan;
    if (!plan) return;
    plan.querySelector(".tp-hover").hidden = true;
    plan.querySelector(".tp-hinweis").hidden = true;
  }

  /** Jetzt gilt der Zustand, davor der Verlauf, danach nur der Plan. */
  _hinweisWerte(minute) {
    const jetzt = this._jetzt();
    const planwert = wertUm(tagesabschnitte(this._planDaten[jetzt.tag]), minute);
    const zeit = uhrzeitAus(minute);

    if (minute > jetzt.minute) return { zeit, plan: planwert, soll: null, ist: null, aktion: null };
    if (minute === jetzt.minute) {
      return { zeit, plan: planwert, soll: this._soll, ist: this._ist, aktion: this._zustand.attributes.hvac_action };
    }

    const zeitpunkt = Date.now() - (jetzt.minute - minute) * 60000;
    const punkt = verlaufspunktUm(this._verlauf, zeitpunkt);
    if (!punkt) return { zeit, plan: planwert, soll: null, ist: null, aktion: null };
    return {
      zeit,
      plan: planwert,
      soll: Number.isFinite(punkt.soll) ? punkt.soll : null,
      ist: punkt.t,
      aktion: punkt.aktion
    };
  }

  _hinweisHtml(w) {
    const zeile = (name, wert) => `<span class="hw-name">${name}</span><span class="hw-wert">${this._zahlteil(wert)}°</span>`;
    const teile = [`<div class="hw-zeit">${w.zeit}</div>`];
    if (w.soll !== null) teile.push(zeile("Soll", w.soll));
    else if (w.plan !== null) teile.push(zeile("Plan", w.plan));
    if (w.ist !== null) teile.push(zeile("Ist", w.ist));
    if (w.aktion) teile.push(`<div class="hw-aktion${w.aktion}">${this._aktionstext(w.aktion)}</div>`);
    return teile.join("");
  }

  _aktionstext(aktion) {
    const uebersetzt = this._hass.localize(
      `component.climate.entity_component._.state_attributes.hvac_action.state.${aktion}`
    );
    if (uebersetzt) return uebersetzt;
    if (aktion === "heating") return "Heizt";
    if (aktion === "off") return "Aus";
    return "Bereit";
  }
}
