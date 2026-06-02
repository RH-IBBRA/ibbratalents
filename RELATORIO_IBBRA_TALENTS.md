# Relatório Executivo — IBBRA Talents

> Documento gerado para consolidação estratégica da DRAP. Análise técnica baseada exclusivamente no código atualmente versionado em `RH-IBBRA/ibbratalents` (commit `a04aec6`, branch `main`).

---

## 1. IDENTIFICAÇÃO

- **Nome do produto:** IBBRA Talents
- **Uma frase que resume o que ele faz:** Plataforma interna de Recrutamento, Seleção, Treinamento & Desenvolvimento que recebe currículos em lote, classifica candidatos com IA, gerencia o funil de R&S e acompanha colaboradores aprovados em trilhas de carreira com promoção automatizada por critérios.
- **Cliente(s) atual(is) ou alvo:** IBBRA Full Family Office (consultoria patrimonial em Goiânia, Brasília e São Paulo) — cliente único atual. Alvo de expansão: consultorias patrimoniais, family offices, escritórios de assessoria de investimentos e PMEs de serviços financeiros (entre 30–300 colaboradores).
- **Status:** **MVP**. Funcional ponta-a-ponta, mas com persistência local (não compartilhada entre usuários) e auth de demonstração.
- **Está em produção hoje? Onde? Quem usa?** Sim, no ar em `https://rh-ibbra.github.io/ibbratalents/` (GitHub Pages, organização `RH-IBBRA`). Uso interno do time de RH IBBRA. Quantos usuários reais batendo no ar diariamente: **incerto** — não há analytics.
- **De quem é a ideia/propriedade?** Propriedade da DRAP. Ideia surgiu de necessidade prática do cliente IBBRA (uso interno do time de RH). Sem contrato de cessão de IP — DRAP detém o código.

## 2. RELAÇÃO COM OUTROS PRODUTOS

- **Compartilha código/banco/infra com outro produto?** Compartilha **identidade visual** com o IBBRA Academy (mesma paleta navy/gold/cream, tipografia Inter + Playfair Display, símbolo IBBRA SVG). O logo é literalmente o mesmo arquivo SVG copiado de `ibbra-academy/assets/img/`. Não compartilha banco (cada projeto tem seu próprio localStorage namespace: `ibbra-rh:*`).
- **É adaptação/derivação de outro produto?** **Parcial.** Reutiliza a estrutura de SPA do IBBRA Academy (HTML estático + view sections + JavaScript vanilla com router por hash, `Store` em `localStorage`, contas demo hardcoded) — esse padrão arquitetural é evidentemente herdado. Mas o domínio (R&S + T&D) é totalmente próprio.
- **% código específico vs herdado:** Estimativa: **~85% específico** deste produto, ~15% padrões/estilos reaproveitados do Academy (topbar, login layout, sistema de toast, alguns componentes CSS base). Os ~5.500 linhas de JS são todas próprias do domínio R&S+T&D.

## 3. O PROBLEMA QUE RESOLVE

- **Dor específica:** O time de RH da IBBRA recebe currículos em fontes desorganizadas (e-mail, WhatsApp, LinkedIn, Notion). A triagem é manual, lenta, e a classificação por vaga depende do julgamento de quem está olhando. Quando o candidato é contratado, o desenvolvimento dele vira mais uma planilha avulsa — não há rastro automatizado de trilhas, 1:1s, feedback e PDI. Promoções viram decisão subjetiva sem critério auditável.
- **Como resolvia antes:** Combinação de Notion (lista de candidatos com fase do funil), planilhas Excel (banco de talentos), PDFs soltos em pastas do Google Drive, conversas no WhatsApp (feedbacks) e memória do gestor (1:1s e desenvolvimento).
- **Por que a nossa solução é melhor:**
  1. **IA classifica automaticamente** cada currículo em 1 das 11 vagas configuradas e atribui senioridade, score 0–100% e tags de expertise/certificação detectadas.
  2. **Funil Kanban editável** + import direto do Notion (CSV) com matching automático de pessoas para o estado atual de cada uma.
  3. **Critérios objetivos de promoção** (trilhas técnicas + 1:1s + feedbacks + PDI + diagnóstico + avaliações 360 com média ≥ 4): quando os 7 critérios são atendidos, o sistema marca o colaborador como "apto" e oferece botão de promoção em 1 clique.
  4. **Trilhas de carreira com tiers** (Headhunter → Talent Acquisition → Business Partner; FA Júnior → Pleno → Sênior) com auto-promoção de cargo conforme módulos são marcados como concluídos.
  5. **Dossiê PDF** automático por candidato (estruturado, com IBBRA Full Family Office) — útil para entregar ao gestor de área quando o RH apresenta finalistas.

