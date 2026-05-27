// IBBRA RH — seed data: vagas, est\u00e1gios do funil, expertises e certifica\u00e7\u00f5es de refer\u00eancia.
// Baseado na metodologia IBBRA Full Family Office (ibbra.com.br) e na r\u00e9gua de carreira de Financial Advisor.

window.IBBRA_RH_SEED = {
  version: 5, // incrementar quando vagas/estágios/expertises do seed mudarem (força refresh no navegador)
  brand: {
    name: "IBBRA Full Family Office",
    product: "Talents \u00b7 Recrutamento, Sele\u00e7\u00e3o, Treinamento & Desenvolvimento",
    tagline: "Selecionamos pessoas para evoluir a rela\u00e7\u00e3o entre brasileiros e seu patrim\u00f4nio.",
    headquarters: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"]
  },

  // Est\u00e1gios do funil (Kanban)
  pipeline: [
    { id: "triagem",       name: "Triagem",            short: "Triagem",   tone: "navy",   desc: "Curr\u00edculo recebido e analisado pela IA." },
    { id: "rh",            name: "Entrevista RH",      short: "RH",        tone: "gold",   desc: "Avalia\u00e7\u00e3o comportamental e fit cultural." },
    { id: "tecnica",       name: "Entrevista T\u00e9cnica", short: "T\u00e9cnica", tone: "navy2",  desc: "Avalia\u00e7\u00e3o t\u00e9cnica e cases pr\u00e1ticos." },
    { id: "proposta",      name: "Proposta",           short: "Proposta",  tone: "amber",  desc: "Proposta enviada e em negocia\u00e7\u00e3o." },
    { id: "contratado",    name: "Contratado",         short: "Hire",      tone: "green",  desc: "Aceitou a proposta e est\u00e1 em onboarding." },
    { id: "reprovado",     name: "Reprovado",          short: "Reprovado", tone: "red",    desc: "N\u00e3o avan\u00e7ou no processo." },
    { id: "declinou",      name: "Declinou",           short: "Declinou",  tone: "amber",  desc: "Candidato recusou a oferta ou desistiu do processo." }
  ],

  // Vagas IBBRA \u2014 r\u00e9gua de carreira de Financial Advisor (slide \"Estimativa de Ganhos\")
  vacancies: [
    {
      id: "fa_trainee1",
      title: "Financial Advisor Trainee 1",
      level: "Trainee 1",
      seniority: "estagiario",
      months: { min: 0, max: 3 },
      clients: 5,
      potentialGross: "R$ 50.000 a R$ 80.000 a.a.",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "Etapa 1 do programa Trainee IBBRA \u2014 primeiros 3 meses: forma\u00e7\u00e3o intensiva em educa\u00e7\u00e3o patrimonial, processos IBBRA, ferramentas e shadow.",
      mustHave: ["Forma\u00e7\u00e3o em andamento ou conclu\u00edda em \u00e1reas correlatas", "Disponibilidade para programa intensivo"],
      niceToHave: ["CPA-10", "Curso de finan\u00e7as pessoais"],
      expertiseTargets: ["educacao_patrimonial", "investimentos"]
    },
    {
      id: "fa_trainee2",
      title: "Financial Advisor Trainee 2",
      level: "Trainee 2",
      seniority: "estagiario",
      months: { min: 3, max: 6 },
      clients: 10,
      potentialGross: "R$ 80.000 a R$ 150.000 a.a.",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "Etapa 2 do programa Trainee \u2014 meses 3 a 6: consolida\u00e7\u00e3o t\u00e9cnica, primeiros atendimentos assistidos e estrutura\u00e7\u00e3o de carteira inicial.",
      mustHave: ["Conclus\u00e3o do Trainee 1 ou equivalente", "ANBIMA b\u00e1sica iniciada"],
      niceToHave: ["CPA-10 conclu\u00eddo", "Experi\u00eancia em vendas consultivas"],
      expertiseTargets: ["educacao_patrimonial", "investimentos", "previdencia"]
    },
    {
      id: "junior",
      title: "Financial Advisor J\u00fanior",
      level: "J\u00fanior",
      seniority: "junior",
      months: { min: 6, max: 12 },
      clients: 30,
      potentialGross: "R$ 350.000 a.a.",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "At\u00e9 12 meses de jornada. J\u00e1 conduz reuni\u00f5es com clientes, executa diagn\u00f3stico patrimonial e plano integrado.",
      mustHave: ["6\u201312 meses em consultoria/relacionamento financeiro", "CPA-10 ou ANBIMA b\u00e1sica"],
      niceToHave: ["CPA-20", "CEA", "Experi\u00eancia em previd\u00eancia ou seguros"],
      expertiseTargets: ["investimentos", "previdencia", "planejamento_financeiro"]
    },
    {
      id: "pleno",
      title: "Financial Advisor",
      level: "Pleno",
      seniority: "pleno",
      months: { min: 12, max: 24 },
      clients: 70,
      potentialGross: "R$ 500.000 a.a.",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "At\u00e9 24 meses. Atua de forma aut\u00f4noma em planejamento 360\u00b0, com cart\u00e9ria pr\u00f3pria e relacionamento high ticket.",
      mustHave: ["1\u20132 anos em wealth/private/consultoria", "Experi\u00eancia com clientes high ticket", "CEA ou CPA-20"],
      niceToHave: ["CFP", "Experi\u00eancia com sucess\u00f3rio e holdings"],
      expertiseTargets: ["wealth_management", "investimentos", "high_ticket", "planejamento_sucessorio"]
    },
    {
      id: "senior",
      title: "Financial Advisor S\u00eanior",
      level: "S\u00eanior",
      seniority: "senior",
      months: { min: 24, max: 240 },
      clients: 100,
      potentialGross: "R$ 500.000+ a.a.",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "+24 meses. L\u00edder de carteira, refer\u00eancia t\u00e9cnica, atua em casos sucess\u00f3rios e fam\u00edlias com patrim\u00f4nio relevante.",
      mustHave: ["2+ anos em wealth/private/family office", "Carteira ativa de high ticket", "CFP ou equivalente"],
      niceToHave: ["CFA", "CGA", "Experi\u00eancia internacional / offshore"],
      expertiseTargets: ["wealth_management", "high_ticket", "planejamento_sucessorio", "planejamento_fiscal"]
    },

    // ---- Vagas de back office, comercial e \u00e1reas-apoio ----
    {
      id: "aux_admin",
      title: "Auxiliar Administrativo",
      level: "Auxiliar",
      seniority: "junior",
      months: { min: 0, max: 36 },
      clients: 0,
      potentialGross: "R$ 2.500 a R$ 4.000 / m\u00eas",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "Apoio operacional: rotinas administrativas, organiza\u00e7\u00e3o documental, agenda, suporte ao time de consultores.",
      mustHave: ["Ensino m\u00e9dio completo", "Pacote Office", "Organiza\u00e7\u00e3o e proatividade"],
      niceToHave: ["Experi\u00eancia com CRM", "Atendimento ao p\u00fablico"],
      expertiseTargets: ["rotinas_administrativas", "atendimento", "pacote_office"]
    },
    {
      id: "aux_financeiro",
      title: "Auxiliar Financeiro / Back Office",
      level: "Auxiliar",
      seniority: "junior",
      months: { min: 6, max: 36 },
      clients: 0,
      potentialGross: "R$ 3.000 a R$ 4.500 / m\u00eas",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "Conferi\u00eancia de contratos, conta-corrente, conciliar relat\u00f3rios, apoio aos consultores em opera\u00e7\u00f5es.",
      mustHave: ["Conhecimento de contas a pagar/receber", "Excel intermedi\u00e1rio"],
      niceToHave: ["Experi\u00eancia banc\u00e1ria", "CPA-10"],
      expertiseTargets: ["contas_pagar_receber", "excel", "operacoes_financeiras"]
    },
    {
      id: "marketing",
      title: "Analista de Marketing",
      level: "Pleno",
      seniority: "pleno",
      months: { min: 12, max: 60 },
      clients: 0,
      potentialGross: "R$ 4.500 a R$ 8.000 / m\u00eas",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "Planeja e executa a\u00e7\u00f5es de marketing: redes sociais, eventos, captura de leads, conte\u00fado.",
      mustHave: ["1+ ano em marketing digital", "Gest\u00e3o de redes sociais", "Performance / Ads"],
      niceToHave: ["HubSpot/RD Station", "Design (Figma/Canva)", "SEO"],
      expertiseTargets: ["marketing_digital", "social_media", "performance_ads", "conteudo"]
    },
    {
      id: "comunicacao",
      title: "Analista de Comunica\u00e7\u00e3o",
      level: "Pleno",
      seniority: "pleno",
      months: { min: 12, max: 60 },
      clients: 0,
      potentialGross: "R$ 4.500 a R$ 7.500 / m\u00eas",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "Comunica\u00e7\u00e3o institucional, releases, gest\u00e3o de marca, relacionamento com m\u00eddia.",
      mustHave: ["Forma\u00e7\u00e3o em Jornalismo/Comunica\u00e7\u00e3o/RP", "Reda\u00e7\u00e3o e ortografia impec\u00e1veis"],
      niceToHave: ["Assessoria de imprensa", "Copywriting"],
      expertiseTargets: ["copywriting", "comunicacao_institucional", "assessoria_imprensa"]
    },
    {
      id: "comercial_inside",
      title: "Comercial / Inside Sales",
      level: "Pleno",
      seniority: "pleno",
      months: { min: 12, max: 60 },
      clients: 0,
      potentialGross: "R$ 4.000 a R$ 8.000 + var.",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "Prospec\u00e7\u00e3o ativa, qualifica\u00e7\u00e3o de leads, agendamento de reuni\u00f5es para os consultores.",
      mustHave: ["1+ ano em vendas/SDR", "CRM"],
      niceToHave: ["Mercado financeiro", "Cold calling estruturado"],
      expertiseTargets: ["vendas_consultivas", "prospeccao", "crm"]
    },
    {
      id: "rh_pessoas",
      title: "Analista de Pessoas / RH",
      level: "Pleno",
      seniority: "pleno",
      months: { min: 12, max: 72 },
      clients: 0,
      potentialGross: "R$ 4.500 a R$ 8.000 / m\u00eas",
      cities: ["Goi\u00e2nia", "Bras\u00edlia", "S\u00e3o Paulo"],
      desc: "Recrutamento e sele\u00e7\u00e3o, DP, cultura, T&D para um time multidisciplinar de 40+ pessoas.",
      mustHave: ["Experi\u00eancia em R&S", "Conhecimento de DP"],
      niceToHave: ["DISC/MBTI", "OKR/PDI", "T&D"],
      expertiseTargets: ["recrutamento_selecao", "dp", "cultura_treinamento"]
    }
  ],

  // Expertises rastre\u00e1veis pelo modelo
  expertises: [
    { id: "wealth_management",       name: "Wealth Management",         group: "core" },
    { id: "high_ticket",              name: "Relacionamento High Ticket", group: "core" },
    { id: "investimentos",            name: "Investimentos / Aloca\u00e7\u00e3o", group: "core" },
    { id: "previdencia",              name: "Previd\u00eancia Privada",       group: "core" },
    { id: "planejamento_sucessorio", name: "Planejamento Sucess\u00f3rio",   group: "core" },
    { id: "planejamento_fiscal",     name: "Planejamento Fiscal",        group: "core" },
    { id: "planejamento_financeiro", name: "Planejamento Financeiro",    group: "core" },
    { id: "seguros",                  name: "Seguros & Gest\u00e3o de Riscos", group: "core" },
    { id: "private_banking",         name: "Private Banking",            group: "complementar" },
    { id: "holdings",                 name: "Holdings / Estruturas Jur\u00eddicas", group: "complementar" },
    { id: "gestao_orcamentaria",     name: "Gest\u00e3o Or\u00e7ament\u00e1ria",        group: "complementar" },
    { id: "educacao_patrimonial",    name: "Educa\u00e7\u00e3o Patrimonial",      group: "complementar" },

    // \u00c1reas administrativas / suporte
    { id: "rotinas_administrativas", name: "Rotinas Administrativas",   group: "administrativo" },
    { id: "atendimento",              name: "Atendimento / Recep\u00e7\u00e3o",    group: "administrativo" },
    { id: "pacote_office",            name: "Pacote Office",             group: "administrativo" },
    { id: "excel",                    name: "Excel Avan\u00e7ado",            group: "administrativo" },
    { id: "contas_pagar_receber",    name: "Contas a Pagar / Receber",  group: "administrativo" },
    { id: "operacoes_financeiras",   name: "Opera\u00e7\u00f5es Financeiras",     group: "administrativo" },

    // Marketing e comunica\u00e7\u00e3o
    { id: "marketing_digital",       name: "Marketing Digital",          group: "marketing" },
    { id: "social_media",             name: "Social Media",               group: "marketing" },
    { id: "performance_ads",         name: "M\u00eddia Paga / Performance",   group: "marketing" },
    { id: "conteudo",                 name: "Produ\u00e7\u00e3o de Conte\u00fado",       group: "marketing" },
    { id: "copywriting",              name: "Copywriting",                group: "marketing" },
    { id: "comunicacao_institucional", name: "Comunica\u00e7\u00e3o Institucional", group: "marketing" },
    { id: "assessoria_imprensa",     name: "Assessoria de Imprensa",     group: "marketing" },

    // TI
    { id: "suporte_ti",               name: "Suporte de TI",              group: "ti" },
    { id: "microsoft_365",            name: "Microsoft 365 / Azure",      group: "ti" },
    { id: "redes",                    name: "Redes e Infraestrutura",     group: "ti" },

    // Comercial
    { id: "vendas_consultivas",      name: "Vendas Consultivas",         group: "comercial" },
    { id: "prospeccao",               name: "Prospec\u00e7\u00e3o / SDR",           group: "comercial" },
    { id: "crm",                      name: "CRM (HubSpot/RD/Pipedrive)", group: "comercial" },

    // RH
    { id: "recrutamento_selecao",    name: "Recrutamento & Sele\u00e7\u00e3o",     group: "rh" },
    { id: "dp",                       name: "Departamento Pessoal",       group: "rh" },
    { id: "cultura_treinamento",     name: "Cultura e T&D",              group: "rh" }
  ],

  // Certifica\u00e7\u00f5es do mercado financeiro brasileiro
  certifications: [
    { id: "cpa10",   name: "CPA-10",  issuer: "ANBIMA",  weight: 1 },
    { id: "cpa20",   name: "CPA-20",  issuer: "ANBIMA",  weight: 2 },
    { id: "cea",     name: "CEA",     issuer: "ANBIMA",  weight: 3 },
    { id: "cfp",     name: "CFP\u00ae",    issuer: "Planejar", weight: 4 },
    { id: "cga",     name: "CGA",     issuer: "ANBIMA",  weight: 4 },
    { id: "cnpi",    name: "CNPI",    issuer: "APIMEC",  weight: 3 },
    { id: "ancord",  name: "ANCORD AAI", issuer: "ANCORD", weight: 2 },
    { id: "cfa",     name: "CFA\u00ae",    issuer: "CFA Institute", weight: 5 },
    { id: "frm",     name: "FRM",     issuer: "GARP",    weight: 4 },
    { id: "susep",   name: "SUSEP / Corretor de Seguros", issuer: "SUSEP", weight: 2 }
  ],

  // Compet\u00eancias universais avaliadas por entrevistadores (Soft Skills)
  softSkills: [
    { id: "comunicacao",       name: "Comunica\u00e7\u00e3o" },
    { id: "trabalho_equipe",   name: "Trabalho em equipe" },
    { id: "lideranca",         name: "Lideran\u00e7a" },
    { id: "resolucao",         name: "Resolu\u00e7\u00e3o de problemas" },
    { id: "adaptabilidade",    name: "Adaptabilidade" },
    { id: "inteligencia_emo",  name: "Intelig\u00eancia emocional" },
    { id: "pensamento_critico", name: "Pensamento cr\u00edtico" },
    { id: "organizacao",       name: "Organiza\u00e7\u00e3o" },
    { id: "proatividade",      name: "Proatividade" },
    { id: "empatia",           name: "Empatia" }
  ],

  // Compet\u00eancias t\u00e9cnicas (Hard Skills) \u2014 agrupadas por \u00e1rea
  hardSkills: [
    // Financeiro / wealth
    { id: "analise_financeira", name: "An\u00e1lise financeira",        area: "financeiro" },
    { id: "alocacao_portfolio", name: "Aloca\u00e7\u00e3o de portf\u00f3lio",     area: "financeiro" },
    { id: "modelagem_patrim",   name: "Modelagem patrimonial",     area: "financeiro" },
    { id: "tributacao",         name: "Tributa\u00e7\u00e3o",                area: "financeiro" },
    { id: "sucessao",           name: "Sucess\u00e3o e holdings",       area: "financeiro" },
    { id: "excel_financeiro",   name: "Excel financeiro",          area: "financeiro" },
    // Marketing
    { id: "google_ads",         name: "Google Ads",                area: "marketing" },
    { id: "meta_ads",           name: "Meta Ads (FB/IG)",          area: "marketing" },
    { id: "seo",                name: "SEO",                       area: "marketing" },
    { id: "analytics",          name: "Analytics & dados",         area: "marketing" },
    { id: "design_visual",      name: "Design (Figma/Canva)",      area: "marketing" },
    { id: "automacao_mkt",      name: "Automa\u00e7\u00e3o (HubSpot/RD)",    area: "marketing" },
    // TI
    { id: "m365_avancado",      name: "Microsoft 365 avan\u00e7ado",    area: "ti" },
    { id: "networking",         name: "Redes e infra",             area: "ti" },
    { id: "powershell",         name: "PowerShell",                area: "ti" },
    { id: "active_directory",   name: "Active Directory / Entra",  area: "ti" },
    { id: "backup_seguranca",   name: "Backup e seguran\u00e7a",        area: "ti" },
    // Administrativo
    { id: "excel_avancado",     name: "Excel avan\u00e7ado",            area: "administrativo" },
    { id: "erp",                name: "ERP (Totvs/SAP/Omie)",      area: "administrativo" },
    { id: "ap_ar",              name: "Contas a pagar/receber",    area: "administrativo" },
    { id: "conciliacao",        name: "Concilia\u00e7\u00e3o banc\u00e1ria",      area: "administrativo" },
    { id: "controladoria",      name: "Controladoria",             area: "administrativo" },
    // Comercial / RH
    { id: "crm_pipeline",       name: "Gest\u00e3o de pipeline (CRM)",  area: "comercial" },
    { id: "cold_outreach",      name: "Cold call / cold mail",     area: "comercial" },
    { id: "negociacao",         name: "Negocia\u00e7\u00e3o",                area: "comercial" },
    { id: "rs_processos",       name: "R&S \u2014 processos",           area: "rh" },
    { id: "dp_processos",       name: "DP \u2014 processos",            area: "rh" }
  ],

  // Trilhas de desenvolvimento (T&D) \u2014 admin pode criar mais via Configura\u00e7\u00f5es
  trails: [
    {
      id: "onboarding",
      title: "Onboarding IBBRA",
      desc: "Boas-vindas, valores, ciclo do patrim\u00f4nio, ferramentas e cultura.",
      target: "qualquer",
      modules: [
        { id: "m1", title: "Boas-vindas e prop\u00f3sito IBBRA",     type: "video",   duration: "20 min" },
        { id: "m2", title: "Ciclo do patrim\u00f4nio em 4 etapas",    type: "video",   duration: "30 min" },
        { id: "m3", title: "Ferramentas internas e M365",         type: "task",    duration: "1h" },
        { id: "m4", title: "Compliance e LGPD",                   type: "reading", duration: "45 min" },
        { id: "m5", title: "Tour pelo escrit\u00f3rio (presencial)",   type: "task",    duration: "2h" }
      ]
    },
    {
      id: "financial_advisor",
      title: "Trilha Financial Advisor",
      desc: "Da fundamenta\u00e7\u00e3o t\u00e9cnica ao atendimento high ticket.",
      target: "financial_advisor",
      modules: [
        { id: "f1", title: "Modelo IBBRA Full Family Office",       type: "video",   duration: "40 min" },
        { id: "f2", title: "Planejamento patrimonial 360\u00b0",          type: "course",  duration: "8h" },
        { id: "f3", title: "ANBIMA CPA-20 \u2014 preparat\u00f3rio",           type: "course",  duration: "40h" },
        { id: "f4", title: "Relacionamento com cliente high ticket", type: "video",   duration: "1h30" },
        { id: "f5", title: "Cases reais \u2014 holdings e sucess\u00e3o",      type: "reading", duration: "3h" },
        { id: "f6", title: "Shadow em consultor s\u00eanior",             type: "task",    duration: "20h" }
      ]
    },
    {
      id: "lideranca",
      title: "Lideran\u00e7a IBBRA",
      desc: "Para cargos de lideran\u00e7a t\u00e9cnica ou de gest\u00e3o.",
      target: "lideranca",
      modules: [
        { id: "l1", title: "Lideran\u00e7a servidora \u2014 fundamentos",     type: "video",   duration: "1h" },
        { id: "l2", title: "Conduzindo 1:1s eficazes",              type: "video",   duration: "45 min" },
        { id: "l3", title: "Feedback de alta qualidade",            type: "reading", duration: "2h" },
        { id: "l4", title: "OKRs e gest\u00e3o por objetivos",           type: "course",  duration: "6h" }
      ]
    },
    {
      id: "atendimento_premium",
      title: "Atendimento de Alta Renda",
      desc: "Para times de relacionamento, recep\u00e7\u00e3o e comercial.",
      target: "atendimento",
      modules: [
        { id: "a1", title: "Perfil do cliente high ticket",          type: "video",   duration: "30 min" },
        { id: "a2", title: "Postura, etiqueta e orat\u00f3ria",           type: "course",  duration: "4h" },
        { id: "a3", title: "Privacidade, discri\u00e7\u00e3o e LGPD",          type: "reading", duration: "1h" }
      ]
    },

    // Trilha de carreira do time de R&S \u2014 com promo\u00e7\u00e3o autom\u00e1tica por tier
    {
      id: "headhunter_bp",
      title: "Carreira: Headhunter \u2192 Talent Acquisition \u2192 Business Partner",
      desc: "Trilha de promo\u00e7\u00e3o autom\u00e1tica em 3 tiers. Ao completar todos os m\u00f3dulos de um tier, o colaborador \u00e9 promovido ao pr\u00f3ximo cargo automaticamente.",
      target: "rh",
      modules: [
        { id: "hbp1", title: "Onboarding & cultura IBBRA",                          type: "course", duration: "8h"  },
        { id: "hbp2", title: "Fundamentos de Recrutamento & Sele\u00e7\u00e3o",                type: "course", duration: "12h" },
        { id: "hbp3", title: "Hunting t\u00e9cnico \u2014 sourcing + abordagem ativa",          type: "course", duration: "10h" },
        { id: "hbp4", title: "Entrevistas t\u00e9cnicas e comportamentais avan\u00e7adas",     type: "course", duration: "8h"  },
        { id: "hbp5", title: "Employer branding & atra\u00e7\u00e3o de talentos",              type: "course", duration: "6h"  },
        { id: "hbp6", title: "Diversidade, equidade e inclus\u00e3o (DEI)",                type: "course", duration: "6h"  },
        { id: "hbp7", title: "Diagn\u00f3stico organizacional & cultura",                   type: "course", duration: "10h" },
        { id: "hbp8", title: "People Analytics estrat\u00e9gico",                           type: "course", duration: "12h" },
        { id: "hbp9", title: "Consultoria C-Level & Business Partnering aplicado",   type: "task",   duration: "30h" }
      ],
      tiers: [
        { id: "hh",  name: "Headhunter",         desc: "Capta\u00e7\u00e3o t\u00e9cnica e estruturada",       modules: ["hbp1","hbp2","hbp3"], tone: "navy"  },
        { id: "ta",  name: "Talent Acquisition", desc: "Estrat\u00e9gia de atra\u00e7\u00e3o e sele\u00e7\u00e3o",        modules: ["hbp4","hbp5","hbp6"], tone: "gold"  },
        { id: "bp",  name: "Business Partner",   desc: "Parceria estrat\u00e9gica com o neg\u00f3cio",     modules: ["hbp7","hbp8","hbp9"], tone: "green" }
      ]
    },

    // Trilhas complementares \u2014 skills que um BP precisa dominar
    {
      id: "people_analytics",
      title: "People Analytics estrat\u00e9gico",
      desc: "Da coleta \u00e0 decis\u00e3o: como usar dados para sustentar a\u00e7\u00f5es de BP.",
      target: "rh",
      modules: [
        { id: "pa1", title: "M\u00e9tricas essenciais de R&S (TTH, fill rate, qualidade)", type: "course",  duration: "4h" },
        { id: "pa2", title: "SQL b\u00e1sico para People Analytics",                         type: "course",  duration: "6h" },
        { id: "pa3", title: "Dashboards em Power BI / Looker",                           type: "course",  duration: "6h" },
        { id: "pa4", title: "OKRs e KPIs de pessoas",                                    type: "video",   duration: "2h" },
        { id: "pa5", title: "Storytelling com dados para C-Level",                       type: "task",    duration: "4h" }
      ]
    },
    {
      id: "coaching_mentoria",
      title: "Coaching & Mentoria",
      desc: "Habilidades 1:1 fundamentais pra BP que desenvolve gestores e times.",
      target: "rh",
      modules: [
        { id: "cm1", title: "Escuta ativa e presen\u00e7a plena",        type: "course",  duration: "3h" },
        { id: "cm2", title: "Perguntas poderosas (modelo GROW)",     type: "course",  duration: "4h" },
        { id: "cm3", title: "Constru\u00e7\u00e3o de PDIs eficazes",           type: "reading", duration: "2h" },
        { id: "cm4", title: "Feedback cont\u00ednuo e radical candor",    type: "course",  duration: "3h" }
      ]
    },
    {
      id: "negociacao_avancada",
      title: "Negocia\u00e7\u00e3o Avan\u00e7ada",
      desc: "Pra conduzir conversas dif\u00edceis: sal\u00e1rio, contraofertas, alinhamento entre gestor e candidato.",
      target: "rh",
      modules: [
        { id: "na1", title: "BATNA, ZOPA e ancoragem",                  type: "course",  duration: "4h" },
        { id: "na2", title: "Comunica\u00e7\u00e3o n\u00e3o-violenta na negocia\u00e7\u00e3o",   type: "course",  duration: "3h" },
        { id: "na3", title: "Negocia\u00e7\u00e3o salarial com C-Level",          type: "video",   duration: "2h" },
        { id: "na4", title: "Conduzindo contraofertas e rescis\u00f5es",      type: "task",    duration: "3h" }
      ]
    },
    {
      id: "dei_avancado",
      title: "DEI \u2014 Diversidade, Equidade e Inclus\u00e3o",
      desc: "Dom\u00ednio operacional e estrat\u00e9gico de DEI para BPs.",
      target: "rh",
      modules: [
        { id: "dei1", title: "Vieses inconscientes na sele\u00e7\u00e3o",         type: "course",  duration: "4h" },
        { id: "dei2", title: "Equidade salarial e auditoria",            type: "course",  duration: "6h" },
        { id: "dei3", title: "Constru\u00e7\u00e3o de ERGs (Employee Resource Groups)", type: "reading", duration: "3h" },
        { id: "dei4", title: "M\u00e9tricas de DEI e accountability",         type: "course",  duration: "4h" }
      ]
    }
  ],

  // M\u00e9rito do score (peso de cada componente, soma = 100)
  scoreWeights: {
    experience: 30,
    expertise:  35,
    certification: 20,
    location:   15
  }
};
