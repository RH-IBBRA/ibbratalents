// IBBRA Talents — storage layer (localStorage)
(function () {
  const KEYS = {
    USER:       "ibbra-rh:user",
    CONFIG:     "ibbra-rh:config",
    SEED:       "ibbra-rh:seed",
    CANDIDATES: "ibbra-rh:candidates"
  };

  function safeRead(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  }
  function safeWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn("storage:", e); return false; }
  }
  function nowIso() { return new Date().toISOString(); }

  const Store = {
    // ---- user
    getUser() { return safeRead(KEYS.USER, null); },
    setUser(u) { safeWrite(KEYS.USER, u); },
    clearUser() { localStorage.removeItem(KEYS.USER); },

    // ---- config
    getConfig() {
      return safeRead(KEYS.CONFIG, { apiKey: "", model: "claude-haiku-4-5-20251001" });
    },
    setConfig(cfg) { safeWrite(KEYS.CONFIG, cfg); },

    // ---- seed (com auto-refresh quando a versão muda)
    getSeed() {
      const stored = safeRead(KEYS.SEED, null);
      const current = window.IBBRA_RH_SEED;
      const currentVersion = current?.version || 0;
      const storedVersion  = stored?.version || 0;

      if (!stored || !stored.vacancies || !stored.expertises) {
        safeWrite(KEYS.SEED, current);
        return current;
      }
      // Seed desatualizado: faz auto-refresh dos dados mestres preservando customizações
      if (storedVersion < currentVersion) {
        // Atualiza vagas, estágios padrão, expertises, certificações e trilhas do current.
        // Mantém trilhas custom criadas pelo usuário (id começando com "tr-").
        const customTrails = (stored.trails || []).filter(t => String(t.id).startsWith("tr-"));
        const merged = {
          ...current,
          trails: [...current.trails, ...customTrails]
        };
        safeWrite(KEYS.SEED, merged);
        try { console.info("[IBBRA Talents] seed atualizado para versão " + currentVersion); } catch {}
        return merged;
      }
      return stored;
    },
    setSeed(s) { safeWrite(KEYS.SEED, s); },
    resetSeed() { safeWrite(KEYS.SEED, window.IBBRA_RH_SEED); return window.IBBRA_RH_SEED; },

    // ---- candidatos
    getCandidates() {
      const list = safeRead(KEYS.CANDIDATES, []);
      // Migração: vagas extintas → mapeia para a substituta mais próxima
      const remap = { trainee: "fa_trainee1", ti_suporte: null, recepcao: null };
      let dirty = false;
      list.forEach(c => {
        if (c.fitVacancyId in remap) {
          c.fitVacancyId = remap[c.fitVacancyId] || "aux_admin"; // fallback genérico
          dirty = true;
        }
      });
      if (dirty) safeWrite(KEYS.CANDIDATES, list);
      return list;
    },
    setCandidates(list) { safeWrite(KEYS.CANDIDATES, list); },
    addCandidate(c) {
      // Garante schema completo, sem sobrescrever dados existentes
      const enriched = {
        comments: [],
        diagnosis: null,
        stageHistory: [{ ts: nowIso(), from: null, to: c.stage, by: (Store.getUser()?.name || "sistema") }],
        stageEnteredAt: nowIso(),
        ...c
      };
      if (!enriched.stageHistory || !enriched.stageHistory.length) {
        enriched.stageHistory = [{ ts: nowIso(), from: null, to: enriched.stage, by: (Store.getUser()?.name || "sistema") }];
      }
      if (!enriched.stageEnteredAt) enriched.stageEnteredAt = nowIso();
      if (!Array.isArray(enriched.comments)) enriched.comments = [];
      if (enriched.diagnosis === undefined) enriched.diagnosis = null;

      // Se o candidato já entra direto como "Contratado" (ex.: import do Notion),
      // dispara onHire também — para garantir consistência com o fluxo de mudança de estágio.
      if (enriched.stage === "contratado" && !enriched.hiredAutomationDone) {
        Store._applyOnHire(enriched);
      }

      const all = this.getCandidates();
      all.unshift(enriched);
      this.setCandidates(all);
      return enriched;
    },
    updateCandidate(id, patch) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return null;
      all[idx] = { ...all[idx], ...patch, updatedAt: nowIso() };
      this.setCandidates(all);
      return all[idx];
    },
    removeCandidate(id) {
      const all = this.getCandidates().filter(x => x.id !== id);
      this.setCandidates(all);
    },
    clearCandidates() { localStorage.removeItem(KEYS.CANDIDATES); },

    // ---- ciclo de estágio (registra histórico + dispara onHire se contratado)
    changeStage(id, newStage, by) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return null;
      const cand = all[idx];
      const from = cand.stage;
      if (from === newStage) return cand;
      const ts = nowIso();
      cand.stageHistory = Array.isArray(cand.stageHistory) ? cand.stageHistory.slice() : [];
      cand.stageHistory.push({ ts, from, to: newStage, by: by || (Store.getUser()?.name || "sistema") });
      cand.stage = newStage;
      cand.stageEnteredAt = ts;
      cand.updatedAt = ts;
      // Automação: ao mover para "contratado" pela primeira vez, dispara onHire
      if (newStage === "contratado" && from !== "contratado") {
        Store._applyOnHire(cand);
      }
      this.setCandidates(all);
      return cand;
    },

    // Dispara onboarding automatizado: trilhas, PDI inicial, feedback de boas-vindas.
    // Não roda novamente se o candidato já passou por isso (idempotente via flag).
    _applyOnHire(cand) {
      if (cand.hiredAutomationDone) return;
      const seed = Store.getSeed();
      cand.trails = cand.trails || [];
      const ensureTrail = (trailId) => {
        if (!(seed.trails || []).find(t => t.id === trailId)) return;
        if (cand.trails.find(t => t.trailId === trailId)) return;
        cand.trails.unshift({ trailId, assignedAt: nowIso(), completedModules: [], completedAt: null });
      };
      // 1) trilha de onboarding sempre
      ensureTrail("onboarding");
      // 2) trilha técnica de acordo com a vaga
      const techByVacancy = {
        fa_trainee1: "financial_advisor",
        fa_trainee2: "financial_advisor",
        junior: "financial_advisor",
        pleno: "financial_advisor",
        senior: "financial_advisor",
        comercial_inside: "atendimento_premium"
      };
      if (techByVacancy[cand.fitVacancyId]) ensureTrail(techByVacancy[cand.fitVacancyId]);

      // 3) feedback automatizado de boas-vindas
      cand.feedbacks = cand.feedbacks || [];
      cand.feedbacks.unshift({
        id: "fb-hire-" + Date.now().toString(36),
        ts: nowIso(),
        from: "IBBRA Talents (automático)",
        type: "reconhecimento",
        text: "🎉 Bem-vindo(a) à IBBRA! Trilhas de onboarding atribuídas automaticamente. Defina objetivos no seu PDI e agende a primeira 1:1 com seu gestor."
      });

      // 4) PDI inicial com objetivo de onboarding (30 dias)
      if (!cand.pdi) cand.pdi = { goals: [], createdAt: nowIso() };
      const hasOnboardingGoal = (cand.pdi.goals || []).some(g => g.id?.startsWith("g-onb-"));
      if (!hasOnboardingGoal) {
        const deadline = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        cand.pdi.goals.unshift({
          id: "g-onb-" + Date.now().toString(36),
          ts: nowIso(),
          title: "Concluir trilha de Onboarding IBBRA",
          competency: "Cultura e processos IBBRA",
          description: "Completar todos os módulos da trilha de boas-vindas nos primeiros 30 dias.",
          deadline,
          status: "em_progresso",
          owner: "—"
        });
      }
      cand.hiredAutomationDone = true;
      cand.hiredAt = cand.hiredAt || nowIso();
    },

    // ---- anotações do RH (notas estruturadas em thread)
    addNote(id, text) {
      const user = Store.getUser();
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return null;
      const c = all[idx];
      c.notesList = Array.isArray(c.notesList) ? c.notesList : [];
      const entry = {
        id: "note-" + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36),
        ts: nowIso(),
        author: user?.name || "anônimo",
        role: user?.role || "rh",
        text: String(text || "").trim()
      };
      if (!entry.text) return null;
      c.notesList.unshift(entry);
      c.updatedAt = nowIso();
      this.setCandidates(all);
      return entry;
    },
    removeNote(id, noteId) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return;
      all[idx].notesList = (all[idx].notesList || []).filter(n => n.id !== noteId);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
    },

    // ---- comentários da equipe
    addComment(id, text) {
      const user = Store.getUser();
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return null;
      const c = all[idx];
      c.comments = Array.isArray(c.comments) ? c.comments : [];
      const entry = {
        id: "cm-" + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36),
        ts: nowIso(),
        author: user?.name || "anônimo",
        role: user?.role || "rh",
        text: String(text || "").trim()
      };
      c.comments.unshift(entry);
      c.updatedAt = nowIso();
      this.setCandidates(all);
      return entry;
    },
    removeComment(id, commentId) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return;
      all[idx].comments = (all[idx].comments || []).filter(c => c.id !== commentId);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
    },

    // ---- diagnóstico de perfil
    setDiagnosis(id, diag) {
      const user = Store.getUser();
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return null;
      const dims = diag.dimensions || {};
      const ratings = Object.values(dims).filter(v => typeof v === "number" && v > 0);
      const score = ratings.length ? Math.round((ratings.reduce((a,b)=>a+b,0) / ratings.length) * 20) : 0;
      const payload = {
        ts: nowIso(),
        author: user?.name || "anônimo",
        dimensions: dims,
        recommendation: diag.recommendation || "considerar",
        observations: diag.observations || "",
        score
      };
      all[idx].diagnosis = payload;
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
      return payload;
    },

    // ---- avaliações por entrevistador (soft + hard skills)
    addInterviewerEval(candidateId, evalPayload) {
      const user = Store.getUser();
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return null;
      const c = all[idx];
      c.interviewerEvals = Array.isArray(c.interviewerEvals) ? c.interviewerEvals : [];
      const entry = {
        id: "iev-" + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36),
        ts: nowIso(),
        author: user?.name || "anônimo",
        role: user?.role || "rh",
        softSkills: evalPayload.softSkills || {},
        hardSkills: evalPayload.hardSkills || {},
        comment: evalPayload.comment || ""
      };
      c.interviewerEvals.unshift(entry);
      c.updatedAt = nowIso();
      this.setCandidates(all);
      return entry;
    },
    removeInterviewerEval(candidateId, evalId) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return;
      all[idx].interviewerEvals = (all[idx].interviewerEvals || []).filter(e => e.id !== evalId);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
    },

    // ---- 1:1s (one-on-ones)
    addOneOnOne(candidateId, payload) {
      const user = Store.getUser();
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return null;
      all[idx].oneonones = Array.isArray(all[idx].oneonones) ? all[idx].oneonones : [];
      const entry = {
        id: "1on1-" + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36),
        ts: nowIso(),
        scheduledFor: payload.scheduledFor || nowIso(),
        manager: payload.manager || user?.name || "—",
        agenda: payload.agenda || "",
        notes: payload.notes || "",
        actionItems: Array.isArray(payload.actionItems) ? payload.actionItems : [],
        mood: payload.mood || null,
        status: payload.status || "agendado"
      };
      all[idx].oneonones.unshift(entry);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
      return entry;
    },
    updateOneOnOne(candidateId, oneId, patch) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return;
      const list = all[idx].oneonones || [];
      const j = list.findIndex(o => o.id === oneId);
      if (j === -1) return;
      list[j] = { ...list[j], ...patch };
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
      return list[j];
    },
    removeOneOnOne(candidateId, oneId) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return;
      all[idx].oneonones = (all[idx].oneonones || []).filter(o => o.id !== oneId);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
    },

    // ---- PDI (Plano de Desenvolvimento Individual)
    addPdiGoal(candidateId, payload) {
      const user = Store.getUser();
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return null;
      if (!all[idx].pdi) all[idx].pdi = { goals: [], createdAt: nowIso() };
      const goal = {
        id: "g-" + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36),
        ts: nowIso(),
        title: payload.title || "Objetivo",
        competency: payload.competency || "",
        description: payload.description || "",
        deadline: payload.deadline || "",
        status: payload.status || "pendente",
        owner: payload.owner || user?.name || ""
      };
      all[idx].pdi.goals.unshift(goal);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
      return goal;
    },
    updatePdiGoal(candidateId, goalId, patch) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1 || !all[idx].pdi) return;
      const j = (all[idx].pdi.goals || []).findIndex(g => g.id === goalId);
      if (j === -1) return;
      all[idx].pdi.goals[j] = { ...all[idx].pdi.goals[j], ...patch };
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
      return all[idx].pdi.goals[j];
    },
    removePdiGoal(candidateId, goalId) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1 || !all[idx].pdi) return;
      all[idx].pdi.goals = (all[idx].pdi.goals || []).filter(g => g.id !== goalId);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
    },

    // ---- Feedback (mural simples por pessoa)
    addFeedback(candidateId, payload) {
      const user = Store.getUser();
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return null;
      all[idx].feedbacks = Array.isArray(all[idx].feedbacks) ? all[idx].feedbacks : [];
      const entry = {
        id: "fb-" + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36),
        ts: nowIso(),
        from: user?.name || "anônimo",
        type: payload.type || "positivo",   // positivo | construtivo | reconhecimento
        text: String(payload.text || "").trim()
      };
      all[idx].feedbacks.unshift(entry);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
      return entry;
    },
    removeFeedback(candidateId, fbId) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return;
      all[idx].feedbacks = (all[idx].feedbacks || []).filter(f => f.id !== fbId);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
    },

    // ---- Trilhas (assignments por candidato)
    assignTrail(candidateId, trailId) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return null;
      all[idx].trails = Array.isArray(all[idx].trails) ? all[idx].trails : [];
      if (all[idx].trails.find(t => t.trailId === trailId)) return null;
      const entry = { trailId, assignedAt: nowIso(), completedModules: [], completedAt: null };
      all[idx].trails.unshift(entry);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
      return entry;
    },
    unassignTrail(candidateId, trailId) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return;
      all[idx].trails = (all[idx].trails || []).filter(t => t.trailId !== trailId);
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
    },
    toggleTrailModule(candidateId, trailId, moduleId) {
      const all = this.getCandidates();
      const idx = all.findIndex(x => x.id === candidateId);
      if (idx === -1) return;
      const tr = (all[idx].trails || []).find(t => t.trailId === trailId);
      if (!tr) return;
      const i = tr.completedModules.indexOf(moduleId);
      if (i >= 0) tr.completedModules.splice(i, 1);
      else tr.completedModules.push(moduleId);
      // checar conclusão total
      const seed = Store.getSeed();
      const trail = (seed.trails || []).find(t => t.id === trailId);
      if (trail && tr.completedModules.length >= trail.modules.length) {
        tr.completedAt = nowIso();
      } else {
        tr.completedAt = null;
      }
      all[idx].updatedAt = nowIso();
      this.setCandidates(all);
      return tr;
    },

    // ---- Editor de pipeline (estágios)
    addStage(stage) {
      const seed = Store.getSeed();
      seed.pipeline = seed.pipeline || [];
      const id = stage.id || "st-" + Date.now().toString(36);
      seed.pipeline.push({ id, name: stage.name, short: stage.short || stage.name.slice(0, 10), tone: stage.tone || "navy", desc: stage.desc || "" });
      Store.setSeed(seed);
      return seed;
    },
    renameStage(stageId, patch) {
      const seed = Store.getSeed();
      const st = (seed.pipeline || []).find(s => s.id === stageId);
      if (!st) return;
      Object.assign(st, patch);
      Store.setSeed(seed);
      return seed;
    },
    removeStage(stageId, fallbackId) {
      const seed = Store.getSeed();
      seed.pipeline = (seed.pipeline || []).filter(s => s.id !== stageId);
      Store.setSeed(seed);
      // candidatos no estágio removido vão pra fallback (ou primeiro estágio)
      const fb = fallbackId || seed.pipeline[0]?.id;
      if (fb) {
        const all = this.getCandidates();
        let dirty = false;
        all.forEach(c => { if (c.stage === stageId) { c.stage = fb; c.stageEnteredAt = nowIso(); dirty = true; } });
        if (dirty) this.setCandidates(all);
      }
      return seed;
    },
    // ---- Editor de TRILHAS no seed (admin)
    addTrailDef(trail) {
      const seed = Store.getSeed();
      seed.trails = seed.trails || [];
      const id = trail.id || "tr-" + Date.now().toString(36);
      seed.trails.push({
        id,
        title: trail.title || "Nova trilha",
        desc: trail.desc || "",
        target: trail.target || "qualquer",
        modules: trail.modules || []
      });
      Store.setSeed(seed);
      return id;
    },
    updateTrailDef(trailId, patch) {
      const seed = Store.getSeed();
      const t = (seed.trails || []).find(x => x.id === trailId);
      if (!t) return;
      Object.assign(t, patch);
      Store.setSeed(seed);
      return t;
    },
    removeTrailDef(trailId) {
      const seed = Store.getSeed();
      seed.trails = (seed.trails || []).filter(t => t.id !== trailId);
      Store.setSeed(seed);
      // limpa assignments
      const all = this.getCandidates();
      let dirty = false;
      all.forEach(c => {
        const before = (c.trails || []).length;
        c.trails = (c.trails || []).filter(t => t.trailId !== trailId);
        if (c.trails.length !== before) dirty = true;
      });
      if (dirty) this.setCandidates(all);
    },
    addTrailModule(trailId, mod) {
      const seed = Store.getSeed();
      const t = (seed.trails || []).find(x => x.id === trailId);
      if (!t) return;
      t.modules = t.modules || [];
      const id = mod.id || "m-" + Date.now().toString(36);
      t.modules.push({
        id,
        title: mod.title || "Módulo",
        type: mod.type || "video",
        duration: mod.duration || ""
      });
      Store.setSeed(seed);
      return id;
    },
    updateTrailModule(trailId, moduleId, patch) {
      const seed = Store.getSeed();
      const t = (seed.trails || []).find(x => x.id === trailId);
      if (!t) return;
      const m = (t.modules || []).find(x => x.id === moduleId);
      if (!m) return;
      Object.assign(m, patch);
      Store.setSeed(seed);
      return m;
    },
    removeTrailModule(trailId, moduleId) {
      const seed = Store.getSeed();
      const t = (seed.trails || []).find(x => x.id === trailId);
      if (!t) return;
      t.modules = (t.modules || []).filter(m => m.id !== moduleId);
      Store.setSeed(seed);
      // Limpa progresso desse módulo nos candidatos
      const all = this.getCandidates();
      let dirty = false;
      all.forEach(c => (c.trails || []).forEach(tr => {
        if (tr.trailId === trailId) {
          const before = tr.completedModules.length;
          tr.completedModules = tr.completedModules.filter(id => id !== moduleId);
          if (tr.completedModules.length !== before) dirty = true;
        }
      }));
      if (dirty) this.setCandidates(all);
    },

    moveStage(stageId, dir) {
      const seed = Store.getSeed();
      const list = seed.pipeline || [];
      const i = list.findIndex(s => s.id === stageId);
      if (i === -1) return;
      const j = i + (dir === "up" ? -1 : 1);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      Store.setSeed(seed);
      return seed;
    },

    // ---- exemplos seeded (Marcelo + Leandro) — só inserem se ainda não existirem
    seedExampleIfMissing() {
      let dirty = false;
      const all = this.getCandidates();
      if (!all.some(c => c.id === "ex-marcelo")) {
        all.unshift(this._buildMarcelo());
        dirty = true;
      }
      if (!all.some(c => c.id === "ex-leandro")) {
        all.unshift(this._buildLeandro());
        dirty = true;
      }
      if (dirty) this.setCandidates(all);
      return dirty;
    },

    _buildMarcelo() {
      const now = new Date();
      const hiredAt = new Date(now.getTime() - 60 * 86400000).toISOString();
      const tr1 = new Date(now.getTime() - 60 * 86400000).toISOString();
      const tr2 = new Date(now.getTime() - 35 * 86400000).toISOString();
      return this._buildMarceloPayload(now, hiredAt, tr1, tr2);
    },
    _buildLeandro() {
      const now = new Date();
      const hiredAt = new Date(now.getTime() - 3 * 365 * 86400000).toISOString(); // contratado há 3 anos
      return this._buildLeandroPayload(now, hiredAt);
    },

    _buildMarceloPayload(now, hiredAt, tr1, tr2) {
      return {
        id: "ex-marcelo",
        fullName: "Marcelo Furtado",
        email: "marcelo.furtado@ibbra.com.br",
        phone: "(62) 9 9876-1234",
        city: "Goiânia", state: "GO",
        linkedin: "linkedin.com/in/marcelo-furtado-ibbra",
        experienceYears: 3, experienceMonths: 6,
        summary: "Headhunter com 3 anos em R&S, em transição automatizada de carreira para Business Partner.",
        expertises: [
          { id: "recrutamento_selecao", evidence: "3 anos liderando R&S" },
          { id: "vendas_consultivas",   evidence: "Vendas consultivas B2B" }
        ],
        certifications: [],
        languages: ["Português (nativo)", "Inglês (avançado)"],
        education: [{ degree: "Bacharel em Psicologia", institution: "PUC-GO", year: "2020" }],
        fitVacancyId: "rh_pessoas", fitSeniority: "pleno", fitScore: 85,
        fitJustification: "Profissional com 3 anos em R&S, hunting técnico, mentalidade estratégica e potencial para evolução a BP.",
        highlights: ["Mentalidade estratégica", "Bom comunicador", "Liderança natural"],
        redFlags: [],
        stage: "contratado",
        stageEnteredAt: hiredAt,
        stageHistory: [
          { ts: new Date(now.getTime() - 90 * 86400000).toISOString(), from: null,         to: "triagem",    by: "sistema" },
          { ts: new Date(now.getTime() - 80 * 86400000).toISOString(), from: "triagem",    to: "rh",         by: "Gestor de T&D" },
          { ts: new Date(now.getTime() - 70 * 86400000).toISOString(), from: "rh",         to: "tecnica",    by: "Gestor de T&D" },
          { ts: new Date(now.getTime() - 65 * 86400000).toISOString(), from: "tecnica",    to: "proposta",   by: "Administrador" },
          { ts: hiredAt,                                                  from: "proposta",   to: "contratado", by: "Administrador" }
        ],
        notes: "Em trilha de carreira de Headhunter para Business Partner. Avaliação semestral em agosto.",
        resumeText: "Currículo de exemplo do Marcelo Henrique — Headhunter sênior em desenvolvimento para BP.",
        source: "exemplo",
        createdAt: new Date(now.getTime() - 90 * 86400000).toISOString(),
        updatedAt: hiredAt,
        hiredAt, hiredAutomationDone: true,
        comments: [
          {
            id: "cm-ex-1", ts: new Date(now.getTime() - 14 * 86400000).toISOString(),
            author: "Gestor de T&D", role: "gestor",
            text: "Marcelo entregou o módulo de Hunting Avançado com nota excelente. Pronto para o próximo passo na trilha."
          },
          {
            id: "cm-ex-2", ts: new Date(now.getTime() - 7 * 86400000).toISOString(),
            author: "Administrador", role: "admin",
            text: "Conversamos sobre a transição para BP. Forte alinhamento. Vamos atribuir mentoria do João nos próximos 30 dias."
          }
        ],
        feedbacks: [
          {
            id: "fb-ex-hire", ts: hiredAt, from: "IBBRA Talents (automático)", type: "reconhecimento",
            text: "🎉 Bem-vindo(a) à IBBRA! Trilhas de onboarding atribuídas automaticamente."
          },
          {
            id: "fb-ex-1", ts: new Date(now.getTime() - 20 * 86400000).toISOString(), from: "Gestor de T&D", type: "positivo",
            text: "Excelente facilitação na entrevista com a candidata Ana. Soube conduzir a conversa de forma técnica e empática."
          },
          {
            id: "fb-ex-2", ts: new Date(now.getTime() - 5 * 86400000).toISOString(), from: "Administrador", type: "construtivo",
            text: "Atenção ao volume de candidatos no funil. Vamos trabalhar priorização nas próximas 1:1s."
          }
        ],
        oneonones: [
          {
            id: "1on1-ex-1", ts: new Date(now.getTime() - 30 * 86400000).toISOString(),
            scheduledFor: new Date(now.getTime() - 30 * 86400000).toISOString(),
            manager: "Gestor de T&D", agenda: "Check-in dos primeiros 30 dias",
            notes: "Marcelo bem adaptado. Trilha de onboarding 100% concluída no prazo. Discutimos próximos passos.",
            actionItems: [], status: "concluido"
          },
          {
            id: "1on1-ex-2", ts: new Date(now.getTime() + 7 * 86400000).toISOString(),
            scheduledFor: new Date(now.getTime() + 7 * 86400000).toISOString(),
            manager: "Gestor de T&D", agenda: "Avaliação módulo Diagnóstico organizacional + plano para cases BP",
            notes: "", actionItems: [], status: "agendado"
          }
        ],
        pdi: {
          createdAt: hiredAt,
          goals: [
            {
              id: "g-ex-1", ts: hiredAt, title: "Concluir trilha de Onboarding IBBRA",
              competency: "Cultura e processos IBBRA", description: "Completar todos os módulos da trilha de boas-vindas.",
              deadline: new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10),
              status: "concluido", owner: "Marcelo"
            },
            {
              id: "g-ex-2", ts: tr2, title: "Concluir trilha de carreira Headhunter → BP",
              competency: "Business Partnering", description: "Avançar nos 9 módulos com mentoria assistida.",
              deadline: new Date(now.getTime() + 180 * 86400000).toISOString().slice(0, 10),
              status: "em_progresso", owner: "Marcelo"
            },
            {
              id: "g-ex-3", ts: tr2, title: "Conduzir 5 casos como BP assistido",
              competency: "Business Partnering aplicado", description: "Rotação assistida em 5 áreas do negócio.",
              deadline: new Date(now.getTime() + 240 * 86400000).toISOString().slice(0, 10),
              status: "pendente", owner: "Marcelo"
            }
          ]
        },
        diagnosis: {
          ts: new Date(now.getTime() - 25 * 86400000).toISOString(),
          author: "Gestor de T&D",
          dimensions: { tecnica: 4, cultural: 5, comunicacao: 5, disponibilidade: 4, pretensao_salarial: 4 },
          recommendation: "avancar",
          observations: "Pronto para a próxima fase. Plano: rotação assistida + mentoria sênior.",
          score: 88
        },
        trails: [
          // Onboarding: 100% concluído
          { trailId: "onboarding",     assignedAt: tr1, completedModules: ["m1","m2","m3","m4","m5"], completedAt: new Date(now.getTime() - 30 * 86400000).toISOString() },
          // Carreira HH→BP: 4/9 — TIER 1 (Headhunter) completo, em meio do TIER 2 (Talent Acquisition)
          { trailId: "headhunter_bp",   assignedAt: tr2, completedModules: ["hbp1","hbp2","hbp3","hbp4"], completedAt: null },
          // Trilhas complementares pra BP
          { trailId: "people_analytics", assignedAt: tr2, completedModules: ["pa1","pa2"], completedAt: null },         // 2/5
          { trailId: "coaching_mentoria", assignedAt: tr2, completedModules: ["cm1"], completedAt: null },                // 1/4
          { trailId: "dei_avancado",     assignedAt: new Date(now.getTime() - 10 * 86400000).toISOString(), completedModules: [], completedAt: null } // 0/4 recém atribuída
        ]
      };
    },

    _buildLeandroPayload(now, hiredAt) {
      const m24 = new Date(now.getTime() - 24 * 30 * 86400000).toISOString(); // 24m atrás
      const m18 = new Date(now.getTime() - 18 * 30 * 86400000).toISOString();
      const m12 = new Date(now.getTime() - 12 * 30 * 86400000).toISOString();
      const m6  = new Date(now.getTime() -  6 * 30 * 86400000).toISOString();
      const m3  = new Date(now.getTime() -  3 * 30 * 86400000).toISOString();
      const m1  = new Date(now.getTime() -  1 * 30 * 86400000).toISOString();
      const w1  = new Date(now.getTime() -  7 * 86400000).toISOString();

      return {
        id: "ex-leandro",
        fullName: "Leandro Carlos",
        email: "leandro.carlos@ibbra.com.br",
        phone: "(62) 9 8521-0099",
        city: "Goiânia", state: "GO",
        linkedin: "linkedin.com/in/leandro-carlos-cfp",
        experienceYears: 5, experienceMonths: 8,
        summary: "Financial Advisor com 5+ anos em wealth management, em processo final de promoção a Sênior. Carteira ativa de famílias high ticket e domínio técnico completo (CFP®, CEA, CPA-20).",
        expertises: [
          { id: "wealth_management",        evidence: "5+ anos em wealth management" },
          { id: "high_ticket",              evidence: "Carteira de famílias com PL > R$ 10MM" },
          { id: "investimentos",            evidence: "Alocação estratégica multiclasse" },
          { id: "planejamento_sucessorio",  evidence: "Implementação de holdings em 7 famílias" },
          { id: "previdencia",              evidence: "Estruturas PGBL/VGBL otimizadas" },
          { id: "planejamento_fiscal",      evidence: "Eficiência tributária em sucessão" }
        ],
        certifications: [
          { id: "cpa20", evidence: "CPA-20 (2021)" },
          { id: "cea",   evidence: "CEA (2022)" },
          { id: "cfp",   evidence: "CFP® (2024)" }
        ],
        languages: ["Português (nativo)", "Inglês (avançado)", "Espanhol (intermediário)"],
        education: [
          { degree: "Bacharel em Economia",                    institution: "PUC-GO", year: "2017" },
          { degree: "Pós-graduação em Finanças & Investimentos", institution: "FGV",    year: "2020" }
        ],
        fitVacancyId: "pleno", fitSeniority: "pleno", fitScore: 92,
        fitJustification: "100% da trilha técnica concluída (Júnior → Pleno → Sênior). Diagnóstico positivo, 6 1:1s completas, PDI cumprido. Apto à promoção formal a Sênior.",
        highlights: [
          "Carteira de R$ 280MM sob assessoria",
          "Implementou holdings em 7 famílias high ticket",
          "Mentora ativamente 2 trainees",
          "Aprovado em CFP® 2024 com nota alta",
          "NPS interno: 9.4 (média dos últimos 12 meses)"
        ],
        redFlags: [],
        stage: "contratado",
        stageEnteredAt: hiredAt,
        stageHistory: [
          { ts: new Date(now.getTime() - 3.2 * 365 * 86400000).toISOString(), from: null,         to: "triagem",    by: "sistema" },
          { ts: new Date(now.getTime() - 3.15 * 365 * 86400000).toISOString(), from: "triagem",   to: "rh",         by: "Recrutador IBBRA" },
          { ts: new Date(now.getTime() - 3.1 * 365 * 86400000).toISOString(), from: "rh",         to: "tecnica",    by: "Gestor de T&D" },
          { ts: new Date(now.getTime() - 3.05 * 365 * 86400000).toISOString(), from: "tecnica",   to: "proposta",   by: "Administrador" },
          { ts: hiredAt,                                                       from: "proposta",   to: "contratado", by: "Administrador" }
        ],
        notes: "Critérios completos pra promoção a Sênior — CFP® obtido, carteira própria consolidada, mentoria ativa. Aguardando aprovação formal da diretoria.",
        resumeText: "Currículo de exemplo do Leandro Carlos — FA Pleno apto à promoção a Sênior.",
        source: "exemplo",
        createdAt: new Date(now.getTime() - 3.2 * 365 * 86400000).toISOString(),
        updatedAt: w1,
        hiredAt, hiredAutomationDone: true,
        comments: [
          { id: "cm-lc-1", ts: m1, author: "Gestor de T&D", role: "gestor",
            text: "Leandro concluiu o CFP®. Diferencial técnico no time. Pronto pra avançar à categoria Sênior." },
          { id: "cm-lc-2", ts: w1, author: "Administrador",  role: "admin",
            text: "Validamos a carteira atual em R$ 280MM. Performance entre os top 3 do escritório. Apto." }
        ],
        feedbacks: [
          { id: "fb-lc-hire", ts: hiredAt, from: "IBBRA Talents (automático)", type: "reconhecimento",
            text: "🎉 Bem-vindo(a) à IBBRA! Trilha de carreira Financial Advisor atribuída." },
          { id: "fb-lc-1", ts: m18, from: "Gestor de T&D", type: "positivo",
            text: "Aprovação na CEA com 92% — preparação exemplar." },
          { id: "fb-lc-2", ts: m12, from: "Administrador",  type: "reconhecimento",
            text: "Carteira passou de R$ 80MM pra R$ 180MM em 12 meses. Excelente." },
          { id: "fb-lc-3", ts: m6,  from: "Gestor de T&D", type: "construtivo",
            text: "Atenção à organização da agenda — duas reuniões reagendadas no mês. Já discutimos plano de melhoria." },
          { id: "fb-lc-4", ts: m1,  from: "Administrador",  type: "reconhecimento",
            text: "Aprovação no CFP®! Marco histórico da sua jornada na IBBRA. Parabéns." }
        ],
        oneonones: [
          { id: "1on1-lc-1", ts: m24, scheduledFor: m24, manager: "Gestor de T&D",
            agenda: "Check-in 6 meses pós-ingresso", notes: "Onboarding 100% concluído. Pronto pra CPA-20.", status: "concluido" },
          { id: "1on1-lc-2", ts: m18, scheduledFor: m18, manager: "Gestor de T&D",
            agenda: "Pós-CEA + estruturação de carteira inicial", notes: "Foco nas próximas 10 famílias do pipeline.", status: "concluido" },
          { id: "1on1-lc-3", ts: m12, scheduledFor: m12, manager: "Gestor de T&D",
            agenda: "Avaliação de performance anual", notes: "Resultado acima da meta. Promoção a Pleno aprovada.", status: "concluido" },
          { id: "1on1-lc-4", ts: m6,  scheduledFor: m6,  manager: "Administrador",
            agenda: "Preparação CFP® + visão sênior", notes: "Definimos cronograma de estudos. Mentoria assistida.", status: "concluido" },
          { id: "1on1-lc-5", ts: m3,  scheduledFor: m3,  manager: "Gestor de T&D",
            agenda: "Pós-prova CFP®", notes: "Aprovado. Iniciamos casos sucessórios assistidos.", status: "concluido" },
          { id: "1on1-lc-6", ts: m1,  scheduledFor: m1,  manager: "Administrador",
            agenda: "Critérios de promoção a Sênior", notes: "Check completo: trilha 100%, certificações ok, carteira sólida.", status: "concluido" }
        ],
        pdi: {
          createdAt: new Date(now.getTime() - 3 * 365 * 86400000).toISOString(),
          goals: [
            { id: "g-lc-1", ts: m24, title: "Aprovar na ANBIMA CPA-20",        competency: "Fundamentos técnicos", description: "Preparação 40h + simulados.", deadline: new Date(now.getTime() - 22 * 30 * 86400000).toISOString().slice(0,10), status: "concluido", owner: "Leandro" },
            { id: "g-lc-2", ts: m18, title: "Aprovar na ANBIMA CEA",            competency: "Aprofundamento técnico", description: "Preparação 60h.", deadline: new Date(now.getTime() - 17 * 30 * 86400000).toISOString().slice(0,10), status: "concluido", owner: "Leandro" },
            { id: "g-lc-3", ts: m12, title: "Construir carteira de R$ 100MM",   competency: "High ticket relationship", description: "Captação ativa em famílias do pipeline.", deadline: new Date(now.getTime() - 8 * 30 * 86400000).toISOString().slice(0,10), status: "concluido", owner: "Leandro" },
            { id: "g-lc-4", ts: m6,  title: "Aprovar no CFP® Planejar",          competency: "Certificação sênior", description: "Preparação 120h + 6 meses de estudos.", deadline: new Date(now.getTime() - 2 * 30 * 86400000).toISOString().slice(0,10), status: "concluido", owner: "Leandro" },
            { id: "g-lc-5", ts: m3,  title: "Mentoriar 2 trainees ativamente",   competency: "Liderança técnica",      description: "Acompanhar dois trainees do programa.", deadline: new Date(now.getTime() + 60 * 86400000).toISOString().slice(0,10), status: "em_progresso", owner: "Leandro" }
          ]
        },
        diagnosis: {
          ts: m1, author: "Administrador",
          dimensions: { tecnica: 5, cultural: 5, comunicacao: 5, disponibilidade: 4, pretensao_salarial: 4 },
          recommendation: "avancar",
          observations: "Critérios atendidos integralmente. Promover formalmente a Sênior na próxima janela trimestral.",
          score: 92
        },
        interviewerEvals: [
          {
            id: "iev-lc-1", ts: m3, author: "Gestor de T&D", role: "gestor",
            softSkills: { comunicacao: 5, trabalho_equipe: 5, lideranca: 5, resolucao: 4, proatividade: 5, organizacao: 4, empatia: 5, adaptabilidade: 4, inteligencia_emo: 5, pensamento_critico: 5 },
            hardSkills: { analise_financeira: 5, alocacao_portfolio: 5, modelagem_patrim: 4, tributacao: 5, sucessao: 5, excel_financeiro: 5 },
            comment: "Domínio técnico excepcional. Conduz casos sucessórios complexos com autonomia. Pronto pra senioridade."
          },
          {
            id: "iev-lc-2", ts: m1, author: "Administrador", role: "admin",
            softSkills: { comunicacao: 5, trabalho_equipe: 5, lideranca: 4, proatividade: 5, organizacao: 4 },
            hardSkills: { analise_financeira: 5, alocacao_portfolio: 5, sucessao: 5, tributacao: 4 },
            comment: "Liderança técnica madura. Mentoria ativa do time júnior. Apto à promoção."
          }
        ],
        trails: [
          { trailId: "onboarding",        assignedAt: hiredAt, completedModules: ["m1","m2","m3","m4","m5"], completedAt: new Date(now.getTime() - 2.9 * 365 * 86400000).toISOString() },
          // Trilha de carreira FA: 9/9 — TODOS os 3 tiers (Júnior, Pleno, Sênior) completos
          { trailId: "financial_advisor", assignedAt: hiredAt, completedModules: ["f1","f2","f3","f4","f5","f6","f7","f8","f9"], completedAt: m1 },
          // Liderança IBBRA — preparação pra carreira de gestor (em progresso)
          { trailId: "lideranca",         assignedAt: m6,      completedModules: ["l1","l2"], completedAt: null }
        ]
      };
    },

    // ---- helpers
    nextId(prefix = "cand") {
      return prefix + "-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    }
  };

  // ---------- IndexedDB: originais (blobs de PDF/TXT) ----------
  const DB_NAME = "ibbra-rh-db";
  const DB_STORE = "originals";
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB indisponível neste navegador."));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error || new Error("Falha ao abrir IndexedDB"));
    });
  }
  async function idbPut(key, value) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const r = tx.objectStore(DB_STORE).get(key);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbDelete(key) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function idbAll() {
    const db = await openDb();
    return new Promise((res, rej) => {
      const out = [];
      const tx = db.transaction(DB_STORE, "readonly");
      const cur = tx.objectStore(DB_STORE).openCursor();
      cur.onsuccess = e => {
        const c = e.target.result;
        if (c) { out.push({ key: c.key, value: c.value }); c.continue(); }
        else res(out);
      };
      cur.onerror = () => rej(cur.error);
    });
  }
  async function idbClear() {
    const db = await openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  Store.Originals = {
    async save(candidateId, blob, sourceName, sourceKind) {
      // sourceKind: "pdf" | "txt" | "text-generated"
      await idbPut(candidateId, { blob, sourceName: sourceName || "", sourceKind: sourceKind || "pdf", ts: Date.now() });
    },
    async get(candidateId) { return idbGet(candidateId); },
    async remove(candidateId) { return idbDelete(candidateId); },
    async all() { return idbAll(); },
    async clear() { return idbClear(); }
  };

  // Limpa originais junto com os candidatos
  const _origClear = Store.clearCandidates.bind(Store);
  Store.clearCandidates = function () {
    _origClear();
    Store.Originals.clear().catch(e => console.warn("clear originals:", e));
  };
  const _origRemove = Store.removeCandidate.bind(Store);
  Store.removeCandidate = function (id) {
    _origRemove(id);
    Store.Originals.remove(id).catch(e => console.warn("remove original:", e));
  };

  window.Store = Store;
})();
