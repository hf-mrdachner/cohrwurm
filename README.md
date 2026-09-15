# CohrWurm

Ein persönlicher, deutschsprachiger Morsecode-(CW)-Trainer nach der Koch-Methode – für Funkamateure, die das Hören und Geben von Morsezeichen üben wollen.

73 de DA6CHI

CohrWurm ist absichtlich schlank gehalten: keine Build-Pipeline, keine Server-Logik über das reine Ausliefern von Dateien hinaus, kein Login. Der Lernfortschritt wird nur lokal im Browser (`localStorage`) gespeichert.

## Features

- **Koch-Methode**: Zeichen werden nacheinander in fester, bewährter Reihenfolge freigeschaltet (LCWO.net-Sequenz), nicht alphabetisch.
- **Adaptive Schwierigkeit**: Anhand der letzten Versuche pro Zeichen werden Geschwindigkeit und Zeichenumfang automatisch gesteigert, sobald ~90 % Trefferquote erreicht ist.
- **Drei Übungsmodi**:
  - **Hören** (Copy) – live mittippen, während Audio abgespielt wird. Einziger Modus, der den Lernfortschritt (Koch-Aufstieg) beeinflusst.
  - **Geben** (Send) – per Leertaste oder virtueller Taste selbst morsen, Dits/Dahs werden per Timing erkannt.
  - **Karteikarten** (Flash) – einzelnes Zeichen hören, passenden Buchstaben klicken.
- **Reiner Web-Audio-Sound**, keine Audiodateien.
- **Hell/Dunkel-Theme** inkl. System-Präferenz.

## Schnellstart

Keine Abhängigkeiten, kein `npm install` nötig, um die App zu starten:

```
node server.js
```

Läuft danach auf `http://localhost:8080` (mit `PORT=xxxx node server.js` anpassbar).

`index.html` lädt `logic.mjs` als ES-Modul – die App muss daher über HTTP ausgeliefert werden (`node server.js`); direktes Öffnen der `index.html` per `file://` funktioniert wegen CORS-Restriktionen bei Modul-Imports nicht.

## Entwicklung (optional)

Linting und Tests sind eine separate, optionale Ebene mit eigenen Abhängigkeiten:

```
npm install
npm run lint
npm test
```

- `npm run lint` – ESLint (flat config), inklusive des Inline-Scripts in `index.html`.
- `npm test` – `node --test` gegen `logic.mjs` (`logic.test.mjs`).

Für die App selbst ist beides nicht erforderlich.

## Architektur

Kurzüberblick, Details siehe [`CLAUDE.md`](./CLAUDE.md):

- `logic.mjs` – reine Morse-/Koch-Daten und adaptive Lernlogik, ohne DOM- oder Web-Audio-Abhängigkeit, unit-getestet.
- `index.html` – HTML-Grundgerüst, Styles und das gesamte UI/Audio/Persistenz-Verhalten als inline `<script type="module">`.
- `server.js` – minimaler, abhängigkeitsfreier statischer Dateiserver ohne weitere Logik.

## Mitmachen

Issues und Pull Requests sind willkommen – siehe [`CONTRIBUTING.md`](./CONTRIBUTING.md) für Setup, Konventionen und Ablauf.

## Lizenz

[MIT](./LICENSE)
