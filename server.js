// Baund Pipeline – schlanker Server ohne externe Abhängigkeiten (nur Node-Bordmittel).
// Speicherung in einer JSON-Datei (siehe README für die Grenzen davon und den
// Umstieg auf eine echte Datenbank, sobald mehr Dauerbetrieb gefragt ist).

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
// DATA_FILE kann per Umgebungsvariable auf einen persistenten Speicherort
// zeigen (z. B. ein Railway-Volume unter /data/data.json), damit die Daten
// einen Redeploy überleben. Ohne die Variable bleibt alles wie bisher.
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const SEED_FILE = path.join(__dirname, "data.seed.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// ---------- Speicher-Hilfsfunktionen ----------

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    // Erster Start an diesem Speicherort (z. B. frisch angelegtes Volume):
    // mit den mitgelieferten Beispieldaten befüllen, falls vorhanden.
    const seed = fs.existsSync(SEED_FILE)
      ? fs.readFileSync(SEED_FILE, "utf8")
      : JSON.stringify({ candidates: [], nextId: 1 }, null, 2);
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, seed);
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function touch(candidate) {
  candidate.lastUpdated = todayISO();
}

function findCandidate(data, id) {
  return data.candidates.find((c) => String(c.id) === String(id));
}

function deriveStatusFromEvent(label, dateISO) {
  if (/absage/i.test(label)) return "abgesagt";
  if (/deal|angebot angenommen/i.test(label)) return "deal";
  const eventDate = new Date(dateISO);
  const today = new Date(todayISO());
  return eventDate > today ? "ausstehend" : "erfolgt";
}

// ---------- kleines Routing ----------

const routes = [];
function route(method, pattern, handler) {
  // pattern e.g. "/api/candidates/:id/clients/:idx/events"
  const paramNames = [];
  const regex = new RegExp(
    "^" +
      pattern
        .split("/")
        .map((seg) => {
          if (seg.startsWith(":")) {
            paramNames.push(seg.slice(1));
            return "([^/]+)";
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("/") +
      "$"
  );
  routes.push({ method, regex, paramNames, handler });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(pathname);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
  }
  return null;
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = "";
    req.on("data", (c) => (chunks += c));
    req.on("end", () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (e) {
        reject(new Error("Ungültiges JSON im Request-Body."));
      }
    });
    req.on("error", reject);
  });
}

// ---------- Kandidaten ----------

route("GET", "/api/candidates", (req, res, params, query) => {
  const data = readData();
  const archived = query.get("archived") === "true";
  send(res, 200, data.candidates.filter((c) => !!c.archived === archived));
});

route("POST", "/api/candidates", async (req, res) => {
  const data = readData();
  const body = await readBody(req);
  if (!body.name || !body.name.trim()) return send(res, 400, { error: "Name ist erforderlich." });

  const candidate = {
    id: data.nextId++,
    name: body.name.trim(),
    role: (body.role || "").trim(),
    archived: false,
    lastUpdated: todayISO(),
    clients: [],
    todos: [],
    notes: [],
  };
  data.candidates.push(candidate);
  writeData(data);
  send(res, 201, candidate);
});

route("PATCH", "/api/candidates/:id", async (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  const body = await readBody(req);

  if (typeof body.archived === "boolean") candidate.archived = body.archived;
  if (typeof body.name === "string") candidate.name = body.name.trim();
  if (typeof body.role === "string") candidate.role = body.role.trim();
  touch(candidate);
  writeData(data);
  send(res, 200, candidate);
});

route("DELETE", "/api/candidates/:id", (req, res, params) => {
  const data = readData();
  const idx = data.candidates.findIndex((c) => String(c.id) === String(params.id));
  if (idx === -1) return send(res, 404, { error: "Kandidat nicht gefunden." });
  data.candidates.splice(idx, 1);
  writeData(data);
  res.writeHead(204);
  res.end();
});

// ---------- Kunden-Kontakte ----------

route("POST", "/api/candidates/:id/clients", async (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  const body = await readBody(req);
  if (!body.name || !body.name.trim()) return send(res, 400, { error: "Kundenname ist erforderlich." });

  candidate.clients.push({
    name: body.name.trim(),
    status: "vorgestellt",
    events: [{ date: todayISO(), label: "Vorgestellt" }],
  });
  touch(candidate);
  writeData(data);
  send(res, 201, candidate);
});

route("PATCH", "/api/candidates/:id/clients/:idx", async (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  const client = candidate.clients[params.idx];
  if (!client) return send(res, 404, { error: "Kunde nicht gefunden." });
  const body = await readBody(req);

  if (typeof body.status === "string") client.status = body.status;
  if (typeof body.name === "string" && body.name.trim()) client.name = body.name.trim();
  touch(candidate);
  writeData(data);
  send(res, 200, candidate);
});

