# 💰 Caixa 232 — Site de Transparência Financeira da Formatura

> Dashboard público e didático para a turma **232 La Salle** acompanhar, em tempo quase real, como está a arrecadação da formatura: quanto já entrou, quanto falta para a meta, no que o dinheiro está sendo gasto e os avisos dos organizadores.

Este documento é o **guia de construção** do projeto. Ele explica **o quê** construir, **por quê** cada decisão foi tomada e **como** executar passo a passo. A implementação técnica está abaixo. O conteúdo conceitual continua a partir da Seção 1.

---

## 🚀 Stack final (decidida) — Google Apps Script + clasp

A stack original do README era Vite+React+Vercel lendo CSV publicado. A implementação final pivotou para **Google Apps Script Web App** com **clasp** local: o admin já é Sheets, então o front-end vive no mesmo ecossistema. Sem Vercel, sem CSV publicado.

**O que mudou em relação às seções 4-5 abaixo:**
- ❌ Seção 4 (publicar CSV) não é mais necessária. Apps Script acessa a planilha direto via `SpreadsheetApp.openById`.
- ❌ Seção 5 (Vite+React+Tailwind+Recharts) substituída por: HTML+JS vanilla + Chart.js via CDN.
- ✅ Adição: **`/admin`** dentro do mesmo Web App — área editável protegida por senha, onde organizadores mexem em meta, lançamentos, avisos e categorias **pela própria UI** (não precisa abrir a planilha no celular).
- ✅ **Meta mede SALDO** (saldo / meta), não arrecadação — decisão de produto travada com o Vítor.

### Estrutura de arquivos

```
organizacao-financeira/
├── appsscript.json          ← manifest do Apps Script
├── package.json             ← devDeps: @google/clasp
├── .clasp.json              ← gerado por clasp create (NÃO versionado)
├── .claspignore             ← exclui node_modules, etc do push
├── README.md                ← este arquivo
└── src/                     ← rootDir do clasp
    ├── Code.gs              ← doGet router, endpoints
    ├── Setup.gs             ← cria abas, validações, senha admin
    ├── DataLayer.gs         ← leitura defensiva da planilha
    ├── Calculations.gs      ← funções puras (saldo, %, agrupamento)
    ├── AdminBackend.gs      ← auth + CRUD do /admin
    ├── Index.html           ← shell do dashboard público
    ├── Styles.html          ← tokens verde+azul, componentes
    ├── App.html             ← JS do dashboard (Chart.js, render)
    ├── Admin.html           ← shell do /admin com modal de senha
    └── AdminApp.html        ← JS do /admin (CRUD)
```

### Como rodar localmente (deploy via clasp)

```bash
# 1. Conta Google correta
clasp logout                                      # se estiver logado em outra conta
clasp login                                        # logue com vitormachadoneves8@gmail.com

# 2. Vincular o script à planilha existente
clasp create --type sheets --title "Caixa 232" \
  --parentId 1Tr6_YsT7B_S4KXqx6Pe8IGsuUWTik6iG-jgv3t4oGH4 \
  --rootDir ./src

# 3. Subir o código
clasp push

# 4. Abrir editor pra rodar setup() (cria as 4 abas + senha admin)
clasp open-script
# No editor: selecione a função "setup" e clique em Run.
# Anote a senha admin que aparece em "Logs" (Ctrl+Enter).

# 5. Deploy como Web App público
# No editor: Deploy > New deployment > type "Web app"
#   - Execute as: Me
#   - Who has access: Anyone
# Copie a URL gerada. Acesso admin: <URL>?page=admin
```

### Endpoints do Apps Script

