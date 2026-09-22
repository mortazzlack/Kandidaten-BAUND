# Baund Pipeline

Recruiting-Pipeline-Tool für Baund Consulting: eine Karte pro Kandidat, mehrere
parallele Kunden-Kontakte mit Terminverlauf, To-Dos, Notizen und Deal-Tracking.

## Lokal starten

Keine Installation nötig – das Projekt nutzt bewusst nur Node-Bordmittel,
keine externen Pakete:

```bash
npm start
```

Dann im Browser `http://localhost:3000` öffnen. Beim ersten Start wird die
mitgelieferte `data.json` als Startdaten verwendet.

## Bei GitHub hochladen

Genau wie bei deinem bestehenden Kandidatenprofil-Tool:

```bash
git init
git add .
git commit -m "Erste Version Baund Pipeline"
```

Dann auf github.com ein neues, leeres Repository anlegen (ohne README/License,
die hast du schon) und den angezeigten Push-Befehlen folgen, z. B.:

```bash
git remote add origin https://github.com/<dein-name>/baund-pipeline.git
git branch -M main
git push -u origin main
```

## Bei Railway deployen

1. In Railway: "New Project" → "Deploy from GitHub repo" → das gerade
   erstellte Repo auswählen.
2. Railway erkennt automatisch, dass es sich um eine Node.js-App handelt
   (über `package.json`), installiert die Abhängigkeiten und startet sie mit
   `npm start`. Es ist keine weitere Konfiguration nötig.
3. Railway vergibt automatisch eine `*.up.railway.app`-URL – genau wie bei
   deinem bestehenden Tool.

## Wichtiger Hinweis zur Datenspeicherung

Diese erste Version speichert alle Daten in einer einzigen Datei
(`data.json`) direkt im Projektordner. Das ist bewusst einfach gehalten,
damit du sofort loslegen kannst – hat aber eine Einschränkung:

- **Solange die App läuft**, bleiben alle Änderungen (neue Kandidaten,
  Termine, To-Dos, Notizen) zuverlässig erhalten.
- **Bei einem Redeploy** (z. B. wenn du neuen Code pushst) baut Railway den
  Container neu auf, und die Datei wird auf den Stand aus dem Git-Repo
  zurückgesetzt – zwischenzeitlich eingetragene Daten gehen dann verloren.

Für den täglichen Gebrauch reicht das erstmal völlig aus, solange du nicht
laufend neuen Code deployst. Sobald du auf Dauerbetrieb gehst, ist der
nächste sinnvolle Schritt eine echte Datenbank (z. B. das kostenlose
Postgres-Plugin direkt in Railway) – das können wir nachrüsten, ohne die
Oberfläche neu bauen zu müssen.

## Projektstruktur

```
baund-pipeline/
├─ server.js        Express-Server + REST-API + Speicherlogik
├─ data.json         Kandidaten-Daten (Startdaten / persistenter Stand)
├─ package.json
└─ public/
   ├─ index.html     Oberfläche
   ├─ styles.css     Design (angelehnt an eure bestehende App)
   └─ app.js         Frontend-Logik, spricht die REST-API an
```

## API-Übersicht

| Methode | Pfad                                              | Zweck                              |
|---------|----------------------------------------------------|-------------------------------------|
| GET     | `/api/candidates?archived=false`                   | Kandidaten laden                    |
| POST    | `/api/candidates`                                   | Neuen Kandidaten anlegen            |
| PATCH   | `/api/candidates/:id`                               | Kandidat bearbeiten / archivieren   |
| POST    | `/api/candidates/:id/clients`                       | Kunden-Präsentation hinzufügen      |
| PATCH   | `/api/candidates/:id/clients/:idx`                  | Status eines Kunden ändern          |
| POST    | `/api/candidates/:id/clients/:idx/events`           | Termin hinzufügen                   |
| POST    | `/api/candidates/:id/clients/:idx/deal`             | Deal eintragen (Value/Start/Frist)  |
| POST    | `/api/candidates/:id/todos`                         | To-Do hinzufügen                    |
| PATCH   | `/api/candidates/:id/todos/:idx`                    | To-Do abhaken                       |
| POST    | `/api/candidates/:id/notes`                         | Notiz hinzufügen                    |