## 4. O QUE ESTÁ DE FATO CONSTRUÍDO

Leitura direta do repositório (`6.477 linhas` em 4 arquivos JS + 1 CSS + 1 HTML).

### Núcleo R&S
- **Funil Kanban com 7 estágios** [IMPLEMENTADO] — Triagem, Entrevista RH, Entrevista Técnica, Proposta, Contratado, Reprovado, Declinou (estágio adicionado para mapear desistências do Notion). Drag-and-drop **NÃO** existe — movimentação via dropdown "mover →" em cada card. Editor de estágios em Configurações permite renomear, reordenar e remover.
- **Filtros do funil** [IMPLEMENTADO] — por vaga (11 chips) + quick filters secundários (Alta aderência ≥75, Pontos de atenção, Com/Sem diagnóstico, Parados há 7+ dias).
- **Toggle "Por estágio" vs "Por vaga"** [IMPLEMENTADO] — modo alternativo onde cada coluna vira uma vaga, candidatos ordenados por score decrescente.
- **Card do candidato (Notion-style)** [IMPLEMENTADO] — minimalista: nome, telefone, e-mail, badge do estágio + dropdown de mover. Avatar/score/expertise tags foram intencionalmente removidos a pedido do cliente.
- **Análise de currículo individual** [IMPLEMENTADO] — drop PDF/TXT, extração de texto via PDF.js no browser (com agrupamento por coordenada Y para reconstruir linhas), análise via Claude API ou fallback heurístico, **auto-save** direto no banco, geração automática de dossiê PDF.
- **Análise em lote** [IMPLEMENTADO] — múltiplos arquivos processados em sequência, status por arquivo, seletor de fase de destino, resumo por vaga ao final.
- **Import do Notion** [IMPLEMENTADO] — parser de CSV tolerante (delimitador `,` ou `;`, aspas), normalização de cabeçalhos com aliases, mapeamento de fases Notion → sistema (Prospecção→Triagem, Aprovado→Contratado, Declinou→Declinou etc.), matching automático nome PDF↔CSV (exato e parcial), tabela de revisão editável antes de importar.
- **Detecção robusta de nome** [IMPLEMENTADO] — 3 estratégias (anchor "Experiência", anchor cidade/UF, scan top + blocklist de skill-words) que cobrem CVs do LinkedIn, com cabeçalhos, prefixos (Sr./Dr.), nomes em CAIXA-ALTA. 9 casos de teste documentados passando.
- **Análise via Claude API** [IMPLEMENTADO] — chamada direta do browser para `api.anthropic.com` com header `anthropic-dangerous-direct-browser-access: true`. Modelos suportados: Haiku 4.5, Sonnet 4.6, Opus 4.7. System prompt instrui retorno em JSON estrito com fullName, contatos, expertises (com evidência), certs, fitVacancyId, fitSeniority, fitScore, redFlags, highlights. Fallback heurístico determinístico quando sem chave (regex + keywords).
- **Score de aderência** [IMPLEMENTADO] — peso: experiência 30% + expertise 35% + certificação 20% + localização 15%. Recalculado deterministicamente mesmo no modo IA (média do score do modelo com o score determinístico).
- **Detalhe do candidato com subnav** [IMPLEMENTADO] — 8 seções com âncoras: Dados, Avaliações, Diagnóstico, T&D Trilhas, T&D 1:1s, T&D PDI, T&D Feedback, Histórico.
- **Indicadores** [IMPLEMENTADO] — 4 KPIs + 6 mini-charts em barras SVG (por estágio, vaga, senioridade, top expertises, top certificações, por estado).
- **Planilha consolidada** [IMPLEMENTADO] — tabela com 13 colunas, busca em tempo real, export CSV (BOM UTF-8, separador `;`).
- **Export ZIP "pasta de currículos"** [IMPLEMENTADO] — JSZip empacota currículos originais nomeados como `Nome Completo.pdf` + subpasta `Dossies/` com dossiês estruturados.
- **Dossiê PDF estruturado** [IMPLEMENTADO] — 15+ seções (posição no funil, contato, expertises, certificações, idiomas, formação, justificativa, destaques, pontos de atenção, anotações, diagnóstico com estrelas, comentários, histórico no funil, metadados). Header navy + barra gold + pill de score, footer com data + paginação.
- **Histórico no funil** [IMPLEMENTADO] — timeline cronológica auto-registrada toda vez que um candidato muda de estágio (via `Store.changeStage(id, newStage, by)`).
- **Aging badge** [PARCIAL] — função existe (`agingDays(c)`, `agingClass(days)`), filtro "Parados há 7+ dias" funciona. Mas o badge visual **foi removido do card** quando simplificamos pro estilo Notion. Pode ser reintroduzido em listas.
- **Comentários da equipe** [IMPLEMENTADO] — thread cronológica com autor, role, timestamp, remover individual.
- **Diagnóstico de perfil** [IMPLEMENTADO] — 5 dimensões com estrelas 1–5 (Aderência técnica, cultural, Comunicação, Disponibilidade, Pretensão salarial), recomendação radio (Avançar/Considerar/Reprovar), observações livres, score = média × 20. Validação: mínimo 3 dimensões avaliadas.
- **Avaliações por entrevistador** [IMPLEMENTADO] — formulário com tabs Soft skills (10 universais) e Hard skills (27 técnicas agrupadas por área), estrelas 1–5, comentário geral. Thread visível com todas as avaliações + remover individual.

