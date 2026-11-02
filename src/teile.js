/**
 * Baut die Methoden der Teile in eine Klasse ein. So bleibt die Karte ein
 * Element, ihr Code liegt aber je Thema in einer eigenen Datei.
 */
export function teileEinbauen(ziel, ...teile) {
  teile.forEach((teil) => {
    Object.getOwnPropertyNames(teil.prototype)
      .filter((name) => name !== "constructor")
      .forEach((name) => Object.defineProperty(ziel.prototype, name, Object.getOwnPropertyDescriptor(teil.prototype, name)));
  });
}
