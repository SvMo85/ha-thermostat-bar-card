import { cssFarbe } from "../farben.js";
import { ABWEICHUNG_SCHWELLE_GRAD, KURVE_FLAECHE_DECKKRAFT, KURVE_LINIE_PX, RAMPE_MIN, SKALA_LUFT_GRAD, TAGESMINUTEN, VERLAUF_ABRUF_MS, VERLAUF_FARBSTAERKE_PROZENT, VERLAUF_LINIE_PX, ZEITMARKEN_MIN } from "../konstanten.js";
import { naechsterSchaltpunkt, tagesabschnitte, verlaufsabschnitte, wertUm, wochentemperaturen } from "./plan.js";

/** Tagesplan und gemessener Verlauf; wird in die Karte eingebaut. */
export class TagesplanTeil {
  _planZeichnen() {
    const plan = this._el && this._el.plan;
    if (!plan || !this._zustand) return;

    const sichtbar = this._tagesplanSichtbar;
    plan.style.display = sichtbar ? "" : "none";
    if (!sichtbar) return;

    const jetzt = this._jetzt();
    const abschnitte = tagesabschnitte(this._planDaten[jetzt.tag]);
    const breite = plan.offsetWidth;
    const hoehe = plan.offsetHeight;
    const prozent = (m) => `${(m / TAGESMINUTEN) * 100}%`;

    plan.querySelector(".tp-marken").innerHTML = ZEITMARKEN_MIN
      .map((m) => `<div class="tp-marke" style="left:${prozent(m)}"></div>`)
      .join("");
    plan.querySelector(".tp-jetzt").style.left = prozent(jetzt.minute);

    const svg = plan.querySelector(".tp-kurve");
    if (!abschnitte.length || !breite || !hoehe) {
      svg.innerHTML = "";
      return;
    }
    svg.innerHTML = this._kurveSvg(abschnitte, jetzt.minute, breite, hoehe);
  }

  /**
   * Hoehe der Kurve: unten der kleinste Planwert der Woche, oben der
   * groesste oder der Sollwert, falls hoeher. Im Modus Aus zaehlt der
   * Sollwert nicht, weil das Geraet dort den Frostschutzwert meldet.
   * Die Farben haengen davon nicht ab, sie folgen der festen Farbskala.
   */
  _hoehenskala(abschnitte) {
    const werte = wochentemperaturen(this._planDaten);
    if (!werte.length) werte.push(...abschnitte.map((a) => a.temp));
    let oben = Math.max(...werte);
    const soll = this._soll;
    if (this._zustand.state !== "off" && soll !== null) oben = Math.max(oben, soll);
    return { unten: Math.min(...werte) - SKALA_LUFT_GRAD, oben: oben + SKALA_LUFT_GRAD };
  }

  _kurveSvg(abschnitte, minute, breite, hoehe) {
    const p = this._config.schedule;
    const innenrand = KURVE_LINIE_PX + 1;
    const skala = this._hoehenskala(abschnitte);
    const spanne = skala.oben - skala.unten;
    const x = (m) => (m / TAGESMINUTEN) * breite;
    // Ohne Begrenzung fuer den Farbverlauf: er haengt an der festen
    // Farbskala und darf deshalb ueber die Flaeche hinausreichen.
    const yUnbegrenzt = (t) => {
      const anteil = spanne <= 0 ? 0.5 : (t - skala.unten) / spanne;
      return hoehe - innenrand - anteil * (hoehe - 2 * innenrand);
    };
    const y = (t) => Math.min(hoehe - innenrand, Math.max(innenrand, yUnbegrenzt(t)));
    const abblassen = (von, bis, deckkraft) =>
      `<rect x="${x(von)}" y="0" width="${Math.max(0, x(bis) - x(von))}" height="${hoehe}"` +
      ` style="fill: var(--card-background-color, #1c1c1c)" opacity="${deckkraft}"/>`;

    const minFarbe = cssFarbe(p.min_color);
    const maxFarbe = cssFarbe(p.max_color);
    const stopps = [];
    for (let k = 0; k <= 8; k++) {
      stopps.push(
        `<stop offset="${k / 8}" style="stop-color: color-mix(in oklab, ${maxFarbe} ${(k / 8) * 100}%, ${minFarbe})"/>`
      );
    }

    const pfad = this._kurvenpfad(abschnitte, x, y);
    const teile = [
      `<defs><linearGradient id="tp-farbskala" gradientUnits="userSpaceOnUse" x1="0"` +
        ` y1="${yUnbegrenzt(p.min_temp)}" x2="0" y2="${yUnbegrenzt(p.max_temp)}">${stopps.join("")}</linearGradient></defs>`,
      `<path d="${pfad} L ${breite} ${hoehe} L 0 ${hoehe} Z" fill="url(#tp-farbskala)" opacity="${KURVE_FLAECHE_DECKKRAFT}"/>`,
      `<path d="${pfad}" fill="none" stroke="url(#tp-farbskala)" stroke-width="${KURVE_LINIE_PX}"` +
        ` stroke-linejoin="round" stroke-linecap="round"/>`
    ];

    if (p.show_history) teile.push(this._verlaufSvg(minute, x, y));

    const abweichung = this._abweichung(abschnitte, minute);
    if (abweichung) teile.push(this._abweichungSvg(abweichung, abschnitte, skala, x, y, breite, abblassen));

    return teile.join("");
  }

