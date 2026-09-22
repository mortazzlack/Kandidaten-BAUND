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

### Lösung: Railway Volume (empfohlen als schneller nächster Schritt)

Ein Volume ist ein persistenter Speicherbereich, der Redeploys übersteht.
Der Server unterstützt das bereits über die Umgebungsvariable `DATA_FILE`
– du musst dafür nichts programmieren, nur in Railway einrichten:

1. Im Railway-Projekt auf deinen Service klicken, dann oben den Reiter
   **"Volumes"** öffnen (teils unter "Settings" zu finden, je nach
   Railway-Version).
2. **"+ New Volume"** (oder "Add Volume") klicken.
3. Als **Mount Path** `/data` eintragen und speichern. Railway legt jetzt
   bei jedem Deploy ein Verzeichnis `/data` an, das dauerhaft erhalten
   bleibt (unabhängig vom Code-Container).
4. Zum Service unter **"Variables"** eine neue Umgebungsvariable anlegen:
   - Name: `DATA_FILE`
   - Wert: `/data/data.json`
5. Einmal neu deployen (z. B. "Redeploy" klicken, oder einfach den nächsten
   `git push` abwarten).

Ab jetzt schreibt und liest der Server `data.json` aus `/data` statt aus
dem Projektordner. Der erste Start befüllt diese Datei einmalig mit den
mitgelieferten Beispieldaten (`data.seed.json`), danach bleiben alle
Änderungen unabhängig davon erhalten, wie oft du neuen Code pushst.

**Wichtig:** Volumes bei Railway sind aktuell auf **einen** Service/eine
Instanz begrenzt (kein horizontales Skalieren) – für deinen Anwendungsfall
(ein Nutzer, eine Instanz) ist das aber genau richtig.

## Projektstruktur

```
baund-pipeline/
├─ server.js        Node-HTTP-Server (ohne Dependencies) + REST-API + Speicherlogik
├─ data.json         Kandidaten-Daten (lokaler/persistenter Stand ohne Volume)
├─ data.seed.json    Beispieldaten, mit denen ein frisches Volume befüllt wird
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
| DELETE  | `/api/candidates/:id`                               | Kandidat endgültig löschen          |
| POST    | `/api/candidates/:id/clients`                       | Kunden-Präsentation hinzufügen      |
| PATCH   | `/api/candidates/:id/clients/:idx`                  | Status und/oder Name eines Kunden ändern |
| DELETE  | `/api/candidates/:id/clients/:idx`                  | Kunden von Kandidat entfernen       |
| POST    | `/api/candidates/:id/clients/:idx/events`           | Termin hinzufügen                   |
| PATCH   | `/api/candidates/:id/clients/:idx/events/:eventIdx` | Termin bearbeiten                   |
| DELETE  | `/api/candidates/:id/clients/:idx/events/:eventIdx` | Termin löschen (mind. 1 muss bleiben)|
| POST    | `/api/candidates/:id/clients/:idx/deal`             | Deal eintragen (Value/Start/Frist)  |
| POST    | `/api/candidates/:id/todos`                         | To-Do hinzufügen                    |
| PATCH   | `/api/candidates/:id/todos/:idx`                    | To-Do abhaken                       |
| POST    | `/api/candidates/:id/notes`                         | Notiz hinzufügen                    |