### Núcleo T&D
- **Aba T&D filtrada por colaboradores aprovados** [IMPLEMENTADO] — apenas candidatos no estágio "Contratado" aparecem.
- **Tab "Colaboradores"** [IMPLEMENTADO] — grid de cards com 5 métricas por pessoa (% onboarding, # trilhas, # 1:1s, # PDIs ativos, # feedbacks).
- **1:1s** [IMPLEMENTADO] — agendamento (datetime-local + pauta), notas auto-save (debounce 500ms), marcar como concluído, remover.
- **PDI** [IMPLEMENTADO] — objetivos com competência alvo, prazo, status (pendente/em progresso/concluído/bloqueado), edição inline.
- **Feedback** [IMPLEMENTADO] — 3 tipos (positivo/construtivo/reconhecimento), mural cronológico.
- **Trilhas com tiers + auto-promoção** [IMPLEMENTADO] — Stepper visual com divisores de tier, badge "🎉 Promovido" quando tier completo, status "em formação" / "bloqueado". Função `getCareerLevel(c)` computa o cargo atual live a partir dos módulos concluídos.
- **9 trilhas seed** [IMPLEMENTADO] — Onboarding IBBRA (5 mod), Carreira FA Júnior→Pleno→Sênior (9 mod, 3 tiers), Carreira HH→TA→BP (9 mod, 3 tiers), Liderança IBBRA (4 mod), Atendimento Premium (3 mod), People Analytics (5 mod), Coaching & Mentoria (4 mod), Negociação Avançada (4 mod), DEI (4 mod).
- **Editor de trilhas (admin)** [IMPLEMENTADO] — CRUD completo: criar trilha (título, desc, target), editar inline, adicionar/remover módulos (título, tipo: video/reading/task/course, duração), remover trilha (limpa assignments).
- **Critérios de promoção (checklist)** [IMPLEMENTADO] — 7 critérios verificados automaticamente: trilha 100%, 1:1s ≥6 concluídas, feedbacks ≥4, PDI ≥2 concluídos, diagnóstico "avançar" com score ≥75, soft skills média ≥4, hard skills média ≥4. Banner verde "🏆 Apto à promoção" quando todos atendidos.
- **Botão "Promover oficialmente"** [IMPLEMENTADO] — quando trilha completa mas `fitVacancyId` ainda não bateu com o tier final: clica → atualiza vaga + dispara feedback automático de reconhecimento.
- **Automação onHire** [IMPLEMENTADO] — quando candidato vai para "Contratado": auto-atribui trilha Onboarding + trilha técnica conforme vaga + envia feedback de boas-vindas + cria PDI inicial de 30 dias.

### Acessos e administração
- **3 roles** [IMPLEMENTADO] — `recrutador`, `gestor`, `admin`. Contas demo hardcoded em `app.js`. **Não é auth real** — qualquer um com a URL e a senha demo entra.
- **Configurações (admin)** [IMPLEMENTADO] — chave Claude API + modelo, teste de chave, editor de funil, restaurar padrão, zona de risco com modal multi-step (digitar "EXCLUIR TUDO" + checkbox + confirm nativo).
- **Routing por hash** [IMPLEMENTADO] — F5 mantém a view; URLs viram shareáveis (ex: `#candidato/ex-leandro`).

### Exemplos seedados (auto-criados na 1ª abertura)
- **Marcelo Furtado** — Headhunter em transição para BP, completou Tier 1, em Tier 2 (Talent Acquisition), com 5 trilhas paralelas.
- **Leandro Carlos** — FA Pleno apto à promoção a Sênior, 100% da trilha técnica, CFP®+CEA+CPA-20, 6 1:1s concluídas, 4 feedbacks, 4 PDIs concluídos, diagnóstico 92% "avançar".

### Não construído (declarado como planejado)
- **Firebase Auth / Firestore** [PLANEJADO] — conversa de planejamento foi iniciada e adiada. Hoje a auth é demo + dados locais por navegador.
- **Banco compartilhado entre usuários** [PLANEJADO] — depende do Firebase acima.
- **Notificações** [PLANEJADO] — nada construído.
- **Mobile app / PWA** [PLANEJADO] — é responsivo mas não é app instalável.
- **Logs de auditoria** [PLANEJADO] — só o `stageHistory` é registrado; outras ações (editar campos, remover, exportar) não.

## 5. STACK TÉCNICA

- **Linguagens e frameworks:** HTML5, CSS3 com variáveis (sem Sass/Tailwind), JavaScript ES2020+ vanilla. **Zero frameworks** (sem React/Vue/Svelte), **zero build step** (sem Webpack/Vite/Rollup). Apenas `<script>` tags no HTML.
- **Banco de dados:** **Nenhum servidor.** Persistência local no navegador:
  - `localStorage` para usuário, config, seed (vagas/expertises/etc.) e lista de candidatos (todo o JSON estruturado).
  - `IndexedDB` (database `ibbra-rh-db`, store `originals`) para blobs de PDFs originais (não cabem em localStorage).
- **Hospedagem / infraestrutura:** **GitHub Pages** (gratuito), repo público `RH-IBBRA/ibbratalents`. SSL automático via GitHub. Branch `main`/root.
- **Integrações externas:**
  - **Anthropic Claude API** (`api.anthropic.com/v1/messages`) — opcional, chamada direta do browser.
  - **CDN Cloudflare** — PDF.js 3.11.174, jsPDF 2.5.1 UMD, JSZip 3.10.1.
  - **Google Fonts** — Inter (sans) + Playfair Display (serif).
- **Dependências críticas (se cair, produto para?):**
  - GitHub Pages **fora** → site inteiro fora.
  - cdnjs.cloudflare.com **fora** → app carrega mas upload de PDF, geração de dossiê e export ZIP quebram (uso de PDF.js, jsPDF, JSZip).
  - Anthropic API **fora ou sem quota** → análise cai para modo heurístico (degrada qualidade mas não quebra).
  - Google Fonts **fora** → app carrega com fallback de fontes do sistema.
  - **Sem backend** — não há dependência de servidor próprio; um lado positivo na disponibilidade, mas implica nas limitações abaixo.

## 6. POTENCIALIDADES

- **O que poderia se tornar com mais investimento:**
  1. **SaaS multi-tenant real** — Firebase Auth + Firestore + Storage (caminho já planejado, ~8h de implementação) destrava: dados compartilhados pela equipe, signup, recuperação de senha, permissões por domínio (`@empresa.com.br`).
  2. **Integrações com origens de candidatos** — LinkedIn Easy Apply, Indeed, Trampos.co, Vagas.com, Carreiras.com.br. Coletar candidatos sem precisar do RH baixar PDF manualmente.
  3. **Marketplace de trilhas** — bibliotecas pré-prontas de trilhas por área (financeiro, marketing, jurídico, saúde). Empresa adquire pacotes e atribui.
  4. **Analytics e benchmarks** — comparar tempo médio por estágio, taxa de aprovação por vaga, distribuição de score. Eventualmente benchmark anônimo entre empresas-clientes.
  5. **Mobile-first PWA** — para gestores aprovarem promoções, comentarem em 1:1s ou darem feedback pelo celular.
  6. **Workflow de aprovação para promoção** — fluxo "RH propõe → Gestor aprova → Diretoria confirma" com notificações.
  7. **Integração com folha** — quando promovido, atualizar sistema de RH (Senior Sistemas, Totvs, Solides, Gupy).
- **SaaS escalável vs serviço sob medida:** Tem perfil claro de **SaaS de nicho** — não está montado para customizações pesadas por cliente, mas o seed (vagas/expertises/certificações/estágios/trilhas) é todo editável via UI por admin. Cada cliente configura o próprio sem mexer em código.
- **Vendável para outros clientes do mesmo segmento?** Sim. Universo brasileiro razoável:
  - ~50–80 family offices estruturados no Brasil.
  - ~300–500 assessorias de investimentos (AAI) com 30+ pessoas.
  - ~200 corretoras pequenas/médias.
  - **Total endereçável estimado: 500–800 empresas no Brasil** que combinam R&S contínuo + T&D estruturado + foco em retenção de talentos.
- **Funcionalidades que destravariam mais valor:**
  1. **Multi-tenant** (compartilhamento real) — sem isso, é uma ferramenta single-user, valor limitado.
  2. **Score de retenção / risco de saída** — usar dados de 1:1, feedback, NPS interno para prever turnover.
  3. **API REST aberta** — clientes integrarem com seus sistemas internos.
  4. **White-label** — trocar logo/cor por cliente (já é parametrizável no seed).

## 7. LIMITAÇÕES E RISCOS

- **O que ainda NÃO funciona bem ou está frágil:**
  - **Dados não são compartilhados** entre usuários nem entre dispositivos. Time de RH abre em 3 computadores = 3 bancos diferentes. Para uso real em equipe, isso é bloqueador (Firebase resolve, mas ainda não está construído).
  - **Auth é demo** — `rh@ibbra.com.br` + senha hardcoded `ibbra2026` em JavaScript visível no browser. Qualquer pessoa com a URL entra.
  - **Chave da Claude API no localStorage** — embora a chave seja por design da Anthropic apenas para uso da própria conta do dono, está exposta a qualquer extensão de browser ou JavaScript injetado. Mitigação possível: proxy server (não construído).
  - **PDFs escaneados (imagem)** não são lidos — PDF.js só extrai texto digital. Aviso é dado ao usuário ("texto extraído muito curto"), mas sem OCR.
  - **Aging badge removido do card** ao simplificar para Notion-style — quem queria visão "tempo no estágio" perdeu visibilidade. Função interna ainda existe.
- **Dívida técnica:**
  - **`app.js` com 3.177 linhas** num arquivo único — funcional, mas atrapalha refatoração e onboarding de outro dev. Não há separação em módulos (sem ES modules / sem split).
  - **Zero testes automatizados** — nem unitários, nem E2E. Validação é feita manualmente via `preview_eval` em sessões de chat. Bugs de regressão são prováveis com qualquer mudança grande.
  - **Sem CI/CD** — deploy é `git push` direto. Sem lint, sem type-check (não usa TypeScript), sem testes pre-merge.
  - **Detecção de nome é heurística** — apesar de 9 casos cobertos, qualquer CV com formato inesperado pode falhar. Mitigado pelo fallback Claude IA quando configurado.
  - **Algumas funções já estão duplicadas** ou parcialmente sobrepostas (renderTd, renderCandidato — ambas têm helpers que repetem lógica).
- **Riscos de segurança e LGPD:**
  - **LGPD: alto** — currículos contêm dados pessoais (nome, e-mail, telefone, endereço, histórico profissional, formação) sem controle de retenção, sem consentimento explícito do candidato, sem exclusão automática após período. **Para uso em produção real com LGPD, é obrigatório**: termo de consentimento, política de retenção, registro de tratamento, possibilidade de exclusão a pedido do titular, criptografia em repouso (hoje os PDFs em IndexedDB não são criptografados).
  - **Chave de API exposta:** mitigação só com backend proxy.
  - **Sem logs de auditoria** além do `stageHistory` — não dá pra responder "quem viu o currículo do João?".
  - **Sem rate limiting** — admin pode acidentalmente disparar batch de 200 currículos = 200 chamadas Claude = conta inflada.
- **O que quebraria se 10 clientes usassem ao mesmo tempo?**
  - **GitHub Pages aguenta** muito mais que 10 clientes — não é o gargalo.
  - **Mas o produto não é multi-tenant** — todos os 10 estariam compartilhando o mesmo "site" e cada um teria o próprio localStorage isolado por máquina. Sem dados centrais, "10 clientes" significa 10 cópias paralelas e isoladas, o que não escala como negócio.
  - **Para 10 clientes pagantes**, precisa Firebase Auth + Firestore antes (~8h de dev).
- **Bus factor:** **1.** Conhecimento técnico do código está concentrado em uma pessoa (sócio-dev DRAP), sem documentação técnica além do README. Sem testes para servir como spec executável. Se essa pessoa parar, qualquer dev novo precisa de 1–2 semanas pra entender e mexer com segurança.

## 8. ESFORÇO E MATURIDADE

- **Tempo de desenvolvimento investido:** Estimativa baseada em ~6 sessões de pair-programming com Claude:
  - **Horas-trabalho cliente (sócio):** ~40–60h de conversas estruturadas, decisões, validações.
  - **Equivalente solo dev (sem IA):** ~3–4 semanas full-time (120–160h).
  - **Codebase:** 6.477 linhas em arquivos versionados (excluindo libs CDN).
- **Quão perto está de ser vendável para um novo cliente sem retrabalho grande?**
  - **Para venda como tool single-user** (ex: consultor RH solo) — está pronto, basta trocar branding via seed em ~1h.
  - **Para venda B2B (equipe de RH)** — falta multi-tenant. **~1 semana de dev** (Firebase Auth + Firestore + Storage + migração do `Store` para async) e estaria vendável.
- **O que falta pra chegar lá:**
  1. Firebase Auth + Firestore (~8h).
  2. White-label adequado: substituir hardcoded "IBBRA" por config (~3h).
  3. Termos de LGPD: consentimento, política de privacidade, exclusão a pedido (~6h dev + redação jurídica).
  4. Testes E2E mínimos do fluxo crítico (upload→análise→funil) (~4h).
  5. Documentação pra onboarding de cliente (PDF do produto + tutorial em vídeo) (~6h).
  6. Pricing page + checkout (Stripe/PagSeguro/AsaaS) se for SaaS direto (~8h).
  - **Total para SaaS minimamente vendável: ~35h de dev + 8h conteúdo = ~1 semana full-time.**

## 9. MODELO DE RECEITA

- **Como gera (ou geraria) dinheiro:**
  - **Hoje:** **R$ 0.** Uso interno IBBRA, sem cobrança.
  - **Futuro:** SaaS B2B mensal por empresa-cliente.
- **Setup único, mensalidade, ou ambos?** Ambos. Setup pra configurar vagas/trilhas iniciais + treinamento da equipe (R$ 1.500–3.000 one-time) + mensalidade por uso.
- **Faixa de preço sugerida:**
  - **Tier Starter** (até 5 usuários RH, até 200 candidatos/mês): **R$ 490/mês**.
  - **Tier Pro** (até 15 usuários, candidatos ilimitados, integrações Notion+CSV): **R$ 1.290/mês**.
  - **Tier Enterprise** (uso ilimitado + white-label + suporte dedicado + integração com folha): **R$ 2.900–4.900/mês** com setup R$ 5.000.
  - **Add-on Claude IA** — repassar custo + margem. Análise por currículo varia de R$ 0,05 (Haiku) a R$ 0,80 (Opus). Empresas que rodam 200 CVs/mês = R$ 10–160 de custo bruto, vendido como pacote de "Análise IA" de R$ 99–399/mês.
- **Cliente pagando hoje?** **[PLANEJADO]** — nenhum cliente externo paga ainda. IBBRA usa internamente (a empresa pode ser considerada um cliente-âncora não-pagante / proof-of-concept).
- **Projeção realista (12 meses pós-MVP B2B):** 5–10 clientes pagando em média **R$ 1.000/mês** = **R$ 60–120k ARR**. Para um produto de nicho com 800 empresas endereçáveis e equipe enxuta, é meta conservadora e atingível.

## 10. RESUMO EXECUTIVO

**IBBRA Talents é uma plataforma web estática de R&S + T&D em estágio MVP, em uso interno na IBBRA Full Family Office, com diferencial competitivo claro: análise automatizada de currículos via Claude IA + funil estilo Notion + trilhas de carreira com promoção automatizada por checklist objetivo de 7 critérios (trilha técnica, 1:1s, feedback, PDI, diagnóstico, soft/hard skills).** O produto está vivo (`rh-ibbra.github.io/ibbratalents`), tecnicamente sólido no fluxo de candidato individual, com 6.477 linhas de código vanilla bem organizadas, mas tem dois bloqueadores conhecidos para virar SaaS pagável: **não é multi-tenant** (cada navegador é um silo de dados) e **auth é demo**. Ambos resolvidos com ~1 semana de Firebase. **Potencial real de R$ 60–120k ARR em 12 meses pós-multi-tenant**, com mercado endereçável de ~500–800 family offices, assessorias de investimentos e corretoras brasileiras que combinam R&S + T&D estruturado — particularmente atrativo para investidor que veja synergy com outros produtos DRAP que atendem o mesmo segmento financeiro.