  /**
   * Stufen mit Uebergaengen: jeder Schaltpunkt wird zu einer geglaetteten
   * Rampe, mittig um den Schaltpunkt. Kurze Abschnitte begrenzen die Rampe,
   * damit kein Plateau verschwindet.
   */
  _kurvenpfad(abschnitte, x, y) {
    const halb = RAMPE_MIN / 2;
    let d = `M 0 ${y(abschnitte[0].temp)}`;
    for (let i = 0; i + 1 < abschnitte.length; i++) {
      const a = abschnitte[i];
      const b = abschnitte[i + 1];
      const r = Math.min(halb, (a.bis - a.von) / 2, (b.bis - b.von) / 2);
      const x1 = x(a.bis - r);
      const x2 = x(a.bis + r);
      const y1 = y(a.temp);
      const y2 = y(b.temp);
      d += ` L ${x1} ${y1}`;
      if (r > 0) {
        const xm = (x1 + x2) / 2;
        d += ` C ${xm} ${y1} ${xm} ${y2} ${x2} ${y2}`;
      } else {
        d += ` L ${x2} ${y2}`;
      }
    }
    return `${d} L ${x(TAGESMINUTEN)} ${y(abschnitte[abschnitte.length - 1].temp)}`;
  }

  /**
   * Weicht der Sollwert vom Plan ab, gilt die Abweichung im Automatikbetrieb
   * bis zum naechsten Schaltpunkt; Homematic IP kehrt dann ins Profil zurueck.
   * In jedem anderen Modus ruht das Profil, die Abweichung gilt bis Tagesende.
   */
  _abweichung(abschnitte, minute) {
    const modus = this._zustand.state;
    const soll = this._soll;

    if (modus === "off") return { von: minute, bis: TAGESMINUTEN, aus: true, text: this._modusBeschriftung({ mode: "off" }) };
    if (modus !== "auto") {
      if (soll === null) return null;
      return {
        von: minute,
        bis: TAGESMINUTEN,
        aus: false,
        text: `${this._modusBeschriftung({ mode: modus })} ${this._zahlteil(soll)}°`
      };
    }

    const planwert = wertUm(abschnitte, minute);
    if (soll === null || planwert === null || Math.abs(soll - planwert) < ABWEICHUNG_SCHWELLE_GRAD) return null;
    return {
      von: minute,
      bis: naechsterSchaltpunkt(abschnitte, minute),
      aus: false,
      text: `Manuell ${this._zahlteil(soll)}°`
    };
  }

  _abweichungSvg(abweichung, abschnitte, skala, x, y, breite, abblassen) {
    const f = this._config.colors;
    const teile = [abblassen(abweichung.von, abweichung.bis, abweichung.aus ? 0.7 : 0.6)];
    let textHoehe = y(skala.unten);

    if (!abweichung.aus) {
      const ys = y(this._soll);
      const strich = `stroke="${f.target}" stroke-width="${KURVE_LINIE_PX}" stroke-dasharray="5 4" stroke-linecap="round"`;
      const planVorher = wertUm(abschnitte, abweichung.von);
      const planNachher = wertUm(abschnitte, Math.min(abweichung.bis, TAGESMINUTEN - 1));

      // Senkrechte Anschluesse zeigen, wo die Abweichung vom Plan abzweigt
      // und wohin sie zurueckkehrt.
      if (planVorher !== null) {
        teile.push(`<line x1="${x(abweichung.von)}" y1="${y(planVorher)}" x2="${x(abweichung.von)}" y2="${ys}" ${strich}/>`);
      }
      teile.push(`<line x1="${x(abweichung.von)}" y1="${ys}" x2="${x(abweichung.bis)}" y2="${ys}" ${strich}/>`);
      if (abweichung.bis < TAGESMINUTEN && planNachher !== null) {
        teile.push(`<line x1="${x(abweichung.bis)}" y1="${ys}" x2="${x(abweichung.bis)}" y2="${y(planNachher)}" ${strich}/>`);
      }
      textHoehe = ys;
    }

    // Die Beschriftung steht immer, auch wenn die Abweichung kuerzer ist als der Text.
    const textY = textHoehe - 6 < 10 ? textHoehe + 14 : textHoehe - 6;
    const textX = Math.min(x(abweichung.von) + 6, breite - 70);
    const farbe = abweichung.aus ? "var(--secondary-text-color)" : f.target;
    teile.push(`<text x="${textX}" y="${textY}" style="fill: ${farbe}">${abweichung.text}</text>`);
    return teile.join("");
  }

