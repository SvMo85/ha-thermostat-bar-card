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
 * Der Betriebsmodus wird beim Verstellen bewusst nicht geaendert. Homematic IP
 * behaelt einen im Automatikbetrieb gesetzten Wert bis zum naechsten
 * Schaltzeitpunkt des Heizprofils bei; das ist gewolltes Verhalten.
 */

const CARD_VERSION = "2.0.0";

console.info(
  `%c THERMOSTAT-BAR-CARD %c ${CARD_VERSION} `,
  "color: #16181a; background: #e8a33d; font-weight: 700;",
  "color: #e8a33d; background: #16181a;"
);

const STANDARDFARBEN = {
  track: "var(--divider-color, #262c32)",
  current: "#2b8a9a",
  demand: "linear-gradient(90deg, #6a2d1a 0%, #94421f 40%, #c45826 78%, #e2702f 100%)",
  demand_glow: "#e8663d",
  target: "#e8a33d",
  target_heating: "#c23a1a",
  label_current: "#dde7ee",
  label_target: "#e8a33d",
  status_heating: "#e8663d",
  status_reached: "#4caf50",
  status_idle: "var(--secondary-text-color, #8d97a1)",
  mode_auto: "#4caf50",
  mode_heat: "#e8663d",
  mode_off: "#3d5f7a",
  mode_inactive: "var(--divider-color, #2a3036)",
  lock_active: "#c06a6a"
};

const MODUS_SYMBOLE = {
  auto: "mdi:calendar-sync",
  heat: "mdi:fire",
  cool: "mdi:snowflake",
  heat_cool: "mdi:autorenew",
  dry: "mdi:water-percent",
  fan_only: "mdi:fan",
  off: "mdi:power"
};

const HALTEDAUER_MS = 600;
const BEWEGUNGSSCHWELLE_PX = 6;
const BESCHRIFTUNGSLUECKE_PX = 10;
const GREIFPUNKT_RADIUS_PX = 9;
const RAND_BEARBEITEN_PX = 52;

class ThermostatBarCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("thermostat-bar-card-editor");
  }

  static getStubConfig(hass) {
    const ersteKlimaEntitaet = Object.keys(hass.states).find((id) => id.startsWith("climate."));
    return { entity: ersteKlimaEntitaet || "" };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._haltenTimer = null;
    this._startX = 0;
    this._startY = 0;
    this._editBox = null;
    this._editLeiste = null;
    this._vorschauSoll = null;
    this._aufgebaut = false;
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Es muss eine Klima-Entitaet angegeben werden.");
    }
    if (!config.entity.startsWith("climate.")) {
      throw new Error("entity muss aus der Domaene climate stammen.");
    }

    this._config = {
      name: null,
      icon: "mdi:radiator",
      lock_entity: null,
      height: 44,
      edit_height: 56,
      edge_space: 60,
      tolerance: 0.2,
      show_labels: true,
      show_status: true,
      show_icons: true,
      show_mode_labels: true,
      hvac_modes: null,
      ...config,
      colors: { ...STANDARDFARBEN, ...(config.colors || {}) }
    };

    this._aufgebaut = false;
    if (this._hass) this._zeichnen();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._zeichnen();
  }

  getCardSize() {
    return 3;
  }

  // ---------------------------------------------------------------- Zustand

  get _zustand() {
    return this._hass.states[this._config.entity];
  }

  get _min() {
    const wert = this._zustand.attributes.min_temp;
    return Number(wert === undefined ? 5 : wert);
  }

  get _max() {
    const wert = this._zustand.attributes.max_temp;
    return Number(wert === undefined ? 35 : wert);
  }

  get _schritt() {
    return Number(this._zustand.attributes.target_temp_step || 0.5);
  }

  get _ist() {
    const wert = this._zustand.attributes.current_temperature;
    return wert === undefined || wert === null ? null : Number(wert);
  }

  get _soll() {
    if (this._vorschauSoll !== null) return this._vorschauSoll;
    const wert = this._zustand.attributes.temperature;
    return wert === undefined || wert === null ? null : Number(wert);
  }

  get _modi() {
    if (Array.isArray(this._config.hvac_modes) && this._config.hvac_modes.length) {
      return this._config.hvac_modes.map((eintrag) =>
        typeof eintrag === "string" ? { mode: eintrag } : eintrag
      );
    }
    return (this._zustand.attributes.hvac_modes || []).map((mode) => ({ mode }));
  }

  _modusBeschriftung(eintrag) {
    if (eintrag.label !== undefined) return eintrag.label;
    const uebersetzt = this._hass.localize(
      `component.climate.entity_component._.state.${eintrag.mode}`
    );
    return uebersetzt || eintrag.mode;
  }

  _anteil(wert) {
    const spanne = this._max - this._min;
    if (spanne <= 0) return 0;
    return Math.min(1, Math.max(0, (wert - this._min) / spanne));
  }

  _rasten(wert) {
    const schritt = this._schritt;
    return Math.min(this._max, Math.max(this._min, Math.round(wert / schritt) * schritt));
  }

  _einheit() {
    return this._hass.config.unit_system.temperature || "°C";
  }

  _zahlteil(wert) {
    const sprache = (this._hass.locale && this._hass.locale.language) || "en";
    const trenner = sprache.startsWith("de") ? "," : ".";
    return Number(wert).toFixed(1).replace(".", trenner);
  }

  _formatieren(wert) {
    if (wert === null || wert === undefined || isNaN(wert)) return "--";
    return `${this._zahlteil(wert)} ${this._einheit()}`;
  }

  /** Zahl gross, Einheit klein und hochgestellt. */
  _formatierenHtml(wert) {
    if (wert === null || wert === undefined || isNaN(wert)) return "--";
    return `${this._zahlteil(wert)}<span class="einheit">${this._einheit()}</span>`;
  }

  // ----------------------------------------------------------------- Aufbau

  _zeichnen() {
    if (!this._zustand) {
      this.shadowRoot.innerHTML =
        `<ha-card><div style="padding:16px">Entitaet ${this._config.entity} nicht gefunden.</div></ha-card>`;
      this._aufgebaut = false;
      return;
    }

    if (!this._aufgebaut) {
      this._geruestBauen();
      this._aufgebaut = true;
    }

    this._werteSchreiben();
  }

  _geruestBauen() {
    const c = this._config;
    const f = c.colors;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        *, *::before, *::after { box-sizing: border-box; }
        ha-card {
          display: flex; flex-direction: column; gap: 14px;
          padding: 14px 16px; position: relative;
          width: 100%; overflow: hidden;
        }

        .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .name {
          font-size: 1.12rem; font-weight: 600; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap;
        }
        .namensymbol { --mdc-icon-size: 21px; color: var(--secondary-text-color); flex: 0 0 auto; }
        .lock {
          display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; flex: 0 0 auto; margin-left: -4px;
          border: 1px solid transparent; border-radius: 8px;
          background: transparent; color: var(--secondary-text-color);
          cursor: pointer; padding: 0;
        }
        .lock[aria-pressed="true"] { color: ${f.lock_active}; border-color: ${f.lock_active}; }
        .lock ha-icon { --mdc-icon-size: 18px; }

        .status {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 0.98rem; white-space: nowrap; color: ${f.status_idle};
        }
        .status ha-icon { --mdc-icon-size: 18px; }
        .status[data-zustand="heating"] { color: ${f.status_heating}; font-weight: 500; }
        .status[data-zustand="reached"] { color: ${f.status_reached}; font-weight: 500; }

        .trackwrap { position: relative; transition: transform 120ms ease; }
        .trackwrap.haelt { transform: scale(0.98); }

        /* Waechst waehrend des Haltens von der Mitte nach aussen. */
        .haltefortschritt {
          position: absolute; top: 0; bottom: 0; left: 50%; width: 0;
          transform: translateX(-50%);
          background: rgba(255, 255, 255, 0.22);
          border-left: 2px solid rgba(255, 255, 255, 0.55);
          border-right: 2px solid rgba(255, 255, 255, 0.55);
          opacity: 0; pointer-events: none;
        }
        .trackwrap.haelt .haltefortschritt { opacity: 1; }
        .trackwrap.anzeige {
          height: ${c.height}px; margin: 0 ${c.edge_space}px;
          touch-action: auto; cursor: pointer;
        }
        .trackwrap.bedienbar {
          height: ${c.edit_height}px; margin: 0 ${RAND_BEARBEITEN_PX}px;
          touch-action: none; cursor: pointer;
        }
        .trackclip {
          position: absolute; inset: 0; border-radius: 8px;
          background: ${f.track}; overflow: hidden; z-index: 1;
        }

        /* Warmer Schein unter der Heizanforderung, ausserhalb des Beschnitts */
        .waermeglow {
          position: absolute; top: 3px; bottom: 3px; display: none; z-index: 0;
          background: ${f.demand_glow}; opacity: 0.5; filter: blur(12px);
          border-radius: 8px; pointer-events: none;
        }
        .trackwrap:focus-visible .trackclip {
          outline: 2px solid ${f.target}; outline-offset: 2px;
        }
        /* Glut-Verlauf von der Ist-Kante zum Sollwert. Beginnt exakt an der
           Ist-Kante, damit die Ist-Fuellung nicht optisch verkuerzt wird. */
        .demand {
          position: absolute; top: 0; bottom: 0; display: none; overflow: hidden;
          background: ${f.demand};
        }
        .demand::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(100deg, transparent 0%, rgba(255, 196, 128, 0.2) 45%, transparent 70%);
          background-size: 220% 100%;
          animation: waermeflimmern 3.2s ease-in-out infinite;
        }
        @keyframes waermeflimmern {
          0% { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
        .fill { position: absolute; inset: 0 auto 0 0; background: ${f.current}; }
        .markerline {
          position: absolute; top: 0; bottom: 0;
          width: 3px; margin-left: -1.5px; background: ${f.target};
        }
        .markerdot {
          position: absolute; top: 50%;
          width: 18px; height: 18px; margin: -9px 0 0 -9px;
          border-radius: 50%; background: ${f.target};
          box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.4); pointer-events: none;
          z-index: 2;
        }
        .lbl {
          position: absolute; top: 50%; transform: translateY(-50%);
          white-space: nowrap; pointer-events: none; z-index: 2;
          font-size: 1.2rem; font-variant-numeric: tabular-nums;
        }
        .lbl.ist { color: ${f.label_current}; }
        .lbl.soll { color: ${f.label_target}; font-weight: 600; }

        /* Beim Heizen: Strich dunkelrot hinter der Kugel, die Kugel glueht,
           die Soll-Beschriftung zieht mit. */
        .trackwrap.heizt .markerline {
          background: ${f.target_heating};
          box-shadow: 0 0 6px 1px ${f.target_heating};
        }
        .trackwrap.heizt .markerdot {
          background: radial-gradient(circle at 40% 35%, #ffd8a8 0%, #ff7a33 45%, #d63c18 100%);
          animation: glutpuls 1.8s ease-in-out infinite;
        }
        .trackwrap.heizt .lbl.soll { color: #ff8a4a; }
        @keyframes glutpuls {
          0%, 100% { box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.4), 0 0 10px 2px rgba(255, 90, 38, 0.5); }
          50%      { box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.4), 0 0 18px 6px rgba(255, 90, 38, 0.85); }
        }

        @media (prefers-reduced-motion: reduce) {
          .demand::after { animation: none; }
          .trackwrap.heizt .markerdot {
            animation: none;
            box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.4), 0 0 14px 4px rgba(255, 90, 38, 0.65);
          }
          .trackwrap { transition: none; }
        }
        .einheit { font-size: 0.58em; vertical-align: super; margin-left: 2px; }

        .modes { display: flex; gap: 8px; }
        .modes button {
          flex: 1; min-width: 0; min-height: 44px;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          border: 1px solid ${f.mode_inactive}; border-radius: 8px;
          background: transparent; color: var(--primary-text-color);
          font: inherit; font-size: 1.06rem; cursor: pointer;
        }
        .modes button ha-icon { --mdc-icon-size: 22px; }
        .modes button[aria-pressed="true"] { font-weight: 600; color: #16181a; }
        .modes button[aria-pressed="true"][data-mode="auto"] { background: ${f.mode_auto}; border-color: ${f.mode_auto}; }
        .modes button[aria-pressed="true"][data-mode="heat"],
        .modes button[aria-pressed="true"][data-mode="heat_cool"] { background: ${f.mode_heat}; border-color: ${f.mode_heat}; }
        .modes button[aria-pressed="true"][data-mode="off"],
        .modes button[aria-pressed="true"][data-mode="cool"] {
          background: ${f.mode_off}; border-color: ${f.mode_off}; color: #eef3f7;
        }

        .editbox {
          position: absolute; left: 6px; right: 6px; top: 50%;
          transform: translateY(-50%); z-index: 5;
          display: flex; flex-direction: column; gap: 12px;
          background: var(--card-background-color, #0c0f12);
          border: 1px solid var(--divider-color); border-radius: 14px;
          padding: 12px; box-shadow: 0 14px 38px rgba(0, 0, 0, 0.6);
        }
        .editbox .zeile { display: flex; gap: 12px; }
        .editbox .zeile button {
          flex: 1; min-height: 54px; border-radius: 12px;
          border: 1px solid var(--divider-color); background: transparent;
          color: var(--primary-text-color); font: inherit; font-size: 1.8rem;
          line-height: 1; cursor: pointer;
        }
        .editbox .fertig {
          min-height: 46px; border: 1px solid ${f.target}; border-radius: 10px;
          background: ${f.target}; color: #16181a;
          font: inherit; font-size: 1rem; font-weight: 600; cursor: pointer;
        }
      </style>

      <ha-card>
        <div class="head">
          <span class="head-left">
            ${c.lock_entity ? '<button type="button" class="lock" aria-pressed="false"></button>' : ""}
            ${c.icon ? `<ha-icon class="namensymbol" icon="${c.icon}"></ha-icon>` : ""}
            <span class="name"></span>
          </span>
          ${c.show_status ? '<span class="status"><ha-icon></ha-icon><span class="stext"></span></span>' : ""}
        </div>
        <div class="modes"></div>
      </ha-card>
    `;

    this._el = {
      karte: this.shadowRoot.querySelector("ha-card"),
      name: this.shadowRoot.querySelector(".name"),
      lock: this.shadowRoot.querySelector(".lock"),
      status: this.shadowRoot.querySelector(".status"),
      modes: this.shadowRoot.querySelector(".modes")
    };

    this._anzeigeLeiste = this._leisteErzeugen(this._config.edge_space, false);
    this._el.karte.insertBefore(this._anzeigeLeiste.wrap, this._el.modes);

    this._haltenBinden(this._anzeigeLeiste.wrap);
    this._modiBauen();

    if (this._el.lock) {
      this._el.lock.addEventListener("click", () => this._sperreUmschalten());
    }

    if (this._beobachter) this._beobachter.disconnect();
    this._beobachter = new ResizeObserver(() => this._werteSchreiben());
    this._beobachter.observe(this._anzeigeLeiste.wrap);
  }

  /**
   * Erzeugt eine Leiste. Anzeige und Bearbeitungsmodus nutzen dieselbe
   * Darstellung, nur Bedienbarkeit, Hoehe und Randbereich unterscheiden sich.
   */
  _leisteErzeugen(rand, bedienbar) {
    const wrap = document.createElement("div");
    wrap.className = `trackwrap ${bedienbar ? "bedienbar" : "anzeige"}`;
    wrap.setAttribute("role", "slider");
    wrap.setAttribute("tabindex", "0");
    wrap.innerHTML = `
      <div class="waermeglow"></div>
      <div class="trackclip">
        <div class="fill"></div>
        <div class="demand"></div>
        <div class="markerline"></div>
        <div class="haltefortschritt"></div>
      </div>
      <div class="markerdot"></div>
      ${this._config.show_labels ? '<span class="lbl ist"></span><span class="lbl soll"></span>' : ""}
    `;

    const clip = wrap.querySelector(".trackclip");
    const demand = wrap.querySelector(".demand");
    const glow = wrap.querySelector(".waermeglow");
    const fortschritt = wrap.querySelector(".haltefortschritt");
    const fill = wrap.querySelector(".fill");
    const linie = wrap.querySelector(".markerline");
    const punkt = wrap.querySelector(".markerdot");
    const istLbl = wrap.querySelector(".lbl.ist");
    const sollLbl = wrap.querySelector(".lbl.soll");

    /**
     * bedarf:      Soll liegt ueber Ist. Steuert Flaeche und Schein.
     * geraetHeizt: Das Geraet meldet, dass es heizt. Steuert Kugel und Strich.
     */
    const zeichnen = (ist, soll, bedarf, geraetHeizt) => {
      const breite = clip.offsetWidth;
      const istPx = ist === null ? 0 : this._anteil(ist) * breite;
      const sollPx = soll === null ? 0 : this._anteil(soll) * breite;

      fill.style.width = `${istPx}px`;
      linie.style.left = `${sollPx}px`;
      punkt.style.left = `${sollPx}px`;

      wrap.classList.toggle("heizt", geraetHeizt);

      if (bedarf && sollPx > istPx) {
        demand.style.display = "block";
        demand.style.left = `${istPx}px`;
        demand.style.width = `${sollPx - istPx}px`;
        glow.style.display = "block";
        glow.style.left = `${istPx}px`;
        glow.style.width = `${sollPx - istPx}px`;
      } else {
        demand.style.display = "none";
        glow.style.display = "none";
      }

      wrap.setAttribute("aria-valuemin", String(this._min));
      wrap.setAttribute("aria-valuemax", String(this._max));
      wrap.setAttribute("aria-valuenow", String(soll === null ? this._min : soll));
      wrap.setAttribute("aria-valuetext", this._formatieren(soll));

      if (!istLbl) return;

      istLbl.innerHTML = this._formatierenHtml(ist);
      sollLbl.innerHTML = this._formatierenHtml(soll);

      const istBreite = istLbl.offsetWidth;
      const sollBreite = sollLbl.offsetWidth;

      // Soll steht immer rechts vom Strich, Ist immer links davon.
      let sollLinks = sollPx + GREIFPUNKT_RADIUS_PX + BESCHRIFTUNGSLUECKE_PX;
      const grenze = sollPx - GREIFPUNKT_RADIUS_PX - BESCHRIFTUNGSLUECKE_PX - istBreite;
      let istLinks = Math.min(istPx - BESCHRIFTUNGSLUECKE_PX - istBreite, grenze);

      const maxRechts = breite + rand - 4;
      if (sollLinks + sollBreite > maxRechts) sollLinks = maxRechts - sollBreite;
      if (istLinks < -rand + 4) istLinks = -rand + 4;

      sollLbl.style.left = `${sollLinks}px`;
      istLbl.style.left = `${istLinks}px`;
    };

    const wertAus = (ereignis) => {
      const rechteck = clip.getBoundingClientRect();
      const quote = Math.min(1, Math.max(0, (ereignis.clientX - rechteck.left) / rechteck.width));
      return this._rasten(this._min + quote * (this._max - this._min));
    };

    return { wrap, clip, fortschritt, zeichnen, wertAus };
  }

  _modiBauen() {
    const c = this._config;
    this._el.modes.innerHTML = this._modi
      .map((eintrag) => {
        const text = this._modusBeschriftung(eintrag);
        const symbol = eintrag.icon || MODUS_SYMBOLE[eintrag.mode] || "mdi:help-circle-outline";
        const teile = [];
        if (c.show_icons) teile.push(`<ha-icon icon="${symbol}"></ha-icon>`);
        if (c.show_mode_labels && text) teile.push(`<span>${text}</span>`);
        if (!teile.length) teile.push(`<span>${text || eintrag.mode}</span>`);
        return (
          `<button type="button" data-mode="${eintrag.mode}" aria-pressed="false"` +
          ` aria-label="${text}" title="${text}">${teile.join("")}</button>`
        );
      })
      .join("");

    this._el.modes.addEventListener("click", (ereignis) => {
      const knopf = ereignis.target.closest("button");
      if (!knopf) return;
      this._hass.callService("climate", "set_hvac_mode", {
        entity_id: this._config.entity,
        hvac_mode: knopf.dataset.mode
      });
    });
  }

  // ---------------------------------------------------------------- Zeichnen

  _werteSchreiben() {
    const c = this._config;
    const z = this._zustand;
    const el = this._el;
    if (!el) return;

    el.name.textContent = c.name || z.attributes.friendly_name || c.entity;

    const ist = this._ist;
    const soll = this._soll;

    // Die Flaeche zeigt den Abstand zwischen Ist und Soll, nicht den laufenden
    // Betrieb. hvac_action meldet bei abgeschalteter Heizung "idle", obwohl
    // das Ventil geoeffnet waere, sobald Waerme verfuegbar ist.
    const bedarf = ist !== null && soll !== null && soll > ist + c.tolerance;
    const erreicht = ist !== null && soll !== null && Math.abs(soll - ist) <= c.tolerance;

    // Kugel, Strich und Status folgen dem Geraet. Meldet es kein hvac_action,
    // dient die Differenz als Ersatz.
    const aktion = z.attributes.hvac_action;
    const geraetHeizt = aktion !== undefined ? aktion === "heating" : bedarf;

    this._anzeigeLeiste.zeichnen(ist, soll, bedarf, geraetHeizt);
    if (this._editLeiste) this._editLeiste.zeichnen(ist, soll, bedarf, geraetHeizt);

    if (el.status) {
      const art = geraetHeizt ? "heating" : erreicht ? "reached" : "idle";
      el.status.setAttribute("data-zustand", art);
      el.status.querySelector("ha-icon").setAttribute(
        "icon",
        geraetHeizt ? "mdi:fire" : erreicht ? "mdi:check-circle-outline" : "mdi:thermometer"
      );
      el.status.querySelector(".stext").textContent = this._statustext(art);
    }

    this._modiAktualisieren();
    this._sperreAktualisieren();
  }

  _statustext(art) {
    const aktion = this._zustand.attributes.hvac_action;
    if (aktion) {
      const uebersetzt = this._hass.localize(
        `component.climate.entity_component._.state_attributes.hvac_action.state.${aktion}`
      );
      if (uebersetzt) return uebersetzt;
    }
    if (art === "heating") return "Heizt";
    if (art === "reached") return "Erreicht";
    return "Bereit";
  }

  _modiAktualisieren() {
    const aktuell = this._zustand.state;
    this._el.modes.querySelectorAll("button").forEach((knopf) => {
      knopf.setAttribute("aria-pressed", String(knopf.dataset.mode === aktuell));
    });
  }

  _sperreAktualisieren() {
    if (!this._el.lock) return;
    const sperrzustand = this._hass.states[this._config.lock_entity];
    const gesperrt = sperrzustand
      ? sperrzustand.state === "on" || sperrzustand.state === "locked"
      : false;
    this._el.lock.setAttribute("aria-pressed", String(gesperrt));
    this._el.lock.setAttribute(
      "title",
      gesperrt ? "Bedienung am Geraet gesperrt" : "Bedienung am Geraet moeglich"
    );
    this._el.lock.innerHTML = `<ha-icon icon="${gesperrt ? "mdi:lock" : "mdi:lock-open-variant"}"></ha-icon>`;
  }

  _sperreUmschalten() {
    const id = this._config.lock_entity;
    const zustand = this._hass.states[id];
    if (!zustand) return;

    if (id.startsWith("lock.")) {
      const gesperrt = zustand.state === "locked";
      this._hass.callService("lock", gesperrt ? "unlock" : "lock", { entity_id: id });
    } else {
      this._hass.callService("homeassistant", "toggle", { entity_id: id });
    }
  }

  // ------------------------------------------------------------------ Gesten

  /**
   * Die Anzeigeleiste reagiert nur auf langes Halten. Jede Bewegung bricht ab,
   * damit senkrechtes Scrollen ueber der Karte nie etwas verstellt.
   */
  _haltenBinden(wrap) {
    wrap.addEventListener("pointerdown", (ereignis) => {
      if (this._editBox) return;
      this._startX = ereignis.clientX;
      this._startY = ereignis.clientY;
      this._haltenAbbrechen();
      this._fortschrittStarten();
      this._haltenTimer = setTimeout(() => {
        this._haltenTimer = null;
        this._fortschrittZuruecksetzen();
        this._editOeffnen();
      }, HALTEDAUER_MS);
    });

    wrap.addEventListener("pointermove", (ereignis) => {
      if (!this._haltenTimer) return;
      if (
        Math.abs(ereignis.clientX - this._startX) > BEWEGUNGSSCHWELLE_PX ||
        Math.abs(ereignis.clientY - this._startY) > BEWEGUNGSSCHWELLE_PX
      ) {
        this._haltenAbbrechen();
      }
    });

    wrap.addEventListener("pointerup", () => this._haltenAbbrechen());
    wrap.addEventListener("pointercancel", () => this._haltenAbbrechen());
    wrap.addEventListener("pointerleave", () => this._haltenAbbrechen());

    wrap.addEventListener("keydown", (ereignis) => {
      if (ereignis.key === "Enter" || ereignis.key === " ") {
        this._editOeffnen();
        ereignis.preventDefault();
      }
    });
  }

  _haltenAbbrechen() {
    if (this._haltenTimer) {
      clearTimeout(this._haltenTimer);
      this._haltenTimer = null;
    }
    this._fortschrittZuruecksetzen();
  }

  /** Macht sichtbar, dass laenger gehalten werden muss. */
  _fortschrittStarten() {
    if (!this._anzeigeLeiste) return;
    const balken = this._anzeigeLeiste.fortschritt;
    balken.style.transition = "none";
    balken.style.width = "0";
    void balken.offsetWidth; // Neuberechnung erzwingen, sonst startet die Animation nicht
    balken.style.transition = `width ${HALTEDAUER_MS}ms linear`;
    balken.style.width = "100%";
    this._anzeigeLeiste.wrap.classList.add("haelt");
  }

  _fortschrittZuruecksetzen() {
    if (!this._anzeigeLeiste) return;
    const balken = this._anzeigeLeiste.fortschritt;
    balken.style.transition = "width 140ms ease";
    balken.style.width = "0";
    this._anzeigeLeiste.wrap.classList.remove("haelt");
  }

  // --------------------------------------------------------- Bearbeitungsmodus

  _editOeffnen() {
    if (this._editBox) return;

    const box = document.createElement("div");
    box.className = "editbox";

    this._editLeiste = this._leisteErzeugen(RAND_BEARBEITEN_PX, true);
    box.appendChild(this._editLeiste.wrap);

    const zeile = document.createElement("div");
    zeile.className = "zeile";
    zeile.innerHTML =
      '<button type="button" data-schritt="-1" aria-label="Weniger">−</button>' +
      '<button type="button" data-schritt="1" aria-label="Mehr">+</button>';
    box.appendChild(zeile);

    const fertig = document.createElement("button");
    fertig.type = "button";
    fertig.className = "fertig";
    fertig.textContent = "Fertig";
    box.appendChild(fertig);

    this._el.karte.appendChild(box);
    this._editBox = box;

    let zieht = false;
    const clip = this._editLeiste.clip;

    clip.addEventListener("pointerdown", (ereignis) => {
      clip.setPointerCapture(ereignis.pointerId);
      zieht = true;
      this._vorschauSoll = this._editLeiste.wertAus(ereignis);
      this._werteSchreiben();
    });

    clip.addEventListener("pointermove", (ereignis) => {
      if (!zieht) return;
      this._vorschauSoll = this._editLeiste.wertAus(ereignis);
      this._werteSchreiben();
    });

    const loslassen = () => {
      if (!zieht) return;
      zieht = false;
      if (this._vorschauSoll !== null) this._sollSenden(this._vorschauSoll);
    };
    clip.addEventListener("pointerup", loslassen);
    clip.addEventListener("pointercancel", loslassen);

    box.addEventListener("click", (ereignis) => {
      const knopf = ereignis.target.closest("button");
      if (!knopf) return;
      if (knopf === fertig) {
        this._editSchliessen();
        return;
      }
      const richtung = Number(knopf.dataset.schritt);
      const basis = this._soll === null ? this._min : this._soll;
      this._sollSenden(this._rasten(basis + richtung * this._schritt));
    });

    this._aussenKlick = (ereignis) => {
      if (!ereignis.composedPath().includes(box)) this._editSchliessen();
    };
    setTimeout(() => document.addEventListener("pointerdown", this._aussenKlick, true), 0);

    this._werteSchreiben();
  }

  _editSchliessen() {
    if (!this._editBox) return;
    document.removeEventListener("pointerdown", this._aussenKlick, true);
    this._editBox.remove();
    this._editBox = null;
    this._editLeiste = null;
  }

  _sollSenden(wert) {
    this._vorschauSoll = wert;
    this._werteSchreiben();
    this._hass.callService("climate", "set_temperature", {
      entity_id: this._config.entity,
      temperature: wert
    });

    // Die optimistische Anzeige wird freigegeben, sobald das Geraet geantwortet
    // hat. Batteriegeraete melden verzoegert, deshalb grosszuegig bemessen.
    clearTimeout(this._freigabeTimer);
    this._freigabeTimer = setTimeout(() => {
      this._vorschauSoll = null;
      if (this._hass) this._werteSchreiben();
    }, 5000);
  }

  disconnectedCallback() {
    this._haltenAbbrechen();
    this._editSchliessen();
    clearTimeout(this._freigabeTimer);
    if (this._beobachter) {
      this._beobachter.disconnect();
      this._beobachter = null;
    }
  }
}

// ------------------------------------------------------------------- Editor

const EDITOR_SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "climate" } } },
  { name: "name", selector: { text: {} } },
  { name: "icon", selector: { icon: {} } },
  { name: "lock_entity", selector: { entity: { domain: ["switch", "lock", "input_boolean"] } } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "height", selector: { number: { min: 28, max: 120, step: 2, mode: "box" } } },
      { name: "edit_height", selector: { number: { min: 28, max: 120, step: 2, mode: "box" } } },
      { name: "edge_space", selector: { number: { min: 0, max: 160, step: 4, mode: "box" } } },
      { name: "tolerance", selector: { number: { min: 0, max: 2, step: 0.1, mode: "box" } } }
    ]
  },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "show_labels", selector: { boolean: {} } },
      { name: "show_status", selector: { boolean: {} } },
      { name: "show_icons", selector: { boolean: {} } },
      { name: "show_mode_labels", selector: { boolean: {} } }
    ]
  },
  {
    type: "expandable",
    name: "colors",
    title: "Farben",
    schema: Object.keys(STANDARDFARBEN).map((schluessel) => ({
      name: schluessel,
      selector: { text: {} }
    }))
  }
];

const EDITOR_BESCHRIFTUNGEN = {
  entity: "Thermostat",
  name: "Name",
  icon: "Symbol vor dem Namen",
  lock_entity: "Entitaet der Bedienungssperre",
  height: "Hoehe der Anzeigeleiste",
  edit_height: "Hoehe im Bearbeitungsmodus",
  edge_space: "Randbereich",
  tolerance: "Toleranz fuer Erreicht",
  show_labels: "Werte in der Leiste",
  show_status: "Statusanzeige",
  show_icons: "Symbole auf den Knoepfen",
  show_mode_labels: "Text auf den Knoepfen"
};

class ThermostatBarCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._zeichnen();
  }

  set hass(hass) {
    this._hass = hass;
    this._zeichnen();
  }

  _zeichnen() {
    if (!this._hass || !this._config) return;

    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (eintrag) =>
        EDITOR_BESCHRIFTUNGEN[eintrag.name] || eintrag.name;
      this._form.addEventListener("value-changed", (ereignis) => {
        this.dispatchEvent(
          new CustomEvent("config-changed", {
            detail: { config: ereignis.detail.value },
            bubbles: true,
            composed: true
          })
        );
      });
      this.appendChild(this._form);
    }

    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = this._config;
  }
}

customElements.define("thermostat-bar-card", ThermostatBarCard);
customElements.define("thermostat-bar-card-editor", ThermostatBarCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "thermostat-bar-card",
  name: "Thermostat Bar Card",
  description:
    "Waagerechte Thermostat-Karte mit Ist-Fuellung, Heizanforderung und Bearbeitungsmodus.",
  preview: true,
  documentationURL: "https://github.com/SvMo85/ha-thermostat-bar-card"
});
