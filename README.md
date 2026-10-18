# Thermostat Bar Card

Waagerechte Thermostat-Karte für Home Assistant. Die Füllung zeigt die Ist-Temperatur, die farbige Fläche bis zur Markierung die Heizanforderung, und die ziehbare Markierung setzt die Solltemperatur.

Entstanden, weil die eingebaute Thermostat-Karte ihren Rundregler zugleich als Bedienfläche nutzt: Wird sie flach genug für ein Dashboard, ist sie am Telefon nicht mehr zu treffen. Eine Leiste trennt beides — sie bleibt flach und behält fingergerechte Bedienflächen.

## Bedienung

Die Leiste in der Karte ist **reine Anzeige**. Sie fängt keine Wischgeste ab, deshalb lässt sich über einem Dashboard voller solcher Karten ungestört scrollen, ohne versehentlich eine Temperatur zu verstellen.

- **600 ms halten** öffnet den Bearbeitungsmodus. Bewegt sich der Finger vorher um mehr als sechs Pixel, bricht die Geste ab.
- Im Bearbeitungsmodus erscheint dieselbe Leiste noch einmal, dort **ziehbar**, darunter große **Plus- und Minus-Flächen** und ein **Fertig**-Knopf.
- Schließen durch Tippen daneben oder über **Fertig**.
- Über Tastatur: Leiste fokussieren, dann Eingabe oder Leertaste.

## Installation

### Über HACS

1. HACS öffnen, oben rechts das Menü, **Custom repositories**
2. `https://github.com/SvMo85/ha-thermostat-bar-card` eintragen, Kategorie **Dashboard**
3. Die Karte herunterladen
4. Browser mit Strg+Shift+F5 neu laden

### Von Hand

1. `dist/thermostat-bar-card.js` nach `config/www/` kopieren
2. Unter Einstellungen > Dashboards > Ressourcen eintragen:
   `/local/thermostat-bar-card.js` als **JavaScript-Modul**
3. Browser neu laden

## Verwendung

Eine Karte mit nur `type` und `entity` ist vollständig funktionsfähig. Minimum, Maximum und Schrittweite liest die Karte aus der Entität.

```yaml
type: custom:thermostat-bar-card
entity: climate.thermostat_kinderzimmer
```

Mit allen gebräuchlichen Optionen:

```yaml
type: custom:thermostat-bar-card
entity: climate.thermostat_kinderzimmer
name: Kinderzimmer
icon: mdi:radiator
lock_entity: lock.thermostat_kinderzimmer_button_lock
height: 44
edit_height: 56
edge_space: 60
tolerance: 0.2
show_labels: true
show_status: true
show_icons: true
show_mode_labels: true
hvac_modes:
  - mode: auto
  - mode: heat
    label: ""
  - mode: "off"
    label: Aus
colors:
  current: "#4a7f9e"
  demand: "#7d4226"
  target: "#e8a33d"
```

## Konfiguration

| Schlüssel | Vorgabe | Wirkung |
|---|---|---|
| `entity` | — | Klima-Entität, Pflichtfeld |
| `name` | Name der Entität | Überschrift der Karte |
| `icon` | `mdi:radiator` | Symbol vor dem Namen. Leer lassen, um es wegzulassen |
| `lock_entity` | — | Entität der Bedienungssperre. Fehlt sie, erscheint kein Schloss |
| `height` | `44` | Höhe der Anzeigeleiste in Pixel, entspricht der Knopfhöhe |
| `edit_height` | `56` | Höhe der Leiste im Bearbeitungsmodus |
| `edge_space` | `60` | Freier Rand links und rechts, in den die Beschriftungen auswandern dürfen |
| `tolerance` | `0.2` | Ab welcher Abweichung in Kelvin der Status auf "Erreicht" wechselt |
| `show_labels` | `true` | Ist- und Soll-Werte in der Leiste |
| `show_status` | `true` | Statusanzeige oben rechts |
| `show_icons` | `true` | Symbole auf den Modus-Knöpfen |
| `show_mode_labels` | `true` | Text auf den Modus-Knöpfen |
| `hvac_modes` | alle vom Gerät gemeldeten | Welche Knöpfe erscheinen und in welcher Reihenfolge |
| `colors` | siehe unten | Farben der Karte |

Minimum, Maximum und Schrittweite sind bewusst **nicht** konfigurierbar. Sie stammen aus `min_temp`, `max_temp` und `target_temp_step` der Entität, damit die Leiste nie etwas anbietet, das das Gerät nicht annimmt.

### hvac_modes

Entweder als einfache Liste von Modusnamen, oder ausführlich mit eigener Beschriftung und eigenem Symbol:

```yaml
hvac_modes:
  - mode: auto
    label: Automatik
    icon: mdi:calendar-clock
  - mode: heat
    label: ""          # leer lassen: nur das Symbol
  - mode: "off"
```

Ohne `label` nimmt die Karte die Übersetzung von Home Assistant und folgt damit der eingestellten Sprache. Sind `label` leer und `show_icons: false`, bliebe der Knopf leer — in dem Fall zeigt die Karte den Text.

### Farben

Jeder Wert nimmt eine beliebige CSS-Farbangabe an, also auch Theme-Variablen wie `var(--primary-color)`.

| Schlüssel | Vorgabe | Wirkung |
|---|---|---|
| `track` | `var(--divider-color)` | Hintergrund der Leiste |
| `current` | `#4a7f9e` | Füllung bis zur Ist-Temperatur |
| `demand` | `#7d4226` | Fläche zwischen Ist und Soll beim Heizen |
| `target` | `#e8a33d` | Strich und Greifpunkt |
| `label_current` | `#dde7ee` | Ist-Beschriftung |
| `label_target` | `#e8a33d` | Soll-Beschriftung |
| `status_heating` | `#e8663d` | Status, solange geheizt wird |
| `status_reached` | `#4caf50` | Status, wenn die Solltemperatur erreicht ist |
| `status_idle` | `var(--secondary-text-color)` | Status sonst |
| `mode_auto` | `#4caf50` | Knopf Auto, ausgewählt |
| `mode_heat` | `#e8663d` | Knopf Heizen, ausgewählt |
| `mode_off` | `#3d5f7a` | Knopf Aus, ausgewählt |
| `mode_inactive` | `var(--divider-color)` | Rahmen der nicht ausgewählten Knöpfe |
| `lock_active` | `#c06a6a` | Schloss, wenn die Bedienung gesperrt ist |

## Hinweis zu Homematic IP

Die Karte ändert beim Verstellen der Temperatur **nicht** den Betriebsmodus. Das ist Absicht: Homematic-IP-Thermostate behalten einen im Automatikbetrieb gesetzten Wert bis zum nächsten Schaltzeitpunkt des Heizprofils bei und kehren danach ins Profil zurück. Wer einen Wert dauerhaft halten will, schaltet über den Knopf auf Heizen.

Die Bedienungssperre am Gerät ist bei Homematic IP ein eigener Geräteparameter und keine Eigenschaft der Klima-Entität. Die passende Schalter-Entität gehört deshalb in `lock_entity`.

## Lizenz

MIT