  // ----------------------------------------------------------------- Verlauf

  /**
   * Gemessene Ist-Temperatur von 0 Uhr bis jetzt, gedaempft und gestrichelt,
   * damit die Planlinie fuehrend bleibt. Endet am aktuellen Ist-Wert.
   * Meldet das Geraet hvac_action, ist die Linie dort rot, wo geheizt wurde,
   * und blau, wo nicht; sonst hat sie durchgehend history_color.
   */
  _verlaufSvg(minute, x, y) {
    const tagesbeginn = Date.now() - minute * 60000;
    const punkte = this._verlauf
      .map((p) => ({ m: Math.max(0, (p.zeit - tagesbeginn) / 60000), t: p.t, aktion: p.aktion }))
      .filter((p) => p.m <= minute);
    if (this._ist !== null) {
      punkte.push({ m: minute, t: this._ist, aktion: this._zustand.attributes.hvac_action });
    }
    if (punkte.length < 2) return "";

    const geglaettet = punkte.map((p, i) => {
      const fenster = punkte.slice(Math.max(0, i - 3), i + 4);
      return { ...p, t: fenster.reduce((summe, q) => summe + q.t, 0) / fenster.length };
    });
    geglaettet[geglaettet.length - 1] = punkte[punkte.length - 1];

    const s = this._config.schedule;
    const mitAktion = geglaettet.some((p) => p.aktion !== undefined && p.aktion !== null);
    const farbeVon = (p) => !mitAktion ? s.history_color
      : p.aktion === "heating" ? s.history_heating_color : s.history_idle_color;
    return verlaufsabschnitte(geglaettet, farbeVon)
      .map((abschnitt) => this._verlaufPfad(abschnitt.punkte, abschnitt.farbe, x, y))
      .join("");
  }

  _verlaufPfad(punkte, farbe, x, y) {
    const d = punkte
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.m)} ${y(p.t)}`)
      .join(" ");
    const strich = `color-mix(in oklab, ${cssFarbe(farbe)} ` +
      `${VERLAUF_FARBSTAERKE_PROZENT}%, var(--card-background-color, #1c1c1c))`;
    return `<path d="${d}" fill="none" style="stroke: ${strich}" stroke-width="${VERLAUF_LINIE_PX}"` +
      ` stroke-dasharray="4 3" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  _verlaufBeiBedarfLaden() {
    if (!this._tagesplanSichtbar || !this._config.schedule.show_history) return;
    if (!this._hass.callWS || this._verlaufLaedt) return;
    if (Date.now() - this._verlaufGeladenAm < VERLAUF_ABRUF_MS) return;
    this._verlaufLaden();
  }

  /**
   * Holt die Ist-Temperatur des heutigen Tages aus dem Verlauf von Home
   * Assistant. Nur mit minimal_response: false traegt jeder Eintrag seine
   * Attribute; lu ist der Zeitpunkt in Sekunden.
   */
  async _verlaufLaden() {
    this._verlaufLaedt = true;
    this._verlaufGeladenAm = Date.now();
    const entitaet = this._config.entity;
    try {
      const ende = new Date();
      const beginn = new Date(ende.getTime() - this._jetzt().minute * 60000);
      const antwort = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: beginn.toISOString(),
        end_time: ende.toISOString(),
        entity_ids: [entitaet],
        minimal_response: false,
        no_attributes: false,
        significant_changes_only: false
      });
      if (entitaet !== this._config.entity) return;
      this._verlauf = ((antwort && antwort[entitaet]) || [])
        .map((eintrag) => ({
          zeit: Number(eintrag.lu) * 1000,
          t: Number(eintrag.a && eintrag.a.current_temperature),
          aktion: eintrag.a ? eintrag.a.hvac_action : undefined
        }))
        .filter((p) => Number.isFinite(p.zeit) && Number.isFinite(p.t))
        .sort((a, b) => a.zeit - b.zeit);
    } catch (fehler) {
      // Ohne Verlauf bleibt der Tagesplan vollstaendig; die Linie fehlt nur.
      this._verlauf = [];
    } finally {
      this._verlaufLaedt = false;
      if (this._el) this._planZeichnen();
    }
  }
}