| Função | Caller | Auth | O quê |
|---|---|---|---|
| `doGet(?)` | navegador | público | renderiza Index.html (dashboard) |
| `doGet(?page=admin)` | navegador | público | renderiza Admin.html (com modal de senha) |
| `getDashboardData()` | dashboard via `google.script.run` | público | dados pra refresh |
| `adminLogin(senha)` | /admin | senha | retorna token (válido 30min) |
| `adminGetSnapshot(token)` | /admin | token | dados crus pra editar |
| `adminAdicionar/Editar/Deletar Lancamento/Aviso/Categoria` | /admin | token | CRUD |
| `adminAtualizarConfig(token, chave, valor)` | /admin | token | editar meta, nome_turma, data_formatura |
| `adminTrocarSenha(token, atual, nova)` | /admin | token | rotação de senha |

### Senha admin

Criada automaticamente no `setup()` (10 chars alfanuméricos, salva em `ScriptProperties`). Logada no console na 1ª execução. Trocável pelo /admin depois. Se perder: rode `setup()` de novo no editor — ele mantém a existente; pra forçar nova, apague a propriedade `ADMIN_PASSWORD` em Properties no editor.

---

---

## 📑 Índice

1. [Visão geral e filosofia do projeto](#1-visão-geral-e-filosofia-do-projeto)
2. [Arquitetura: por que Google Sheets é o "admin"](#2-arquitetura-por-que-google-sheets-é-o-admin)
3. [A planilha: estrutura blindada (o coração do sistema)](#3-a-planilha-estrutura-blindada-o-coração-do-sistema)
4. [Publicando a planilha como fonte de dados](#4-publicando-a-planilha-como-fonte-de-dados)
5. [Stack do front-end](#5-stack-do-front-end)
6. [Identidade visual: verde + azul](#6-identidade-visual-verde--azul)
7. [Anatomia do dashboard (componentes)](#7-anatomia-do-dashboard-componentes)
8. [A lógica de cálculo automático](#8-a-lógica-de-cálculo-automático)
9. [Tratamento de erros (quando a planilha quebra o site)](#9-tratamento-de-erros-quando-a-planilha-quebra-o-site)
10. [Roteiro de execução (checkpoints)](#10-roteiro-de-execução-checkpoints)
11. [Deploy](#11-deploy)
12. [Manual do organizador (não-técnico)](#12-manual-do-organizador-não-técnico)

---

## 1. Visão geral e filosofia do projeto

### O problema
Uma formatura tem um custo (a **meta**). A turma arrecada dinheiro de várias fontes (rifa, festa, caixinha...) e gasta com várias coisas (buffet, decoração, fotógrafo...). A pergunta que todo mundo faz no grupo do WhatsApp é: **"e aí, como tá o dinheiro?"**. Responder isso na mão, toda hora, é desgastante e gera desconfiança.

### A solução
Um site **público, sem login**, que responde essa pergunta de forma visual e honesta — 24h por dia. Um único link que qualquer pessoa da 232 abre e entende em 10 segundos.

### Os 3 princípios não-negociáveis

| Princípio | O que significa na prática |
|---|---|
| **Transparência, não comunicação** | O site **não** tem chat, comentários ou DM. Para conversar existe o WhatsApp. O site só *mostra* números e avisos. |
| **Zero dor de cabeça matemática** | O organizador **nunca** calcula nada. Ele só registra fatos ("entrou R$ 240 da rifa", "gastei R$ 800 com buffet"). Todo cálculo (meta, %, saldo) é feito pelo site. |
| **Uma única fonte da verdade** | Existe **um** lugar onde o dinheiro "mora": a planilha. O site é só um espelho bonito dela. Nunca há dois números brigando. |

> **Conceito de engenharia — "Single Source of Truth" (Fonte Única da Verdade):** num sistema de dados, o maior risco é existirem duas cópias do mesmo número que discordam entre si (a planilha diz R$ 5.000, o site diz R$ 4.800 — qual é o certo?). Eliminamos esse risco fazendo o site **derivar** 100% do que vê da planilha, sem nunca guardar número próprio. Se a planilha está certa, o site está certo. Sempre.

---

## 2. Arquitetura: por que Google Sheets é o "admin"

A decisão central deste projeto: **não existe um painel `/admin` codado. O painel administrativo É uma planilha do Google Sheets.**

### O fluxo de dados, ilustrado

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│   ORGANIZADORES (Vítor, Maria, +2)                            │
│   editam a planilha pelo app do Google Sheets                 │
│            │                                                   │
│            ▼                                                   │
│   ┌──────────────────────┐                                    │
│   │  📊 GOOGLE SHEETS     │  ← A "fonte da verdade"            │
│   │  (privada, editável   │     Protegida por permissão        │
│   │   só p/ organizadores)│     do Google = a "senha"          │
│   └──────────┬───────────┘                                    │
│              │ publicada como CSV (link público de LEITURA)    │
│              ▼                                                  │
│   ┌──────────────────────┐                                    │
│   │  🌐 SITE (front-end)  │  ← Lê o CSV, calcula tudo,         │
│   │  público, sem login   │     desenha o dashboard            │
│   └──────────┬───────────┘                                    │
│              │                                                  │
│              ▼                                                  │
│   👥 TURMA 232 INTEIRA (só visualiza)                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Por que isso é melhor do que codar um admin de verdade

| Se codássemos um admin... | Com a planilha como admin... |
|---|---|
| Eu teria que construir login, banco de dados, formulários, validação | Tudo isso já existe e é mantido pelo Google, de graça |
| Organizadores aprenderiam uma interface nova | Eles já sabem usar planilha |
| Histórico/auditoria = mais código | Sheets tem **Histórico de Versões** nativo: dá pra ver quem mudou o quê e quando |
| Um bug meu poderia corromper os dados | A lógica do site é **só leitura** — impossível ele estragar a planilha |

> **A "senha única" que você pediu = a permissão de edição da planilha.** Quem tiver o link de edição (ou for adicionado como editor) pode lançar dados. Quem não tiver, não pode. Isso já é autenticação real do Google — mais segura do que qualquer senha que eu escrevesse no código (que ficaria visível pra quem inspecionasse o site).

### O preço dessa escolha (seja honesto com a turma)
- **Delay de atualização:** o Google leva de segundos a ~5 minutos para atualizar o CSV publicado. O site **não** é instantâneo. Isso é aceitável para transparência (ninguém precisa ver o centavo ao vivo).
- **Fragilidade estrutural:** se um organizador bagunçar as colunas da planilha, o site quebra. Por isso a Seção 3 trata a estrutura como **sagrada e blindada**.

---

## 3. A planilha: estrutura blindada (o coração do sistema)

A planilha terá **3 abas**. As colunas têm nomes e ordens **fixas** — o código vai depender delas. Trate isto como um contrato.

### Aba 1 — `Lancamentos`
Cada linha é **um fato financeiro**: dinheiro que entrou ou saiu.

| Coluna A: `Data` | Coluna B: `Tipo` | Coluna C: `Categoria` | Coluna D: `Descricao` | Coluna E: `Valor` |
|---|---|---|---|---|
| 2026-03-01 | Entrada | Rifa | Rifa do PS5 | 240.00 |
| 2026-03-05 | Saida | Buffet | Sinal do buffet | 800.00 |
| 2026-03-10 | Entrada | Festa | Festa de março | 1500.00 |

**Regras de blindagem (escreva isto na linha 1 fixada da planilha, como cabeçalho):**
- `Tipo` aceita **somente** dois valores: `Entrada` ou `Saida`. → Configure **Validação de Dados** (Dados → Validação) com lista suspensa.
- `Valor` é **sempre positivo**, em reais, ponto como separador decimal (`240.00`). O sinal (+/−) é decidido pela coluna `Tipo`, **nunca** pelo valor. → Isso evita o erro clássico de "esqueci de pôr o menos".
- `Data` no formato `AAAA-MM-DD` (ano-mês-dia). → Padrão ISO, ordena e parseia sem ambiguidade.
- `Categoria` também via lista suspensa (Validação de Dados), para não virar bagunça ("Buffet", "buffet", "Bufê"...).

> **Por que separar `Tipo` do `Valor` (e não usar valores negativos)?** Porque pessoas erram sinais o tempo todo. Se o organizador só digita o valor "puro" e escolhe Entrada/Saida numa listinha, o erro de sinal **deixa de existir**. O site faz a conta: `Entrada` soma, `Saida` subtrai. Tiramos a matemática da cabeça do humano — exatamente o princípio nº 2.

### Aba 2 — `Config`
Os parâmetros do projeto. Uma linha por parâmetro.

| Coluna A: `Chave` | Coluna B: `Valor` |
|---|---|
| meta | 30000.00 |
| nome_turma | 232 La Salle |
| data_formatura | 2026-12-15 |

> **Por que uma aba só pra isso?** Para a **meta** e o nome não ficarem "chumbados" (hardcoded) no código. Se a meta mudar de R$ 30.000 para R$ 32.000, o organizador edita uma célula — não me chama pra mexer no código. Isso se chama **separar configuração de implementação**, e é um princípio que vai te servir em todo projeto da vida.

### Aba 3 — `Avisos`
Os recados de planejamento dos organizadores.

| Coluna A: `Data` | Coluna B: `Titulo` | Coluna C: `Mensagem` | Coluna D: `Fixado` |
|---|---|---|---|
| 2026-03-08 | Festa dia 15! | Vendas de ingresso até dia 12. | SIM |
| 2026-03-01 | Meta atualizada | Subimos a meta por causa do buffet. | NAO |

- `Fixado` aceita `SIM` ou `NAO` (lista suspensa). Avisos fixados aparecem no topo, destacados.

---

## 4. Publicando a planilha como fonte de dados

O site precisa **ler** a planilha sem precisar de senha (é leitura pública), enquanto a **edição** continua privada. O Google permite isso.

### Passo a passo (para cada uma das 3 abas)

1. Abra a planilha → menu **Arquivo → Compartilhar → Publicar na web**.
2. Em "Publicar conteúdo e configurações", escolha **a aba específica** (ex: `Lancamentos`).
3. Formato: **Valores separados por vírgula (.csv)**.
4. Clique em **Publicar**. Copie o link gerado.
5. Repita para `Config` e `Avisos`.

Você terá 3 URLs, uma por aba. Elas terão a cara:
```
https://docs.google.com/spreadsheets/d/e/SEU_ID/pub?gid=0&single=true&output=csv
```

> **⚠️ Distinção crítica de segurança:** "Publicar na web" expõe apenas uma **cópia somente-leitura** dos dados daquela aba. O link de **edição** da planilha (o que você usa no app pra digitar) é **outro** e continua privado, restrito a quem você compartilhou. Publicar leitura ≠ dar permissão de edição. Confira isso antes de divulgar qualquer link pra turma.

Guarde as 3 URLs — elas vão num arquivo de configuração do site (Seção 5).

---

## 5. Stack do front-end

Conforme o padrão de priorizar front-end com fator-UAU, e mantendo o projeto leve (é um site de leitura, não um app pesado):

| Camada | Escolha | Por quê |
|---|---|---|
| **Framework** | **Vite + React** | Rápido de desenvolver, fácil de fazer deploy estático, sem servidor |
| **Estilo** | **Tailwind CSS** | Controle fino do design verde+azul sem escrever CSS solto |
| **Gráficos** | **Recharts** | Gráficos de pizza/barra prontos e bonitos, integração React nativa |
| **Parsing do CSV** | **PapaParse** | Lê o CSV do Google e transforma em objetos JS de forma robusta |
| **Ícones** | **lucide-react** | Conjunto de ícones limpo e consistente |
| **Hospedagem** | **Vercel** ou **Netlify** | Deploy grátis a partir do GitHub, HTTPS automático |

### Estrutura de pastas sugerida
```
caixa-232/
├── src/
│   ├── config.js              ← as 3 URLs do CSV + cores
│   ├── lib/
│   │   ├── fetchData.js       ← busca e parseia os CSVs
│   │   └── calculations.js    ← TODA a lógica de cálculo (Seção 8)
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── MetaProgress.jsx   ← barra de progresso da meta (estrela do show)
│   │   ├── ResumoCards.jsx    ← cards: arrecadado, gasto, saldo, falta
│   │   ├── GraficoCategorias.jsx
│   │   ├── ListaLancamentos.jsx
│   │   ├── Avisos.jsx
│   │   └── Loading.jsx / ErroFonte.jsx
│   ├── App.jsx
│   └── main.jsx
├── index.html
└── package.json
```

> **Por que separar `calculations.js` num arquivo próprio?** Porque a lógica financeira é o que mais importa estar **correto**. Isolada, ela fica fácil de testar e revisar sem o barulho da interface. Mistura de "conta" com "tela" é uma das principais fontes de bug em apps financeiros. Separação de responsabilidades (*separation of concerns*).

---

## 6. Identidade visual: verde + azul

A psicologia das cores aqui não é decorativa, é **funcional**: verde = dinheiro/entrada/positivo; azul = a escola (La Salle) e a estrutura/confiança. Elas combinam porque são análogas-frias com alto contraste de matiz.

### Paleta

```css
/* AZUL — cor estrutural / La Salle / confiança */
--azul-900: #0B2A4A;   /* fundo escuro, headers */
--azul-700: #14508C;   /* títulos, elementos primários */
--azul-500: #2B7CC9;   /* destaques, links */
--azul-100: #DBEAFE;   /* fundos suaves */

/* VERDE — dinheiro / entradas / metas batidas */
--verde-700: #15803D;   /* valores de entrada, sucesso */
--verde-500: #22C55E;   /* barra de progresso, positivo */
--verde-100: #DCFCE7;   /* fundo de cards de arrecadação */

/* APOIO */
--vermelho-500: #EF4444; /* APENAS para saídas/gastos (contraste semântico) */
--cinza-50:  #F8FAFC;    /* fundo geral da página */
--cinza-900: #0F172A;    /* texto principal */
--branco:    #FFFFFF;    /* cards */
```

### Regras de uso (semântica da cor = informação)
- **Entradas** sempre em **verde**. **Saídas** sempre em **vermelho**. Isso deixa o olho ler o sinal sem ler o número.
- **Meta / progresso** em **verde** preenchendo sobre trilho **azul-claro**.
- **Estrutura** (header, títulos, navegação) em **azul**.
- Use gradientes sutis `azul-700 → verde-700` no header para "amarrar" as duas cores.

> **Princípio de design — cor como canal de dados:** num dashboard financeiro, a cor deve *carregar informação*, não só enfeitar. Verde/vermelho consistentes permitem que a pessoa entenda o quadro periférico antes mesmo de ler. Reservar o vermelho **exclusivamente** para gastos preserva essa força — se vermelho aparecer em outro lugar, ele "mente" pro olho.

### Tom geral
Limpo, espaçado, tipografia forte para os números (eles são os protagonistas). Referência de capricho: dashboards estilo Linear/Stripe. Nada de poluição — é transparência, deve **respirar**.

---

## 7. Anatomia do dashboard (componentes)

A página única (`/`), de cima pra baixo:

```
┌───────────────────────────────────────────────┐
│  HEADER (gradiente azul→verde)                  │
│  💰 Caixa 232 · Formatura La Salle              │
│  "Transparência total. Atualizado via planilha."│
├───────────────────────────────────────────────┤
│  META — A ESTRELA DO SHOW                       │
│  R$ 18.450 ███████████████░░░░░░  de R$ 30.000  │
│  61% da meta · faltam R$ 11.550                 │
├───────────────────────────────────────────────┤
│  4 CARDS DE RESUMO                              │
│  ┌─────────┐┌─────────┐┌─────────┐┌─────────┐  │
│  │Arrecadado││ Gasto   ││ Saldo   ││ Falta   │  │
│  │R$ 20.450 ││R$ 2.000 ││R$ 18.450││R$ 11.550│  │
│  │ (verde)  ││(vermelho)││ (azul)  ││ (azul)  │  │
│  └─────────┘└─────────┘└─────────┘└─────────┘  │
├───────────────────────────────────────────────┤
│  📊 GRÁFICOS                                    │
│  Pizza: entradas por categoria                  │
│  Pizza/barra: gastos por categoria              │
├───────────────────────────────────────────────┤
│  📢 AVISOS DOS ORGANIZADORES                    │
│  (fixados no topo, destacados em azul)          │
├───────────────────────────────────────────────┤
│  🧾 EXTRATO (lista de lançamentos)              │
│  Data · Categoria · Descrição · Valor (+/−)     │
│  filtro: [Tudo] [Entradas] [Saídas]             │
├───────────────────────────────────────────────┤
│  RODAPÉ: "Dados da planilha oficial da turma.   │
│  Última leitura: há 2 min."                      │
└───────────────────────────────────────────────┘
```

Cada componente recebe os dados **já calculados** (Seção 8) e só se preocupa em desenhar.

---

## 8. A lógica de cálculo automático

Todo o "cérebro" mora em `calculations.js`. O organizador **nunca** toca aqui — ele só registra fatos na planilha, e estas funções derivam tudo.

Dadas as linhas de `Lancamentos` (cada uma com `tipo` e `valor`) e a `meta` da aba `Config`:

### Definições matemáticas

Seja $L$ o conjunto de lançamentos. Para cada lançamento $i$, temos o valor $v_i \geq 0$ e um tipo $t_i \in \{\text{Entrada}, \text{Saída}\}$.

**Total arrecadado** (soma das entradas):
$$A = \sum_{i \,:\, t_i = \text{Entrada}} v_i$$

**Total gasto** (soma das saídas):
$$G = \sum_{i \,:\, t_i = \text{Saída}} v_i$$

**Saldo em caixa** (o que há de dinheiro disponível agora):
$$S = A - G$$

**Quanto falta para a meta** $M$ (nunca negativo — se passou da meta, falta zero):
$$F = \max(0,\; M - A)$$

**Percentual da meta atingido** (limitado a 100% na barra visual, mas exibido real se passar):
$$P = \frac{A}{M} \times 100\%$$

> **Decisão de design importante — a meta mede ARRECADAÇÃO ($A$) ou SALDO ($S$)?** Escolhemos **arrecadação** ($A$). Raciocínio: a meta da formatura é "juntar R$ 30.000 no total"; gastos planejados já fazem parte desse orçamento e não devem "derrubar" o progresso da meta a cada pagamento. O **saldo** ($S$) é exibido à parte, como card, para responder "quanto temos em caixa agora". São perguntas diferentes — `$A$` responde *"chegamos lá?"*, `$S$` responde *"quanto temos na mão?"*. **Confirme comigo se você prefere que a barra meça saldo em vez de arrecadação** — é uma troca de uma linha de código, mas muda o significado do dashboard.

### Esqueleto da implementação

```javascript
// calculations.js — o cérebro financeiro. Mantenha puro: entra dado, sai número.

export function calcularResumo(lancamentos, meta) {
  // Soma condicional: separa entradas de saídas pela coluna `tipo`.
  // reduce() percorre a lista uma vez acumulando o total.
  const arrecadado = lancamentos
    .filter((l) => l.tipo === "Entrada")
    .reduce((soma, l) => soma + l.valor, 0);

  const gasto = lancamentos
    .filter((l) => l.tipo === "Saida")
    .reduce((soma, l) => soma + l.valor, 0);

  const saldo = arrecadado - gasto;
  const falta = Math.max(0, meta - arrecadado);
  const percentual = meta > 0 ? (arrecadado / meta) * 100 : 0;

  return { arrecadado, gasto, saldo, falta, percentual, meta };
}

// Agrupa por categoria (para os gráficos de pizza).
// Retorna [{ categoria: "Rifa", total: 240 }, ...]
export function agruparPorCategoria(lancamentos, tipo) {
  const mapa = {};
  for (const l of lancamentos) {
    if (l.tipo !== tipo) continue;
    mapa[l.categoria] = (mapa[l.categoria] || 0) + l.valor;
  }
  return Object.entries(mapa).map(([categoria, total]) => ({ categoria, total }));
}

// Formata número como moeda BR. Use SEMPRE para exibir — nunca mostre número cru.
export function formatarBRL(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
```

> **Por que funções "puras" (sem efeitos colaterais)?** Cada função aqui recebe dados e devolve um resultado, sem mexer em nada externo. Isso as torna **previsíveis** (mesma entrada → mesma saída, sempre) e **testáveis** isoladamente. Em código que lida com dinheiro, previsibilidade não é luxo, é obrigação.
>
> **Atenção ao centavo (armadilha de ponto flutuante):** computadores representam decimais em binário e `0.1 + 0.2` pode dar `0.30000000000000004`. Para somas de reais isso raramente estoura o centavo em valores pequenos, mas se quiser robustez total, trabalhe internamente em **centavos (inteiros)** e divida por 100 só na hora de exibir. Para uma caixinha de turma, o `reduce` simples acima é suficiente — mas saiba que essa armadilha existe.

---

## 9. Tratamento de erros (quando a planilha quebra o site)

A maior fragilidade da arquitetura: o site depende da planilha estar bem-formada. O código **tem que** se defender. Cenários e respostas:

| Cenário | O que o site deve fazer |
|---|---|
| Planilha fora do ar / sem internet | Mostrar tela `ErroFonte`: "Não conseguimos ler os dados agora. Tente recarregar." Nunca tela branca. |
| Uma linha tem `Valor` vazio ou texto | **Ignorar essa linha** no cálculo e seguir. Não derrubar tudo por um dado. |
| `Tipo` escrito errado ("entrada", "Entradas") | Normalizar: comparar em minúsculas e sem acento. Se ainda não bater, ignorar a linha. |
| `meta` ausente na aba Config | Usar fallback e avisar discretamente ("meta não configurada"). |
| Demora pra carregar | Mostrar componente `Loading` (esqueleto animado), nunca a página vazia. |

```javascript
// fetchData.js — leitura defensiva.
export async function carregarDados() {
  try {
    const resposta = await fetch(URL_LANCAMENTOS);
    if (!resposta.ok) throw new Error("Falha ao buscar planilha");
    const csv = await resposta.text();
    const linhas = parseCSV(csv); // PapaParse

    const lancamentos = linhas
      .map(normalizarLinha)        // converte e limpa cada linha
      .filter((l) => l !== null);  // descarta linhas inválidas, sem quebrar

    return { ok: true, lancamentos };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}
```

> **Princípio — "falhe suave" (graceful degradation):** um dado ruim deve degradar **uma linha**, não o site inteiro. Numa ferramenta de transparência, uma tela branca destrói a confiança mais do que um número faltando. Sempre prefira mostrar o que dá certo e sinalizar o que falhou.

---

## 10. Roteiro de execução (checkpoints)

Construa nesta ordem. Cada checkpoint é testável sozinho — não avance sem o anterior funcionando.

- [ ] **CP1 — Planilha:** crie as 3 abas com a estrutura exata da Seção 3, preencha 4-5 linhas de teste, configure as validações de dados (listas suspensas).
- [ ] **CP2 — Publicação:** publique as 3 abas como CSV (Seção 4) e teste cada URL no navegador (deve baixar/mostrar um CSV).
- [ ] **CP3 — Leitura:** monte o projeto Vite+React+Tailwind, faça `fetchData.js` ler e logar no console os dados das 3 abas. **Valide que os dados chegam antes de desenhar qualquer coisa.**
- [ ] **CP4 — Cálculo:** implemente `calculations.js` e logue no console: arrecadado, gasto, saldo, falta, %. Confira na mão com a calculadora se bate.
- [ ] **CP5 — Meta (componente estrela):** construa só o `MetaProgress` com o design verde/azul. É o componente mais importante — capriche.
- [ ] **CP6 — Cards de resumo:** os 4 cards (arrecadado/gasto/saldo/falta).
- [ ] **CP7 — Gráficos:** pizzas de categoria com Recharts.
- [ ] **CP8 — Avisos + Extrato:** lista de avisos (fixados no topo) e extrato com filtro.
- [ ] **CP9 — Estados de erro/loading:** implemente Seção 9.
- [ ] **CP10 — Polimento:** responsividade mobile (a maioria vai abrir no celular!), animações sutis, rodapé com horário da última leitura.
- [ ] **CP11 — Deploy** (Seção 11).

> Construa **mobile-first**: a turma vai abrir isso no celular, no recreio. Se ficar bom no celular, fica bom em tudo.

---

## 11. Deploy

1. Suba o projeto para um repositório no **GitHub**.
2. Conecte o repositório à **Vercel** (ou Netlify) — login com GitHub, "Import Project".
3. As 3 URLs do CSV ficam em `src/config.js` (não são segredo — são leitura pública).
4. Deploy automático: cada `git push` republica o site.
5. Pegue o link gerado (ex: `caixa-232.vercel.app`) e divulgue no WhatsApp da turma.

> **Atualização dos dados não exige novo deploy.** O site lê a planilha *ao vivo* a cada carregamento. Organizador edita planilha → próxima vez que alguém abre o site, já está atualizado. Você só faz deploy quando muda o **código**, não os **dados**.

---

## 12. Manual do organizador (não-técnico)

Cole isto num bloco de notas compartilhado com os organizadores:

> **Como lançar dinheiro que entrou ou saiu:**
> 1. Abra a planilha "Caixa 232" no app do Google Sheets.
> 2. Vá na aba **Lancamentos**.
> 3. Na primeira linha vazia, preencha:
>    - **Data:** ano-mês-dia (ex: 2026-03-15)
>    - **Tipo:** escolha na listinha — `Entrada` (dinheiro que entrou) ou `Saida` (dinheiro que gastamos)
>    - **Categoria:** escolha na listinha (Rifa, Festa, Buffet...)
>    - **Descrição:** uma frase curta ("Sinal do buffet")
>    - **Valor:** só o número positivo (ex: 240.00). **Nunca** ponha sinal de menos — o site sabe que Saída é negativo.
> 4. Pronto. Em alguns minutos o site atualiza sozinho. **Você nunca precisa calcular nada.**
>
> **Para postar um aviso:** aba **Avisos** → preencha Data, Título, Mensagem. Coloque `SIM` em "Fixado" se for importante.
>
> **Regra de ouro:** nunca mude os nomes nem a ordem das colunas. Elas são o que o site lê. Mexeu nisso, quebrou o site.

---

## ⚠️ Pontos que ainda preciso confirmar com você

Antes de codar, três decisões de produto que mudam o resultado:

1. **A barra de meta mede arrecadação ($A$) ou saldo ($S$)?** (Seção 8) — recomendo arrecadação.
2. **Categorias fixas ou livres?** Recomendo fixas (lista suspensa) para não virar bagunça. Quais categorias de entrada e de saída a 232 já tem?
3. **A turma é grande o bastante pra alguém "inspecionar" e achar a planilha?** Mesmo o CSV sendo só-leitura, o conteúdo é público. Tem algum dado que **não** pode aparecer (nome de quem deve, valores individuais)? Se sim, planejamos a planilha pra não expor isso.

---

*Documento vivo — atualize conforme o projeto evoluir. Feito para a turma 232 La Salle. 💙💚*
