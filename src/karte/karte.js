import { dunkler, heizflaecheVerlauf } from "../farben.js";
import { BedienungTeil } from "./bedienung.js";
import { karteStil } from "./stil.js";
import { BESCHRIFTUNGSLUECKE_PX, GREIFPUNKT_RADIUS_PX, KARTEN_VORGABEN, MODUS_SYMBOLE, STANDARDFARBEN, TAGESPLAN_VORGABEN, UHR_TAKT_MS } from "../konstanten.js";
import { TagesplanTeil } from "../tagesplan/zeichnung.js";
import { teileEinbauen } from "../teile.js";

export class ThermostatBarCard extends HTMLElement {
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
    this._verlauf = [];
    this._verlaufGeladenAm = 0;
    this._verlaufLaedt = false;
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Es muss eine Klima-Entität angegeben werden.");
    }
    if (!config.entity.startsWith("climate.")) {
      throw new Error("entity muss aus der Domäne climate stammen.");
    }

    const farben = { ...STANDARDFARBEN, ...(config.colors || {}) };
    if (!farben.demand) farben.demand = heizflaecheVerlauf(farben.current, farben.demand_glow);
    if (!farben.target_heating) farben.target_heating = dunkler(farben.demand_glow, 80);

    this._config = {
      ...KARTEN_VORGABEN,
      ...config,
      colors: farben,
      schedule: { ...TAGESPLAN_VORGABEN, ...(config.schedule || {}) }
    };

    if (this._config.entity !== (this._verlaufEntitaet || this._config.entity)) this._verlauf = [];
    this._verlaufEntitaet = this._config.entity;
    this._verlaufGeladenAm = 0;
    this._aufgebaut = false;
    if (this._hass) this._zeichnen();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._profilBlatt && this._profilBlatt.isConnected) this._profilBlatt.hass = hass;
    if (!this._config) return;
    this._zeichnen();
    this._verlaufBeiBedarfLaden();
  }

  getCardSize() {
    return this._tagesplanSichtbar ? 4 : 3;
  }

  connectedCallback() {
    // Der Zeitstrich wandert, auch wenn sich am Geraet nichts aendert.
    clearInterval(this._uhr);
    this._uhr = setInterval(() => {
      if (this._hass && this._el) this._planZeichnen();
      this._verlaufBeiBedarfLaden();
    }, UHR_TAKT_MS);
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

  get _planDaten() {
    return this._zustand.attributes.schedule_data || null;
  }

  get _tagesplanSichtbar() {
    return Boolean(this._config && this._config.schedule.show && this._hass && this._zustand && this._planDaten);
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

  /**
   * Wochentag und Minute in der Zeitzone von Home Assistant. Das Heizprofil
   * laeuft auf dem Geraet nach der Uhr der Zentrale, nicht nach der des Browsers.
   */
  _jetzt() {
    const zeitzone = this._hass.config && this._hass.config.time_zone;
    const optionen = { weekday: "long", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" };
    let teile;
    try {
      teile = new Intl.DateTimeFormat("en-US", { ...optionen, timeZone: zeitzone }).formatToParts(new Date());
    } catch (fehler) {
      teile = new Intl.DateTimeFormat("en-US", optionen).formatToParts(new Date());
    }
    const teil = (typ) => (teile.find((t) => t.type === typ) || {}).value;
    return {
      tag: String(teil("weekday")).toUpperCase(),
      minute: Number(teil("hour")) * 60 + Number(teil("minute")) + Number(teil("second")) / 60
    };
  }

  // ----------------------------------------------------------------- Aufbau

  _zeichnen() {
    if (!this._zustand) {
      this.shadowRoot.innerHTML =
        `<ha-card><div style="padding:16px">Entität ${this._config.entity} nicht gefunden.</div></ha-card>`;
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
    // Ein offener Bearbeitungsmodus gehoert zum alten Aufbau und muss weg,
    // sonst blockiert sein Zustand das naechste Oeffnen.
    this._editSchliessen();

    const c = this._config;
    const f = c.colors;

    this.shadowRoot.innerHTML = `
      ${karteStil(c, f)}

      <ha-card>
        <div class="head">
          <span class="head-left">
            ${c.lock_entity ? '<button type="button" class="lock" aria-pressed="false"></button>' : ""}
            ${c.icon ? `<ha-icon class="namensymbol" icon="${c.icon}"></ha-icon>` : ""}
            <span class="name"></span>
          </span>
          ${c.show_status ? '<span class="status"><ha-icon></ha-icon><span class="stext"></span></span>' : ""}
        </div>
        <div class="instrument">
          <div class="tagesplan" role="button" tabindex="0" aria-label="Heizprofil bearbeiten">
            <div class="tp-clip">
              <div class="tp-marken"></div>
              <svg class="tp-kurve"></svg>
              <div class="haltefortschritt"></div>
            </div>
            <div class="tp-jetzt"></div>
          </div>
          <div class="modes"></div>
        </div>
      </ha-card>
    `;

    this._el = {
      karte: this.shadowRoot.querySelector("ha-card"),
      name: this.shadowRoot.querySelector(".name"),
      lock: this.shadowRoot.querySelector(".lock"),
      status: this.shadowRoot.querySelector(".status"),
      instrument: this.shadowRoot.querySelector(".instrument"),
      plan: this.shadowRoot.querySelector(".tagesplan"),
      modes: this.shadowRoot.querySelector(".modes")
    };

    this._anzeigeLeiste = this._leisteErzeugen(this._config.edge_space, false);
    this._el.instrument.insertBefore(this._anzeigeLeiste.wrap, this._el.modes);

    // Halten auf der Leiste stellt die Temperatur ein, Halten auf dem
    // Tagesplan oeffnet das Heizprofil.
    this._haltenBinden(this._anzeigeLeiste.wrap, this._anzeigeLeiste.fortschritt, () => this._editOeffnen());
    this._haltenBinden(this._el.plan, this._el.plan.querySelector(".haltefortschritt"), () => this._profilOeffnen());
    this._modiBauen();

    if (this._el.lock) {
      this._el.lock.addEventListener("click", () => this._sperreUmschalten());
    }

    if (this._beobachter) this._beobachter.disconnect();
    this._beobachter = new ResizeObserver(() => this._werteSchreiben());
    this._beobachter.observe(this._anzeigeLeiste.wrap);
    this._beobachter.observe(this._el.plan);
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
        <div class="haltefortschritt"></div>
      </div>
      <div class="markerline"></div>
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
      const strichPx = Math.round(sollPx);

      fill.style.width = `${istPx}px`;
      linie.style.left = `${strichPx}px`;
      punkt.style.left = `${strichPx}px`;

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
    if (!el || !z) return;

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
    this._planZeichnen();
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
      gesperrt ? "Bedienung am Gerät gesperrt" : "Bedienung am Gerät möglich"
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

  disconnectedCallback() {
    this._haltenAbbrechen();
    this._editSchliessen();
    if (this._profilBlatt) this._profilBlatt.schliessen();
    clearTimeout(this._freigabeTimer);
    clearInterval(this._uhr);
    if (this._beobachter) {
      this._beobachter.disconnect();
      this._beobachter = null;
    }
  }
}

teileEinbauen(ThermostatBarCard, TagesplanTeil, BedienungTeil);
