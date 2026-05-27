// IBBRA RH \u2014 an\u00e1lise de curr\u00edculo via Claude API (com fallback heur\u00edstico offline)
(function () {

  function buildPrompt(seed) {
    const vagas = seed.vacancies.map(v =>
      `- id: "${v.id}" | ${v.title} | senioridade: ${v.seniority} | tempo: ${v.months.min}\u2013${v.months.max} meses | foco: ${v.expertiseTargets.join(", ")}`
    ).join("\n");
    const expertises = seed.expertises.map(e => `- id: "${e.id}" | ${e.name}`).join("\n");
    const certs = seed.certifications.map(c => `- id: "${c.id}" | ${c.name} (${c.issuer})`).join("\n");

    return `Voc\u00ea \u00e9 analisador de curr\u00edculos do RH da IBBRA Full Family Office (consultoria patrimonial em Goi\u00e2nia, Bras\u00edlia e S\u00e3o Paulo). O RH gere um BANCO DE TALENTOS amplo: as vagas v\u00e3o de consultor financeiro at\u00e9 auxiliar administrativo, marketing, comunica\u00e7\u00e3o, comercial, TI, RH e recep\u00e7\u00e3o. Classifique cada candidato na vaga MAIS aderente ao perfil, mesmo que ele tenha pouca ou nenhuma experi\u00eancia financeira.

Sua tarefa: ler o curr\u00edculo abaixo e devolver APENAS um objeto JSON v\u00e1lido (sem markdown, sem coment\u00e1rios) seguindo EXATAMENTE este schema:

{
  "fullName": string,
  "phone": string,
  "email": string,
  "city": string,
  "state": string,
  "linkedin": string | "",
  "experienceYears": number,
  "experienceMonths": number,
  "summary": string,
  "expertises": [ { "id": string, "evidence": string } ],
  "certifications": [ { "id": string, "evidence": string } ],
  "languages": [ string ],
  "education": [ { "degree": string, "institution": string, "year": string } ],
  "fitVacancyId": string,
  "fitSeniority": "estagiario" | "junior" | "pleno" | "senior",
  "fitScore": number,
  "fitJustification": string,
  "redFlags": [ string ],
  "highlights": [ string ]
}

Regras:
\u2022 fitVacancyId DEVE ser um destes ids exatos:
${vagas}

\u2022 expertises[].id DEVE vir desta lista (apenas ids confirmados pelo curr\u00edculo, com evid\u00eancia textual curta):
${expertises}

\u2022 certifications[].id DEVE vir desta lista (apenas as efetivamente declaradas):
${certs}

\u2022 fitScore: inteiro 0\u2013100 representando ader\u00eancia \u00e0 fitVacancyId considerando: tempo de experi\u00eancia na \u00e1rea da vaga, expertises da vaga (expertiseTargets), certifica\u00e7\u00f5es relevantes e cidade (presencial em GO/DF/SP \u00e9 plus). Score baixo (\u226440) \u00e9 perfeitamente aceit\u00e1vel quando o perfil destoa muito.
\u2022 experienceYears + experienceMonths = experi\u00eancia relevante para a vaga sugerida (financeira para vagas FA; administrativa/marketing/etc para vagas correspondentes). Use 0 se n\u00e3o for poss\u00edvel inferir.
\u2022 Se faltar dado, devolva string vazia para campos texto e arrays vazios para listas. NUNCA invente n\u00fameros, certifica\u00e7\u00f5es ou expertises sem evid\u00eancia textual.
\u2022 Devolva SOMENTE o JSON, nada antes nem depois.`;
  }

  async function analyzeWithAPI({ resume, apiKey, model, seed }) {
    const sys = buildPrompt(seed);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: model || "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: sys,
        messages: [
          { role: "user", content: `Curr\u00edculo a analisar:\n\n<<<\n${resume}\n>>>\n\nResponda APENAS o JSON.` }
        ]
      })
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Claude API ${r.status}: ${txt.slice(0, 240)}`);
    }
    const data = await r.json();
    const text = (data.content || []).map(b => b.text || "").join("").trim();
    const jsonStr = extractJSON(text);
    if (!jsonStr) throw new Error("Resposta sem JSON v\u00e1lido.");
    return JSON.parse(jsonStr);
  }

  function extractJSON(s) {
    // remove cercas markdown se vierem
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    if (s.startsWith("{")) return s;
    const i = s.indexOf("{"); const j = s.lastIndexOf("}");
    return (i !== -1 && j !== -1) ? s.slice(i, j + 1) : null;
  }

  // -------- Detec\u00e7\u00e3o e limpeza de nome --------
  // Palavras que N\u00c3O podem aparecer numa linha que ser\u00e1 considerada nome.
  const NAME_HEADER_BLOCKLIST = /\b(curr[\u00edi]culo|curriculum|vit[ae]e?|resum[e\u00e9]|\bcv\b|dados\s+pessoais|objetivo|sobre\s+mim|perfil|resumo|experi[\u00eae]ncia|forma[\u00e7c][\u00e3a]o|educa[\u00e7c][\u00e3a]o|escolaridade|habilidades|compet[\u00eae]ncias|idiomas|qualifica[\u00e7c][\u00f5o]es|certifica[\u00e7c][\u00f5o]es|contatos?|telefone|e[\-\s]?mail|linkedin|endere[\u00e7c]o|profissional|hist[\u00f3o]rico|atividades|projetos)\b/i;

  // Prefixos comuns antes do nome \u2014 ordem importa (mais espec\u00edfico antes), \b no fim evita comer letras
  // Ordem importa: mais específicos primeiro (sra antes de sr) para evitar consumir "Sra" como "Sr"+"a".
  // Exige whitespace depois do prefixo para não comer letras de nomes que coincidentemente começam com "Dr"/"Sr".
  const NAME_TITLE_STRIP = /^(sra|dra|prof(?:essora?)?|engenheir[oa]|m\.?sc|mba|phd|ph\.d|nome|sr|dr)\.?[:\-]?\s+/i;
  // Sufixos: s\u00f3 separadores cercados por espa\u00e7os (n\u00e3o corta h\u00edfen interno de sobrenome composto)
  const NAME_SUFFIX_STRIP = /(\s+[\-\u2013|\u00b7]\s+.*|\s*\([^)]*\)\s*|\s*[\[\{][^\]\}]*[\]\}]\s*)$/;

  // Word que parece parte de nome (capitalizada OU preposi\u00e7\u00e3o comum em nomes BR/Lat).
  const NAME_WORD_RE = /^([A-Z\u00c0-\u00dd][A-Za-z\u00c0-\u00dd\u00e0-\u00ff'.\-]+|D[aeoEAO]s?|D[oa]|Von|Van|Del|Della|Du|Y)$/;

  function looksLikeNameLine(s) {
    if (!s) return false;
    if (s.includes("@")) return false;          // e-mail
    if (/\d/.test(s)) return false;             // tem d\u00edgito (telefone/CEP/etc)
    if (s.length > 80) return false;            // linha longa demais
    if (NAME_HEADER_BLOCKLIST.test(s)) return false;
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 6) return false;
    // Cada palavra precisa parecer nome
    let nameWords = 0;
    for (const w of words) {
      // Aceita tamb\u00e9m nomes em CAIXA-ALTA (JO\u00c3O PEDRO)
      const isAllCaps = /^[A-Z\u00c0-\u00dd'.\-]+$/.test(w) && w.length > 1;
      if (NAME_WORD_RE.test(w) || isAllCaps) nameWords++;
    }
    // pelo menos 2 palavras precisam ser nominais E todas precisam atender ao padr\u00e3o (preposi\u00e7\u00f5es inclu\u00eddas)
    return nameWords === words.length && nameWords >= 2;
  }

  function detectName(raw) {
    if (!raw) return "";
    // Examina as primeiras ~10 linhas n\u00e3o vazias, pulando cabe\u00e7alhos.
    const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 12);
    for (const line of lines) {
      if (looksLikeNameLine(line)) return cleanName(line);
    }
    // Fallback: tenta primeira linha n\u00e3o-cabe\u00e7alho mesmo se padr\u00e3o for menos estrito
    for (const line of lines) {
      if (!line.includes("@") && !/\d/.test(line) && !NAME_HEADER_BLOCKLIST.test(line) && line.split(/\s+/).length >= 2 && line.length <= 80) {
        return cleanName(line);
      }
    }
    return "";
  }

  function cleanName(s) {
    if (!s) return "";
    let n = String(s).replace(/\s+/g, " ").trim();
    // remove prefixos tipo "Sr.", "Dr.", "Nome:"
    let prev;
    do { prev = n; n = n.replace(NAME_TITLE_STRIP, "").trim(); } while (n !== prev);
    // remove sufixos depois de h\u00edfen/par\u00eanteses (geralmente cargo ou e-mail)
    n = n.replace(NAME_SUFFIX_STRIP, "").trim();
    // se virou tudo mai\u00fasculo, capitaliza
    if (n && n === n.toUpperCase()) {
      n = n.toLowerCase().split(" ").map(w => {
        const lowercaseConnectors = new Set(["de", "da", "do", "das", "dos", "del", "della", "y", "von", "van", "du"]);
        if (lowercaseConnectors.has(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1);
      }).join(" ");
    }
    return n;
  }

  // -------- Fallback heur\u00edstico (sem API) --------
  function heuristic(resume, seed) {
    const txt = " " + resume.replace(/\s+/g, " ").toLowerCase() + " ";
    const raw = resume;

    const emailMatch = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const phoneMatch = raw.match(/(\(?\+?\d{2,3}\)?\s*)?\(?\d{2}\)?\s*9?\s*\d{4}\s*-?\s*\d{4}/);
    const cityMatch = raw.match(/\b([A-Z][\u00c0-\u00daa-z\u00e0-\u00fa]+(?:[ \t][A-Z][\u00c0-\u00daa-z\u00e0-\u00fa]+){0,3})[ \t]*[\/\-,][ \t]*([A-Z]{2})\b/);
    const linkedin = (raw.match(/linkedin\.com\/in\/[\w\-_.]+/i) || [""])[0];
    const nameLine = detectName(raw);

    // experi\u00eancia: capta "X anos" e "Y meses"
    const yMatch = txt.match(/(\d{1,2})\s*(?:anos?|years?)/);
    const mMatch = txt.match(/(\d{1,2})\s*(?:meses?|months?)/);
    const yrs = yMatch ? parseInt(yMatch[1], 10) : 0;
    const mns = mMatch ? parseInt(mMatch[1], 10) : 0;

    const expHits = seed.expertises.filter(e => {
      const kws = expertiseKeywords(e.id);
      return kws.some(k => txt.includes(" " + k + " ") || txt.includes(" " + k));
    }).map(e => ({ id: e.id, evidence: e.name }));

    const certHits = seed.certifications.filter(c => {
      const re = certRegex(c.id);
      return re.test(raw);
    }).map(c => ({ id: c.id, evidence: c.name }));

    // escolhe vaga: prioridade = mais expertises target em comum, desempate por tempo na faixa
    const totalMonths = yrs * 12 + mns;
    const expHitIds = new Set(expHits.map(e => e.id));
    const ranked = seed.vacancies.map(v => {
      const targetHit = (v.expertiseTargets || []).filter(t => expHitIds.has(t)).length;
      const inRange = totalMonths >= v.months.min && totalMonths <= v.months.max ? 1 : 0;
      return { v, score: targetHit * 10 + inRange * 2 + (v.expertiseTargets?.length ? 0 : 0) };
    }).sort((a, b) => b.score - a.score);
    let vacancy = ranked[0]?.v;
    // se ninguém pontuou (zero matches), cai num fallback genérico:
    // candidato com 0+ meses sem matching vai pra Trainee, com 6m+ vai pra junior, etc.
    if (!ranked[0] || ranked[0].score === 0) {
      vacancy = seed.vacancies.find(v => totalMonths >= v.months.min && totalMonths <= v.months.max)
             || seed.vacancies[0];
    }

    const score = computeScore({
      experienceMonths: totalMonths,
      expertises: expHits.map(e => e.id),
      certifications: certHits.map(c => c.id),
      city: cityMatch ? cityMatch[1] : ""
    }, vacancy, seed);

    return {
      fullName: nameLine || "",
      phone: phoneMatch ? phoneMatch[0].trim() : "",
      email: emailMatch ? emailMatch[0] : "",
      city: cityMatch ? cityMatch[1] : "",
      state: cityMatch ? cityMatch[2] : "",
      linkedin: linkedin,
      experienceYears: yrs,
      experienceMonths: mns,
      summary: "",
      expertises: expHits,
      certifications: certHits,
      languages: [],
      education: [],
      fitVacancyId: vacancy.id,
      fitSeniority: vacancy.seniority,
      fitScore: score,
      fitJustification: "An\u00e1lise heur\u00edstica offline (configure a chave de API para an\u00e1lise inteligente).",
      redFlags: [],
      highlights: []
    };
  }

  function expertiseKeywords(id) {
    const map = {
      // Financeiro / wealth
      wealth_management:        ["wealth management", "wealth", "family office", "patrimonial"],
      high_ticket:              ["high ticket", "high-ticket", "alta renda", "private", "private banking", "ultra high"],
      investimentos:            ["investiment", "aloca\u00e7\u00e3o", "asset", "renda fixa", "renda vari\u00e1vel", "fundos"],
      previdencia:              ["previd\u00eancia", "pgbl", "vgbl"],
      planejamento_sucessorio: ["sucess\u00e3o", "sucess\u00f3rio", "holding familiar", "invent\u00e1rio"],
      planejamento_fiscal:     ["planejamento fiscal", "tribut\u00e1ri", "imposto de renda"],
      planejamento_financeiro: ["planejamento financeiro", "financial plan"],
      seguros:                  ["seguro", "vida", "susep", "corretor"],
      private_banking:          ["private banking"],
      holdings:                 ["holding"],
      gestao_orcamentaria:     ["or\u00e7ament"],
      educacao_patrimonial:    ["educa\u00e7\u00e3o financeira", "educa\u00e7\u00e3o patrimonial"],

      // Administrativo / suporte
      rotinas_administrativas: ["rotinas administrativas", "auxiliar administrativo", "administrativo", "secretari"],
      atendimento:              ["atendimento", "recep\u00e7\u00e3o", "recepcionista", "atendente", "customer service"],
      pacote_office:            ["pacote office", "word", "powerpoint", "ms office"],
      excel:                    ["excel avan\u00e7ado", "excel intermedi\u00e1rio", "tabela din\u00e2mica", "vlookup", "procv", "xlookup"],
      contas_pagar_receber:    ["contas a pagar", "contas a receber", "concilia\u00e7\u00e3o", "fluxo de caixa"],
      operacoes_financeiras:   ["back office", "back-office", "opera\u00e7\u00f5es financeiras", "boletas", "liquida\u00e7\u00e3o"],

      // Marketing
      marketing_digital:       ["marketing digital", "growth", "inbound", "outbound", "digital marketing"],
      social_media:             ["social media", "redes sociais", "instagram", "linkedin", "tiktok"],
      performance_ads:         ["google ads", "meta ads", "facebook ads", "performance", "m\u00eddia paga", "tr\u00e1fego pago"],
      conteudo:                 ["produ\u00e7\u00e3o de conte\u00fado", "blog", "newsletter", "youtube", "podcast"],
      copywriting:              ["copywriting", "reda\u00e7\u00e3o publicit\u00e1ria", "copy"],
      comunicacao_institucional: ["comunica\u00e7\u00e3o institucional", "rela\u00e7\u00f5es p\u00fablicas", "endomarketing"],
      assessoria_imprensa:     ["assessoria de imprensa", "release", "media training", "porta-voz"],

      // TI
      suporte_ti:               ["suporte t\u00e9cnico", "help desk", "helpdesk", "service desk", "suporte ti", "n1", "n2"],
      microsoft_365:            ["microsoft 365", "m365", "office 365", "azure ad", "entra", "exchange online"],
      redes:                    ["redes", "tcp/ip", "vpn", "firewall", "switch", "wi-fi", "active directory"],

      // Comercial
      vendas_consultivas:      ["vendas consultivas", "consultivo", "b2b", "sales executive"],
      prospeccao:               ["prospec\u00e7\u00e3o", "sdr", "bdr", "cold call", "cold mail"],
      crm:                      ["hubspot", "rd station", "rdstation", "pipedrive", "salesforce", "crm"],

      // RH
      recrutamento_selecao:    ["recrutamento", "r&s", "sele\u00e7\u00e3o", "head hunt", "headhunt", "talent acquisition", "ta"],
      dp:                       ["departamento pessoal", "folha de pagamento", "esocial", "rescis\u00e3o", "admiss\u00e3o"],
      cultura_treinamento:     ["t&d", "treinamento e desenvolvimento", "cultura organizacional", "okr", "pdi"]
    };
    return map[id] || [];
  }

  function certRegex(id) {
    // [\s\-–]+ é tolerante a espaço, hífen e en-dash entre tokens
    const map = {
      cpa10:  /\bCPA[\s\-–]*10\b/i,
      cpa20:  /\bCPA[\s\-–]*20\b/i,
      cea:    /\bCEA\b/,
      cfp:    /\bCFP\b/,
      cga:    /\bCGA\b/,
      cnpi:   /\bCNPI\b/,
      ancord: /ANCORD|\bAAI\b/i,
      cfa:    /\bCFA\b/,
      frm:    /\bFRM\b/,
      susep:  /\bSUSEP\b|corretor[\s\-–]+de[\s\-–]+seguros/i
    };
    return map[id] || /a^/;
  }

  // -------- Score determin\u00edstico (usado tanto na heur\u00edstica como em refinamento) --------
  function computeScore(profile, vacancy, seed) {
    const w = seed.scoreWeights;

    // 1) experi\u00eancia (proximidade do range da vaga)
    let exp = 0;
    const m = profile.experienceMonths || 0;
    if (m >= vacancy.months.min && m <= vacancy.months.max) exp = 1;
    else if (m > vacancy.months.max) exp = vacancy.id === "senior" ? 1 : 0.7;
    else if (vacancy.months.min === 0) exp = 0.6;
    else exp = Math.max(0, m / vacancy.months.min) * 0.6;

    // 2) expertises core x targets da vaga
    const targets = new Set(vacancy.expertiseTargets);
    const hit = (profile.expertises || []).filter(id => targets.has(id)).length;
    const expScore = targets.size ? Math.min(1, hit / targets.size) : 0;

    // 3) certifica\u00e7\u00f5es (peso por relev\u00e2ncia)
    const cmap = Object.fromEntries(seed.certifications.map(c => [c.id, c.weight]));
    const certSum = (profile.certifications || []).reduce((s, id) => s + (cmap[id] || 0), 0);
    const certScore = Math.min(1, certSum / 6);

    // 4) cidade (presencial GO/DF/SP)
    const presencial = ["goi\u00e2nia", "goiania", "bras\u00edlia", "brasilia", "s\u00e3o paulo", "sao paulo"];
    const city = (profile.city || "").toLowerCase();
    const locScore = presencial.some(c => city.includes(c)) ? 1 : 0.3;

    return Math.round(exp * w.experience + expScore * w.expertise + certScore * w.certification + locScore * w.location);
  }

  // -------- API p\u00fablica --------
  async function analyze({ resume, apiKey, model, seed }) {
    if (!resume || !resume.trim()) throw new Error("Curr\u00edculo vazio.");
    if (!apiKey) {
      // fallback offline
      return { source: "heuristic", data: heuristic(resume, seed) };
    }
    const data = await analyzeWithAPI({ resume, apiKey, model, seed });
    // sanitiza nome retornado pela IA (remove "Sr.", "Dr.", quebras de linha, tudo ap\u00f3s " - cargo")
    data.fullName = cleanName(data.fullName);
    // se a IA n\u00e3o devolveu nome (ou devolveu vazio ap\u00f3s limpeza), tenta extrair via heur\u00edstica
    if (!data.fullName) data.fullName = detectName(resume) || "";
    // recalcular score com a r\u00e9gua determin\u00edstica para garantir consist\u00eancia
    const totalMonths = (data.experienceYears || 0) * 12 + (data.experienceMonths || 0);
    const vacancy = seed.vacancies.find(v => v.id === data.fitVacancyId) || seed.vacancies[0];
    const refined = computeScore({
      experienceMonths: totalMonths,
      expertises: (data.expertises || []).map(e => e.id),
      certifications: (data.certifications || []).map(c => c.id),
      city: data.city
    }, vacancy, seed);
    data.fitScore = Math.round((data.fitScore + refined) / 2);
    return { source: "claude", data };
  }

  window.AI = { analyze, heuristic, computeScore };
})();
