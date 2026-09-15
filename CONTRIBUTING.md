# Contributing

Danke für dein Interesse an CohrWurm! Issues und Pull Requests sind willkommen.

## Bevor du loslegst

- **Kleine Fixes** (Tippfehler, offensichtliche Bugs, kleine UI-Korrekturen): einfach einen PR aufmachen.
- **Größere Änderungen** (neue Übungsmodi, andere Adaptions-Logik, Architektur-Änderungen): bitte vorher ein Issue aufmachen und kurz das Vorgehen abstimmen, bevor du Zeit in die Umsetzung steckst. Das ist ein Hobby-Projekt mit klaren Design-Entscheidungen (siehe [`CLAUDE.md`](./CLAUDE.md)) – manche Ideen passen bewusst nicht rein.

## Setup

```
npm install
npm run lint
npm test
```

Die App selbst braucht dafür nichts (`node server.js` reicht), aber für einen PR müssen Lint und Tests grün sein – das prüft auch die CI (`.github/workflows/ci.yml`) automatisch bei jedem Push/PR.

## Woran sich orientieren

- Architektur, Datenflüsse und die Begründung hinter bestehenden Entscheidungen stehen in [`CLAUDE.md`](./CLAUDE.md) – bitte vor größeren Änderungen lesen.
- `logic.mjs` bleibt frei von DOM-/Web-Audio-Abhängigkeiten und wird über `logic.test.mjs` unit-getestet. Neue reine Logik gehört dort hinein, inklusive Tests.
- Der Runtime-Teil der App (`index.html`, `server.js`) bleibt abhängigkeitsfrei und zero-install – keine neuen Runtime-`npm`-Pakete ohne vorherige Absprache. Dev-Tooling-Abhängigkeiten (Lint/Test) sind unkritischer, aber auch da: sparsam bleiben.
- Bestehenden Code-Stil übernehmen (siehe ESLint-Config), keine großflächigen Neuformatierungen in fachlichen PRs.

## Pull Requests

- Ein PR = ein zusammenhängendes Thema. Lieber mehrere kleine PRs als einen riesigen.
- Kurze, aussagekräftige Beschreibung: was ändert sich und warum (nicht nur "was").
- Commit-Messages: kurzer Imperativ-Satz als Zusammenfassung (siehe `git log` für Beispiele aus der Historie).
- Lint (`npm run lint`) und Tests (`npm test`) müssen lokal grün sein, bevor du den PR aufmachst.
- Für neue Logik in `logic.mjs`: passende Tests in `logic.test.mjs` ergänzen.

## Review

Reviews mache ich (der Maintainer) in meiner Freizeit – keine feste Reaktionszeit, aber ich schau mir jeden PR an. Rückfragen oder Änderungswünsche sind normal, kein Grund zur Sorge.

## Verhalten

Sachlich, respektvoll, konstruktiv – wie in jedem guten Open-Source-Projekt. Bei Uneinigkeit über eine Design-Entscheidung: das Issue ist der richtige Ort dafür, nicht der PR.