route("DELETE", "/api/candidates/:id/clients/:idx", (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  if (!candidate.clients[params.idx]) return send(res, 404, { error: "Kunde nicht gefunden." });

  candidate.clients.splice(params.idx, 1);
  touch(candidate);
  writeData(data);
  send(res, 200, candidate);
});

route("POST", "/api/candidates/:id/clients/:idx/events", async (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  const client = candidate.clients[params.idx];
  if (!client) return send(res, 404, { error: "Kunde nicht gefunden." });
  const body = await readBody(req);

  if (!body.date || !body.label) return send(res, 400, { error: "Datum und Bezeichnung sind erforderlich." });

  const event = { date: body.date, label: String(body.label).trim() };
  if (body.time) event.time = body.time;
  client.events.push(event);
  client.status = deriveStatusFromEvent(body.label, body.date);
  touch(candidate);
  writeData(data);
  send(res, 201, candidate);
});

route("PATCH", "/api/candidates/:id/clients/:idx/events/:eventIdx", async (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  const client = candidate.clients[params.idx];
  if (!client) return send(res, 404, { error: "Kunde nicht gefunden." });
  const event = client.events[params.eventIdx];
  if (!event) return send(res, 404, { error: "Termin nicht gefunden." });
  const body = await readBody(req);

  if (!body.date || !body.label) return send(res, 400, { error: "Datum und Bezeichnung sind erforderlich." });
  event.date = body.date;
  event.label = String(body.label).trim();
  if (body.time) event.time = body.time;
  else delete event.time;

  // Status anhand des jetzt letzten Termins neu ableiten (chronologisch letzter Eintrag in der Liste)
  const last = client.events[client.events.length - 1];
  if (client.status !== "deal") client.status = deriveStatusFromEvent(last.label, last.date);
  touch(candidate);
  writeData(data);
  send(res, 200, candidate);
});

route("DELETE", "/api/candidates/:id/clients/:idx/events/:eventIdx", (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  const client = candidate.clients[params.idx];
  if (!client) return send(res, 404, { error: "Kunde nicht gefunden." });
  if (!client.events[params.eventIdx]) return send(res, 404, { error: "Termin nicht gefunden." });
  if (client.events.length <= 1) return send(res, 400, { error: "Ein Kunde braucht mindestens einen Termin – lösche stattdessen den ganzen Kunden." });

  client.events.splice(params.eventIdx, 1);
  const last = client.events[client.events.length - 1];
  if (client.status !== "deal") client.status = deriveStatusFromEvent(last.label, last.date);
  touch(candidate);
  writeData(data);
  send(res, 200, candidate);
});

route("POST", "/api/candidates/:id/clients/:idx/deal", async (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  const client = candidate.clients[params.idx];
  if (!client) return send(res, 404, { error: "Kunde nicht gefunden." });
  const body = await readBody(req);

  client.status = "deal";
  client.value = Number(body.value) || 0;
  client.start = body.start || "";
  client.refund = body.refund || "";
  client.events.push({ date: todayISO(), label: "Angebot angenommen – Deal vereinbart" });
  touch(candidate);
  writeData(data);
  send(res, 201, candidate);
});

// ---------- To-Dos ----------

route("POST", "/api/candidates/:id/todos", async (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  const body = await readBody(req);
  if (!body.text || !body.text.trim()) return send(res, 400, { error: "Text ist erforderlich." });

  candidate.todos.push({ text: body.text.trim(), done: false, created: todayISO() });
  touch(candidate);
  writeData(data);
  send(res, 201, candidate);
});

route("PATCH", "/api/candidates/:id/todos/:idx", async (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  const todo = candidate.todos[params.idx];
  if (!todo) return send(res, 404, { error: "To-Do nicht gefunden." });
  const body = await readBody(req);

  if (typeof body.done === "boolean") todo.done = body.done;
  touch(candidate);
  writeData(data);
  send(res, 200, candidate);
});

// ---------- Notizen ----------

route("POST", "/api/candidates/:id/notes", async (req, res, params) => {
  const data = readData();
  const candidate = findCandidate(data, params.id);
  if (!candidate) return send(res, 404, { error: "Kandidat nicht gefunden." });
  const body = await readBody(req);
  if (!body.text || !body.text.trim()) return send(res, 400, { error: "Text ist erforderlich." });

  candidate.notes.unshift({ text: body.text.trim(), created: todayISO() });
  touch(candidate);
  writeData(data);
  send(res, 201, candidate);
});

// ---------- statische Dateien (public/) ----------

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = path.join(PUBLIC_DIR, filePath);

  // Verzeichnis-Traversal verhindern
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + req.headers.host);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    const match = matchRoute(req.method, pathname);
    if (!match) return send(res, 404, { error: "Unbekannter Endpunkt." });
    try {
      await match.handler(req, res, match.params, url.searchParams);
    } catch (e) {
      send(res, 400, { error: e.message || "Unerwarteter Fehler." });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Baund Pipeline läuft auf Port ${PORT}`);
});
