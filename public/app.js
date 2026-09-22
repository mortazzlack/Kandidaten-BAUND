(function () {
  "use strict";

  var STALE_DAYS = 4;
  var COMPANY_COLORS = ["var(--teal)", "var(--blue)", "var(--plum)", "var(--rust)"];
  var statusLabel = { vorgestellt: "Vorgestellt", ausstehend: "Interview ausstehend", erfolgt: "Interview erfolgt", abgesagt: "Abgesagt", deal: "Deal" };

  var wall = document.getElementById("wall");
  var jumpRow = document.getElementById("jumpRow");

  var state = {
    candidates: [],
    view: "active",
    onlyAlerts: false,
    search: "",
    expanded: {},
    addingClient: {},
    addingEvent: {},
    addingDeal: {},
    addingTodo: {},
    addingNote: {},
  };

  // ---------- helpers ----------

  function initials(n) { return n.split(" ").map(function (p) { return p[0]; }).join("").slice(0, 2).toUpperCase(); }
  function eur(n) { return Number(n || 0).toLocaleString("de-DE") + " €"; }
  function fmtDate(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function daysAgo(iso) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var d = new Date(iso + "T00:00:00");
    return Math.round((today - d) / 86400000);
  }
  function isStale(c) { return daysAgo(c.lastUpdated) >= STALE_DAYS; }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function companyColor(c, name) {
    var idx = c.clients.map(function (cl) { return cl.name; }).indexOf(name);
    return COMPANY_COLORS[((idx % COMPANY_COLORS.length) + COMPANY_COLORS.length) % COMPANY_COLORS.length];
  }
  function latestEvent(cl) { return cl.events[cl.events.length - 1]; }

  async function api(method, url, body) {
    var res = await fetch(url, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error(err.error || ("Fehler " + res.status));
    }
    return res.status === 204 ? null : res.json();
  }

  // ---------- data loading ----------

  async function loadCandidates() {
    var res = await fetch("/api/candidates?archived=" + (state.view === "archived"));
    state.candidates = await res.json();
    render();
  }

  // ---------- render pieces ----------

  function clientRowHtml(c, cl) {
    var ev = latestEvent(cl);
    var dateText = ev.time ? fmtDate(ev.date) + " · " + ev.time + " Uhr" : fmtDate(ev.date);
    return '<div class="client-row">' +
      '<span class="c-dot" style="background:' + companyColor(c, cl.name) + '"></span>' +
      '<div class="cinfo"><div class="cname">' + cl.name + '</div>' +
      '<div class="cdate">' + dateText + '</div>' +
      (ev.time ? '' : '<div class="cformat">' + ev.label + '</div>') +
      '</div>' +
      '<span class="status-chip ' + cl.status + '">' + statusLabel[cl.status] + '</span>' +
      '</div>';
  }

  function timelineHtml(c) {
    var events = [];
    c.clients.forEach(function (cl) {
      cl.events.forEach(function (ev) {
        events.push({ date: ev.date, time: ev.time, label: ev.label, client: cl.name, color: companyColor(c, cl.name) });
      });
    });
    events.sort(function (a, b) { return new Date(b.date + "T" + (b.time || "00:00")) - new Date(a.date + "T" + (a.time || "00:00")); });
    if (!events.length) return '<div class="more-row">Noch keine Termine erfasst.</div>';
    return '<div class="timeline">' + events.map(function (ev, i) {
      var dateText = fmtDate(ev.date) + (ev.time ? " · " + ev.time + " Uhr" : "");
      var label = /vorgestellt|vereinbart|absage/i.test(ev.label) ? ev.label + " · " + ev.client : ev.label + " bei " + ev.client;
      return '<div class="tl-item">' +
        '<div class="tl-rail"><span class="tl-dot" style="background:' + ev.color + '"></span>' + (i < events.length - 1 ? '<span class="tl-line"></span>' : '') + '</div>' +
        '<div class="tl-content"><div class="tl-date">' + dateText + '</div><div class="tl-label">' + label + '</div></div>' +
        '</div>';
    }).join("") + '</div>';
  }

  function clientManageBlockHtml(c, cl, idx) {
    var eventKey = c.id + "-" + idx;
    var isDeal = cl.status === "deal";
    var addEventFormHtml = state.addingEvent[eventKey] ? (
      '<div class="mini-form">' +
      '<input type="text" id="ev-label-' + eventKey + '" placeholder="z.B. 2. Vorstellungsgespräch (Teams)">' +
      '<input type="date" id="ev-date-' + eventKey + '" value="' + todayISO() + '">' +
      '<input type="time" id="ev-time-' + eventKey + '">' +
      '<button class="mini-btn" data-save-event="' + eventKey + '">Speichern</button>' +
      '</div>'
    ) : "";
    var addDealFormHtml = state.addingDeal[eventKey] ? (
      '<div class="mini-form">' +
      '<input type="number" id="deal-value-' + eventKey + '" placeholder="Deal Value in €">' +
      '<input type="text" id="deal-start-' + eventKey + '" placeholder="Start (z.B. 01.11.2026)">' +
      '<input type="text" id="deal-refund-' + eventKey + '" placeholder="Rückvergütungsfrist (z.B. bis 01.02.2027)">' +
      '<button class="mini-btn" data-save-deal="' + eventKey + '">Als Deal eintragen</button>' +
      '</div>'
    ) : "";

    var statusOptions = ["vorgestellt", "ausstehend", "erfolgt", "abgesagt"].map(function (s) {
      return '<option value="' + s + '"' + (cl.status === s ? " selected" : "") + '>' + statusLabel[s] + '</option>';
    }).join("");

    return '<div class="client-block">' +
      '<div class="client-block-head">' +
      '<span class="cname"><span class="c-dot" style="background:' + companyColor(c, cl.name) + '"></span>' + cl.name + '</span>' +
      (isDeal ? '<span class="status-chip deal">Deal</span>' : '<select class="status-chip" data-status-select="' + c.id + '|' + idx + '" style="background:var(--surface-2);color:var(--text-muted);border:1px solid var(--border);">' + statusOptions + '</select>') +
      '</div>' +
      (isDeal ? "" :
        '<div class="client-actions">' +
        '<button class="mini-btn" data-add-event="' + eventKey + '">+ Termin</button>' +
        '<button class="mini-btn" data-add-deal="' + eventKey + '">Als Deal markieren</button>' +
        '</div>' +
        addEventFormHtml + addDealFormHtml
      ) +
      '</div>';
  }

  function cardHtml(c) {
    var dealClient = c.clients.filter(function (cl) { return cl.status === "deal"; })[0];
    var otherClients = c.clients.filter(function (cl) { return cl.status !== "deal"; });
    var visibleClients = otherClients.slice(0, 2);
    var moreCount = otherClients.length - visibleClients.length;
    var doneTodos = c.todos.filter(function (t) { return t.done; }).length;
    var stale = isStale(c);
    var updatedText = daysAgo(c.lastUpdated) === 0 ? "heute aktualisiert" : "vor " + daysAgo(c.lastUpdated) + " Tagen aktualisiert";

    var dealHtml = dealClient ? (
      '<div class="deal-block">' +
      '<div class="deal-head"><span class="deal-client">Deal · ' + dealClient.name + '</span><span class="deal-value num">' + eur(dealClient.value) + '</span></div>' +
      '<div class="deal-meta">' +
      '<div>Start<b>' + dealClient.start + '</b></div>' +
      '<div>Rückvergütungsfrist<b>' + dealClient.refund + '</b></div>' +
      '</div>' +
      '</div>'
    ) : "";

    var clientListHtml = visibleClients.length ? (
      '<div class="client-list">' + visibleClients.map(function (cl) { return clientRowHtml(c, cl); }).join("") +
      (moreCount > 0 ? '<div class="more-row">+ ' + moreCount + ' weitere' + (moreCount > 1 ? "r" : "") + ' Kunde' + (moreCount > 1 ? "n" : "") + '</div>' : '') +
      '</div>'
    ) : (dealClient ? "" : '<div class="more-row">Noch keinem Kunden vorgestellt.</div>');

    var todosHtml = c.todos.map(function (t, i) {
      return '<div class="todo' + (t.done ? " done" : "") + '">' +
        '<input type="checkbox" data-todo="' + c.id + '|' + i + '" ' + (t.done ? "checked" : "") + '>' +
        '<div class="todo-text"><label>' + t.text + '</label><div class="todo-created">hinzugefügt am ' + fmtDate(t.created) + '</div></div>' +
        '</div>';
    }).join("");

    var notesHtml = c.notes.length ? c.notes.map(function (n) {
      return '<div class="note-entry"><div class="note-date">' + fmtDate(n.created) + '</div><div class="note-text">' + n.text + '</div></div>';
    }).join("") : '<div class="more-row">Noch keine Notizen.</div>';

    var clientManageHtml = c.clients.map(function (cl, idx) { return clientManageBlockHtml(c, cl, idx); }).join("");

    return '' +
      '<div class="card' + (state.expanded[c.id] ? " expanded" : "") + '" data-id="' + c.id + '">' +
      '<div class="card-head">' +
      '<div class="avatar">' + initials(c.name) + '</div>' +
      '<div style="flex:1;"><div class="card-name">' + c.name + '</div><div class="card-role">' + (c.role || "") + '</div></div>' +
      (stale ? '<span class="stale-dot" title="Länger keine Aktivität"></span>' : '') +
      '<button class="archive-toggle" data-archive="' + c.id + '" data-target="' + (c.archived ? "false" : "true") + '" title="' + (c.archived ? "Reaktivieren" : "Archivieren") + '">' +
      (c.archived ?
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>' :
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></svg>') +
      '</button>' +
      '</div>' +
      dealHtml +
      clientListHtml +
      (c.todos.length ? '<div class="todo-row"><div class="progress-track"><div class="progress-fill" style="width:' + Math.round(doneTodos / c.todos.length * 100) + '%"></div></div><span class="progress-label num">' + doneTodos + '/' + c.todos.length + ' To-Dos</span></div>' : '') +
      '<div class="card-foot">' +
      '<span class="updated' + (stale ? " stale" : "") + '">' + updatedText + '</span>' +
      '<button class="expand-btn" data-toggle="' + c.id + '">' + (state.expanded[c.id] ? "Weniger" : "Details") + ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg></button>' +
      '</div>' +
      '<div class="details">' +
      '<div><div class="section-title">Kunden' +
      (state.addingClient[c.id] ?
        '' :
        '<button class="add-link" style="padding:0;" data-add-client="' + c.id + '">+ Kunde hinzufügen</button>') +
      '</div>' +
      (state.addingClient[c.id] ? '<div class="add-row"><input type="text" id="new-client-' + c.id + '" placeholder="Kundenname …"><button data-save-client="' + c.id + '">Speichern</button></div>' : '') +
      clientManageHtml +
      '</div>' +
      '<div><div class="section-title">Verlauf</div>' + timelineHtml(c) + '</div>' +
      '<div><div class="section-title">To-Dos</div>' + (todosHtml || '<div class="more-row">Keine offenen Schritte.</div>') +
      (state.addingTodo[c.id] ?
        '<div class="add-row"><input type="text" id="new-todo-' + c.id + '" placeholder="Neuer Schritt …"><button data-save-todo="' + c.id + '">Speichern</button></div>' :
        '<button class="add-link" data-add-todo="' + c.id + '">+ Schritt hinzufügen</button>') +
      '</div>' +
      '<div class="notes"><div class="section-title">Notizen</div>' + notesHtml +
      (state.addingNote[c.id] ?
        '<div class="add-row"><input type="text" id="new-note-' + c.id + '" placeholder="Notiz zu ' + c.name + ' …"><button data-save-note="' + c.id + '">Speichern</button></div>' :
        '<button class="add-link" data-add-note="' + c.id + '">+ Notiz hinzufügen</button>') +
      '</div>' +
      '</div>' +
      '</div>';
  }

  // ---------- main render ----------

  function matchesSearch(c, term) {
    if (!term) return true;
    term = term.toLowerCase();
    if (c.name.toLowerCase().indexOf(term) !== -1) return true;
    if ((c.role || "").toLowerCase().indexOf(term) !== -1) return true;
    return c.clients.some(function (cl) { return cl.name.toLowerCase().indexOf(term) !== -1; });
  }

  function render() {
    var list = state.candidates.filter(function (c) { return matchesSearch(c, state.search); });
    if (state.onlyAlerts) list = list.filter(isStale);

    document.getElementById("countLabel").textContent =
      (state.view === "archived" ? list.length + " archivierte Kandidaten" : list.length + " aktive Kandidaten");

    var staleCount = state.candidates.filter(isStale).length;
    document.getElementById("alertText").textContent = staleCount + " brauch" + (staleCount === 1 ? "t" : "en") + " Aufmerksamkeit";
    document.getElementById("alertChip").style.display = state.view === "archived" ? "none" : "inline-flex";

    wall.innerHTML = list.length ? list.map(cardHtml).join("") : '<div class="empty">Keine Kandidaten in dieser Ansicht.</div>';

    jumpRow.innerHTML = list.map(function (c, i) {
      return '<div class="jump-pill' + (i === 0 ? " current" : "") + '" data-jump="' + c.id + '">' +
        '<span class="jp-avatar">' + initials(c.name) + '</span>' + c.name.split(" ")[0] +
        (isStale(c) ? '<span class="jp-dot"></span>' : '') +
        '</div>';
    }).join("");

    bindEvents();
  }

  function findCandidate(id) { return state.candidates.filter(function (x) { return String(x.id) === String(id); })[0]; }

  // ---------- event binding (delegated per render) ----------

  function bindEvents() {
    wall.querySelectorAll("[data-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-toggle");
        state.expanded[id] = !state.expanded[id];
        render();
      });
    });

    wall.querySelectorAll("[data-archive]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-archive");
        var target = btn.getAttribute("data-target") === "true";
        await api("PATCH", "/api/candidates/" + id, { archived: target });
        loadCandidates();
      });
    });

    wall.querySelectorAll('[data-todo]').forEach(function (input) {
      input.addEventListener("change", async function () {
        var parts = input.getAttribute("data-todo").split("|");
        await api("PATCH", "/api/candidates/" + parts[0] + "/todos/" + parts[1], { done: input.checked });
        loadCandidates();
      });
    });

    wall.querySelectorAll("[data-status-select]").forEach(function (sel) {
      sel.addEventListener("change", async function () {
        var parts = sel.getAttribute("data-status-select").split("|");
        await api("PATCH", "/api/candidates/" + parts[0] + "/clients/" + parts[1], { status: sel.value });
        loadCandidates();
      });
    });

    wall.querySelectorAll("[data-add-client]").forEach(function (btn) {
      btn.addEventListener("click", function () { state.addingClient[btn.getAttribute("data-add-client")] = true; render(); });
    });
    wall.querySelectorAll("[data-save-client]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-save-client");
        var input = document.getElementById("new-client-" + id);
        if (input && input.value.trim()) {
          await api("POST", "/api/candidates/" + id + "/clients", { name: input.value.trim() });
        }
        state.addingClient[id] = false;
        loadCandidates();
      });
    });

    wall.querySelectorAll("[data-add-event]").forEach(function (btn) {
      btn.addEventListener("click", function () { state.addingEvent[btn.getAttribute("data-add-event")] = true; render(); });
    });
    wall.querySelectorAll("[data-save-event]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var key = btn.getAttribute("data-save-event");
        var parts = key.split("-");
        var candidateId = parts[0], idx = parts[1];
        var label = document.getElementById("ev-label-" + key).value.trim();
        var date = document.getElementById("ev-date-" + key).value;
        var time = document.getElementById("ev-time-" + key).value;
        if (label && date) {
          await api("POST", "/api/candidates/" + candidateId + "/clients/" + idx + "/events", { label: label, date: date, time: time || undefined });
        }
        state.addingEvent[key] = false;
        loadCandidates();
      });
    });

    wall.querySelectorAll("[data-add-deal]").forEach(function (btn) {
      btn.addEventListener("click", function () { state.addingDeal[btn.getAttribute("data-add-deal")] = true; render(); });
    });
    wall.querySelectorAll("[data-save-deal]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var key = btn.getAttribute("data-save-deal");
        var parts = key.split("-");
        var candidateId = parts[0], idx = parts[1];
        var value = document.getElementById("deal-value-" + key).value;
        var start = document.getElementById("deal-start-" + key).value.trim();
        var refund = document.getElementById("deal-refund-" + key).value.trim();
        await api("POST", "/api/candidates/" + candidateId + "/clients/" + idx + "/deal", { value: value, start: start, refund: refund });
        state.addingDeal[key] = false;
        loadCandidates();
      });
    });

    wall.querySelectorAll("[data-add-todo]").forEach(function (btn) {
      btn.addEventListener("click", function () { state.addingTodo[btn.getAttribute("data-add-todo")] = true; render(); });
    });
    wall.querySelectorAll("[data-save-todo]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-save-todo");
        var input = document.getElementById("new-todo-" + id);
        if (input && input.value.trim()) await api("POST", "/api/candidates/" + id + "/todos", { text: input.value.trim() });
        state.addingTodo[id] = false;
        loadCandidates();
      });
    });

    wall.querySelectorAll("[data-add-note]").forEach(function (btn) {
      btn.addEventListener("click", function () { state.addingNote[btn.getAttribute("data-add-note")] = true; render(); });
    });
    wall.querySelectorAll("[data-save-note]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var id = btn.getAttribute("data-save-note");
        var input = document.getElementById("new-note-" + id);
        if (input && input.value.trim()) await api("POST", "/api/candidates/" + id + "/notes", { text: input.value.trim() });
        state.addingNote[id] = false;
        loadCandidates();
      });
    });

    jumpRow.querySelectorAll(".jump-pill").forEach(function (pill) {
      pill.addEventListener("click", function () {
        var id = pill.getAttribute("data-jump");
        var target = wall.querySelector('.card[data-id="' + id + '"]');
        if (target) target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      });
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          var id = entry.target.getAttribute("data-id");
          jumpRow.querySelectorAll(".jump-pill").forEach(function (p) {
            p.classList.toggle("current", p.getAttribute("data-jump") === id);
          });
        }
      });
    }, { root: wall, threshold: [0.6] });
    wall.querySelectorAll(".card").forEach(function (c) { io.observe(c); });
  }

  // ---------- top-level controls ----------

  document.getElementById("viewTabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll("#viewTabs .tab").forEach(function (t) { t.classList.remove("active"); });
    btn.classList.add("active");
    state.view = btn.getAttribute("data-view");
    loadCandidates();
  });

  document.getElementById("alertChip").addEventListener("click", function () {
    state.onlyAlerts = !state.onlyAlerts;
    this.classList.toggle("on", state.onlyAlerts);
    render();
  });

  document.getElementById("searchInput").addEventListener("input", function () {
    state.search = this.value;
    render();
  });

  var newForm = document.getElementById("newCandidateForm");
  document.getElementById("newCandidateBtn").addEventListener("click", function () {
    newForm.hidden = !newForm.hidden;
    if (!newForm.hidden) document.getElementById("newName").focus();
  });
  document.getElementById("cancelCandidateBtn").addEventListener("click", function () {
    newForm.hidden = true;
    document.getElementById("newName").value = "";
    document.getElementById("newRole").value = "";
  });
  document.getElementById("saveCandidateBtn").addEventListener("click", async function () {
    var name = document.getElementById("newName").value.trim();
    var role = document.getElementById("newRole").value.trim();
    if (!name) { document.getElementById("newName").focus(); return; }
    await api("POST", "/api/candidates", { name: name, role: role });
    document.getElementById("newName").value = "";
    document.getElementById("newRole").value = "";
    newForm.hidden = true;
    loadCandidates();
  });

  loadCandidates();
})();
