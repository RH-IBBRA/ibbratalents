// IBBRA RH \u2014 main app
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const State = {
    user: null,
    seed: null,
    currentCandidateId: null,
    analysis: null,
    funilFilter: "all",
    funilQuickFilter: "all",
    pipeBoardMode: "stage",
    currentFile: null,
    // Import do Notion (wizard em mem\u00f3ria)
    notion: { rows: [], pdfs: [], matches: [] }
  };

  // ---------- Parser de CSV (tolerante) ----------
  function parseCsv(text) {
    if (!text) return [];
    // detecta separador: ; ou , (predominante na 1\u00aa linha)
    const firstLine = text.split(/\r?\n/, 1)[0];
    const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
    const rows = [];
    let row = [], field = "", inQuotes = false;
    const flush = () => { row.push(field); field = ""; };
    const flushRow = () => { rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inQuotes) {
        if (c === '"' && n === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === sep) flush();
        else if (c === "\n") { flush(); flushRow(); }
        else if (c === "\r") { /* skip */ }
        else { field += c; }
      }
    }
    if (field.length || row.length) { flush(); flushRow(); }
    return rows.filter(r => r.length > 1 || (r[0] && r[0].trim()));
  }

  function normalizeKey(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  // Mapeia cabe\u00e7alhos de v\u00e1rias formas para chaves can\u00f4nicas
  const HEADER_ALIASES = {
    nome:    ["nome", "nomecompleto", "candidato", "fullname", "name", "pessoa"],
    estagio: ["estagio", "fase", "etapa", "status", "stage"],
    email:   ["email", "mail", "contato", "emailprincipal"],
    vaga:    ["vaga", "cargo", "posicao", "role", "vagasugerida", "vagaalvo"],
    notas:   ["observacoes", "obs", "comentario", "comentarios", "notas", "notes"]
  };

  function csvRowsToObjects(rows) {
    if (rows.length < 2) return [];
    const headers = rows[0].map(h => normalizeKey(h));
    // map index \u2192 canonical key
    const colMap = {};
    headers.forEach((h, i) => {
      for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.includes(h)) { colMap[i] = canonical; break; }
      }
    });
    return rows.slice(1).map(r => {
      const obj = {};
      r.forEach((v, i) => { if (colMap[i]) obj[colMap[i]] = (v || "").trim(); });
      return obj;
    }).filter(o => o.nome || o.email);
  }

  // ---------- Mapeamento de fases Notion \u2192 sistema ----------
  const NOTION_STAGE_MAP = {
    "prospeccao": "triagem",
    "prospec": "triagem",          // truncados
    "triagem": "triagem",
    "entrevistarh": "rh",
    "rh": "rh",
    "entrevistatecnica": "tecnica",
    "tecnica": "tecnica",
    "tech": "tecnica",
    "proposta": "proposta",
    "oferta": "proposta",
    "aprovado": "contratado",
    "contratado": "contratado",
    "hire": "contratado",
    "declinou": "declinou",
    "declinado": "declinou",
    "desistiu": "declinou",
    "reprovado": "reprovado",
    "rejeitado": "reprovado",
    "naoavancou": "reprovado"
  };
  function mapNotionStage(label) {
    const k = normalizeKey(label);
    return NOTION_STAGE_MAP[k] || null;
  }

  const ACCOUNTS = [
    {
      email: "rh@ibbra.com.br", password: "ibbra2026",
      role: "recrutador", name: "Recrutador IBBRA",
      label: "Recrutador",
      desc: "Foco em Recrutamento & Sele\u00e7\u00e3o: funil, an\u00e1lise de curr\u00edculos por IA, planilha consolidada e coment\u00e1rios nos candidatos."
    },
    {
      email: "tdgestor@ibbra.com.br", password: "ibbra2026",
      role: "gestor", name: "Gestor de T&D",
      label: "Gestor",
      desc: "Tudo do Recrutador + atribui trilhas, agenda 1:1s, cria PDIs e envia feedback. Acesso pleno ao m\u00f3dulo de T&D."
    },
    {
      email: "gestor@ibbra.com.br", password: "ibbra2026",
      role: "admin", name: "Administrador IBBRA",
      label: "Admin",
      desc: "Tudo + Configura\u00e7\u00f5es da plataforma: chave da Claude API, editor de funil/trilhas, importa\u00e7\u00e3o do Notion, Zona de risco."
    }
  ];
  function authenticate(email, password) {
    const e = (email || "").trim().toLowerCase();
    return ACCOUNTS.find(a => a.email === e && a.password === password) || null;
  }
  function isAdmin()      { return State.user?.role === "admin"; }
  function isGestorPlus() { return ["gestor", "admin"].includes(State.user?.role); }   // pode editar T&D
  function isRecrutador() { return ["recrutador", "rh", "gestor", "admin"].includes(State.user?.role); }
  function roleLabel(role) {
    return ({ recrutador: "Recrutador", rh: "Recrutador", gestor: "Gestor", admin: "Admin" })[role] || role;
  }

  // ---------- helpers ----------
  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
  }
  function initials(name) {
    return (name || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
  }
  function fmtDate(iso) {
    if (!iso) return "\u2014";
    try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" }); }
    catch { return iso; }
  }
  function showToast(msg, type = "default") {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.className = "toast " + type;
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove("show"), 2800);
  }
  function nav(view, opts = {}) {
    $$(".view").forEach(v => v.classList.remove("active"));
    const target = $(`#view-${view}`);
    if (!target) return;
    target.classList.add("active");
    $$(".nav button").forEach(b => b.classList.toggle("active", b.dataset.nav === view));
    Object.assign(State, opts);
    window.scrollTo({ top: 0, behavior: "instant" });
    // Persiste a view no hash da URL (restaura no refresh)
    const candPart = (view === "candidato" && State.currentCandidateId) ? "/" + State.currentCandidateId : "";
    const newHash = "#" + view + candPart;
    if (window.location.hash !== newHash) {
      // replaceState pra não criar entrada extra no histórico
      history.replaceState(null, "", newHash);
    }
    renderView(view);
  }

  function readHashRoute() {
    const h = (window.location.hash || "").replace(/^#/, "");
    if (!h) return null;
    const parts = h.split("/");
    return { view: parts[0], candidatoId: parts[1] || null };
  }
  function vacancyOf(id) {
    return State.seed.vacancies.find(v => v.id === id) || State.seed.vacancies[0];
  }
  function stageOf(id) {
    return State.seed.pipeline.find(s => s.id === id) || State.seed.pipeline[0];
  }
  function expertiseName(id) {
    return (State.seed.expertises.find(e => e.id === id) || {}).name || id;
  }
  function certName(id) {
    return (State.seed.certifications.find(c => c.id === id) || {}).name || id;
  }
  function seniorityLabel(s) {
    return ({ estagiario: "Estagi\u00e1rio/Trainee", junior: "J\u00fanior", pleno: "Pleno", senior: "S\u00eanior" })[s] || s;
  }
  function fmtDateTime(iso) {
    if (!iso) return "\u2014";
    try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  }
  function agingDays(c) {
    const since = c.stageEnteredAt || c.updatedAt || c.createdAt;
    if (!since) return 0;
    const ms = Date.now() - new Date(since).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }
  function agingClass(days) {
    if (days >= 7) return "hot";
    if (days >= 4) return "warn";
    return "ok";
  }
  function commentsCount(c) { return (c.comments || []).length; }
  function hasRedFlags(c) { return (c.redFlags || []).length > 0; }
  function hasDiagnosis(c) { return !!c.diagnosis; }
  // Converte texto bruto em PDF simples nomeado com o candidato (cabeçalho + corpo)
  function resumeTextToPdfBlob(text, candidateName) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF não carregou.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 50;
    doc.setFont("times", "bold"); doc.setFontSize(15);
    doc.text(String(candidateName || "Currículo"), M, 50);
    doc.setFont("times", "italic"); doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Currículo arquivado pelo IBBRA Talents · " + new Date().toLocaleDateString("pt-BR"), M, 66);
    doc.setTextColor(20, 20, 20);
    doc.setFont("times", "normal"); doc.setFontSize(11);
    const lines = doc.splitTextToSize(String(text || ""), W - M * 2);
    let y = 92;
    lines.forEach(line => {
      if (y > H - 50) { doc.addPage(); y = 60; }
      doc.text(line, M, y);
      y += 14;
    });
    return doc.output("blob");
  }

  async function saveOriginalForCandidate(candidate, file, fallbackText) {
    try {
      if (file && (file.type === "application/pdf" || (file.name || "").toLowerCase().endsWith(".pdf"))) {
        await Store.Originals.save(candidate.id, file, file.name, "pdf");
        return { kind: "pdf-original", name: file.name };
      }
      // TXT ou paste: converte texto em PDF nomeado
      const blob = resumeTextToPdfBlob(fallbackText || (file ? await file.text() : ""), candidate.fullName);
      const name = Dossier.sanitizeFilename(candidate.fullName) + " — currículo.pdf";
      await Store.Originals.save(candidate.id, blob, name, "text-generated");
      return { kind: "text-generated", name };
    } catch (err) {
      console.warn("saveOriginalForCandidate falhou:", err);
      return null;
    }
  }

  async function downloadOriginalCV(candidate) {
    const rec = await Store.Originals.get(candidate.id);
    if (!rec || !rec.blob) {
      showToast("Currículo original não encontrado para este candidato.", "warn");
      return false;
    }
    const filename = Dossier.sanitizeFilename(candidate.fullName) + ".pdf";
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    return filename;
  }

  function applyQuickFilter(cands, q) {
    if (q === "all") return cands;
    if (q === "high") return cands.filter(c => (c.fitScore || 0) >= 75);
    if (q === "flags") return cands.filter(hasRedFlags);
    if (q === "diag") return cands.filter(hasDiagnosis);
    if (q === "nodiag") return cands.filter(c => !hasDiagnosis(c));
    if (q === "stuck") return cands.filter(c => agingDays(c) >= 7 && !["contratado","reprovado"].includes(c.stage));
    return cands;
  }

  // ---------- LOGIN ----------
  function renderLogin() {
    $("#view-login").innerHTML = `
      <div class="login-page">
        <div class="login-side">
          <div class="eyebrow gold">IBBRA Talents</div>
          <h1 class="login-title">Funil de <em>Recrutamento &amp; Sele\u00e7\u00e3o</em></h1>
          <p class="login-lead">Plataforma interna para registrar candidatos, ler curr\u00edculos com IA, classificar por vaga e senioridade, e acompanhar o pipeline com indicadores em tempo real.</p>
          <ul class="login-bullets">
            <li><strong>An\u00e1lise inteligente</strong> de curr\u00edculos: vaga sugerida, senioridade, expertises e certifica\u00e7\u00f5es.</li>
            <li><strong>Funil Kanban</strong> visual: triagem \u2192 entrevistas \u2192 proposta \u2192 contrata\u00e7\u00e3o.</li>
            <li><strong>Indicadores</strong> e <strong>planilha consolidada</strong> exportada em CSV.</li>
          </ul>
        </div>
        <form class="login-card" id="login-form" autocomplete="off">
          <h3>Acessar plataforma</h3>
          <p class="muted">Use uma das contas de demonstra\u00e7\u00e3o abaixo.</p>
          <label for="login-email">E-mail</label>
          <input type="email" id="login-email" required placeholder="rh@ibbra.com.br" />
          <label for="login-password">Senha</label>
          <input type="password" id="login-password" required placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" />
          <div id="login-error" class="login-error" hidden></div>
          <button class="btn btn-primary btn-block" type="submit">Entrar</button>
          <div class="demo-accounts">
            <div class="demo-label">N\u00edveis de acesso</div>
            ${ACCOUNTS.map(a => `
              <button type="button" class="demo-card" data-email="${escapeHtml(a.email)}" data-pwd="${escapeHtml(a.password)}">
                <div class="demo-role role-${a.role}">${escapeHtml(a.label)}</div>
                <div class="demo-info">
                  <div class="demo-tag">${escapeHtml(a.name)}</div>
                  <div class="demo-cred"><strong>${escapeHtml(a.email)}</strong> \u00b7 senha: ${escapeHtml(a.password)}</div>
                  <div class="demo-desc">${escapeHtml(a.desc)}</div>
                </div>
              </button>`).join("")}

            <details class="perm-matrix-wrap">
              <summary>Ver matriz de permiss\u00f5es completa</summary>
              <table class="perm-matrix">
                <thead><tr><th>Recurso</th><th>Recrutador</th><th>Gestor</th><th>Admin</th></tr></thead>
                <tbody>
                  <tr><td>Funil de candidatos</td>      <td>\u2713</td><td>\u2713</td><td>\u2713</td></tr>
                  <tr><td>An\u00e1lise de curr\u00edculos (IA)</td><td>\u2713</td><td>\u2713</td><td>\u2713</td></tr>
                  <tr><td>Importar do Notion</td>        <td>\u2713</td><td>\u2713</td><td>\u2713</td></tr>
                  <tr><td>Planilha + exporta\u00e7\u00f5es</td>    <td>\u2713</td><td>\u2713</td><td>\u2713</td></tr>
                  <tr><td>Coment\u00e1rios e diagn\u00f3sticos</td><td>\u2713</td><td>\u2713</td><td>\u2713</td></tr>
                  <tr><td>T&amp;D \u2014 ler dashboards</td>  <td>\u2713</td><td>\u2713</td><td>\u2713</td></tr>
                  <tr><td>T&amp;D \u2014 criar 1:1s, PDIs, atribuir trilhas</td><td class="x">\u2014</td><td>\u2713</td><td>\u2713</td></tr>
                  <tr><td>Indicadores gerenciais</td>    <td>\u2713</td><td>\u2713</td><td>\u2713</td></tr>
                  <tr><td>Editor de funil &amp; trilhas</td><td class="x">\u2014</td><td class="x">\u2014</td><td>\u2713</td></tr>
                  <tr><td>Chave Claude API</td>          <td class="x">\u2014</td><td class="x">\u2014</td><td>\u2713</td></tr>
                  <tr><td>Zona de risco (exclus\u00e3o)</td>  <td class="x">\u2014</td><td class="x">\u2014</td><td>\u2713</td></tr>
                </tbody>
              </table>
            </details>
          </div>
        </form>
      </div>`;

    $("#login-form").addEventListener("submit", e => {
      e.preventDefault();
      const acc = authenticate($("#login-email").value, $("#login-password").value);
      if (!acc) {
        const err = $("#login-error");
        err.textContent = "E-mail ou senha incorretos.";
        err.hidden = false;
        return;
      }
      const user = { name: acc.name, email: acc.email, role: acc.role, since: new Date().toISOString() };
      Store.setUser(user);
      State.user = user;
      mountChrome();
      nav("funil");
      showToast(`Bem-vindo(a), ${acc.name.split(" ")[0]}.`);
    });
    $$(".demo-card").forEach(card => card.addEventListener("click", () => {
      $("#login-email").value = card.dataset.email;
      $("#login-password").value = card.dataset.pwd;
      $("#login-form").requestSubmit();
    }));
  }

  // ---------- TOPBAR ----------
  function mountChrome() {
    const top = $("#topbar");
    const u = State.user;
    top.innerHTML = `
      <div class="topbar-inner">
        <div class="brand" data-nav="${u ? "funil" : "login"}">
          <img src="assets/img/logo.svg" alt="IBBRA" />
          <span class="brand-tag">Talents \u00b7 R&amp;S + T&amp;D</span>
        </div>
        ${u ? `
        <nav class="nav">
          <button data-nav="funil">Funil</button>
          <button data-nav="analise">Nova an\u00e1lise</button>
          <button data-nav="indicadores">Indicadores</button>
          <button data-nav="planilha">Planilha</button>
          <button data-nav="td">T&amp;D</button>
          ${u.role === "admin" ? `<button data-nav="config">Configura\u00e7\u00f5es</button>` : ""}
        </nav>
        <div class="user-chip ${u.role}">
          <div class="avatar">${initials(u.name)}</div>
          <div>
            <div>${escapeHtml(u.name.split(" ").slice(0, 2).join(" "))} <span class="role-pill role-${u.role}">${roleLabel(u.role)}</span></div>
            <button class="linklike" id="logout">sair</button>
          </div>
        </div>` : ""}
      </div>`;
    if (u) {
      $("#logout").addEventListener("click", () => { Store.clearUser(); State.user = null; mountChrome(); nav("login"); });
      $$(".nav button, .brand").forEach(el => el.addEventListener("click", () => nav(el.dataset.nav)));
    }
    $("#footer").innerHTML = `
      <div class="footer-inner">
        <div>\u00a9 ${new Date().getFullYear()} ${escapeHtml(State.seed.brand.name)} \u2014 ${escapeHtml(State.seed.brand.product)}.</div>
        <div>${State.seed.brand.headquarters.join(" \u00b7 ")}</div>
      </div>`;
  }

  // ---------- KPIs ----------
  function kpiCards() {
    const cands = Store.getCandidates();
    const ativos = cands.filter(c => !["contratado", "reprovado"].includes(c.stage));
    const contratados = cands.filter(c => c.stage === "contratado").length;
    const taxa = cands.length ? Math.round((contratados / cands.length) * 100) : 0;
    const altoFit = cands.filter(c => (c.fitScore || 0) >= 75).length;
    return `
      <div class="stats">
        <div class="stat-card"><div class="label">Candidatos no funil</div><div class="value">${ativos.length}</div><div class="sub">de ${cands.length} no total</div></div>
        <div class="stat-card"><div class="label">Alta ader\u00eancia</div><div class="value">${altoFit}</div><div class="sub">score \u2265 75%</div></div>
        <div class="stat-card"><div class="label">Contratados</div><div class="value">${contratados}</div><div class="sub">acumulado</div></div>
        <div class="stat-card"><div class="label">Taxa de convers\u00e3o</div><div class="value">${taxa}%</div><div class="sub">contratados / total</div></div>
      </div>`;
  }

  // ---------- FUNIL (Kanban) ----------
  function renderFunil() {
    const cands = Store.getCandidates();
    const stages = State.seed.pipeline;
    const filteredByVacancy = State.funilFilter === "all" ? cands : cands.filter(c => c.fitVacancyId === State.funilFilter);
    const filtered = applyQuickFilter(filteredByVacancy, State.funilQuickFilter);
    const byStage = State.pipeBoardMode === "stage";

    const quickFilters = [
      { id: "all",    label: "Todos" },
      { id: "high",   label: "Alta ader\u00eancia (\u226575)" },
      { id: "flags",  label: "Com pontos de aten\u00e7\u00e3o" },
      { id: "diag",   label: "Com diagn\u00f3stico" },
      { id: "nodiag", label: "Sem diagn\u00f3stico" },
      { id: "stuck",  label: "Parados h\u00e1 7+ dias" }
    ];

    $("#view-funil").innerHTML = `
      <div class="container">
        <div class="section-head">
          <div>
            <div class="eyebrow gold">Pipeline</div>
            <h1>Funil de Recrutamento &amp; Sele\u00e7\u00e3o</h1>
            <p class="lead">Acompanhe os candidatos por est\u00e1gio ou por vaga. Mova entre colunas conforme o avan\u00e7o no processo.</p>
          </div>
          <div class="head-actions">
            <button class="btn btn-primary" data-nav="analise">+ Nova an\u00e1lise</button>
          </div>
        </div>

        ${kpiCards()}

        <div class="filter-group">
          <div class="filter-label">Filtrar por vaga</div>
          <div class="filters" id="filters-vacancy">
            <button class="chip ${State.funilFilter === "all" ? "active" : ""}" data-v="all">Todas as vagas</button>
            ${State.seed.vacancies.map(v =>
              `<button class="chip ${State.funilFilter === v.id ? "active" : ""}" data-v="${v.id}">${escapeHtml(v.title)}</button>`
            ).join("")}
          </div>
        </div>

        <div class="filter-group filter-row-with-toggle">
          <div class="filters quick" id="filters-quick">
            ${quickFilters.map(q =>
              `<button class="chip chip-quick ${State.funilQuickFilter === q.id ? "active" : ""}" data-q="${q.id}">${escapeHtml(q.label)}</button>`
            ).join("")}
          </div>
          <div class="board-toggle" role="tablist" aria-label="Modo de visualiza\u00e7\u00e3o">
            <button class="toggle-btn ${byStage ? "active" : ""}" data-mode="stage" role="tab">Por est\u00e1gio</button>
            <button class="toggle-btn ${!byStage ? "active" : ""}" data-mode="vacancy" role="tab">Por vaga</button>
          </div>
        </div>

        <div class="kanban ${byStage ? "by-stage" : "by-vacancy"}">
          ${byStage
            ? stages.map(st => {
                const col = filtered.filter(c => c.stage === st.id);
                return `
                  <div class="kcol kcol-${st.tone}" data-stage="${st.id}">
                    <div class="kcol-head">
                      <div class="kcol-title">${escapeHtml(st.name)}</div>
                      <div class="kcol-count">${col.length}</div>
                    </div>
                    <div class="kcol-desc">${escapeHtml(st.desc)}</div>
                    <div class="kcol-list">
                      ${col.length ? col.map(c => candidateCardHTML(c)).join("") : `<div class="kcol-empty">Sem candidatos</div>`}
                    </div>
                  </div>`;
              }).join("")
            : (() => {
                const groups = State.seed.vacancies.map(v => ({
                  id: v.id, title: v.title, list: filtered
                    .filter(c => c.fitVacancyId === v.id)
                    .sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0))
                }));
                const orphans = filtered.filter(c => !State.seed.vacancies.some(v => v.id === c.fitVacancyId));
                if (orphans.length) groups.push({ id: "_none", title: "Sem vaga sugerida", list: orphans });
                return groups.map(g => `
                  <div class="kcol kcol-navy" data-vacancy="${g.id}">
                    <div class="kcol-head">
                      <div class="kcol-title">${escapeHtml(g.title)}</div>
                      <div class="kcol-count">${g.list.length}</div>
                    </div>
                    <div class="kcol-desc">ordenado por score decrescente</div>
                    <div class="kcol-list">
                      ${g.list.length ? g.list.map(c => candidateCardHTML(c, { showStageBadge: true })).join("") : `<div class="kcol-empty">Sem candidatos</div>`}
                    </div>
                  </div>`).join("");
              })()
          }
        </div>
      </div>`;

    $$("#filters-vacancy .chip").forEach(c =>
      c.addEventListener("click", () => { State.funilFilter = c.dataset.v; renderFunil(); }));
    $$("#filters-quick .chip-quick").forEach(c =>
      c.addEventListener("click", () => { State.funilQuickFilter = c.dataset.q; renderFunil(); }));
    $$(".board-toggle .toggle-btn").forEach(b =>
      b.addEventListener("click", () => { State.pipeBoardMode = b.dataset.mode; renderFunil(); }));
    $$('[data-nav="analise"]', $("#view-funil")).forEach(b =>
      b.addEventListener("click", () => nav("analise")));
    $$(".kcard").forEach(card => {
      card.addEventListener("click", e => {
        if (e.target.closest(".kcard-move")) return;
        nav("candidato", { currentCandidateId: card.dataset.id });
      });
    });
    $$(".kcard-move select").forEach(sel => {
      sel.addEventListener("click", e => e.stopPropagation());
      sel.addEventListener("change", () => {
        const id = sel.dataset.id;
        Store.changeStage(id, sel.value, State.user?.name);
        showToast("Candidato movido para " + stageOf(sel.value).name);
        renderFunil();
      });
    });
  }

  function candidateCardHTML(c, opts = {}) {
    const st = stageOf(c.stage);
    return `
      <article class="kcard" data-id="${c.id}">
        <div class="kcard-name">${escapeHtml(c.fullName || "Sem nome")}</div>
        <div class="kcard-rows">
          <div class="kcard-row"><span class="kcard-key">Telefone</span><span class="kcard-val">${escapeHtml(c.phone || "\u2014")}</span></div>
          <div class="kcard-row"><span class="kcard-key">E-mail</span><span class="kcard-val">${escapeHtml(c.email || "\u2014")}</span></div>
        </div>
        <div class="kcard-foot">
          <span class="kcard-stage stage-${st.tone}">${escapeHtml(st.name)}</span>
          <label class="kcard-move" title="Mover para outra etapa">
            <select data-id="${c.id}">
              ${State.seed.pipeline.map(stp => `<option value="${stp.id}" ${stp.id === c.stage ? "selected" : ""}>${escapeHtml(stp.name)}</option>`).join("")}
            </select>
          </label>
        </div>
      </article>`;
  }

  // ---------- AN\u00c1LISE (paste curr\u00edculo + IA) ----------
  function renderAnalise() {
    const cfg = Store.getConfig();
    const hasKey = !!cfg.apiKey;
    $("#view-analise").innerHTML = `
      <div class="container">
        <button class="btn btn-ghost btn-sm" id="back-funil">\u2190 Voltar ao funil</button>
        <div class="section-head">
          <div>
            <div class="eyebrow gold">An\u00e1lise inteligente</div>
            <h1>Lan\u00e7ar curr\u00edculo</h1>
            <p class="lead">Cole o texto do curr\u00edculo abaixo. A IA classifica vaga sugerida, senioridade, expertises, certifica\u00e7\u00f5es e dados pessoais centrais.</p>
          </div>
        </div>

        <details class="card notion-import" id="notion-import">
          <summary>\ud83d\udccb Importar em lote do Notion (CSV + curr\u00edculos)</summary>
          <p class="muted small">Cole o CSV exportado do Notion (Markdown &amp; CSV) e arraste todos os curr\u00edculos. O sistema vai casar cada PDF com uma linha do CSV e colocar a pessoa na fase correta do funil.</p>

          <div class="notion-steps">
            <div class="notion-step">
              <div class="step-label">1. CSV do Notion</div>
              <input type="file" id="notion-csv-file" accept=".csv,text/csv" hidden />
              <button type="button" class="btn btn-ghost-on-light btn-sm" id="notion-pick-csv">Selecionar CSV</button>
              <div id="notion-csv-status" class="muted small"></div>
              <details class="notion-paste">
                <summary>ou cole o conte\u00fado</summary>
                <textarea id="notion-csv-text" rows="4" placeholder="Nome;Est\u00e1gio;E-mail;Vaga..."></textarea>
                <button type="button" class="btn btn-ghost-on-light btn-sm" id="notion-parse-text">Carregar texto</button>
              </details>
            </div>

            <div class="notion-step">
              <div class="step-label">2. Curr\u00edculos (PDF/TXT)</div>
              <input type="file" id="notion-pdfs" accept=".pdf,.txt,application/pdf,text/plain" multiple hidden />
              <button type="button" class="btn btn-ghost-on-light btn-sm" id="notion-pick-pdfs">Selecionar arquivos</button>
              <div id="notion-pdfs-status" class="muted small"></div>
            </div>

            <div class="notion-step">
              <div class="step-label">3. Revis\u00e3o</div>
              <div id="notion-review">
                <p class="muted small">Carregue o CSV e os curr\u00edculos para revisar.</p>
              </div>
            </div>
          </div>
        </details>

        <div class="analise-grid">
          <div class="analise-input">
            <div class="card">
              <div class="card-head">
                <h3>Texto do curr\u00edculo</h3>
                <div class="ai-status ${hasKey ? "on" : "off"}">${hasKey ? "IA Claude ativada" : "Modo heur\u00edstico (sem chave)"}</div>
              </div>
              <div class="stage-picker">
                <label for="target-stage">Adicionar \u00e0 fase do funil</label>
                <select id="target-stage">
                  ${State.seed.pipeline.map(st => `<option value="${st.id}" ${st.id === "triagem" ? "selected" : ""}>${escapeHtml(st.name)}</option>`).join("")}
                </select>
                <span class="stage-picker-hint">aplica-se ao envio individual e ao lote</span>
              </div>
              <div class="dropzone" id="dropzone">
                <input type="file" id="resume-file" accept=".pdf,.txt,application/pdf,text/plain" multiple hidden />
                <div class="dropzone-icon">\u21ea</div>
                <div class="dropzone-label">Arraste <strong>um ou v\u00e1rios</strong> PDFs/TXT aqui \u2014 ou <button type="button" class="linklike" id="pick-file">selecione arquivos</button></div>
                <div class="dropzone-hint">processa em lote no pr\u00f3prio navegador. Cada curr\u00edculo \u00e9 analisado e adicionado \u00e0 fase escolhida acima.</div>
                <div class="dropzone-status" id="dropzone-status" hidden></div>
              </div>
              <textarea id="resume-text" placeholder="...ou cole aqui o texto completo do curr\u00edculo (nome, contatos, hist\u00f3rico, certifica\u00e7\u00f5es)."></textarea>
              <div class="card-actions">
                <button class="btn btn-ghost-on-light btn-sm" id="load-demo">Usar curr\u00edculo de exemplo</button>
                <button class="btn btn-primary" id="btn-analyze">Analisar curr\u00edculo</button>
              </div>
              ${!hasKey ? `<p class="hint">Para an\u00e1lise inteligente, configure a chave da Claude API em <a class="linklike" data-nav="config">Configura\u00e7\u00f5es</a>.</p>` : ""}
            </div>
          </div>

          <div class="analise-output">
            <div id="analysis-result" class="analysis-result empty">
              <div class="empty-state">
                <div class="empty-icon">\u25c6</div>
                <h3>Resultado aparecer\u00e1 aqui</h3>
                <p>Os campos centrais ser\u00e3o extra\u00eddos do curr\u00edculo e a vaga mais aderente ser\u00e1 sugerida com um score 0\u2013100%.</p>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    $("#back-funil").addEventListener("click", () => nav("funil"));
    $$('[data-nav="config"]').forEach(b => b.addEventListener("click", () => nav("config")));
    $("#load-demo").addEventListener("click", () => { $("#resume-text").value = DEMO_RESUME; });
    $("#btn-analyze").addEventListener("click", runAnalysis);
    bindDropzone();
    bindNotionImport();
  }

  // ---------- Notion import wizard ----------
  function bindNotionImport() {
    State.notion = { rows: [], pdfs: [], matches: [] };

    $("#notion-pick-csv").addEventListener("click", () => $("#notion-csv-file").click());
    $("#notion-csv-file").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      const text = await f.text();
      ingestNotionCsv(text, f.name);
    });
    $("#notion-parse-text").addEventListener("click", () => {
      const text = $("#notion-csv-text").value;
      if (!text.trim()) { showToast("Cole o CSV antes.", "warn"); return; }
      ingestNotionCsv(text, "(colado)");
    });

    $("#notion-pick-pdfs").addEventListener("click", () => $("#notion-pdfs").click());
    $("#notion-pdfs").addEventListener("change", e => {
      const files = Array.from(e.target.files || []);
      ingestNotionPdfs(files);
    });
  }

  function ingestNotionCsv(text, sourceName) {
    try {
      const rows = csvRowsToObjects(parseCsv(text));
      if (!rows.length) { showToast("Nenhuma linha válida no CSV.", "warn"); return; }
      State.notion.rows = rows;
      $("#notion-csv-status").innerHTML = `<strong>${escapeHtml(sourceName)}</strong> — ${rows.length} linha(s) carregada(s).`;
      buildNotionReview();
    } catch (err) {
      console.error(err);
      showToast("Falha ao ler CSV: " + err.message, "warn");
    }
  }

  function ingestNotionPdfs(files) {
    State.notion.pdfs = files;
    $("#notion-pdfs-status").innerHTML = `${files.length} arquivo(s) carregado(s).`;
    buildNotionReview();
  }

  // Matching: tenta nome do arquivo → primeira linha do PDF → e-mail.
  // Para velocidade, no momento da revisão fazemos apenas match por NOME DE ARQUIVO.
  // No processamento final, se ainda houver dúvida, extraímos texto e tentamos por nome.
  function matchPdfToRow(pdfFile, rows) {
    const pdfBase = normalizeKey((pdfFile.name || "").replace(/\.(pdf|txt)$/i, ""));
    if (!pdfBase) return null;
    // exato
    let m = rows.find(r => normalizeKey(r.nome) === pdfBase);
    if (m) return { row: m, by: "nome-exato" };
    // contains
    m = rows.find(r => {
      const k = normalizeKey(r.nome);
      return k && (pdfBase.includes(k) || k.includes(pdfBase));
    });
    if (m) return { row: m, by: "nome-parcial" };
    return null;
  }

  function buildNotionReview() {
    const root = $("#notion-review");
    const { rows, pdfs } = State.notion;
    if (!rows.length && !pdfs.length) {
      root.innerHTML = `<p class="muted small">Carregue o CSV e os currículos para revisar.</p>`;
      return;
    }
    if (!rows.length) {
      root.innerHTML = `<p class="muted small">Carregue o CSV (passo 1) para gerar a revisão.</p>`;
      return;
    }
    if (!pdfs.length) {
      root.innerHTML = `<p class="muted small">Carregue os currículos (passo 2) para gerar a revisão.</p>`;
      return;
    }

    const stages = State.seed.pipeline;
    const stageOpts = stages.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");

    // Pré-monta matches
    State.notion.matches = pdfs.map((pdf, i) => {
      const m = matchPdfToRow(pdf, rows);
      const stageFromNotion = m ? mapNotionStage(m.row.estagio) : null;
      return {
        i,
        pdf,
        rowIdx: m ? rows.indexOf(m.row) : -1,
        matchedBy: m ? m.by : null,
        stage: stageFromNotion || "triagem"
      };
    });

    // Linhas do CSV que não casaram com nenhum PDF
    const usedRows = new Set(State.notion.matches.filter(m => m.rowIdx >= 0).map(m => m.rowIdx));
    const orphanRows = rows.map((r, i) => ({ r, i })).filter(({ i }) => !usedRows.has(i));

    root.innerHTML = `
      <div class="notion-review-summary">
        <strong>${State.notion.matches.filter(m => m.rowIdx >= 0).length} de ${pdfs.length} PDFs</strong> casados automaticamente · ${orphanRows.length} pessoa(s) do CSV sem PDF correspondente
      </div>
      <table class="notion-review-table">
        <thead>
          <tr>
            <th>Currículo (PDF)</th>
            <th>Match no Notion</th>
            <th>Vaga (Notion)</th>
            <th>Fase no sistema</th>
          </tr>
        </thead>
        <tbody>
          ${State.notion.matches.map(m => {
            const r = m.rowIdx >= 0 ? rows[m.rowIdx] : null;
            const stageNotion = r ? (r.estagio || "—") : "—";
            const mappedAuto = r ? mapNotionStage(r.estagio) : null;
            const warnUnmapped = r && r.estagio && !mappedAuto;
            return `
              <tr class="${m.rowIdx === -1 ? "row-unmatched" : ""}">
                <td>${escapeHtml(m.pdf.name)}</td>
                <td>
                  <select class="notion-row-select" data-i="${m.i}">
                    <option value="-1" ${m.rowIdx === -1 ? "selected" : ""}>— sem match (será criado avulso)</option>
                    ${rows.map((r, ri) => `<option value="${ri}" ${m.rowIdx === ri ? "selected" : ""}>${escapeHtml(r.nome || r.email || "Linha " + (ri+1))}${r.email ? " · " + escapeHtml(r.email) : ""}</option>`).join("")}
                  </select>
                  ${m.matchedBy ? `<div class="muted small">match: ${escapeHtml(m.matchedBy)} · ${escapeHtml(stageNotion)}${warnUnmapped ? ` <span class="warn-pill">estágio não mapeado</span>` : ""}</div>` : `<div class="muted small">nenhum match automático</div>`}
                </td>
                <td>${r ? escapeHtml(r.vaga || "—") : "—"}</td>
                <td>
                  <select class="notion-stage-select" data-i="${m.i}">
                    ${stages.map(s => `<option value="${s.id}" ${m.stage === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
                  </select>
                </td>
              </tr>`;
          }).join("")}
          ${orphanRows.length ? orphanRows.map(({ r }) => `
            <tr class="row-orphan">
              <td><em class="muted">— sem currículo —</em></td>
              <td>${escapeHtml(r.nome)} ${r.email ? `<span class="muted small">${escapeHtml(r.email)}</span>` : ""} <span class="muted small">${escapeHtml(r.estagio || "")}</span></td>
              <td>${escapeHtml(r.vaga || "—")}</td>
              <td class="muted small">ignorado</td>
            </tr>`).join("") : ""}
        </tbody>
      </table>

      <div class="notion-review-actions">
        <button class="btn btn-ghost-on-light btn-sm" id="notion-cancel">Cancelar</button>
        <button class="btn btn-primary" id="notion-import-run">Importar ${pdfs.length} candidato(s) →</button>
      </div>
    `;

    // bindings
    $$(".notion-row-select").forEach(s => s.addEventListener("change", () => {
      const i = parseInt(s.dataset.i, 10);
      const ri = parseInt(s.value, 10);
      State.notion.matches[i].rowIdx = ri;
      // re-mapeia stage automaticamente quando troca a linha
      if (ri >= 0) {
        const auto = mapNotionStage(State.notion.rows[ri].estagio);
        if (auto) State.notion.matches[i].stage = auto;
      }
      buildNotionReview();
    }));
    $$(".notion-stage-select").forEach(s => s.addEventListener("change", () => {
      const i = parseInt(s.dataset.i, 10);
      State.notion.matches[i].stage = s.value;
    }));
    $("#notion-cancel").addEventListener("click", () => {
      State.notion = { rows: [], pdfs: [], matches: [] };
      $("#notion-csv-status").textContent = "";
      $("#notion-pdfs-status").textContent = "";
      buildNotionReview();
    });
    $("#notion-import-run").addEventListener("click", runNotionImport);
  }

  async function runNotionImport() {
    const { matches, rows } = State.notion;
    if (!matches.length) { showToast("Nada para importar.", "warn"); return; }
    const btn = $("#notion-import-run");
    btn.disabled = true; btn.textContent = "Importando...";
    const cfg = Store.getConfig();
    let ok = 0, fail = 0;

    for (const m of matches) {
      try {
        const ext = (m.pdf.name.split(".").pop() || "").toLowerCase();
        let text = "";
        if (ext === "pdf" || m.pdf.type === "application/pdf") text = await extractPdfText(m.pdf);
        else text = await m.pdf.text();
        if (text.trim().length < 50) throw new Error("texto muito curto");

        const result = await AI.analyze({ resume: text, apiKey: cfg.apiKey, model: cfg.model, seed: State.seed });
        const d = result.data;

        // se houver linha do Notion, sobrescreve campos confiáveis
        const r = m.rowIdx >= 0 ? rows[m.rowIdx] : null;
        if (r) {
          if (r.nome)  d.fullName = r.nome;
          if (r.email) d.email = r.email;
        }

        const cand = {
          id: Store.nextId("cand"),
          ...d,
          stage: m.stage,                                  // ← fase final escolhida pelo gestor
          notes: r && r.notas ? r.notas : "",
          resumeText: text,
          source: result.source,
          notionImport: r ? { ...r, importedAt: new Date().toISOString() } : null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        const saved = Store.addCandidate(cand);
        await saveOriginalForCandidate(saved, m.pdf, text);
        // Não baixa dossiê em import do Notion — só no fluxo individual.
        ok++;
      } catch (err) {
        console.error("import falhou:", m.pdf?.name, err);
        fail++;
      }
    }

    btn.disabled = false; btn.textContent = `Importar ${matches.length} candidato(s) →`;
    showToast(`Importação concluída: ${ok} adicionado(s)${fail ? `, ${fail} falha(s)` : ""}.`, ok ? "success" : "warn");
    State.notion = { rows: [], pdfs: [], matches: [] };
    nav("funil");
  }

  // ---------- Upload de PDF / TXT ----------
  function bindDropzone() {
    const dz = $("#dropzone");
    const file = $("#resume-file");
    const pick = $("#pick-file");
    if (!dz || !file) return;

    pick.addEventListener("click", () => file.click());
    file.addEventListener("change", e => {
      const files = Array.from(e.target.files || []);
      if (files.length) handleFiles(files);
    });

    ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation(); dz.classList.add("over");
    }));
    ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation(); dz.classList.remove("over");
    }));
    dz.addEventListener("drop", e => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) handleFiles(files);
    });
  }

  function handleFiles(files) {
    if (files.length === 1) return handleFile(files[0]);
    runBatch(files);
  }

  async function readFileAsText(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf" || file.type === "application/pdf") return extractPdfText(file);
    if (ext === "txt" || file.type === "text/plain")     return file.text();
    throw new Error("formato n\u00e3o suportado (use PDF ou TXT)");
  }

  async function runBatch(files) {
    const targetStage = $("#target-stage")?.value || "triagem";
    const stageName = stageOf(targetStage).name;
    const out = $("#analysis-result");
    const batchRouted = [];
    out.classList.remove("empty");
    out.innerHTML = `
      <div class="result-card">
        <div class="result-head">
          <div>
            <div class="eyebrow gold">Processamento em lote \u2192 ${escapeHtml(stageName)}</div>
            <h2 id="batch-title">${files.length} curr\u00edculos na fila</h2>
            <div class="muted small" id="batch-progress">Aguarde \u2014 cada curr\u00edculo \u00e9 lido, analisado e adicionado \u00e0 fase <strong>${escapeHtml(stageName)}</strong>.</div>
          </div>
        </div>
        <ul class="batch-list" id="batch-list">
          ${files.map((f, i) => `
            <li class="batch-item" data-i="${i}">
              <div class="batch-icon" id="batch-icon-${i}">\u00b7\u00b7\u00b7</div>
              <div class="batch-info">
                <div class="batch-name">${escapeHtml(f.name)}</div>
                <div class="batch-status pending" id="batch-status-${i}">Aguardando na fila...</div>
              </div>
            </li>`).join("")}
        </ul>
        <div class="result-actions" id="batch-actions" hidden>
          <button class="btn btn-ghost-on-light" id="batch-discard">Limpar</button>
          <button class="btn btn-ghost-on-light" id="batch-go-funil">Ver no funil por est\u00e1gio</button>
          <button class="btn btn-primary" id="batch-go-vacancy">Ver no funil por vaga \u2192</button>
        </div>
      </div>`;

    const cfg = Store.getConfig();
    let success = 0, fail = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const setStatus = (txt, cls) => {
        const el = $(`#batch-status-${i}`);
        if (el) { el.innerHTML = txt; el.className = "batch-status " + cls; }
      };
      const setIcon = (sym, cls) => {
        const el = $(`#batch-icon-${i}`);
        if (el) { el.textContent = sym; el.className = "batch-icon " + cls; }
      };

      setIcon("\u25cb", "processing");
      setStatus(`Lendo arquivo (${Math.round(f.size / 1024)}KB)...`, "processing");
      try {
        if (f.size > 10 * 1024 * 1024) throw new Error("acima de 10MB");
        const text = await readFileAsText(f);
        if (text.trim().length < 50) throw new Error("texto extra\u00eddo muito curto (PDF escaneado?)");

        setStatus(cfg.apiKey ? "Analisando com Claude IA..." : "Analisando (modo heur\u00edstico)...", "processing");
        const result = await AI.analyze({ resume: text, apiKey: cfg.apiKey, model: cfg.model, seed: State.seed });
        const d = result.data;

        const cand = {
          id: Store.nextId("cand"),
          ...d,
          stage: targetStage, notes: "",
          resumeText: text, source: result.source,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        const saved = Store.addCandidate(cand);
        await saveOriginalForCandidate(saved, f, text);
        // Não baixa dossiê em batch — só no fluxo de envio individual.
        batchRouted.push({ candidate: saved, fileName: f.name });

        const v = vacancyOf(d.fitVacancyId);
        const fitClass = (d.fitScore || 0) >= 75 ? "high" : (d.fitScore || 0) >= 50 ? "mid" : "low";
        setIcon("\u2713", "ok");
        setStatus(
          `<strong>${escapeHtml(d.fullName || "Sem nome")}</strong> ` +
          `<span class="batch-fit ${fitClass}">score ${d.fitScore || 0}</span> ` +
          `\u00b7 \u2192 <strong>${escapeHtml(v.title)}</strong> ` +
          `<span class="muted small">\u00b7 ${escapeHtml(f.name)}</span>`,
          "done"
        );
        success++;
      } catch (err) {
        console.error(err);
        setIcon("!", "error");
        setStatus(`Falha: ${escapeHtml(err.message || "erro desconhecido")}`, "error");
        fail++;
      }
      $("#batch-progress").textContent = `${i + 1} de ${files.length} processados \u00b7 ${success} adicionados ao funil${fail ? " \u00b7 " + fail + " com falha" : ""}.`;
    }

    $("#batch-title").textContent = success === files.length
      ? `${success} curr\u00edculos analisados e adicionados \u00e0 fase ${stageName}`
      : `${success} adicionados em ${stageName} \u00b7 ${fail} com falha`;

    // Resumo do roteamento por vaga
    if (batchRouted.length) {
      const byVac = {};
      batchRouted.forEach(r => {
        const vid = r.candidate.fitVacancyId || "_none";
        byVac[vid] = (byVac[vid] || 0) + 1;
      });
      const vagaCount = Object.keys(byVac).length;
      const routedList = Object.entries(byVac).sort((a, b) => b[1] - a[1]).map(([vid, n]) => {
        const title = vid === "_none" ? "Sem vaga sugerida" : (vacancyOf(vid).title || vid);
        return `<li><strong>${escapeHtml(title)}</strong> \u00b7 ${n} candidato${n > 1 ? "s" : ""}</li>`;
      }).join("");
      const summaryHtml = `
        <div class="batch-summary">
          <div class="block-label">Resumo do roteamento</div>
          <div class="batch-summary-headline">${batchRouted.length} candidatos roteados para ${vagaCount} vaga(s)</div>
          <ul class="batch-summary-list">${routedList}</ul>
        </div>`;
      $("#batch-list").insertAdjacentHTML("afterend", summaryHtml);
    }

    $("#batch-actions").hidden = false;
    $("#batch-discard").addEventListener("click", () => {
      $("#analysis-result").classList.add("empty");
      $("#analysis-result").innerHTML = `<div class="empty-state"><div class="empty-icon">\u25c6</div><h3>Pronto para o pr\u00f3ximo lote</h3><p>Carregue novos curr\u00edculos para continuar.</p></div>`;
      $("#resume-file").value = "";
    });
    $("#batch-go-funil").addEventListener("click", () => { State.pipeBoardMode = "stage"; nav("funil"); });
    $("#batch-go-vacancy").addEventListener("click", () => { State.pipeBoardMode = "vacancy"; nav("funil"); });
    showToast(`${success} candidato(s) adicionado(s) em ${stageName}.`, success ? "success" : "warn");
  }

  async function handleFile(file) {
    const status = $("#dropzone-status");
    const showStatus = (html, type = "info") => {
      status.hidden = false;
      status.className = "dropzone-status " + type;
      status.innerHTML = html;
    };

    const name = file.name || "arquivo";
    const sizeKB = Math.round(file.size / 1024);
    const ext = (name.split(".").pop() || "").toLowerCase();

    if (file.size > 10 * 1024 * 1024) {
      showStatus(`<strong>${escapeHtml(name)}</strong> \u2014 acima de 10MB. Reduza o arquivo.`, "warn");
      return;
    }

    try {
      let text = "";
      if (ext === "pdf" || file.type === "application/pdf") {
        showStatus(`Extraindo texto de <strong>${escapeHtml(name)}</strong>...`);
        text = await extractPdfText(file);
      } else if (ext === "txt" || file.type === "text/plain") {
        showStatus(`Lendo <strong>${escapeHtml(name)}</strong>...`);
        text = await file.text();
      } else {
        showStatus(`Formato n\u00e3o suportado. Use PDF ou TXT (DOCX: salve como PDF antes).`, "warn");
        return;
      }

      $("#resume-text").value = text.trim();
      State.currentFile = file;
      const charCount = text.trim().length;
      if (charCount < 50) {
        showStatus(`<strong>${escapeHtml(name)}</strong> processado, mas o texto extra\u00eddo \u00e9 muito curto (${charCount} caracteres). Pode ser um PDF escaneado (imagem). Cole o texto manualmente.`, "warn");
      } else {
        showStatus(`<strong>${escapeHtml(name)}</strong> \u00b7 ${sizeKB}KB \u00b7 ${charCount} caracteres extra\u00eddos. Pronto para analisar.`, "ok");
      }
    } catch (err) {
      console.error(err);
      showStatus(`Falha ao processar <strong>${escapeHtml(name)}</strong>: ${escapeHtml(err.message || "erro desconhecido")}.`, "warn");
    }
  }

  async function extractPdfText(file) {
    if (!window.pdfjsLib) throw new Error("Biblioteca PDF n\u00e3o carregada.");
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      // Reagrupa por linha usando a posi\u00e7\u00e3o Y dos itens (PDF.js d\u00e1 itens posicionados)
      const lines = [];
      let curY = null;
      let curLine = [];
      for (const it of tc.items) {
        const y = it.transform ? Math.round(it.transform[5]) : 0;
        if (curY === null || Math.abs(y - curY) > 2) {
          if (curLine.length) lines.push(curLine.join(" "));
          curLine = [it.str];
          curY = y;
        } else {
          curLine.push(it.str);
        }
      }
      if (curLine.length) lines.push(curLine.join(" "));
      pages.push(lines.join("\n"));
    }
    return pages.join("\n\n");
  }

  async function runAnalysis() {
    const txt = $("#resume-text").value.trim();
    if (!txt) { showToast("Cole o curr\u00edculo antes de analisar.", "warn"); return; }
    const btn = $("#btn-analyze");
    btn.disabled = true; btn.textContent = "Analisando...";
    const out = $("#analysis-result");
    out.classList.remove("empty");
    out.innerHTML = `<div class="loading"><div class="spinner"></div><div>Lendo curr\u00edculo e adicionando ao banco...</div></div>`;

    try {
      const cfg = Store.getConfig();
      const result = await AI.analyze({ resume: txt, apiKey: cfg.apiKey, model: cfg.model, seed: State.seed });
      const targetStage = $("#target-stage")?.value || "triagem";
      const cand = {
        id: Store.nextId("cand"),
        ...result.data,
        stage: targetStage,
        notes: "",
        resumeText: txt,
        source: result.source,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const saved = Store.addCandidate(cand);
      // Salva o blob original (PDF se foi PDF; gera PDF se foi TXT/paste)
      const savedRec = await saveOriginalForCandidate(saved, State.currentFile, txt);
      State.analysis = result;
      State.currentFile = null;
      try { Dossier.downloadPdf(saved, State.seed); } catch (e) { console.warn("Dossi\u00ea auto-download falhou:", e); }
      renderAnalysisResult(saved, result.source, txt, savedRec);
      showToast(`${saved.fullName || "Candidato"} adicionado ao banco de talentos.`, "success");
    } catch (err) {
      console.error(err);
      out.innerHTML = `
        <div class="error-state">
          <h3>Falha na an\u00e1lise</h3>
          <p>${escapeHtml(err.message || "Erro desconhecido.")}</p>
          <p class="muted small">Verifique a chave da Claude API em Configura\u00e7\u00f5es ou tente o modo heur\u00edstico (sem chave).</p>
        </div>`;
    } finally {
      btn.disabled = false; btn.textContent = "Analisar curr\u00edculo";
    }
  }

  function renderAnalysisResult(d, source, resumeText, originalRec) {
    const v = vacancyOf(d.fitVacancyId);
    const fit = d.fitScore || 0;
    const fitClass = fit >= 75 ? "high" : fit >= 50 ? "mid" : "low";
    const candId = d.id;
    $("#analysis-result").innerHTML = `
      <div class="result-card">
        <div class="saved-banner">
          <span class="saved-badge">\u2713 Adicionado ao banco de talentos</span>
          <span class="muted small">${originalRec ? (originalRec.kind === "pdf-original" ? "PDF original arquivado" : "Curr\u00edculo convertido em PDF e arquivado") : "curr\u00edculo salvo"}</span>
        </div>
        <div class="result-head">
          <div>
            <div class="eyebrow ${source === "claude" ? "gold" : "muted"}">${source === "claude" ? "An\u00e1lise por Claude IA" : "An\u00e1lise heur\u00edstica"}</div>
            <h2>${escapeHtml(d.fullName || "Candidato sem nome")}</h2>
            <div class="muted small">${escapeHtml(d.email || "\u2014")} \u00b7 ${escapeHtml(d.phone || "\u2014")} \u00b7 ${escapeHtml(d.city || "\u2014")}${d.state ? " / " + escapeHtml(d.state) : ""}</div>
          </div>
          <div class="fit-score ${fitClass}">
            <div class="fit-num">${fit}%</div>
            <div class="fit-label">ader\u00eancia</div>
          </div>
        </div>

        <div class="result-grid">
          <div class="result-block">
            <div class="block-label">Vaga sugerida</div>
            <div class="block-value">${escapeHtml(v.title)}</div>
            <div class="block-sub">${seniorityLabel(d.fitSeniority)} \u00b7 ${v.months.min}\u2013${v.months.max} meses \u00b7 ${escapeHtml(v.potentialGross)}</div>
          </div>
          <div class="result-block">
            <div class="block-label">Tempo de experi\u00eancia</div>
            <div class="block-value">${(d.experienceYears || 0)}a ${(d.experienceMonths || 0)}m</div>
            <div class="block-sub">em finan\u00e7as / wealth / consultoria</div>
          </div>
          <div class="result-block">
            <div class="block-label">Senioridade</div>
            <div class="block-value">${seniorityLabel(d.fitSeniority)}</div>
            <div class="block-sub">classifica\u00e7\u00e3o sugerida</div>
          </div>
        </div>

        <div class="result-section">
          <div class="block-label">Expertises detectadas</div>
          ${(d.expertises || []).length
            ? `<div class="tag-grid">${d.expertises.map(e => `<span class="tag tag-strong" title="${escapeHtml(e.evidence || "")}">${escapeHtml(expertiseName(e.id))}</span>`).join("")}</div>`
            : `<div class="muted">Nenhuma expertise core encontrada.</div>`}
        </div>

        <div class="result-section">
          <div class="block-label">Certifica\u00e7\u00f5es</div>
          ${(d.certifications || []).length
            ? `<div class="tag-grid">${d.certifications.map(c => `<span class="tag tag-cert">${escapeHtml(certName(c.id))}</span>`).join("")}</div>`
            : `<div class="muted">Nenhuma certifica\u00e7\u00e3o financeira identificada.</div>`}
        </div>

        ${d.fitJustification ? `
        <div class="result-section">
          <div class="block-label">Justificativa</div>
          <p>${escapeHtml(d.fitJustification)}</p>
        </div>` : ""}

        ${(d.highlights || []).length ? `
        <div class="result-section">
          <div class="block-label">Destaques</div>
          <ul class="bullet-list">${d.highlights.map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>
        </div>` : ""}

        ${(d.redFlags || []).length ? `
        <div class="result-section warn">
          <div class="block-label">Pontos de aten\u00e7\u00e3o</div>
          <ul class="bullet-list">${d.redFlags.map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>
        </div>` : ""}

        <div class="result-actions">
          <button class="btn btn-ghost-on-light" id="new-analysis">+ Lan\u00e7ar outro curr\u00edculo</button>
          <button class="btn btn-ghost-on-light" id="dl-original-now">\u2b07 Baixar curr\u00edculo (PDF)</button>
          <button class="btn btn-ghost-on-light" id="del-just-added">Remover do banco</button>
          <button class="btn btn-primary" id="open-detail">Abrir ficha completa \u2192</button>
        </div>
      </div>`;

    $("#new-analysis").addEventListener("click", () => {
      State.analysis = null;
      $("#resume-text").value = "";
      $("#resume-file").value = "";
      $("#dropzone-status").hidden = true;
      $("#analysis-result").classList.add("empty");
      $("#analysis-result").innerHTML = `<div class="empty-state"><div class="empty-icon">\u25c6</div><h3>Pronto para o pr\u00f3ximo</h3><p>Carregue outro curr\u00edculo ou cole o texto.</p></div>`;
    });
    $("#dl-original-now").addEventListener("click", async () => {
      const fresh = Store.getCandidates().find(x => x.id === candId);
      if (fresh) await downloadOriginalCV(fresh);
    });
    $("#del-just-added").addEventListener("click", () => {
      if (!confirm(`Remover ${d.fullName || "este candidato"} do banco de talentos?`)) return;
      Store.removeCandidate(candId);
      showToast("Candidato removido do banco.", "success");
      $("#new-analysis").click();
    });
    $("#open-detail").addEventListener("click", () => nav("candidato", { currentCandidateId: candId }));
  }

  // ---------- INDICADORES ----------
  function renderIndicadores() {
    const cands = Store.getCandidates();
    const total = cands.length;

    const byVacancy = countBy(cands, c => c.fitVacancyId);
    const bySeniority = countBy(cands, c => c.fitSeniority);
    const byStage = countBy(cands, c => c.stage);
    const byState = countBy(cands, c => c.state || "?");
    const byExpertise = countItems(cands.flatMap(c => (c.expertises || []).map(e => e.id || e)));
    const byCert = countItems(cands.flatMap(c => (c.certifications || []).map(e => e.id || e)));

    $("#view-indicadores").innerHTML = `
      <div class="container">
        <div class="section-head">
          <div>
            <div class="eyebrow gold">Indicadores</div>
            <h1>Vis\u00e3o gerencial do funil</h1>
            <p class="lead">Distribui\u00e7\u00e3o de candidatos por vaga, senioridade, est\u00e1gio do funil, expertises e certifica\u00e7\u00f5es.</p>
          </div>
        </div>

        ${kpiCards()}

        <div class="charts-grid">
          ${chartCard("Por est\u00e1gio do funil", State.seed.pipeline.map(s => ({ label: s.name, value: byStage[s.id] || 0, tone: s.tone })))}
          ${chartCard("Por vaga", State.seed.vacancies.map(v => ({ label: v.title, value: byVacancy[v.id] || 0, tone: "navy" })))}
          ${chartCard("Por senioridade", ["estagiario", "junior", "pleno", "senior"].map(s => ({ label: seniorityLabel(s), value: bySeniority[s] || 0, tone: "gold" })))}
          ${chartCard("Top expertises", topN(byExpertise, 8).map(([id, v]) => ({ label: expertiseName(id), value: v, tone: "navy2" })))}
          ${chartCard("Top certifica\u00e7\u00f5es", topN(byCert, 8).map(([id, v]) => ({ label: certName(id), value: v, tone: "amber" })))}
          ${chartCard("Por estado", topN(byState, 10).map(([id, v]) => ({ label: id || "\u2014", value: v, tone: "green" })))}
        </div>

        ${total === 0 ? `<div class="empty-block"><h3>Sem dados ainda</h3><p>Lance algumas an\u00e1lises de curr\u00edculo para popular os indicadores.</p><button class="btn btn-primary" data-nav="analise">Iniciar primeira an\u00e1lise</button></div>` : ""}
      </div>`;

    $$('[data-nav="analise"]', $("#view-indicadores")).forEach(b => b.addEventListener("click", () => nav("analise")));
  }

  function countBy(arr, fn) {
    const out = {};
    arr.forEach(x => { const k = fn(x); if (k == null) return; out[k] = (out[k] || 0) + 1; });
    return out;
  }
  function countItems(arr) {
    const out = {};
    arr.forEach(k => { if (!k) return; out[k] = (out[k] || 0) + 1; });
    return out;
  }
  function topN(obj, n) {
    return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
  }
  function chartCard(title, items) {
    const max = Math.max(1, ...items.map(i => i.value));
    return `
      <div class="chart-card">
        <h3>${escapeHtml(title)}</h3>
        ${items.length === 0 || items.every(i => i.value === 0)
          ? `<div class="muted small">sem dados</div>`
          : `<div class="bars">
              ${items.map(i => `
                <div class="bar-row">
                  <div class="bar-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</div>
                  <div class="bar-track">
                    <div class="bar bar-${i.tone}" style="width:${(i.value / max) * 100}%"></div>
                  </div>
                  <div class="bar-value">${i.value}</div>
                </div>`).join("")}
            </div>`}
      </div>`;
  }

  // ---------- PLANILHA ----------
  function renderPlanilha() {
    const cands = Store.getCandidates();
    $("#view-planilha").innerHTML = `
      <div class="container">
        <div class="section-head">
          <div>
            <div class="eyebrow gold">Planilha consolidada</div>
            <h1>Banco de candidatos</h1>
            <p class="lead">Todos os campos centrais em uma vis\u00e3o tabular. Exporte em CSV para abrir em Excel/Sheets.</p>
          </div>
          <div class="head-actions">
            <input type="search" id="tbl-search" placeholder="Buscar por nome, e-mail, expertise..." />
            <button class="btn btn-ghost-on-light" id="export-csv">Exportar CSV</button>
            <button class="btn btn-ghost-on-light" id="export-zip">\u2b07 Pasta de curr\u00edculos (ZIP)</button>
            <button class="btn btn-primary" data-nav="analise">+ Nova an\u00e1lise</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table" id="tbl-candidates">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Cidade/UF</th>
                <th>Tempo</th>
                <th>Vaga sugerida</th>
                <th>Senioridade</th>
                <th>Expertises</th>
                <th>Certifica\u00e7\u00f5es</th>
                <th>Score</th>
                <th>Est\u00e1gio</th>
                <th>Criado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${cands.length ? cands.map(c => rowHTML(c)).join("") : `
                <tr><td colspan="13" class="empty-row">Nenhum candidato cadastrado ainda. Lance sua primeira an\u00e1lise.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    $$('[data-nav="analise"]', $("#view-planilha")).forEach(b => b.addEventListener("click", () => nav("analise")));
    $("#export-csv").addEventListener("click", exportCSV);
    $("#export-zip").addEventListener("click", exportZip);
    $("#tbl-search").addEventListener("input", e => filterTable(e.target.value));
    $$(".tbl-open").forEach(a => a.addEventListener("click", e => {
      e.preventDefault();
      nav("candidato", { currentCandidateId: a.dataset.id });
    }));
  }

  async function exportZip() {
    if (!window.JSZip) { showToast("Biblioteca ZIP não carregada.", "warn"); return; }
    const cands = Store.getCandidates();
    if (!cands.length) { showToast("Nada a exportar.", "warn"); return; }
    const btn = $("#export-zip");
    btn.disabled = true; btn.textContent = "Empacotando...";

    try {
      const zip = new JSZip();
      const folderName = "Curriculos IBBRA " + new Date().toISOString().slice(0, 10);
      const folder = zip.folder(folderName);
      const dossierFolder = zip.folder(folderName + "/Dossies");

      let withOriginal = 0, missing = 0;
      for (const c of cands) {
        const base = Dossier.sanitizeFilename(c.fullName);
        try {
          const rec = await Store.Originals.get(c.id);
          if (rec && rec.blob) {
            folder.file(base + ".pdf", rec.blob);
            withOriginal++;
          } else {
            missing++;
          }
        } catch (e) { missing++; }
        // Dossie
        try {
          const doc = Dossier.buildPdf(c, State.seed);
          dossierFolder.file(base + " — dossie.pdf", doc.output("blob"));
        } catch (e) { console.warn("Falha gerando dossie:", e); }
      }

      // README
      folder.file("LEIA-ME.txt",
        `Banco de talentos IBBRA — exportação ${new Date().toLocaleString("pt-BR")}\n\n` +
        `${cands.length} candidatos\n` +
        `${withOriginal} com currículo original arquivado\n` +
        `${missing} sem currículo original\n\n` +
        `Pasta /Dossies contém os dossiês estruturados gerados pelo sistema.`);

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = folderName + ".zip";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
      showToast(`ZIP gerado: ${cands.length} candidatos (${withOriginal} com PDF, ${missing} sem).`, "success");
    } catch (err) {
      console.error(err);
      showToast("Falha no ZIP: " + (err.message || "erro"), "warn");
    } finally {
      btn.disabled = false; btn.textContent = "⬇ Pasta de currículos (ZIP)";
    }
  }

  function rowHTML(c) {
    const v = vacancyOf(c.fitVacancyId);
    const exps = (c.expertises || []).map(e => expertiseName(e.id || e)).join(", ");
    const certs = (c.certifications || []).map(e => certName(e.id || e)).join(", ");
    const tempo = `${c.experienceYears || 0}a ${c.experienceMonths || 0}m`;
    const fit = c.fitScore || 0;
    const fitClass = fit >= 75 ? "high" : fit >= 50 ? "mid" : "low";
    return `<tr>
      <td><strong>${escapeHtml(c.fullName || "\u2014")}</strong></td>
      <td>${escapeHtml(c.phone || "\u2014")}</td>
      <td>${escapeHtml(c.email || "\u2014")}</td>
      <td>${escapeHtml(c.city || "")}${c.state ? "/" + escapeHtml(c.state) : ""}</td>
      <td>${tempo}</td>
      <td>${escapeHtml(v.title)}</td>
      <td>${seniorityLabel(c.fitSeniority)}</td>
      <td class="cell-tags">${escapeHtml(exps) || "\u2014"}</td>
      <td class="cell-tags">${escapeHtml(certs) || "\u2014"}</td>
      <td><span class="pill pill-${fitClass}">${fit}%</span></td>
      <td>${escapeHtml(stageOf(c.stage).name)}</td>
      <td class="muted">${fmtDate(c.createdAt)}</td>
      <td><a href="#" class="tbl-open" data-id="${c.id}">abrir</a></td>
    </tr>`;
  }

  function filterTable(q) {
    q = q.trim().toLowerCase();
    $$("#tbl-candidates tbody tr").forEach(tr => {
      tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  }

  function exportCSV() {
    const cands = Store.getCandidates();
    if (!cands.length) { showToast("Nada a exportar.", "warn"); return; }
    const cols = [
      "Nome completo","Telefone","E-mail","Cidade","Estado","LinkedIn",
      "Anos exp.","Meses exp.","Vaga sugerida","Senioridade","Score (%)",
      "Expertises","Certifica\u00e7\u00f5es","Idiomas","Est\u00e1gio do funil",
      "Justificativa","Destaques","Pontos de aten\u00e7\u00e3o","Anota\u00e7\u00f5es RH","Criado em"
    ];
    const rows = cands.map(c => {
      const v = vacancyOf(c.fitVacancyId);
      return [
        c.fullName, c.phone, c.email, c.city, c.state, c.linkedin,
        c.experienceYears || 0, c.experienceMonths || 0,
        v.title, seniorityLabel(c.fitSeniority), c.fitScore || 0,
        (c.expertises || []).map(e => expertiseName(e.id || e)).join(" | "),
        (c.certifications || []).map(e => certName(e.id || e)).join(" | "),
        (c.languages || []).join(" | "),
        stageOf(c.stage).name,
        c.fitJustification || "",
        (c.highlights || []).join(" | "),
        (c.redFlags || []).join(" | "),
        c.notes || "",
        c.createdAt
      ];
    });
    const csv = "\ufeff" + [cols, ...rows].map(r =>
      r.map(cell => {
        const s = String(cell ?? "");
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(";")
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ibbra-rh-candidatos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast("CSV gerado.", "success");
  }

  // ---------- DETALHE DO CANDIDATO ----------
  const DIMENSIONS = [
    { id: "tecnica",             label: "Ader\u00eancia t\u00e9cnica" },
    { id: "cultural",            label: "Ader\u00eancia cultural" },
    { id: "comunicacao",         label: "Comunica\u00e7\u00e3o" },
    { id: "disponibilidade",     label: "Disponibilidade" },
    { id: "pretensao_salarial",  label: "Pretens\u00e3o salarial" }
  ];
  const RECOMMENDATIONS = [
    { id: "avancar",    label: "Avan\u00e7ar",    tone: "high" },
    { id: "considerar", label: "Considerar", tone: "mid" },
    { id: "reprovar",   label: "Reprovar",   tone: "low" }
  ];
  function recLabel(id) { return (RECOMMENDATIONS.find(r => r.id === id) || {}).label || id; }
  function recTone(id)  { return (RECOMMENDATIONS.find(r => r.id === id) || {}).tone || "mid"; }

  // helpers de exibição para hard/soft skills + trilhas
  function softSkillName(id) { return (State.seed.softSkills || []).find(s => s.id === id)?.name || id; }
  function hardSkillName(id) { return (State.seed.hardSkills || []).find(s => s.id === id)?.name || id; }
  function trailById(id) { return (State.seed.trails || []).find(t => t.id === id); }

  function fmtDateInput(iso) {
    if (!iso) return "";
    try { const d = new Date(iso); return d.toISOString().slice(0, 10); }
    catch { return ""; }
  }

  function ratingRow(prefix, item, currentValue) {
    let html = `<div class="rating-row" data-skill="${item.id}" data-prefix="${prefix}" data-value="${currentValue || 0}"><div class="rating-label">${escapeHtml(item.name)}</div><div class="rating-stars">`;
    for (let i = 1; i <= 5; i++) {
      html += `<button type="button" class="rstar ${i <= currentValue ? "on" : ""}" data-v="${i}" aria-label="${i} estrelas">★</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function evalCardHTML(c) {
    const soft = State.seed.softSkills || [];
    const hard = State.seed.hardSkills || [];
    // Agrupar hard skills por área
    const hardByArea = {};
    hard.forEach(h => { (hardByArea[h.area] = hardByArea[h.area] || []).push(h); });
    const areaLabels = { financeiro: "Financeiro / Wealth", marketing: "Marketing", ti: "TI", administrativo: "Administrativo", comercial: "Comercial", rh: "RH" };

    const evals = c.interviewerEvals || [];
    const evalsHTML = evals.length ? `
      <div class="eval-thread">
        ${evals.map(e => {
          const softList = Object.entries(e.softSkills || {}).filter(([, v]) => v > 0);
          const hardList = Object.entries(e.hardSkills || {}).filter(([, v]) => v > 0);
          return `
            <div class="eval-item">
              <div class="eval-head">
                <div><strong>${escapeHtml(e.author)}</strong> <span class="muted small">· ${escapeHtml(e.role)}</span></div>
                <div class="muted small">${fmtDateTime(e.ts)}</div>
              </div>
              ${softList.length ? `<div class="eval-block"><div class="eval-block-label">Soft skills</div><div class="eval-stars-list">${softList.map(([id, v]) => `<div><span>${escapeHtml(softSkillName(id))}</span><span class="stars-display"><span class="on-stars">${"★".repeat(v)}</span><span class="off">${"★".repeat(5-v)}</span></span></div>`).join("")}</div></div>` : ""}
              ${hardList.length ? `<div class="eval-block"><div class="eval-block-label">Hard skills</div><div class="eval-stars-list">${hardList.map(([id, v]) => `<div><span>${escapeHtml(hardSkillName(id))}</span><span class="stars-display"><span class="on-stars">${"★".repeat(v)}</span><span class="off">${"★".repeat(5-v)}</span></span></div>`).join("")}</div></div>` : ""}
              ${e.comment ? `<p class="eval-comment">${escapeHtml(e.comment)}</p>` : ""}
              <button class="linklike eval-del" data-eval="${e.id}">remover</button>
            </div>`;
        }).join("")}
      </div>` : `<p class="muted small">Nenhuma avaliação ainda. Adicione a sua usando o formulário abaixo.</p>`;

    return `
      <div class="card" id="section-evaluations">
        <h3>Avaliações por entrevistador <span class="muted small" style="font-weight:400">— soft & hard skills</span></h3>
        ${evalsHTML}

        <details class="eval-form-wrap">
          <summary class="eval-summary">+ Adicionar avaliação</summary>
          <div class="eval-form">
            <div class="skill-tabs" role="tablist">
              <button type="button" class="skill-tab active" data-tab="soft" role="tab">Soft skills</button>
              <button type="button" class="skill-tab" data-tab="hard" role="tab">Hard skills</button>
            </div>
            <div class="skill-tab-panel" data-panel="soft">
              <div class="rating-list">
                ${soft.map(s => ratingRow("soft", s, 0)).join("")}
              </div>
            </div>
            <div class="skill-tab-panel" data-panel="hard" hidden>
              ${Object.entries(hardByArea).map(([area, items]) => `
                <div class="hard-area">
                  <div class="block-label">${escapeHtml(areaLabels[area] || area)}</div>
                  <div class="rating-list">
                    ${items.map(h => ratingRow("hard", h, 0)).join("")}
                  </div>
                </div>`).join("")}
            </div>
            <label>Comentário geral</label>
            <textarea id="eval-comment" rows="3" placeholder="Pontos fortes, dúvidas, contexto..."></textarea>
            <div class="card-actions">
              <button type="button" class="btn btn-primary btn-sm" id="submit-eval">Enviar avaliação</button>
            </div>
          </div>
        </details>
      </div>`;
  }

  // Tipo de módulo → ícone (visual da trilha)
  const MODULE_TYPE_ICON = { video: "▶", course: "◈", reading: "📖", task: "✓" };

  function trailStepperHTML(trail, assignment, editable = true) {
    const completed = new Set(assignment.completedModules);
    const currentIdx = trail.modules.findIndex(m => !completed.has(m.id));
    return `
      <ol class="trail-stepper">
        ${trail.modules.map((m, i) => {
          const isDone = completed.has(m.id);
          const isCurrent = !isDone && i === currentIdx;
          const cls = isDone ? "done" : isCurrent ? "current" : "pending";
          const icon = isDone ? "✓" : isCurrent ? "●" : (i + 1);
          return `
            <li class="trail-step trail-step-${cls}">
              <div class="step-marker">${icon}</div>
              <div class="step-body">
                <div class="step-title">${escapeHtml(m.title)}</div>
                <div class="step-meta">${escapeHtml(MODULE_TYPE_ICON[m.type] || "•")} ${escapeHtml(m.type)}${m.duration ? " · " + escapeHtml(m.duration) : ""}</div>
                ${editable ? `<label class="step-action">
                  <input type="checkbox" class="trail-mod-check" data-trail="${trail.id}" data-module="${m.id}" ${isDone ? "checked" : ""} />
                  ${isDone ? "Concluído" : isCurrent ? "Marcar como concluído" : "Aguardando módulos anteriores"}
                </label>` : ""}
              </div>
            </li>`;
        }).join("")}
      </ol>`;
  }

  function trailsCardHTML(c) {
    const trails = State.seed.trails || [];
    const assigned = c.trails || [];
    const assignedMap = Object.fromEntries(assigned.map(t => [t.trailId, t]));

    return `
      <div class="card" id="section-trails">
        <h3>Trilhas de desenvolvimento <span class="muted small" style="font-weight:400">— T&D</span></h3>
        ${trails.length === 0 ? `<p class="muted small">Nenhuma trilha cadastrada no seed.</p>` : ""}
        <div class="trails-list">
          ${trails.map(t => {
            const a = assignedMap[t.id];
            const done = a ? a.completedModules.length : 0;
            const total = t.modules.length;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return `
              <div class="trail-card ${a ? "assigned" : ""}">
                <div class="trail-head">
                  <div>
                    <div class="trail-title">${escapeHtml(t.title)}</div>
                    <div class="muted small">${escapeHtml(t.desc || "")}</div>
                  </div>
                  <div class="trail-actions">
                    ${a
                      ? `<span class="trail-progress ${a.completedAt ? "done" : ""}">${pct}% · ${done}/${total}</span>
                         <button class="btn btn-ghost-on-light btn-sm trail-unassign" data-trail="${t.id}">Remover</button>`
                      : `<button class="btn btn-primary btn-sm trail-assign" data-trail="${t.id}">Atribuir trilha</button>`}
                  </div>
                </div>
                ${a ? trailStepperHTML(t, a, true) : ""}
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }

  function oneononesCardHTML(c) {
    const list = c.oneonones || [];
    return `
      <div class="card" id="section-oneonones">
        <h3>1:1s <span class="muted small" style="font-weight:400">— acompanhamento periódico</span></h3>

        <details class="oneonone-form-wrap">
          <summary>+ Agendar 1:1</summary>
          <div class="oneonone-form">
            <label>Quando</label>
            <input type="datetime-local" id="oo-date" />
            <label>Pauta</label>
            <textarea id="oo-agenda" rows="2" placeholder="Tópicos a discutir, expectativas, dúvidas..."></textarea>
            <div class="card-actions">
              <button class="btn btn-primary btn-sm" id="oo-add">Agendar</button>
            </div>
          </div>
        </details>

        ${list.length ? `
          <div class="oneonone-list">
            ${list.map(o => `
              <div class="oneonone-item ${o.status === "concluido" ? "concluded" : ""}" data-one="${o.id}">
                <div class="oneonone-head">
                  <div>
                    <div class="oneonone-when">${fmtDateTime(o.scheduledFor)}</div>
                    <div class="muted small">Conduzido por ${escapeHtml(o.manager)} · ${escapeHtml(o.status)}</div>
                  </div>
                  <div class="oneonone-actions">
                    ${o.status !== "concluido" ? `<button class="btn btn-ghost-on-light btn-sm oo-conclude" data-one="${o.id}">Marcar como concluído</button>` : ""}
                    <button class="btn btn-ghost-on-light btn-sm oo-remove" data-one="${o.id}">×</button>
                  </div>
                </div>
                ${o.agenda ? `<div class="oneonone-block"><div class="block-label">Pauta</div><p>${escapeHtml(o.agenda)}</p></div>` : ""}
                <div class="oneonone-block">
                  <div class="block-label">Notas da reunião</div>
                  <textarea class="oo-notes" data-one="${o.id}" rows="2" placeholder="Pontos discutidos, decisões, próximos passos...">${escapeHtml(o.notes || "")}</textarea>
                </div>
              </div>`).join("")}
          </div>
        ` : `<p class="muted small">Nenhuma 1:1 agendada. Use o formulário acima para começar.</p>`}
      </div>`;
  }

  function pdiCardHTML(c) {
    const goals = (c.pdi && c.pdi.goals) || [];
    return `
      <div class="card" id="section-pdi">
        <h3>PDI <span class="muted small" style="font-weight:400">— Plano de Desenvolvimento Individual</span></h3>

        <details class="pdi-form-wrap">
          <summary>+ Adicionar objetivo</summary>
          <div class="pdi-form">
            <label>Título do objetivo</label>
            <input type="text" id="pdi-title" placeholder="Ex.: Conquistar certificação CFP" />
            <label>Competência alvo</label>
            <input type="text" id="pdi-comp" placeholder="Ex.: Planejamento sucessório" />
            <label>Descrição</label>
            <textarea id="pdi-desc" rows="2" placeholder="Como esse objetivo será desenvolvido"></textarea>
            <label>Prazo</label>
            <input type="date" id="pdi-deadline" />
            <div class="card-actions">
              <button class="btn btn-primary btn-sm" id="pdi-add">Adicionar objetivo</button>
            </div>
          </div>
        </details>

        ${goals.length ? `
          <div class="pdi-list">
            ${goals.map(g => `
              <div class="pdi-item pdi-status-${g.status}" data-goal="${g.id}">
                <div class="pdi-head">
                  <div>
                    <div class="pdi-title">${escapeHtml(g.title)}</div>
                    ${g.competency ? `<div class="muted small">Competência: ${escapeHtml(g.competency)}</div>` : ""}
                    ${g.deadline ? `<div class="muted small">Prazo: ${fmtDate(g.deadline)}</div>` : ""}
                  </div>
                  <select class="pdi-status-select" data-goal="${g.id}">
                    <option value="pendente"   ${g.status === "pendente" ? "selected" : ""}>Pendente</option>
                    <option value="em_progresso" ${g.status === "em_progresso" ? "selected" : ""}>Em progresso</option>
                    <option value="concluido"  ${g.status === "concluido" ? "selected" : ""}>Concluído</option>
                    <option value="bloqueado"  ${g.status === "bloqueado" ? "selected" : ""}>Bloqueado</option>
                  </select>
                </div>
                ${g.description ? `<p class="pdi-desc">${escapeHtml(g.description)}</p>` : ""}
                <button class="linklike pdi-remove" data-goal="${g.id}">remover</button>
              </div>`).join("")}
          </div>
        ` : `<p class="muted small">Nenhum objetivo no PDI ainda.</p>`}
      </div>`;
  }

  function feedbackCardHTML(c) {
    const list = c.feedbacks || [];
    return `
      <div class="card" id="section-feedbacks">
        <h3>Feedback <span class="muted small" style="font-weight:400">— mural de feedbacks</span></h3>

        <div class="fb-form">
          <div class="fb-type-row">
            <label class="fb-type-opt active" data-type="positivo"><input type="radio" name="fb-type" value="positivo" checked /> Positivo</label>
            <label class="fb-type-opt" data-type="construtivo"><input type="radio" name="fb-type" value="construtivo" /> Construtivo</label>
            <label class="fb-type-opt" data-type="reconhecimento"><input type="radio" name="fb-type" value="reconhecimento" /> Reconhecimento</label>
          </div>
          <textarea id="fb-text" rows="2" placeholder="Escreva o feedback de forma específica, focando em comportamento observado..."></textarea>
          <div class="card-actions">
            <button class="btn btn-primary btn-sm" id="fb-add">Enviar feedback</button>
          </div>
        </div>

        ${list.length ? `
          <div class="fb-list">
            ${list.map(f => `
              <div class="fb-item fb-${f.type}">
                <div class="fb-head">
                  <div><strong>${escapeHtml(f.from)}</strong> · <span class="fb-type-pill fb-${f.type}">${escapeHtml(f.type)}</span></div>
                  <div class="muted small">${fmtDateTime(f.ts)}</div>
                </div>
                <p class="fb-text">${escapeHtml(f.text)}</p>
                <button class="linklike fb-del" data-fb="${f.id}">remover</button>
              </div>`).join("")}
          </div>
        ` : `<p class="muted small">Sem feedbacks ainda.</p>`}
      </div>`;
  }

  function starsHTML(dimId, value) {
    let html = `<div class="star-row" data-dim="${dimId}">`;
    for (let i = 1; i <= 5; i++) {
      html += `<button type="button" class="star ${i <= value ? "on" : ""}" data-v="${i}" aria-label="${i} estrelas">\u2605</button>`;
    }
    html += `</div>`;
    return html;
  }

  function renderCandidato() {
    const c = Store.getCandidates().find(x => x.id === State.currentCandidateId);
    if (!c) { nav("funil"); return; }
    const v = vacancyOf(c.fitVacancyId);
    const fit = c.fitScore || 0;
    const fitClass = fit >= 75 ? "high" : fit >= 50 ? "mid" : "low";
    const d = c.diagnosis;

    $("#view-candidato").innerHTML = `
      <div class="container">
        <button class="btn btn-ghost btn-sm" id="back">\u2190 Voltar ao funil</button>
        <div class="section-head">
          <div>
            <div class="eyebrow gold">Candidato</div>
            <h1>${escapeHtml(c.fullName || "Sem nome")}</h1>
            <p class="lead">${escapeHtml(v.title)} \u00b7 ${seniorityLabel(c.fitSeniority)} \u00b7 score <strong>${fit}%</strong></p>
          </div>
          <div class="head-actions">
            <select id="stage-select" class="stage-select">
              ${State.seed.pipeline.map(st => `<option value="${st.id}" ${st.id === c.stage ? "selected" : ""}>${escapeHtml(st.name)}</option>`).join("")}
            </select>
            <button class="btn btn-ghost-on-light" id="dl-original">\u2b07 Curr\u00edculo original</button>
            <button class="btn btn-ghost-on-light" id="dl-dossie">\u2b07 Baixar dossi\u00ea (PDF)</button>
            <button class="btn btn-ghost-on-light" id="del-cand">Excluir</button>
          </div>
        </div>

        <nav class="cand-subnav" aria-label="Seções do candidato">
          <a href="#section-data" class="subnav-link">Dados</a>
          <a href="#section-evaluations" class="subnav-link">Avaliações</a>
          <a href="#section-diag" class="subnav-link">Diagnóstico</a>
          <a href="#section-trails" class="subnav-link"><span class="subnav-bullet">T&amp;D</span> Trilhas</a>
          <a href="#section-oneonones" class="subnav-link"><span class="subnav-bullet">T&amp;D</span> 1:1s</a>
          <a href="#section-pdi" class="subnav-link"><span class="subnav-bullet">T&amp;D</span> PDI</a>
          <a href="#section-feedbacks" class="subnav-link"><span class="subnav-bullet">T&amp;D</span> Feedback</a>
          <a href="#section-history" class="subnav-link">Histórico</a>
        </nav>

        <div class="cand-grid">
          <div>
            <div class="card" id="section-data">
              <div class="card-head"><h3>Dados centrais</h3><span class="fit-score ${fitClass} small"><span class="fit-num">${fit}%</span></span></div>
              <dl class="dl">
                <div><dt>Nome</dt><dd>${escapeHtml(c.fullName || "\u2014")}</dd></div>
                <div><dt>Telefone</dt><dd>${escapeHtml(c.phone || "\u2014")}</dd></div>
                <div><dt>E-mail</dt><dd>${escapeHtml(c.email || "\u2014")}</dd></div>
                <div><dt>Cidade/UF</dt><dd>${escapeHtml(c.city || "")}${c.state ? " / " + escapeHtml(c.state) : ""}</dd></div>
                <div><dt>LinkedIn</dt><dd>${c.linkedin ? `<a href="https://${escapeHtml(c.linkedin)}" target="_blank" rel="noopener">${escapeHtml(c.linkedin)}</a>` : "\u2014"}</dd></div>
                <div><dt>Tempo de experi\u00eancia</dt><dd>${c.experienceYears || 0} anos e ${c.experienceMonths || 0} meses</dd></div>
              </dl>
            </div>

            <div class="card">
              <h3>Expertises</h3>
              ${(c.expertises || []).length
                ? `<div class="tag-grid">${c.expertises.map(e => `<span class="tag tag-strong" title="${escapeHtml(e.evidence || "")}">${escapeHtml(expertiseName(e.id || e))}</span>`).join("")}</div>`
                : `<p class="muted">Nenhuma expertise core identificada.</p>`}
            </div>

            <div class="card">
              <h3>Certifica\u00e7\u00f5es</h3>
              ${(c.certifications || []).length
                ? `<div class="tag-grid">${c.certifications.map(e => `<span class="tag tag-cert">${escapeHtml(certName(e.id || e))}</span>`).join("")}</div>`
                : `<p class="muted">Nenhuma certifica\u00e7\u00e3o identificada.</p>`}
            </div>

            ${c.fitJustification || (c.highlights||[]).length || (c.redFlags||[]).length ? `
            <div class="card">
              <h3>An\u00e1lise do match</h3>
              ${c.fitJustification ? `<p>${escapeHtml(c.fitJustification)}</p>` : ""}
              ${(c.highlights || []).length ? `<div class="block-label" style="margin-top:10px">Destaques</div><ul class="bullet-list">${c.highlights.map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>` : ""}
              ${(c.redFlags || []).length ? `<div class="block-label" style="margin-top:10px">Pontos de aten\u00e7\u00e3o</div><ul class="bullet-list warn-list">${c.redFlags.map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>` : ""}
            </div>` : ""}

            <div class="card" id="section-diag">
              <h3>Diagn\u00f3stico de perfil</h3>
              ${d ? `
                <div class="diag-summary">
                  <div class="diag-score ${recTone(d.recommendation)}"><span class="fit-num">${d.score || 0}%</span><span class="muted small">m\u00e9dia das dimens\u00f5es</span></div>
                  <div class="diag-meta">
                    <div class="diag-rec ${recTone(d.recommendation)}">${escapeHtml(recLabel(d.recommendation))}</div>
                    <div class="muted small">emitido em ${fmtDateTime(d.ts)} por ${escapeHtml(d.author || "\u2014")}</div>
                  </div>
                </div>
                <div class="diag-dims">
                  ${DIMENSIONS.map(dim => {
                    const v = d.dimensions?.[dim.id] || 0;
                    return `<div class="diag-dim"><div class="diag-dim-label">${escapeHtml(dim.label)}</div><div class="stars-display">${"\u2605".repeat(v)}<span class="off">${"\u2605".repeat(5-v)}</span></div></div>`;
                  }).join("")}
                </div>
                ${d.observations ? `<div class="diag-obs"><div class="block-label">Observa\u00e7\u00f5es</div><p>${escapeHtml(d.observations)}</p></div>` : ""}
              ` : `<p class="muted">Sem diagn\u00f3stico emitido. Use o formul\u00e1rio abaixo para avaliar 5 dimens\u00f5es e emitir uma recomenda\u00e7\u00e3o.</p>`}
              <details class="diag-form" ${d ? "" : "open"}>
                <summary>${d ? "Refazer diagn\u00f3stico" : "Emitir diagn\u00f3stico"}</summary>
                <div class="diag-form-body">
                  ${DIMENSIONS.map(dim => `
                    <div class="diag-input-row">
                      <div class="diag-input-label">${escapeHtml(dim.label)}</div>
                      ${starsHTML(dim.id, d?.dimensions?.[dim.id] || 0)}
                    </div>
                  `).join("")}
                  <div class="diag-recommendation">
                    <div class="block-label">Recomenda\u00e7\u00e3o</div>
                    <div class="rec-options">
                      ${RECOMMENDATIONS.map(r => `
                        <label class="rec-opt rec-${r.tone}">
                          <input type="radio" name="recommendation" value="${r.id}" ${d?.recommendation === r.id ? "checked" : ""} />
                          <span>${escapeHtml(r.label)}</span>
                        </label>
                      `).join("")}
                    </div>
                  </div>
                  <label>Observa\u00e7\u00f5es</label>
                  <textarea id="diag-obs" placeholder="Notas complementares da entrevista, pontos a validar, refer\u00eancias..." rows="3">${escapeHtml(d?.observations || "")}</textarea>
                  <div class="card-actions">
                    <button class="btn btn-primary btn-sm" id="emit-diag">Emitir diagn\u00f3stico</button>
                  </div>
                </div>
              </details>
            </div>

            ${evalCardHTML(c)}

            <div class="card">
              <h3>Coment\u00e1rios da equipe</h3>
              <div class="cmt-form">
                <textarea id="cmt-text" placeholder="Compartilhe impress\u00f5es de entrevistas, refer\u00eancias, alertas..." rows="2"></textarea>
                <button class="btn btn-primary btn-sm" id="add-cmt">Adicionar coment\u00e1rio</button>
              </div>
              ${(c.comments || []).length ? `
                <div class="cmt-thread">
                  ${c.comments.map(cm => `
                    <div class="cmt-item">
                      <div class="cmt-head">
                        <div><strong>${escapeHtml(cm.author || "\u2014")}</strong> <span class="muted small">\u00b7 ${escapeHtml(cm.role || "")}</span></div>
                        <div class="muted small">${fmtDateTime(cm.ts)}</div>
                      </div>
                      <p class="cmt-text">${escapeHtml(cm.text)}</p>
                      <button class="cmt-del linklike" data-cmt="${cm.id}">remover</button>
                    </div>`).join("")}
                </div>
              ` : `<p class="muted small">Nenhum coment\u00e1rio ainda. Comece a thread acima.</p>`}
            </div>

            ${trailsCardHTML(c)}
            ${oneononesCardHTML(c)}
            ${pdiCardHTML(c)}
            ${feedbackCardHTML(c)}

            <div class="card" id="section-history">
              <h3>Hist\u00f3rico no funil</h3>
              ${(c.stageHistory || []).length ? `
                <ol class="timeline">
                  ${c.stageHistory.slice().reverse().map(h => {
                    const t = stageOf(h.to);
                    return `
                      <li class="timeline-item">
                        <span class="timeline-dot tone-${t.tone}"></span>
                        <div class="timeline-body">
                          <div class="timeline-stage">${escapeHtml(t.name)}${h.from ? ` <span class="muted">\u00b7 vindo de ${escapeHtml(stageOf(h.from).name)}</span>` : ` <span class="muted">\u00b7 entrada inicial</span>`}</div>
                          <div class="muted small">${fmtDateTime(h.ts)} \u00b7 por ${escapeHtml(h.by || "sistema")}</div>
                        </div>
                      </li>`;
                  }).join("")}
                </ol>
              ` : `<p class="muted small">Sem hist\u00f3rico.</p>`}
            </div>

            <div class="card">
              <h3>Curr\u00edculo (texto)</h3>
              <pre class="resume-pre">${escapeHtml(c.resumeText || "\u2014")}</pre>
            </div>
          </div>

          <aside class="cand-aside">
            <div class="card">
              <h3>Anota\u00e7\u00f5es do RH</h3>
              <textarea id="cand-notes" placeholder="Impress\u00f5es de entrevistas, refer\u00eancias, decis\u00f5es...">${escapeHtml(c.notes || "")}</textarea>
              <button class="btn btn-primary btn-sm" id="save-notes">Salvar anota\u00e7\u00f5es</button>
            </div>
            ${(c.languages || []).length ? `<div class="card"><h3>Idiomas</h3><div class="tag-grid">${c.languages.map(l => `<span class="tag">${escapeHtml(l)}</span>`).join("")}</div></div>` : ""}
            ${(c.education || []).length ? `<div class="card"><h3>Forma\u00e7\u00e3o</h3><ul class="bullet-list">${c.education.map(ed => `<li>${escapeHtml([ed.degree, ed.institution, ed.year].filter(Boolean).join(" \u00b7 "))}</li>`).join("")}</ul></div>` : ""}
            <div class="card muted-card">
              <div class="muted small">Criado em ${fmtDateTime(c.createdAt)}</div>
              <div class="muted small">Atualizado em ${fmtDateTime(c.updatedAt)}</div>
              <div class="muted small">Fonte: ${c.source === "claude" ? "Claude IA" : "heur\u00edstica"}</div>
            </div>
          </aside>
        </div>
      </div>`;

    $("#back").addEventListener("click", () => nav("funil"));
    $("#stage-select").addEventListener("change", e => {
      Store.changeStage(c.id, e.target.value, State.user?.name);
      showToast("Est\u00e1gio atualizado para " + stageOf(e.target.value).name, "success");
      renderCandidato();
    });
    $("#dl-dossie").addEventListener("click", () => {
      try {
        const fresh = Store.getCandidates().find(x => x.id === c.id);
        const fname = Dossier.downloadPdf(fresh, State.seed);
        showToast("Dossi\u00ea gerado: " + fname, "success");
      } catch (err) { showToast("Falha ao gerar PDF: " + err.message, "warn"); }
    });
    $("#dl-original").addEventListener("click", async () => {
      const fname = await downloadOriginalCV(c);
      if (fname) showToast("Curr\u00edculo original baixado: " + fname, "success");
    });
    $("#save-notes").addEventListener("click", () => {
      Store.updateCandidate(c.id, { notes: $("#cand-notes").value });
      showToast("Anota\u00e7\u00f5es salvas.", "success");
    });
    $("#del-cand").addEventListener("click", () => {
      if (confirm(`Excluir o candidato ${c.fullName}? Essa a\u00e7\u00e3o n\u00e3o pode ser desfeita.`)) {
        Store.removeCandidate(c.id);
        showToast("Candidato exclu\u00eddo.", "success");
        nav("funil");
      }
    });

    // estrelas: clique seta o valor da dimens\u00e3o
    $$(".star-row").forEach(row => {
      row.addEventListener("click", e => {
        const btn = e.target.closest(".star"); if (!btn) return;
        const v = parseInt(btn.dataset.v, 10);
        row.dataset.value = v;
        $$(".star", row).forEach(s => s.classList.toggle("on", parseInt(s.dataset.v, 10) <= v));
      });
    });

    $("#emit-diag").addEventListener("click", () => {
      const dims = {};
      let rated = 0;
      $$(".star-row").forEach(row => {
        const v = parseInt(row.dataset.value || row.querySelectorAll(".star.on").length, 10) || 0;
        if (v > 0) rated++;
        dims[row.dataset.dim] = v;
      });
      const recRadio = document.querySelector('input[name="recommendation"]:checked');
      if (rated < 3) { showToast("Avalie pelo menos 3 dimens\u00f5es.", "warn"); return; }
      if (!recRadio)  { showToast("Escolha uma recomenda\u00e7\u00e3o.", "warn"); return; }
      Store.setDiagnosis(c.id, {
        dimensions: dims,
        recommendation: recRadio.value,
        observations: $("#diag-obs").value
      });
      showToast("Diagn\u00f3stico emitido.", "success");
      renderCandidato();
    });

    $("#add-cmt").addEventListener("click", () => {
      const txt = $("#cmt-text").value.trim();
      if (!txt) { showToast("Escreva o coment\u00e1rio.", "warn"); return; }
      Store.addComment(c.id, txt);
      showToast("Coment\u00e1rio adicionado.", "success");
      renderCandidato();
    });
    $$(".cmt-del").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover este coment\u00e1rio?")) return;
      Store.removeComment(c.id, b.dataset.cmt);
      renderCandidato();
    }));

    // ----- AVALIA\u00c7\u00d5ES POR ENTREVISTADOR -----
    $$(".skill-tab").forEach(t => t.addEventListener("click", () => {
      const tab = t.dataset.tab;
      $$(".skill-tab").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
      $$(".skill-tab-panel").forEach(p => { p.hidden = p.dataset.panel !== tab; });
    }));
    // estrelas das avalia\u00e7\u00f5es (ratings)
    $$(".rating-row").forEach(row => {
      row.addEventListener("click", e => {
        const star = e.target.closest(".rstar"); if (!star) return;
        const v = parseInt(star.dataset.v, 10);
        row.dataset.value = v;
        $$(".rstar", row).forEach(s => s.classList.toggle("on", parseInt(s.dataset.v, 10) <= v));
      });
    });
    const submitEvalBtn = $("#submit-eval");
    if (submitEvalBtn) submitEvalBtn.addEventListener("click", () => {
      const softSkills = {}, hardSkills = {};
      let hasAny = false;
      $$(".rating-row").forEach(row => {
        const v = parseInt(row.dataset.value || 0, 10) || 0;
        if (v <= 0) return;
        hasAny = true;
        if (row.dataset.prefix === "soft") softSkills[row.dataset.skill] = v;
        else hardSkills[row.dataset.skill] = v;
      });
      const comment = $("#eval-comment").value.trim();
      if (!hasAny && !comment) { showToast("Avalie ao menos uma compet\u00eancia ou escreva um coment\u00e1rio.", "warn"); return; }
      Store.addInterviewerEval(c.id, { softSkills, hardSkills, comment });
      showToast("Avalia\u00e7\u00e3o registrada.", "success");
      renderCandidato();
    });
    $$(".eval-del").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover esta avalia\u00e7\u00e3o?")) return;
      Store.removeInterviewerEval(c.id, b.dataset.eval);
      renderCandidato();
    }));

    // ----- TRILHAS -----
    $$(".trail-assign").forEach(b => b.addEventListener("click", () => {
      Store.assignTrail(c.id, b.dataset.trail);
      showToast("Trilha atribu\u00edda.", "success");
      renderCandidato();
    }));
    $$(".trail-unassign").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover a trilha (apaga o progresso registrado)?")) return;
      Store.unassignTrail(c.id, b.dataset.trail);
      renderCandidato();
    }));
    $$(".trail-mod-check").forEach(cb => cb.addEventListener("change", () => {
      Store.toggleTrailModule(c.id, cb.dataset.trail, cb.dataset.module);
      renderCandidato();
    }));

    // ----- 1:1s -----
    const ooAdd = $("#oo-add");
    if (ooAdd) ooAdd.addEventListener("click", () => {
      const dt = $("#oo-date").value;
      const agenda = $("#oo-agenda").value.trim();
      if (!dt && !agenda) { showToast("Defina a data ou pelo menos a pauta.", "warn"); return; }
      Store.addOneOnOne(c.id, {
        scheduledFor: dt ? new Date(dt).toISOString() : new Date().toISOString(),
        agenda
      });
      showToast("1:1 agendada.", "success");
      renderCandidato();
    });
    $$(".oo-conclude").forEach(b => b.addEventListener("click", () => {
      Store.updateOneOnOne(c.id, b.dataset.one, { status: "concluido" });
      renderCandidato();
    }));
    $$(".oo-remove").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover esta 1:1?")) return;
      Store.removeOneOnOne(c.id, b.dataset.one);
      renderCandidato();
    }));
    $$(".oo-notes").forEach(t => {
      let timer;
      t.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          Store.updateOneOnOne(c.id, t.dataset.one, { notes: t.value });
        }, 500);
      });
    });

    // ----- PDI -----
    const pdiAdd = $("#pdi-add");
    if (pdiAdd) pdiAdd.addEventListener("click", () => {
      const title = $("#pdi-title").value.trim();
      if (!title) { showToast("Defina o t\u00edtulo do objetivo.", "warn"); return; }
      Store.addPdiGoal(c.id, {
        title,
        competency: $("#pdi-comp").value.trim(),
        description: $("#pdi-desc").value.trim(),
        deadline: $("#pdi-deadline").value || ""
      });
      showToast("Objetivo adicionado ao PDI.", "success");
      renderCandidato();
    });
    $$(".pdi-status-select").forEach(s => s.addEventListener("change", () => {
      Store.updatePdiGoal(c.id, s.dataset.goal, { status: s.value });
      renderCandidato();
    }));
    $$(".pdi-remove").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover este objetivo?")) return;
      Store.removePdiGoal(c.id, b.dataset.goal);
      renderCandidato();
    }));

    // ----- FEEDBACK -----
    $$(".fb-type-opt").forEach(opt => opt.addEventListener("click", () => {
      $$(".fb-type-opt").forEach(o => o.classList.toggle("active", o === opt));
    }));
    const fbAdd = $("#fb-add");
    if (fbAdd) fbAdd.addEventListener("click", () => {
      const txt = $("#fb-text").value.trim();
      if (!txt) { showToast("Escreva o feedback.", "warn"); return; }
      const type = document.querySelector('input[name="fb-type"]:checked')?.value || "positivo";
      Store.addFeedback(c.id, { type, text: txt });
      showToast("Feedback enviado.", "success");
      renderCandidato();
    });
    $$(".fb-del").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover este feedback?")) return;
      Store.removeFeedback(c.id, b.dataset.fb);
      renderCandidato();
    }));

    // subnav smooth scroll
    $$(".subnav-link").forEach(a => a.addEventListener("click", e => {
      const tgt = a.getAttribute("href");
      if (tgt && tgt.startsWith("#")) {
        e.preventDefault();
        const el = document.querySelector(tgt);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }));
  }

  // ---------- CONFIGURA\u00c7\u00d5ES ----------
  function renderConfig() {
    if (!isAdmin()) { showToast("Acesso restrito a administradores.", "warn"); nav("funil"); return; }
    const cfg = Store.getConfig();
    $("#view-config").innerHTML = `
      <div class="container">
        <div class="section-head">
          <div>
            <div class="eyebrow gold">Configura\u00e7\u00f5es</div>
            <h1>Chave de API e dados</h1>
            <p class="lead">A chave da Claude API \u00e9 armazenada apenas neste navegador (localStorage). Use uma chave dedicada ao RH com or\u00e7amento limitado.</p>
          </div>
        </div>

        <div class="card">
          <h3>Claude API</h3>
          <label>Chave de API (sk-ant-...)</label>
          <input type="password" id="api-key" placeholder="sk-ant-..." value="${escapeHtml(cfg.apiKey || "")}" />
          <label>Modelo</label>
          <select id="api-model">
            <option value="claude-haiku-4-5-20251001"   ${cfg.model === "claude-haiku-4-5-20251001" ? "selected" : ""}>Claude Haiku 4.5 (r\u00e1pido e econ\u00f4mico)</option>
            <option value="claude-sonnet-4-6"           ${cfg.model === "claude-sonnet-4-6" ? "selected" : ""}>Claude Sonnet 4.6 (mais robusto)</option>
            <option value="claude-opus-4-7"             ${cfg.model === "claude-opus-4-7" ? "selected" : ""}>Claude Opus 4.7 (m\u00e1xima qualidade)</option>
          </select>
          <div class="card-actions">
            <button class="btn btn-primary" id="save-config">Salvar configura\u00e7\u00e3o</button>
            <button class="btn btn-ghost-on-light" id="test-key">Testar chave</button>
          </div>
          <p class="hint">Recomenda\u00e7\u00e3o: Haiku 4.5 para alto volume; Sonnet 4.6 quando o curr\u00edculo for muito heterog\u00eaneo.</p>
        </div>

        <div class="card">
          <h3>Editor de funil</h3>
          <p class="muted small">Personalize os est\u00e1gios do funil. Candidatos em um est\u00e1gio removido s\u00e3o movidos para o primeiro est\u00e1gio restante.</p>
          <div class="stage-editor" id="stage-editor">
            ${(State.seed.pipeline || []).map((st, i, arr) => `
              <div class="stage-row" data-stage="${st.id}">
                <div class="stage-row-arrows">
                  <button class="btn-icon stage-up" data-stage="${st.id}" ${i === 0 ? "disabled" : ""} aria-label="Mover para cima">\u25b2</button>
                  <button class="btn-icon stage-down" data-stage="${st.id}" ${i === arr.length - 1 ? "disabled" : ""} aria-label="Mover para baixo">\u25bc</button>
                </div>
                <div class="stage-row-fields">
                  <input type="text" class="stage-name" data-stage="${st.id}" value="${escapeHtml(st.name)}" placeholder="Nome do est\u00e1gio" />
                  <input type="text" class="stage-short" data-stage="${st.id}" value="${escapeHtml(st.short || '')}" placeholder="Curto" maxlength="14" />
                  <select class="stage-tone" data-stage="${st.id}">
                    ${["navy","gold","navy2","amber","green","red"].map(t => `<option value="${t}" ${st.tone === t ? "selected" : ""}>${t}</option>`).join("")}
                  </select>
                </div>
                <input type="text" class="stage-desc" data-stage="${st.id}" value="${escapeHtml(st.desc || '')}" placeholder="Descri\u00e7\u00e3o curta" />
                <button class="btn btn-ghost-on-light btn-sm stage-remove" data-stage="${st.id}" ${arr.length <= 1 ? "disabled title='Mantenha ao menos um est\u00e1gio'" : ""}>Remover</button>
              </div>`).join("")}
          </div>

          <div class="stage-add">
            <input type="text" id="new-stage-name" placeholder="Nome do novo est\u00e1gio (ex.: Background check)" />
            <select id="new-stage-tone">
              ${["navy","gold","navy2","amber","green","red"].map(t => `<option value="${t}">${t}</option>`).join("")}
            </select>
            <button class="btn btn-primary btn-sm" id="add-stage">+ Adicionar est\u00e1gio</button>
          </div>
        </div>

        <div class="card">
          <h3>Dados</h3>
          <p class="muted">${Store.getCandidates().length} candidatos armazenados localmente neste navegador.</p>
          <div class="card-actions">
            <button class="btn btn-ghost-on-light" id="reset-seed">Restaurar configura\u00e7\u00e3o padr\u00e3o</button>
          </div>
        </div>

        <div class="card danger-zone">
          <h2 class="danger-title">Zona de risco</h2>
          <p class="muted">A\u00e7\u00f5es irrevers\u00edveis. Use com extremo cuidado \u2014 pertencem ao perfil de administrador.</p>
          <div class="card-actions">
            <button class="btn btn-danger" id="open-nuke">\ud83d\uddd1 Excluir tudo</button>
          </div>
          <p class="hint">Apaga apenas a base de candidatos. <strong>N\u00e3o</strong> remove sua sess\u00e3o, chave de API, vagas, expertises ou certifica\u00e7\u00f5es.</p>
        </div>
      </div>`;

    $("#save-config").addEventListener("click", () => {
      Store.setConfig({ apiKey: $("#api-key").value.trim(), model: $("#api-model").value });
      showToast("Configura\u00e7\u00e3o salva.", "success");
    });
    $("#test-key").addEventListener("click", async () => {
      const key = $("#api-key").value.trim();
      if (!key) { showToast("Cole a chave antes de testar.", "warn"); return; }
      const btn = $("#test-key"); btn.disabled = true; btn.textContent = "Testando...";
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: $("#api-model").value,
            max_tokens: 32,
            messages: [{ role: "user", content: "Diga ok." }]
          })
        });
        if (r.ok) showToast("Chave v\u00e1lida \u2014 conex\u00e3o ok.", "success");
        else { const t = await r.text().catch(() => ""); showToast("Falha: " + r.status + " " + t.slice(0, 80), "warn"); }
      } catch (e) { showToast("Erro de rede: " + e.message, "warn"); }
      finally { btn.disabled = false; btn.textContent = "Testar chave"; }
    });
    $("#reset-seed").addEventListener("click", () => {
      if (confirm("Restaurar vagas, expertises e certifica\u00e7\u00f5es ao padr\u00e3o IBBRA?")) {
        State.seed = Store.resetSeed();
        showToast("Vagas restauradas.", "success");
        renderConfig();
      }
    });
    $("#open-nuke").addEventListener("click", openNukeModal);

    // --- Editor de funil ---
    function refreshStageEditor() { State.seed = Store.getSeed(); renderConfig(); }
    $$(".stage-up").forEach(b => b.addEventListener("click", () => { Store.moveStage(b.dataset.stage, "up"); refreshStageEditor(); }));
    $$(".stage-down").forEach(b => b.addEventListener("click", () => { Store.moveStage(b.dataset.stage, "down"); refreshStageEditor(); }));
    $$(".stage-remove").forEach(b => b.addEventListener("click", () => {
      if (b.disabled) return;
      const st = Store.getSeed().pipeline.find(s => s.id === b.dataset.stage);
      if (!confirm(`Remover o estágio "${st?.name}"? Candidatos serão movidos para o primeiro estágio restante.`)) return;
      Store.removeStage(b.dataset.stage);
      refreshStageEditor();
    }));
    function commitField(stageId, key, value) {
      const patch = {}; patch[key] = value;
      Store.renameStage(stageId, patch);
      State.seed = Store.getSeed();
      // não re-render (mantém foco no input)
    }
    $$(".stage-name").forEach(i => i.addEventListener("blur", () => commitField(i.dataset.stage, "name", i.value.trim() || "Estágio")));
    $$(".stage-short").forEach(i => i.addEventListener("blur", () => commitField(i.dataset.stage, "short", i.value.trim() || i.value)));
    $$(".stage-desc").forEach(i => i.addEventListener("blur", () => commitField(i.dataset.stage, "desc", i.value)));
    $$(".stage-tone").forEach(s => s.addEventListener("change", () => commitField(s.dataset.stage, "tone", s.value)));
    $("#add-stage").addEventListener("click", () => {
      const name = $("#new-stage-name").value.trim();
      if (!name) { showToast("Defina um nome para o estágio.", "warn"); return; }
      Store.addStage({ name, short: name.slice(0, 12), tone: $("#new-stage-tone").value, desc: "" });
      refreshStageEditor();
    });
  }

  // ---------- MODAL EXCLUIR TUDO ----------
  function openNukeModal() {
    const modal = $("#nuke-confirm");
    if (!modal) return;
    $("#nuke-phrase").value = "";
    $("#nuke-ack").checked = false;
    $("#nuke-confirm-btn").disabled = true;
    modal.hidden = false;
    setTimeout(() => $("#nuke-phrase").focus(), 50);

    const update = () => {
      const ok = $("#nuke-phrase").value === "EXCLUIR TUDO" && $("#nuke-ack").checked;
      $("#nuke-confirm-btn").disabled = !ok;
    };
    $("#nuke-phrase").addEventListener("input", update);
    $("#nuke-ack").addEventListener("change", update);

    const close = () => closeNukeModal();
    $$("#nuke-confirm [data-close]").forEach(el => el.addEventListener("click", close));
    document.addEventListener("keydown", nukeEscHandler);
    $("#nuke-confirm-btn").addEventListener("click", confirmNuke);
  }
  function nukeEscHandler(e) {
    if (e.key === "Escape") closeNukeModal();
  }
  function closeNukeModal() {
    const modal = $("#nuke-confirm");
    if (!modal) return;
    modal.hidden = true;
    document.removeEventListener("keydown", nukeEscHandler);
  }
  function confirmNuke() {
    if ($("#nuke-phrase").value !== "EXCLUIR TUDO" || !$("#nuke-ack").checked) return;
    if (!confirm("\u00daltima confirma\u00e7\u00e3o: apagar TODOS os candidatos agora?")) return;
    Store.clearCandidates();          // s\u00f3 candidatos \u2014 n\u00e3o toca em user/seed/config
    closeNukeModal();
    showToast("Banco de candidatos zerado.", "success");
    nav("funil");                      // navega sem recarregar a p\u00e1gina
  }

  // ---------- T&D (foco em colaboradores aprovados) ----------
  let tdTab = "collabs";

  function renderTd() {
    const all = Store.getCandidates();
    // T&D só lida com colaboradores aprovados (stage === "contratado")
    const collabs = all.filter(c => c.stage === "contratado");
    const collabOptions = collabs.map(c => `<option value="${c.id}">${escapeHtml(c.fullName || c.id)} · ${escapeHtml(vacancyOf(c.fitVacancyId).title)}</option>`).join("");

    // 1:1s próximas
    const upcoming = [];
    collabs.forEach(c => (c.oneonones || []).forEach(o => {
      if (o.status !== "concluido") upcoming.push({ ...o, candidate: c });
    }));
    upcoming.sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));

    // PDIs ativos
    const activeGoals = [];
    collabs.forEach(c => ((c.pdi && c.pdi.goals) || []).forEach(g => {
      if (g.status !== "concluido") activeGoals.push({ ...g, candidate: c });
    }));

    // Feedbacks
    const fbs = [];
    collabs.forEach(c => (c.feedbacks || []).forEach(f => fbs.push({ ...f, candidate: c })));
    fbs.sort((a, b) => new Date(b.ts) - new Date(a.ts));

    // Trilhas stats
    const trailsStats = (State.seed.trails || []).map(t => {
      const assigned = collabs.filter(c => (c.trails || []).some(x => x.trailId === t.id));
      const completed = assigned.filter(c => (c.trails || []).some(x => x.trailId === t.id && x.completedAt));
      return { trail: t, assigned, completed };
    });

    const tabs = [
      { id: "collabs",   label: "Colaboradores",     count: collabs.length },
      { id: "oneonones", label: "1:1s",              count: upcoming.length },
      { id: "pdi",       label: "PDIs",               count: activeGoals.length },
      { id: "feedback",  label: "Feedback",           count: fbs.length },
      { id: "trails",    label: "Trilhas",            count: trailsStats.length }
    ];
    if (isAdmin()) tabs.push({ id: "trailedit", label: "Editor de trilhas", count: (State.seed.trails || []).length });

    const collabsCard = c => {
      const onb = (c.trails || []).find(t => t.trailId === "onboarding");
      const onbPct = onb ? Math.round((onb.completedModules.length / Math.max(1, (trailById("onboarding")?.modules?.length || 1))) * 100) : 0;
      const oonCount = (c.oneonones || []).length;
      const pdiActive = ((c.pdi && c.pdi.goals) || []).filter(g => g.status !== "concluido").length;
      const fbCount = (c.feedbacks || []).length;
      const trailsCount = (c.trails || []).length;
      return `
        <div class="collab-card" data-id="${c.id}">
          <div class="collab-head">
            <div class="kcard-avatar">${initials(c.fullName)}</div>
            <div>
              <div class="collab-name">${escapeHtml(c.fullName || "—")}</div>
              <div class="muted small">${escapeHtml(vacancyOf(c.fitVacancyId).title)} · ${seniorityLabel(c.fitSeniority)}</div>
            </div>
          </div>
          <div class="collab-metrics">
            <div><span class="value">${onbPct}%</span><span class="label">onboarding</span></div>
            <div><span class="value">${trailsCount}</span><span class="label">trilhas</span></div>
            <div><span class="value">${oonCount}</span><span class="label">1:1s</span></div>
            <div><span class="value">${pdiActive}</span><span class="label">PDIs ativos</span></div>
            <div><span class="value">${fbCount}</span><span class="label">feedbacks</span></div>
          </div>
          <div class="collab-actions">
            <button class="btn btn-ghost-on-light btn-sm td-open" data-cand="${c.id}">Abrir ficha →</button>
          </div>
        </div>`;
    };

    const emptyCollabs = `
      <div class="empty-block">
        <h3>Ainda sem colaboradores aprovados</h3>
        <p>Quando um candidato é movido para a fase <strong>Contratado</strong>, ele entra automaticamente no sistema T&amp;D com a trilha de Onboarding atribuída, feedback de boas-vindas e PDI inicial criado.</p>
        <button class="btn btn-primary" data-nav="funil">Ir ao funil</button>
      </div>`;

    $("#view-td").innerHTML = `
      <div class="container">
        <div class="section-head">
          <div>
            <div class="eyebrow gold">Treinamento &amp; Desenvolvimento</div>
            <h1>Sistema T&amp;D — colaboradores aprovados</h1>
            <p class="lead">Onboarding, trilhas, 1:1s, PDIs e feedback do time IBBRA. Tudo automatizado a partir da contratação — editável a qualquer momento.</p>
          </div>
        </div>

        <div class="td-tabs">
          ${tabs.map(t => `<button class="td-tab ${tdTab === t.id ? "active" : ""}" data-tab="${t.id}"><span>${escapeHtml(t.label)}</span><span class="td-tab-count">${t.count}</span></button>`).join("")}
        </div>

        <div class="td-content">
          ${tdTab === "collabs" ? (collabs.length === 0 ? emptyCollabs : `<div class="collabs-grid">${collabs.map(collabsCard).join("")}</div>`) : ""}

          ${tdTab === "oneonones" ? `
            <div class="card td-create-card ${isGestorPlus() ? "" : "td-readonly"}">
              <h3>Agendar 1:1</h3>
              ${collabs.length === 0 ? `<p class="muted small">Nenhum colaborador aprovado ainda.</p>` : `
                <div class="td-create-form">
                  <label>Colaborador</label>
                  <select id="tdoo-cand">${collabOptions}</select>
                  <label>Data e hora</label>
                  <input type="datetime-local" id="tdoo-date" />
                  <label>Pauta</label>
                  <textarea id="tdoo-agenda" rows="2" placeholder="Tópicos principais..."></textarea>
                  <button class="btn btn-primary btn-sm" id="tdoo-add">+ Agendar</button>
                </div>`}
            </div>

            ${upcoming.length === 0 ? `<p class="muted">Sem 1:1s pendentes.</p>` : `
              <div class="td-list">
                ${upcoming.map(o => `
                  <div class="td-item editable" data-cand="${o.candidate.id}" data-one="${o.id}">
                    <div class="td-item-when">${fmtDateTime(o.scheduledFor)}</div>
                    <div class="td-item-body">
                      <div><strong>${escapeHtml(o.candidate.fullName)}</strong> · ${escapeHtml(vacancyOf(o.candidate.fitVacancyId).title)}</div>
                      <div class="muted small">Conduzido por ${escapeHtml(o.manager)}</div>
                      ${o.agenda ? `<p class="td-agenda">${escapeHtml(o.agenda)}</p>` : ""}
                      <details class="td-inline-edit"><summary>Editar notas</summary>
                        <textarea class="td-oo-notes" data-cand="${o.candidate.id}" data-one="${o.id}" rows="2" placeholder="Notas da reunião">${escapeHtml(o.notes || "")}</textarea>
                      </details>
                    </div>
                    <div class="td-item-actions">
                      <button class="btn btn-ghost-on-light btn-sm td-oo-done" data-cand="${o.candidate.id}" data-one="${o.id}">✓ concluir</button>
                      <button class="btn btn-ghost-on-light btn-sm td-oo-remove" data-cand="${o.candidate.id}" data-one="${o.id}">remover</button>
                      <button class="btn btn-ghost-on-light btn-sm td-open" data-cand="${o.candidate.id}">Ficha →</button>
                    </div>
                  </div>`).join("")}
              </div>`}
          ` : ""}

          ${tdTab === "pdi" ? `
            <div class="card td-create-card ${isGestorPlus() ? "" : "td-readonly"}">
              <h3>Novo objetivo de PDI</h3>
              ${collabs.length === 0 ? `<p class="muted small">Nenhum colaborador aprovado ainda.</p>` : `
                <div class="td-create-form">
                  <label>Colaborador</label>
                  <select id="tdpdi-cand">${collabOptions}</select>
                  <label>Título do objetivo</label>
                  <input type="text" id="tdpdi-title" placeholder="Ex.: Concluir CPA-20" />
                  <label>Competência alvo</label>
                  <input type="text" id="tdpdi-comp" placeholder="Ex.: Investimentos" />
                  <label>Prazo</label>
                  <input type="date" id="tdpdi-deadline" />
                  <label>Descrição</label>
                  <textarea id="tdpdi-desc" rows="2"></textarea>
                  <button class="btn btn-primary btn-sm" id="tdpdi-add">+ Adicionar objetivo</button>
                </div>`}
            </div>

            ${activeGoals.length === 0 ? `<p class="muted">Nenhum objetivo ativo.</p>` : `
              <div class="td-list">
                ${activeGoals.map(g => `
                  <div class="td-item editable pdi-status-${g.status}">
                    <div class="td-item-body">
                      <div><strong>${escapeHtml(g.candidate.fullName)}</strong></div>
                      <div class="td-goal-title">${escapeHtml(g.title)}</div>
                      ${g.competency ? `<div class="muted small">Competência: ${escapeHtml(g.competency)}</div>` : ""}
                      ${g.deadline ? `<div class="muted small">Prazo: ${fmtDate(g.deadline)}</div>` : ""}
                      <span class="pdi-pill pdi-status-${g.status}">${escapeHtml(g.status.replace("_", " "))}</span>
                    </div>
                    <div class="td-item-actions">
                      <select class="td-pdi-status" data-cand="${g.candidate.id}" data-goal="${g.id}">
                        <option value="pendente"     ${g.status === "pendente" ? "selected" : ""}>Pendente</option>
                        <option value="em_progresso" ${g.status === "em_progresso" ? "selected" : ""}>Em progresso</option>
                        <option value="concluido"    ${g.status === "concluido" ? "selected" : ""}>Concluído</option>
                        <option value="bloqueado"    ${g.status === "bloqueado" ? "selected" : ""}>Bloqueado</option>
                      </select>
                      <button class="btn btn-ghost-on-light btn-sm td-pdi-remove" data-cand="${g.candidate.id}" data-goal="${g.id}">remover</button>
                      <button class="btn btn-ghost-on-light btn-sm td-open" data-cand="${g.candidate.id}">Ficha →</button>
                    </div>
                  </div>`).join("")}
              </div>`}
          ` : ""}

          ${tdTab === "feedback" ? `
            <div class="card td-create-card ${isGestorPlus() ? "" : "td-readonly"}">
              <h3>Novo feedback</h3>
              ${collabs.length === 0 ? `<p class="muted small">Nenhum colaborador aprovado ainda.</p>` : `
                <div class="td-create-form">
                  <label>Para quem</label>
                  <select id="tdfb-cand">${collabOptions}</select>
                  <label>Tipo</label>
                  <select id="tdfb-type">
                    <option value="positivo">Positivo</option>
                    <option value="construtivo">Construtivo</option>
                    <option value="reconhecimento">Reconhecimento</option>
                  </select>
                  <label>Mensagem</label>
                  <textarea id="tdfb-text" rows="3" placeholder="Comportamento observado, impacto, sugestão..."></textarea>
                  <button class="btn btn-primary btn-sm" id="tdfb-add">+ Enviar feedback</button>
                </div>`}
            </div>

            ${fbs.length === 0 ? `<p class="muted">Nenhum feedback registrado.</p>` : `
              <div class="td-list">
                ${fbs.slice(0, 50).map(f => `
                  <div class="td-item fb-${f.type}">
                    <div class="td-item-when">${fmtDateTime(f.ts)}</div>
                    <div class="td-item-body">
                      <div><strong>${escapeHtml(f.from)}</strong> → <strong>${escapeHtml(f.candidate.fullName)}</strong> · <span class="fb-type-pill fb-${f.type}">${escapeHtml(f.type)}</span></div>
                      <p class="td-agenda">${escapeHtml(f.text)}</p>
                    </div>
                    <div class="td-item-actions">
                      <button class="btn btn-ghost-on-light btn-sm td-fb-remove" data-cand="${f.candidate.id}" data-fb="${f.id}">remover</button>
                      <button class="btn btn-ghost-on-light btn-sm td-open" data-cand="${f.candidate.id}">Ficha →</button>
                    </div>
                  </div>`).join("")}
              </div>`}
          ` : ""}

          ${tdTab === "trails" ? `
            <div class="card td-create-card ${isGestorPlus() ? "" : "td-readonly"}">
              <h3>Atribuir trilha a um colaborador</h3>
              ${collabs.length === 0 || (State.seed.trails || []).length === 0 ? `<p class="muted small">Precisa ter trilha cadastrada e ao menos um colaborador.</p>` : `
                <div class="td-create-form">
                  <label>Colaborador</label>
                  <select id="tdtr-cand">${collabOptions}</select>
                  <label>Trilha</label>
                  <select id="tdtr-trail">${(State.seed.trails || []).map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join("")}</select>
                  <button class="btn btn-primary btn-sm" id="tdtr-add">+ Atribuir</button>
                </div>`}
            </div>

            ${trailsStats.length === 0 ? `<p class="muted">Nenhuma trilha cadastrada.</p>` : `
              <div class="trails-overview">
                ${trailsStats.map(s => {
                  const pctCompleted = s.assigned.length ? Math.round((s.completed.length / s.assigned.length) * 100) : 0;
                  // primeiro colaborador atribuído (referência visual do progresso)
                  const ref = s.assigned[0];
                  const refAssignment = ref && (ref.trails || []).find(x => x.trailId === s.trail.id);
                  return `
                    <div class="trail-overview-card">
                      <div class="trail-overview-head">
                        <div>
                          <div class="trail-stat-title">${escapeHtml(s.trail.title)}</div>
                          <div class="muted small">${escapeHtml(s.trail.desc || "")}</div>
                        </div>
                        <div class="trail-stat-row compact">
                          <div class="trail-stat-metric"><div class="value">${s.assigned.length}</div><div class="label">atribuídos</div></div>
                          <div class="trail-stat-metric"><div class="value">${s.completed.length}</div><div class="label">concluídos</div></div>
                          <div class="trail-stat-metric"><div class="value">${pctCompleted}%</div><div class="label">taxa</div></div>
                          <div class="trail-stat-metric"><div class="value">${s.trail.modules.length}</div><div class="label">módulos</div></div>
                        </div>
                      </div>

                      ${refAssignment ? `
                        <div class="trail-overview-stepper">
                          <div class="block-label">Progresso de ${escapeHtml(ref.fullName)} (referência)</div>
                          ${trailStepperHTML(s.trail, refAssignment, false)}
                        </div>
                      ` : `
                        <div class="trail-overview-stepper">
                          <div class="block-label">Estrutura da trilha</div>
                          ${trailStepperHTML(s.trail, { completedModules: [] }, false)}
                        </div>
                      `}

                      ${s.assigned.length ? `
                        <div class="trail-stat-people-wrap">
                          <div class="block-label">Colaboradores</div>
                          <ul class="trail-stat-people">
                            ${s.assigned.slice(0, 12).map(c => {
                              const a = (c.trails || []).find(x => x.trailId === s.trail.id);
                              const pct = a ? Math.round((a.completedModules.length / s.trail.modules.length) * 100) : 0;
                              return `<li><button class="linklike td-open" data-cand="${c.id}">${escapeHtml(c.fullName)}</button> <span class="muted small">${pct}% · ${(a?.completedModules?.length||0)}/${s.trail.modules.length}</span></li>`;
                            }).join("")}
                            ${s.assigned.length > 12 ? `<li class="muted small">+${s.assigned.length - 12} mais</li>` : ""}
                          </ul>
                        </div>
                      ` : ""}
                    </div>`;
                }).join("")}
              </div>`}
          ` : ""}

          ${tdTab === "trailedit" ? renderTrailEditor() : ""}
        </div>
      </div>`;

    $$(".td-tab").forEach(t => t.addEventListener("click", () => { tdTab = t.dataset.tab; renderTd(); }));
    $$(".td-open").forEach(b => b.addEventListener("click", () => nav("candidato", { currentCandidateId: b.dataset.cand })));
    $$('[data-nav="funil"]', $("#view-td")).forEach(b => b.addEventListener("click", () => nav("funil")));

    // ----- 1:1s inline -----
    const ooAdd = $("#tdoo-add");
    if (ooAdd) ooAdd.addEventListener("click", () => {
      const candId = $("#tdoo-cand").value;
      const dt = $("#tdoo-date").value;
      const agenda = $("#tdoo-agenda").value.trim();
      if (!candId) { showToast("Selecione o colaborador.", "warn"); return; }
      if (!dt && !agenda) { showToast("Defina data ou pauta.", "warn"); return; }
      Store.addOneOnOne(candId, { scheduledFor: dt ? new Date(dt).toISOString() : new Date().toISOString(), agenda });
      showToast("1:1 agendada.", "success");
      renderTd();
    });
    $$(".td-oo-done").forEach(b => b.addEventListener("click", () => {
      Store.updateOneOnOne(b.dataset.cand, b.dataset.one, { status: "concluido" });
      renderTd();
    }));
    $$(".td-oo-remove").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover esta 1:1?")) return;
      Store.removeOneOnOne(b.dataset.cand, b.dataset.one);
      renderTd();
    }));
    $$(".td-oo-notes").forEach(t => {
      let timer;
      t.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => Store.updateOneOnOne(t.dataset.cand, t.dataset.one, { notes: t.value }), 500);
      });
    });

    // ----- PDI inline -----
    const pdiAdd = $("#tdpdi-add");
    if (pdiAdd) pdiAdd.addEventListener("click", () => {
      const candId = $("#tdpdi-cand").value;
      const title = $("#tdpdi-title").value.trim();
      if (!candId || !title) { showToast("Selecione colaborador e título.", "warn"); return; }
      Store.addPdiGoal(candId, {
        title,
        competency: $("#tdpdi-comp").value.trim(),
        description: $("#tdpdi-desc").value.trim(),
        deadline: $("#tdpdi-deadline").value || ""
      });
      showToast("Objetivo adicionado ao PDI.", "success");
      renderTd();
    });
    $$(".td-pdi-status").forEach(s => s.addEventListener("change", () => {
      Store.updatePdiGoal(s.dataset.cand, s.dataset.goal, { status: s.value });
      renderTd();
    }));
    $$(".td-pdi-remove").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover este objetivo?")) return;
      Store.removePdiGoal(b.dataset.cand, b.dataset.goal);
      renderTd();
    }));

    // ----- Feedback inline -----
    const fbAdd = $("#tdfb-add");
    if (fbAdd) fbAdd.addEventListener("click", () => {
      const candId = $("#tdfb-cand").value;
      const txt = $("#tdfb-text").value.trim();
      if (!candId || !txt) { showToast("Selecione colaborador e escreva o feedback.", "warn"); return; }
      Store.addFeedback(candId, { type: $("#tdfb-type").value, text: txt });
      showToast("Feedback enviado.", "success");
      renderTd();
    });
    $$(".td-fb-remove").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover este feedback?")) return;
      Store.removeFeedback(b.dataset.cand, b.dataset.fb);
      renderTd();
    }));

    // ----- Trilhas inline -----
    const trAdd = $("#tdtr-add");
    if (trAdd) trAdd.addEventListener("click", () => {
      const candId = $("#tdtr-cand").value;
      const trailId = $("#tdtr-trail").value;
      if (!candId || !trailId) { showToast("Selecione colaborador e trilha.", "warn"); return; }
      const res = Store.assignTrail(candId, trailId);
      if (!res) showToast("Trilha já atribuída a esse colaborador.", "warn");
      else { showToast("Trilha atribuída.", "success"); renderTd(); }
    });

    // ----- Editor de trilhas -----
    bindTrailEditorHandlers();
  }

  function renderTrailEditor() {
    const trails = State.seed.trails || [];
    return `
      <div class="card te-add">
        <h3>+ Nova trilha</h3>
        <div class="te-add-form">
          <input type="text" id="te-new-title" placeholder="Título da trilha" />
          <input type="text" id="te-new-desc" placeholder="Descrição curta" />
          <input type="text" id="te-new-target" placeholder="Público-alvo (ex: lideranca, financial_advisor)" />
          <button class="btn btn-primary btn-sm" id="te-create-trail">Criar</button>
        </div>
      </div>

      ${trails.map(t => `
        <div class="card te-card" data-trail="${t.id}">
          <div class="te-card-head">
            <input type="text" class="te-title" data-trail="${t.id}" value="${escapeHtml(t.title)}" />
            <button class="btn btn-ghost-on-light btn-sm te-remove-trail" data-trail="${t.id}">Excluir trilha</button>
          </div>
          <input type="text" class="te-desc" data-trail="${t.id}" value="${escapeHtml(t.desc || "")}" placeholder="Descrição" />
          <div class="muted small" style="margin:6px 0">Público-alvo: <input type="text" class="te-target" data-trail="${t.id}" value="${escapeHtml(t.target || "")}" /></div>

          <div class="te-modules-label">Módulos (${t.modules.length})</div>
          <div class="te-modules">
            ${t.modules.map(m => `
              <div class="te-module" data-module="${m.id}">
                <input type="text" class="te-mod-title" data-trail="${t.id}" data-module="${m.id}" value="${escapeHtml(m.title)}" placeholder="Título do módulo" />
                <select class="te-mod-type" data-trail="${t.id}" data-module="${m.id}">
                  ${["video","reading","task","course"].map(tp => `<option value="${tp}" ${m.type === tp ? "selected" : ""}>${tp}</option>`).join("")}
                </select>
                <input type="text" class="te-mod-duration" data-trail="${t.id}" data-module="${m.id}" value="${escapeHtml(m.duration || "")}" placeholder="Duração" />
                <button class="btn btn-ghost-on-light btn-sm te-mod-remove" data-trail="${t.id}" data-module="${m.id}">×</button>
              </div>
            `).join("")}
          </div>
          <div class="te-add-module">
            <input type="text" class="te-newmod-title" data-trail="${t.id}" placeholder="Novo módulo — título" />
            <select class="te-newmod-type" data-trail="${t.id}">
              ${["video","reading","task","course"].map(tp => `<option value="${tp}">${tp}</option>`).join("")}
            </select>
            <input type="text" class="te-newmod-duration" data-trail="${t.id}" placeholder="Duração" />
            <button class="btn btn-primary btn-sm te-add-mod" data-trail="${t.id}">+ Adicionar módulo</button>
          </div>
        </div>
      `).join("")}

      ${trails.length === 0 ? `<p class="muted">Nenhuma trilha cadastrada. Use o form acima para criar a primeira.</p>` : ""}
    `;
  }

  function bindTrailEditorHandlers() {
    const createBtn = $("#te-create-trail");
    if (createBtn) createBtn.addEventListener("click", () => {
      const title = $("#te-new-title").value.trim();
      if (!title) { showToast("Defina um título.", "warn"); return; }
      Store.addTrailDef({
        title,
        desc: $("#te-new-desc").value.trim(),
        target: $("#te-new-target").value.trim() || "qualquer",
        modules: []
      });
      State.seed = Store.getSeed();
      renderTd();
    });
    $$(".te-remove-trail").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover esta trilha? Os assignments de colaboradores serão removidos.")) return;
      Store.removeTrailDef(b.dataset.trail);
      State.seed = Store.getSeed();
      renderTd();
    }));
    const commitTrail = (input, key) => {
      input.addEventListener("blur", () => {
        Store.updateTrailDef(input.dataset.trail, { [key]: input.value });
        State.seed = Store.getSeed();
      });
    };
    $$(".te-title").forEach(i => commitTrail(i, "title"));
    $$(".te-desc").forEach(i => commitTrail(i, "desc"));
    $$(".te-target").forEach(i => commitTrail(i, "target"));

    const commitMod = (input, key) => {
      input.addEventListener("blur", () => {
        Store.updateTrailModule(input.dataset.trail, input.dataset.module, { [key]: input.value });
        State.seed = Store.getSeed();
      });
    };
    const commitModChange = (input, key) => {
      input.addEventListener("change", () => {
        Store.updateTrailModule(input.dataset.trail, input.dataset.module, { [key]: input.value });
        State.seed = Store.getSeed();
      });
    };
    $$(".te-mod-title").forEach(i => commitMod(i, "title"));
    $$(".te-mod-duration").forEach(i => commitMod(i, "duration"));
    $$(".te-mod-type").forEach(i => commitModChange(i, "type"));

    $$(".te-mod-remove").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Remover este módulo?")) return;
      Store.removeTrailModule(b.dataset.trail, b.dataset.module);
      State.seed = Store.getSeed();
      renderTd();
    }));
    $$(".te-add-mod").forEach(b => b.addEventListener("click", () => {
      const trailId = b.dataset.trail;
      const title = document.querySelector(`.te-newmod-title[data-trail="${trailId}"]`).value.trim();
      const type  = document.querySelector(`.te-newmod-type[data-trail="${trailId}"]`).value;
      const dur   = document.querySelector(`.te-newmod-duration[data-trail="${trailId}"]`).value.trim();
      if (!title) { showToast("Defina o título do módulo.", "warn"); return; }
      Store.addTrailModule(trailId, { title, type, duration: dur });
      State.seed = Store.getSeed();
      renderTd();
    }));
  }

  // ---------- ROUTER ----------
  function renderView(view) {
    if (view === "login")        renderLogin();
    if (view === "funil")        renderFunil();
    if (view === "analise")      renderAnalise();
    if (view === "indicadores")  renderIndicadores();
    if (view === "planilha")     renderPlanilha();
    if (view === "candidato")    renderCandidato();
    if (view === "td")           renderTd();
    if (view === "config")       renderConfig();
  }

  // ---------- DEMO RESUME ----------
  const DEMO_RESUME = `Mariana Souza Albuquerque
Goi\u00e2nia / GO \u00b7 (62) 9 8123-4567 \u00b7 mariana.albuquerque@email.com
linkedin.com/in/marianaalbuquerque

Resumo
Profissional de wealth management com 4 anos de experi\u00eancia em consultoria patrimonial e relacionamento com clientes high ticket. Atua\u00e7\u00e3o em planejamento de investimentos, previd\u00eancia privada e estruturas de holdings familiares.

Experi\u00eancia
\u2022 2022 \u2013 atual | Wealth Advisor S\u00ear. \u2014 BTG Pactual Wealth Management
  Carteira de 38 fam\u00edlias high ticket, \u00b1 R$ 240MM sob assessoria.
  Implementa\u00e7\u00e3o de plano de previd\u00eancia (PGBL/VGBL) e holding patrimonial em 12 fam\u00edlias.
\u2022 2021 \u2013 2022 | Especialista de Investimentos \u2014 XP Investimentos
  Aloca\u00e7\u00e3o de carteiras de R$ 1MM\u201310MM, foco em renda fixa, fundos multimercado e a\u00e7\u00f5es.

Certifica\u00e7\u00f5es
CFP\u00ae (2024), CEA (2022), CPA-20 (2021)

Forma\u00e7\u00e3o
Bacharel em Economia \u2014 UFG (2020)
P\u00f3s-gradua\u00e7\u00e3o em Finan\u00e7as e Investimentos \u2014 FGV (2023)

Idiomas
Portugu\u00eas (nativo), Ingl\u00eas (avan\u00e7ado), Espanhol (intermedi\u00e1rio)`;

  // ---------- BOOT ----------
  const KNOWN_VIEWS = new Set(["login","funil","analise","indicadores","planilha","candidato","td","config"]);
  function initialView() {
    if (!State.user) return "login";
    const route = readHashRoute();
    if (route && KNOWN_VIEWS.has(route.view) && route.view !== "login") {
      if (route.candidatoId) State.currentCandidateId = route.candidatoId;
      return route.view;
    }
    return "funil";
  }

  document.addEventListener("DOMContentLoaded", () => {
    State.seed = Store.getSeed();
    State.user = Store.getUser();
    Store.seedExampleIfMissing();  // injeta Marcelo se ainda não existir
    mountChrome();
    nav(initialView());

    // Back/forward do browser também navegam
    window.addEventListener("hashchange", () => {
      const route = readHashRoute();
      if (!route || !KNOWN_VIEWS.has(route.view)) return;
      // evita loop: se já está na view, não re-navega
      const current = $(".view.active")?.id?.replace("view-", "");
      if (current === route.view && (!route.candidatoId || State.currentCandidateId === route.candidatoId)) return;
      const opts = route.candidatoId ? { currentCandidateId: route.candidatoId } : {};
      nav(route.view, opts);
    });
  });
})();
