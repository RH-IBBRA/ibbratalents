# IBBRA Talents

Plataforma interna de **Recrutamento, Seleção, Treinamento & Desenvolvimento** da IBBRA Full Family Office.

## Visão geral

100% estático (HTML + CSS + JavaScript vanilla, sem build step), com persistência em `localStorage` + `IndexedDB`. Roda em qualquer hospedagem estática (GitHub Pages, Netlify, Cloudflare Pages).

### Recursos

**Recrutamento & Seleção**
- Análise inteligente de currículos via Claude API (Haiku 4.5 / Sonnet 4.6 / Opus 4.7) + fallback heurístico offline
- Upload em lote (PDF/TXT) com extração via PDF.js no navegador
- Importação direta de CSV do Notion com mapeamento automático de fases
- Funil Kanban com 7 estágios (Triagem, Entrevista RH, Técnica, Proposta, Contratado, Reprovado, Declinou)
- Visualização "Por estágio" ou "Por vaga" + filtros (alta aderência, pontos de atenção, com/sem diagnóstico, parados 7+ dias)
- Avaliações por entrevistador (soft skills + hard skills com estrelas)
- Diagnóstico de perfil (5 dimensões + recomendação Avançar/Considerar/Reprovar)
- Comentários da equipe e histórico cronológico no funil
- Geração automática de dossiê PDF estruturado por candidato
- Arquivamento do currículo original renomeado para "Nome Completo.pdf"
- Exportação em ZIP de todos os currículos + dossiês

**Treinamento & Desenvolvimento** (Qulture Rocks-inspired)
- Quando candidato vai pra "Contratado", entra automaticamente no sistema T&D com trilha de Onboarding atribuída, PDI inicial e feedback de boas-vindas
- Trilhas de desenvolvimento configuráveis (módulos por trilha)
- 1:1s (agenda + notas + status)
- PDIs (objetivos com competência, prazo e status)
- Feedback (positivo / construtivo / reconhecimento)
- Visão gerencial cross-colaboradores com edição inline

**Vagas IBBRA**
Financial Advisor (Trainee 1, Trainee 2, Júnior, Pleno, Sênior), Auxiliar Administrativo, Auxiliar Financeiro/Back Office, Analista de Marketing, Analista de Comunicação, Comercial/Inside Sales, Analista de RH.

## Acessos demo

- **RH**: `rh@ibbra.com.br` / `ibbra2026`
- **Admin (gestor)**: `gestor@ibbra.com.br` / `ibbra2026`

A senha de demo está no `assets/js/app.js` — em produção real isso seria substituído por autenticação adequada.

## Configurar a Claude API

1. Logue como gestor → aba **Configurações**
2. Cole sua chave da Claude API (`sk-ant-...`)
3. Escolha o modelo (recomendação: **Haiku 4.5** para volume, **Sonnet 4.6** para qualidade superior)
4. Clique em **Testar chave** para validar
5. Salve

Sem chave configurada, o sistema cai em modo heurístico offline (regex).

## Rodar localmente

Qualquer servidor estático funciona. Incluído:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Site sobe em `http://localhost:8771`.

## Estrutura

```
.
├── index.html
├── assets/
│   ├── css/style.css
│   ├── img/             # logos SVG (IBBRA + símbolo)
│   └── js/
│       ├── data.js      # seed: vagas, expertises, certificações, soft/hard skills, trilhas
│       ├── store.js     # persistência (localStorage + IndexedDB para PDFs originais)
│       ├── ai.js        # análise via Claude API + heurística offline
│       ├── dossier.js   # geração de dossiê PDF (jsPDF)
│       └── app.js       # router e views
├── serve.ps1
└── README.md
```

## Licença

Uso interno IBBRA Full Family Office.
