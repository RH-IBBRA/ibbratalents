// IBBRA Talents — Dossiê do candidato em PDF (jsPDF UMD)
(function () {
  const PALETTE = {
    navy:   [11, 30, 63],
    gold:   [201, 168, 92],
    goldD:  [168, 133, 46],
    cream:  [245, 241, 232],
    ink:    [42, 51, 68],
    ink5:   [92, 102, 120],
    line:   [222, 213, 187],
    ok:     [47, 125, 91],
    warn:   [176, 116, 31],
    danger: [176, 65, 62],
    bg:     [250, 247, 240]
  };

  function rgb(doc, c) { doc.setTextColor(c[0], c[1], c[2]); }
  function fill(doc, c) { doc.setFillColor(c[0], c[1], c[2]); }
  function draw(doc, c) { doc.setDrawColor(c[0], c[1], c[2]); }

  function fmtDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return iso; }
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  }

  function sanitizeFilename(name) {
    return String(name || "candidato")
      .replace(/[\\/:*?"<>|]/g, "")   // caracteres ilegais de FS
      .replace(/\s+/g, " ")           // colapsa múltiplos espaços, mantém um
      .trim()
      .slice(0, 120) || "candidato";
  }

  function vacancyOf(seed, id) { return (seed.vacancies || []).find(v => v.id === id) || { title: "—", level: "—" }; }
  function stageOf(seed, id)   { return (seed.pipeline  || []).find(s => s.id === id) || { name: "—" }; }
  function expertiseName(seed, id) { return (seed.expertises || []).find(e => e.id === id)?.name || id; }
  function certName(seed, id)      { return (seed.certifications || []).find(c => c.id === id)?.name || id; }
  function seniorityLabel(s) {
    return ({ estagiario: "Estagiário/Trainee", junior: "Júnior", pleno: "Pleno", senior: "Sênior" })[s] || s || "—";
  }
  function fitTone(score) {
    if (score >= 75) return PALETTE.ok;
    if (score >= 50) return PALETTE.warn;
    return PALETTE.danger;
  }

  // ---------------- Build ----------------
  function buildPdf(candidate, seed) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("jsPDF não carregou. Verifique a conexão.");
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;
    const contentW = W - M * 2;

    const v = vacancyOf(seed, candidate.fitVacancyId);
    const s = stageOf(seed, candidate.stage);
    const fit = Number(candidate.fitScore || 0);

    // ---- HEADER ----
    fill(doc, PALETTE.navy);
    doc.rect(0, 0, W, 100, "F");
    // barra gold inferior
    fill(doc, PALETTE.gold);
    doc.rect(0, 100, W, 4, "F");

    rgb(doc, PALETTE.gold);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("IBBRA TALENTOS · DOSSIÊ DO CANDIDATO", M, 30);

    rgb(doc, PALETTE.cream);
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.text(String(candidate.fullName || "Candidato"), M, 60, { maxWidth: contentW - 130 });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    rgb(doc, [229, 199, 122]);
    doc.text(`${v.title} · ${seniorityLabel(candidate.fitSeniority)} · Estágio: ${s.name}`, M, 82, { maxWidth: contentW - 130 });

    // pill score
    const ft = fitTone(fit);
    fill(doc, ft);
    doc.roundedRect(W - M - 110, 30, 110, 56, 8, 8, "F");
    rgb(doc, [255, 255, 255]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text(`${fit}%`, W - M - 55, 62, { align: "center" });
    doc.setFontSize(8);
    doc.text("ADERÊNCIA", W - M - 55, 78, { align: "center" });

    let y = 130;

    function newPageIfNeeded(need) {
      if (y + need > H - 50) {
        doc.addPage();
        y = 60;
      }
    }

    function sectionTitle(label) {
      newPageIfNeeded(40);
      fill(doc, PALETTE.cream);
      draw(doc, PALETTE.gold);
      doc.setLineWidth(0.4);
      doc.roundedRect(M, y, contentW, 22, 4, 4, "FD");
      rgb(doc, PALETTE.navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(label.toUpperCase(), M + 10, y + 14);
      y += 32;
    }

    function bodyText(text, opts = {}) {
      if (!text) return;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(opts.size || 10);
      rgb(doc, opts.color || PALETTE.ink);
      const lines = doc.splitTextToSize(String(text), contentW - (opts.indent || 0));
      lines.forEach(l => {
        newPageIfNeeded(14);
        doc.text(l, M + (opts.indent || 0), y);
        y += (opts.size || 10) * 1.35;
      });
      y += 4;
    }

    function kvRow(label, value) {
      newPageIfNeeded(18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      rgb(doc, PALETTE.ink5);
      doc.text(label.toUpperCase(), M, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      rgb(doc, PALETTE.ink);
      const txt = String(value || "—");
      const lines = doc.splitTextToSize(txt, contentW - 130);
      doc.text(lines, M + 130, y);
      y += Math.max(16, lines.length * 14);
    }

    function chipsRow(items, color) {
      if (!items || !items.length) {
        bodyText("Nenhum item identificado.", { color: PALETTE.ink5, size: 9 });
        return;
      }
      const padX = 8, padY = 5, gap = 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      let x = M;
      const lineH = 22;
      items.forEach(label => {
        const tw = doc.getTextWidth(label) + padX * 2;
        if (x + tw > M + contentW) { x = M; y += lineH; newPageIfNeeded(lineH); }
        fill(doc, color.bg);
        draw(doc, color.border);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y - lineH + padY + 4, tw, lineH - padY - 2, 10, 10, "FD");
        rgb(doc, color.fg);
        doc.text(label, x + padX, y - 4);
        x += tw + gap;
      });
      y += lineH;
    }

    function bulletList(items, opts = {}) {
      if (!items || !items.length) return;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      rgb(doc, opts.color || PALETTE.ink);
      items.forEach(it => {
        const lines = doc.splitTextToSize("• " + String(it), contentW - 8);
        lines.forEach(l => {
          newPageIfNeeded(14);
          doc.text(l, M + 4, y);
          y += 13;
        });
      });
      y += 4;
    }

    // ---- POSIÇÃO NO FUNIL ----
    sectionTitle("Posição no funil");
    kvRow("Vaga sugerida", v.title);
    kvRow("Senioridade", seniorityLabel(candidate.fitSeniority));
    kvRow("Estágio atual", s.name);
    kvRow("No estágio desde", fmtDateTime(candidate.stageEnteredAt));
    kvRow("Score de aderência", fit + "%");

    // ---- DADOS DE CONTATO ----
    sectionTitle("Dados de contato");
    kvRow("Nome completo", candidate.fullName);
    kvRow("E-mail", candidate.email);
    kvRow("Telefone", candidate.phone);
    kvRow("Cidade / UF", (candidate.city || "") + (candidate.state ? " / " + candidate.state : ""));
    kvRow("LinkedIn", candidate.linkedin || "—");
    kvRow("Experiência", `${candidate.experienceYears || 0} anos e ${candidate.experienceMonths || 0} meses`);

    // ---- EXPERTISES ----
    sectionTitle("Expertises identificadas");
    chipsRow(
      (candidate.expertises || []).map(e => expertiseName(seed, e.id || e)),
      { bg: [240, 232, 211], border: PALETTE.gold, fg: [82, 60, 16] }
    );

    // ---- CERTIFICAÇÕES ----
    sectionTitle("Certificações financeiras");
    chipsRow(
      (candidate.certifications || []).map(c => certName(seed, c.id || c)),
      { bg: [222, 232, 245], border: PALETTE.navy, fg: PALETTE.navy }
    );

    // ---- IDIOMAS ----
    if ((candidate.languages || []).length) {
      sectionTitle("Idiomas");
      bodyText(candidate.languages.join(", "));
    }

    // ---- FORMAÇÃO ----
    if ((candidate.education || []).length) {
      sectionTitle("Formação");
      candidate.education.forEach(ed => {
        const line = [ed.degree, ed.institution, ed.year].filter(Boolean).join(" · ");
        bodyText("• " + line);
      });
    }

    // ---- MATCH ----
    if (candidate.fitJustification) {
      sectionTitle("Justificativa do match");
      bodyText(candidate.fitJustification);
    }
    if ((candidate.highlights || []).length) {
      sectionTitle("Destaques");
      bulletList(candidate.highlights);
    }
    if ((candidate.redFlags || []).length) {
      sectionTitle("Pontos de atenção");
      bulletList(candidate.redFlags, { color: PALETTE.warn });
    }

    // ---- ANOTAÇÕES ----
    if (candidate.notes && candidate.notes.trim()) {
      sectionTitle("Anotações do RH");
      bodyText(candidate.notes);
    }

    // ---- DIAGNÓSTICO ----
    if (candidate.diagnosis) {
      const d = candidate.diagnosis;
      sectionTitle("Diagnóstico de perfil");
      kvRow("Emitido em", fmtDateTime(d.ts));
      kvRow("Autor", d.author || "—");
      kvRow("Score de diagnóstico", (d.score || 0) + "%");
      kvRow("Recomendação", ({ avancar: "Avançar", considerar: "Considerar", reprovar: "Reprovar" })[d.recommendation] || d.recommendation);

      newPageIfNeeded(70);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      rgb(doc, PALETTE.ink5);
      doc.text("DIMENSÕES", M, y);
      y += 14;

      const dimLabels = {
        tecnica:           "Aderência técnica",
        cultural:          "Aderência cultural",
        comunicacao:       "Comunicação",
        disponibilidade:   "Disponibilidade",
        pretensao_salarial: "Pretensão salarial"
      };
      Object.entries(d.dimensions || {}).forEach(([k, v]) => {
        if (!v) return;
        newPageIfNeeded(16);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        rgb(doc, PALETTE.ink);
        doc.text(dimLabels[k] || k, M, y);
        // estrelas
        const stars = "★".repeat(v) + "☆".repeat(Math.max(0, 5 - v));
        rgb(doc, PALETTE.gold);
        doc.text(stars, M + 200, y);
        y += 14;
      });
      y += 6;

      if (d.observations) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        rgb(doc, PALETTE.ink5);
        doc.text("OBSERVAÇÕES", M, y); y += 14;
        bodyText(d.observations);
      }
    }

    // ---- COMENTÁRIOS ----
    if ((candidate.comments || []).length) {
      sectionTitle("Comentários da equipe");
      candidate.comments.forEach(c => {
        newPageIfNeeded(40);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        rgb(doc, PALETTE.navy);
        doc.text(`${c.author || "—"}`, M, y);
        doc.setFont("helvetica", "normal");
        rgb(doc, PALETTE.ink5);
        doc.text(fmtDateTime(c.ts), M + 200, y);
        y += 13;
        bodyText(c.text || "", { size: 10 });
        // separador leve
        draw(doc, PALETTE.line);
        doc.setLineWidth(0.3);
        doc.line(M, y, M + contentW, y);
        y += 8;
      });
    }

    // ---- HISTÓRICO ----
    if ((candidate.stageHistory || []).length) {
      sectionTitle("Histórico no funil");
      candidate.stageHistory.forEach(h => {
        newPageIfNeeded(16);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        rgb(doc, PALETTE.ink);
        const fromName = h.from ? stageOf(seed, h.from).name : "—";
        const toName = stageOf(seed, h.to).name;
        const line = `${fmtDateTime(h.ts)}  ·  ${fromName} → ${toName}  ·  por ${h.by || "sistema"}`;
        doc.text(line, M, y, { maxWidth: contentW });
        y += 14;
      });
    }

    // ---- METADADOS ----
    sectionTitle("Metadados");
    kvRow("Criado em", fmtDateTime(candidate.createdAt));
    kvRow("Atualizado em", fmtDateTime(candidate.updatedAt));
    kvRow("Origem da análise", candidate.source === "claude" ? "Claude IA" : "Heurística offline");
    kvRow("ID interno", candidate.id || "—");

    // ---- FOOTER (em todas as páginas) ----
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      draw(doc, PALETTE.line);
      doc.setLineWidth(0.4);
      doc.line(M, H - 40, W - M, H - 40);
      rgb(doc, PALETTE.ink5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`IBBRA Talents · dossiê gerado em ${fmtDateTime(new Date().toISOString())}`, M, H - 24);
      doc.text(`${p} / ${pageCount}`, W - M, H - 24, { align: "right" });
    }

    return doc;
  }

  function downloadPdf(candidate, seed) {
    const doc = buildPdf(candidate, seed);
    const filename = sanitizeFilename(candidate.fullName) + ".pdf";
    doc.save(filename);
    return filename;
  }

  window.Dossier = { buildPdf, downloadPdf, sanitizeFilename };
})();
