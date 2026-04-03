<p align="center">
  <img src="client/src/assets/logo.png" alt="FairLoot" width="400" />
</p>

<h3 align="center">Sistema de distribuição de loot justo para guilds de World of Warcraft</h3>

<p align="center">
  <img src="https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript" />
  <img src="https://img.shields.io/badge/PostgreSQL-NeonDB-4169E1?logo=postgresql" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker" />
</p>

---

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Funcionalidades](#-funcionalidades)
- [Arquitetura](#-arquitetura)
- [Algoritmo de Prioridade](#-algoritmo-de-prioridade)
- [Tech Stack](#-tech-stack)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação e Setup](#-instalação-e-setup)
- [Configuração](#-configuração)
- [Rodando o Projeto](#-rodando-o-projeto)
- [API Endpoints](#-api-endpoints)
- [Roles e Permissões](#-roles-e-permissões)
- [Integração WowAudit](#-integração-wowaudit)
- [Integração Blizzard API](#-integração-blizzard-api)
- [Banco de Dados](#-banco-de-dados)
- [Frontend](#-frontend)
- [Deploy](#-deploy)

---

## 🎯 Visão Geral

**FairLoot** é um sistema completo de loot council automatizado para guilds de World of Warcraft. Ele integra com a API do [WowAudit](https://wowaudit.com) para importar wishlists dos jogadores e com a [Blizzard API](https://develop.battle.net/) para autenticação via Battle.net e verificação de guild. Utiliza um algoritmo de prioridade com três fatores configuráveis para sugerir distribuições justas de loot.

O sistema resolve o problema clássico de loot council: **como distribuir itens de forma justa, levando em conta o quanto o item é upgrade para cada jogador, quantos itens cada um já recebeu, e quão recentemente receberam loot.**

---

## ✨ Funcionalidades

### Para Admins (Loot Council)
- **Dashboard** — Visão geral da guild com resumo de wishlists, detecção de flags `outdated` do WowAudit
- **Controle de Loot** — Seleção visual de dificuldade → raid → boss → itens com imagens das raids
- **Sugestões inteligentes** — Algoritmo de 3 fatores ranqueia candidatos por prioridade, com penalidade para jogadores novos
- **Distribuição em lote** — Distribui múltiplos itens de uma vez, com detecção automática de transmog e single-upgrade
- **Painel Admin** — Configura pesos do algoritmo (α, β, γ), item level mínimo por dificuldade, gerencia WowAudit key, sincroniza personagens
- **Gestão de membros** — Aprova/rejeita pedidos de entrada, remove membros da guild
- **Desfazer distribuições** — Reverte qualquer distribuição do histórico e restaura scores
- **Recalcular scores** — Recomputa todos os scores a partir do histórico com multiplicadores por dificuldade
- **Toggle New Player** — Marca/desmarca personagens como "jogador novo" para aplicar penalidade de prioridade

### Para Readers (Membros)
- **Dashboard** — Visão geral da guild
- **Histórico de Loot** — Visualiza todo o histórico de distribuições da guild
- **Wishlist** — Consulta as wishlists de todos os jogadores via WowAudit
- **Membros** — Visualiza os membros ativos da guild

### Geral
- **Autenticação dupla** — Login tradicional (email/senha) ou via **Battle.net OAuth2** com seleção de personagem
- **Multi-guild** — Suporte a múltiplas contas Battle.net vinculadas a guilds diferentes, com seleção na hora do login
- **Multi-idioma** — Português (PT) e English (EN), alternável em tempo real
- **Tema claro/escuro** — Persistido no localStorage
- **Autenticação JWT** — Access token + Refresh token com HttpOnly cookie
- **Registro com aprovação** — Novos membros de guilds existentes precisam de aprovação do Admin
- **Verificação de Guild Master** — Na criação de guild, verifica via Blizzard API se o personagem é GM ou Oficial (rank 0-1)
- **Sync automático** — Background service sincroniza personagens do WowAudit a cada 30 minutos
- **Resolução de ícones** — Ícones de itens resolvidos via Wowhead com cache em memória

---

## 🏗 Arquitetura

```
┌─────────────────┐     HTTP/REST      ┌─────────────────────────────────┐
│                 │ ◄──────────────────► │          ASP.NET Core 8        │
│   React SPA     │                     │         (FairLoot API)         │
│   (Vite + TS)   │                     ├─────────────────────────────────┤
│   Port: 5173    │                     │  Controllers                   │
│                 │                     │  ├── AuthController            │
└─────────────────┘                     │  │   (+ Battle.net OAuth)      │
                                        │  ├── BlizzardController        │
                                        │  ├── LootController            │
                                        │  ├── GuildController           │
                                        │  ├── GuildMemberController     │
                                        │  └── BaseApiController         │
                                        ├─────────────────────────────────┤
                                        │  Services                      │
                                        │  ├── TokenService (JWT)        │
                                        │  ├── WowAuditService           │
                                        │  ├── WowAuditSyncService (BG)  │
                                        │  └── BlizzardService           │
                                        │      (OAuth, Realms, GM check) │
                                        ├─────────────────────────────────┤
                                        │  Data                          │
                                        │  └── AppDbContext (EF Core)    │
                                        └──────────┬──────────────────────┘
                                                   │
                                                   ▼
                                        ┌─────────────────────┐
                                        │   PostgreSQL (Neon)  │
                                        └─────────────────────┘
                                                   ▲
                             ┌─────────────────────┤
                             │                     │
                   ┌─────────┴──────┐    ┌─────────┴──────┐
                   │   WowAudit API │    │  Blizzard API  │
                   │  (wishlists,   │    │  (OAuth, icons │
                   │   characters)  │    │   realms, GM)  │
                   └────────────────┘    └────────────────┘
```

---

## 🧮 Algoritmo de Prioridade

O FairLoot calcula a prioridade de cada candidato para cada item usando uma fórmula de três fatores com pesos configuráveis:

```
Priority = α × UpgradeNorm + β × FairnessNorm + γ × LootCountNorm
```

> ⚠️ Personagens marcados como **New Player** recebem uma penalidade de 50% na prioridade final (`Priority *= 0.5`).

### Fatores

| Fator | Peso padrão | Descrição |
|-------|:-----------:|-----------|
| **α (Alpha) — Upgrade** | `0.4` | Quanto o item é upgrade para o jogador (% do WowAudit). Normalizado pelo maior valor entre todos os candidatos. **Maior % = maior prioridade.** |
| **β (Beta) — Score acumulado** | `0.3` | Score acumulado do jogador (soma ponderada por dificuldade dos itens recebidos). Invertido via min-max: **menor score = maior prioridade**, favorecendo quem recebeu menos loot. |
| **γ (Gamma) — Loot recente** | `0.3` | Quantidade de itens recebidos nos últimos 30 dias. Invertido: **menos itens recentes = maior prioridade**, evitando que alguém receba muitos itens seguidos. |

### Valor do award por dificuldade

O score não é simplesmente `1.0` por item — ele varia conforme a dificuldade da raid:

| Dificuldade | Award |
|:-----------:|:-----:|
| Normal | `0.5` |
| Heroic | `1.0` |
| Mythic | `1.5` |

Itens marcados como **transmog** ou **single upgrade** (único candidato com upgrade) recebem award `0` e não somam score.

### Desempate

Quando dois jogadores têm a mesma prioridade:
1. Maior % de upgrade ganha
2. Menor score acumulado ganha
3. Quem recebeu loot há mais tempo ganha

### Transmog e Single Upgrade

- **Transmog** — Quando nenhum candidato tem upgrade (todos com 0%), o item é marcado como transmog e não é atribuído a ninguém.
- **Single Upgrade** — Quando apenas 1 candidato tem upgrade, o item é marcado como single upgrade e é atribuído sem custo de score (award = 0), pois não houve competição.

### Configuração dos pesos

Os pesos α, β e γ são configuráveis por guild no painel Admin. A soma não precisa ser exatamente 1, mas é recomendado:
- `0.5 / 0.25 / 0.25` — prioriza upgrade
- `0.33 / 0.33 / 0.33` — equilibra tudo
- `0.2 / 0.4 / 0.4` — prioriza justiça na distribuição

---

## 🛠 Tech Stack

### Backend
| Tecnologia | Uso |
|------------|-----|
| **ASP.NET Core 8** | Web API REST |
| **Entity Framework Core 8** | ORM com PostgreSQL |
| **Npgsql** | Provider PostgreSQL para EF Core |
| **JWT Bearer** | Autenticação com access + refresh tokens |
| **ASP.NET Identity** | Password hashing (PasswordHasher) |
| **Swagger / Swashbuckle** | Documentação da API (dev) |
| **BackgroundService** | Sync automático de personagens |
| **Docker** | Containerização para deploy |

### Frontend
| Tecnologia | Uso |
|------------|-----|
| **React 18** | UI library |
| **TypeScript 5.5** | Type safety |
| **Vite 5** | Build tool e dev server |
| **React Router DOM 6** | Roteamento SPA |
| **Axios** | HTTP client |
| **SCSS** | Estilos com variáveis e temas |

### Infra
| Tecnologia | Uso |
|------------|-----|
| **PostgreSQL (NeonDB)** | Banco de dados serverless |
| **WowAudit API** | Wishlists e personagens da guild |
| **Blizzard API** | OAuth2, realms, verificação de GM, ícones de itens |

---

## 📁 Estrutura do Projeto

```
FairLoot/
├── FairLoot/                    # Backend ASP.NET Core
│   ├── Controllers/
│   │   ├── AuthController.cs        # Register, Login, Refresh, Logout, Me, CheckGuild, Battle.net OAuth
│   │   ├── BlizzardController.cs    # Realms, Guild lookup, GM verification
│   │   ├── LootController.cs        # Suggest, Distribute, History, Undo, RecalculateScores, Icons
│   │   ├── GuildController.cs       # CRUD guild, sync chars, wishlists, toggle-new
│   │   ├── GuildMemberController.cs # CRUD membros, approve, delete
│   │   └── BaseApiController.cs     # Helpers de autenticação compartilhados
│   ├── Domain/
│   │   ├── Guild.cs                 # Guild entity (nome, server, region, realmSlug, pesos α/β/γ, minIlevel)
│   │   ├── User.cs                  # User entity (email, battleNetId, battleTag, characterName, role)
│   │   ├── Character.cs             # Character entity (nome, classe, score, isNewPlayer)
│   │   ├── LootDrop.cs              # Registro de distribuição (com note, isReverted, revertedAt)
│   │   ├── RefreshToken.cs          # Refresh token entity
│   │   ├── WishlistCache.cs         # Cache de wishlists do WowAudit
│   │   └── UserRoles.cs             # Constantes: Admin, Reader
│   ├── DTOs/
│   │   ├── LootDto.cs               # SuggestItem, SuggestionCandidate, Distribution
│   │   ├── GuildDto.cs              # GuildUpdateDto (com MinIlevel por dificuldade)
│   │   ├── UserDto.cs               # UserDto, CreateMemberRequest, UpdateMemberRequest
│   │   ├── RegisterRequest.cs       # RegisterRequest (com Region, RealmSlug, CharacterName)
│   │   ├── LoginRequest.cs          # LoginRequest (email + senha)
│   │   ├── RefreshRequest.cs        # RefreshRequest
│   │   ├── RevokeRequest.cs         # RevokeRequest
│   │   ├── BnetCharactersRequest.cs # Exchange code por personagens Battle.net
│   │   ├── BnetRegisterRequest.cs   # Registro via sessão Battle.net
│   │   ├── BnetLoginRequest.cs      # Login via Battle.net OAuth
│   │   ├── BnetLoginSelectRequest.cs # Seleção de conta multi-guild
│   │   ├── UpdateGuildRequest.cs    # Atualização de guild
│   │   └── WowAuditDtos.cs         # DTOs do WowAudit (wishlists, encounters, instances)
│   ├── Services/
│   │   ├── WowAuditService.cs       # Integração WowAudit (wishlists, chars, icons)
│   │   ├── WowAuditSyncService.cs   # Background sync a cada 30 min
│   │   ├── BlizzardService.cs       # Integração Blizzard API (OAuth, realms, GM, ícones)
│   │   └── TokenService.cs          # Geração de JWT access + refresh tokens
│   ├── Data/
│   │   └── AppDbContext.cs          # EF Core DbContext
│   ├── Migrations/                  # EF Core migrations
│   ├── Program.cs                   # Startup, DI, middleware, CORS
│   ├── appsettings.json             # Config (connection string, JWT) — NÃO versionado
│   ├── appsettings.Development.json # Config de desenvolvimento
│   ├── appsettings.Template.json    # Template sem credenciais (versionado)
│   └── FairLoot.csproj              # .NET 8 project file
│
├── client/                      # Frontend React
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx             # Landing page (login + register inline)
│   │   │   ├── Login.tsx            # Página de login (redirect p/ Home)
│   │   │   ├── Register.tsx         # Página de registro (redirect p/ Home)
│   │   │   ├── BnetCallback.tsx     # Callback do OAuth Battle.net
│   │   │   ├── Guild.tsx            # Seleção/criação de guild
│   │   │   ├── Control.tsx          # Shell com tabs (role-aware)
│   │   │   ├── Dashboard.tsx        # Dashboard da guild (rota padrão /control)
│   │   │   ├── Loot.tsx             # Controle de loot (step 1: seleção, step 2: sugestões)
│   │   │   ├── Members.tsx          # Grid de membros com approve/remove
│   │   │   ├── Wishlist.tsx         # Visualização de wishlists WowAudit
│   │   │   ├── LootHistory.tsx      # Histórico com undo
│   │   │   └── AdminPanel.tsx       # Configurações e pesos do algoritmo
│   │   ├── context/
│   │   │   └── AppContext.tsx       # Theme, Language, Translations (PT/EN)
│   │   ├── services/
│   │   │   ├── api.ts               # Axios instance com interceptors
│   │   │   ├── auth.ts              # login(), register(), logout()
│   │   │   ├── bossMap.ts           # Mapeamento de bosses por raid/dificuldade
│   │   │   ├── classIcons.ts        # Ícones de classes WoW
│   │   │   ├── demoData.ts          # Dados de demonstração
│   │   │   └── wishlistCache.ts     # Cache local de wishlists
│   │   ├── components/
│   │   │   ├── ProtectedRoute.tsx   # Route guard para rotas autenticadas
│   │   │   └── Spinner.tsx          # Componente de loading spinner
│   │   ├── styles/
│   │   │   ├── _variables.scss      # Cores e constantes
│   │   │   ├── _layout.scss         # Layout, tema claro/escuro, responsivo
│   │   │   ├── _forms.scss          # Estilos de formulário
│   │   │   └── _sidebar.scss        # Sidebar styles
│   │   ├── assets/
│   │   │   ├── logo.png             # Logo FairLoot
│   │   │   ├── mini_logo.png        # Mini logo para sidebar/nav
│   │   │   ├── nav_logo.png         # Logo da barra de navegação
│   │   │   ├── gold_one.png         # Imagem lateral esquerda (tesouro)
│   │   │   ├── gold_two.png         # Imagem lateral direita (tesouro)
│   │   │   ├── voidspire.jpg        # Imagem raid The Voidspire
│   │   │   ├── dreamrift.jpg        # Imagem raid The Dreamrift
│   │   │   └── marchonqueldanas.jpg # Imagem raid March on Quel'Danas
│   │   ├── main.tsx                 # Entry point, rotas
│   │   ├── index.scss               # Global styles
│   │   ├── assets.d.ts              # Type declarations para assets
│   │   └── vite-env.d.ts            # Vite type declarations
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.mjs
│
├── Dockerfile                   # Build multi-stage para deploy Docker
├── .dockerignore                # Arquivos ignorados no build Docker
├── FairLoot.slnx                # Solution file Visual Studio
├── package.json                 # Monorepo scripts (dev concurrently)
├── .gitignore                   # Exclui bin/, obj/, node_modules/, appsettings.json
├── .gitattributes               # Configurações Git
└── README.md
```

---

## 📦 Pré-requisitos

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 18+](https://nodejs.org/) com npm
- [PostgreSQL](https://www.postgresql.org/) (ou uma instância [NeonDB](https://neon.tech/))
- Uma conta no [WowAudit](https://wowaudit.com) com API key da guild
- Credenciais da [Blizzard API](https://develop.battle.net/) (para OAuth, realms, ícones de itens e verificação de GM)
- (Opcional) [Docker](https://www.docker.com/) para deploy containerizado

---

## 🚀 Instalação e Setup

### 1. Clone o repositório

```bash
git clone https://github.com/juliofurtadosilva/FairLoot.git
cd FairLoot
```

### 2. Instale as dependências do frontend

```bash
cd client
npm install
cd ..
```

### 3. Instale as dependências do monorepo (opcional, para `npm run dev`)

```bash
npm install
```

### 4. Restaure os pacotes .NET

```bash
dotnet restore FairLoot/FairLoot.csproj
```

### 5. Configure o banco de dados

Copie o template de configuração e preencha com suas credenciais:

```bash
cp FairLoot/appsettings.Template.json FairLoot/appsettings.json
```

Edite `FairLoot/appsettings.json` com suas credenciais:

> ⚠️ O arquivo `appsettings.json` está no `.gitignore` e **não é versionado**. Apenas o `appsettings.Template.json` (sem credenciais) vai para o repositório.

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=seu-host; Database=fairloot; Username=seu-user; Password=sua-senha; SSL Mode=VerifyFull;"
  },
  "Jwt": {
    "Key": "SUA_CHAVE_SECRETA_COM_PELO_MENOS_64_CARACTERES",
    "Issuer": "FairLoot",
    "Audience": "FairLootUsers"
  },
  "Blizzard": {
    "ClientId": "SEU_CLIENT_ID",
    "ClientSecret": "SEU_CLIENT_SECRET"
  },
  "CORS_ORIGINS": "http://localhost:5173"
}
```

### 6. Aplique as migrations

```bash
cd FairLoot
dotnet ef database update
```

---

## ⚙ Configuração

### Variáveis de ambiente / appsettings.json

| Chave | Obrigatório | Descrição |
|-------|:-----------:|-----------|
| `ConnectionStrings:DefaultConnection` | ✅ | Connection string PostgreSQL |
| `Jwt:Key` | ✅ | Chave secreta para assinar JWTs (mín. 64 chars) |
| `Jwt:Issuer` | ✅ | Issuer do JWT (ex: `FairLoot`) |
| `Jwt:Audience` | ✅ | Audience do JWT (ex: `FairLootUsers`) |
| `Blizzard:ClientId` | ⚠️ | Client ID da Blizzard API (necessário para OAuth Battle.net e ícones) |
| `Blizzard:ClientSecret` | ⚠️ | Client Secret da Blizzard API |
| `CORS_ORIGINS` | ❌ | Origens permitidas para CORS (padrão: `http://localhost:5173`) |

> ⚠️ As credenciais Blizzard são necessárias para login via Battle.net, verificação de Guild Master e resolução de ícones. Sem elas, o sistema funciona apenas com login por email/senha e ícones do Wowhead como fallback.

### WowAudit API Key

A chave do WowAudit é configurada **por guild**, não no appsettings. É inserida:
- No registro (quando cria uma nova guild)
- No painel Admin (para alterar depois)

---

## ▶ Rodando o Projeto

### Modo desenvolvimento (monorepo)

```bash
npm run dev
```

Isso roda simultaneamente:
- **Backend** em `https://localhost:5001` (ou `http://localhost:5000`)
- **Frontend** em `http://localhost:5173`

### Modo separado

**Terminal 1 — Backend:**
```bash
cd FairLoot
dotnet watch
```

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
```

### Swagger

Em modo desenvolvimento, a documentação da API está disponível em:
```
https://localhost:5001/swagger
```

---

## 📡 API Endpoints

### Auth (`/api/auth`)

| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| `POST` | `/register` | ❌ | Registra guild + admin, ou reader em guild existente (email/senha) |
| `POST` | `/login` | ❌ | Login com email/senha → retorna JWT |
| `POST` | `/refresh` | ❌ | Renova access token via refresh token (body ou cookie) |
| `POST` | `/revoke` | ✅ | Revoga um refresh token específico |
| `POST` | `/logout` | ✅ | Revoga todos os refresh tokens do usuário |
| `GET` | `/me` | ✅ | Retorna dados do usuário autenticado |
| `GET` | `/check-guild?name=X&server=Y` | ❌ | Verifica se uma guild já existe |

#### Battle.net OAuth (`/api/auth/bnet`)

| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| `GET` | `/bnet/url` | ❌ | Retorna a URL de autorização Battle.net OAuth |
| `POST` | `/bnet/characters` | ❌ | Troca code OAuth por lista de personagens WoW do usuário |
| `POST` | `/bnet/register` | ❌ | Completa registro usando sessão Battle.net (verifica rank na guild) |
| `POST` | `/bnet/login` | ❌ | Login via Battle.net OAuth (retorna JWT ou seleção de conta) |
| `POST` | `/bnet/login/select` | ❌ | Seleciona qual conta logar (quando usuário tem múltiplas guilds) |

### Blizzard (`/api/blizzard`)

| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| `GET` | `/realms?region=us` | ❌ | Lista realms disponíveis por região |
| `GET` | `/guild?realm=X&name=Y&region=us` | ❌ | Busca informações de uma guild na Blizzard API |
| `GET` | `/guild/verify-gm?realm=X&name=Y&characterName=Z` | ❌ | Verifica se um personagem é Guild Master |

### Loot (`/api/loot`)

| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| `GET` | `/history` | ✅ | Lista todo o histórico de loot da guild |
| `POST` | `/suggest` | ✅ | Calcula sugestões de distribuição para itens |
| `POST` | `/distribute` | ✅ | Confirma a distribuição de itens |
| `POST` | `/undo/{id}` | ✅ Admin | Reverte uma distribuição e restaura scores |
| `POST` | `/recalculate-scores` | ✅ Admin | Recomputa todos os scores dos personagens a partir do histórico |
| `POST` | `/icons` | ❌ | Resolve URLs de ícones de itens (via Wowhead) |

### Guild (`/api/guild`)

| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| `GET` | `/` | ✅ | Retorna dados da guild do usuário |
| `PUT` | `/` | ✅ Admin | Atualiza guild (nome, server, key, pesos, minIlevel) |
| `DELETE` | `/` | ✅ Admin | Deleta a guild |
| `GET` | `/characters` | ✅ | Lista personagens da guild (DB) |
| `POST` | `/characters/{charId}/toggle-new` | ✅ Admin | Alterna flag IsNewPlayer de um personagem |
| `POST` | `/sync-characters` | ✅ | Força sync de personagens do WowAudit |
| `GET` | `/wowaudit/characters` | ✅ | Lista personagens direto do WowAudit |
| `GET` | `/wowaudit/wishlists?force=false` | ✅ | Retorna wishlists (`{ summary, raw }`) com cache DB |
| `GET` | `/members/pending` | ✅ Admin | Lista membros pendentes de aprovação |
| `POST` | `/members/{id}/approve` | ✅ Admin | Aprova um membro pendente |

### Guild Members (`/api/guildmember`)

| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| `GET` | `/` | ✅ | Lista todos os membros da guild |
| `POST` | `/` | ✅ Admin | Adiciona um novo membro |
| `PUT` | `/{id}` | ✅ Admin | Atualiza role/email de um membro |
| `DELETE` | `/{id}` | ✅ Admin | Remove um membro da guild |

---

## 🔐 Roles e Permissões

| Funcionalidade | Admin | Reader |
|----------------|:-----:|:------:|
| Dashboard | ✅ | ✅ |
| Controle de Loot (suggest/distribute) | ✅ | ❌ |
| Histórico de Loot | ✅ | ✅ |
| Desfazer distribuição | ✅ | ❌ |
| Recalcular scores | ✅ | ❌ |
| Toggle jogador novo | ✅ | ❌ |
| Ver membros | ✅ | ✅ |
| Aprovar/remover membros | ✅ | ❌ |
| Wishlist (WowAudit) | ✅ | ✅ |
| Painel Admin (config) | ✅ | ❌ |
| Sincronizar personagens | ✅ | ❌ |

### Fluxo de registro

#### Via Email/Senha
1. **Nova guild** → Usuário vira `Admin`, automaticamente aprovado, recebe JWT. Se `CharacterName` fornecido, verifica Guild Master via Blizzard API.
2. **Guild existente** → Usuário vira `Reader`, `IsApproved = false`, precisa de aprovação

#### Via Battle.net OAuth
1. Usuário conecta com Battle.net → sistema lista personagens WoW
2. Usuário seleciona personagem com guild
3. **Guild nova no FairLoot** → Verifica se é GM ou Oficial (rank 0-1) → cria guild como `Admin`
4. **Guild já existe** → Cria conta como `Reader`, pendente de aprovação
5. **Login multi-guild** → Se o Battle.net ID tem contas em múltiplas guilds, o usuário seleciona qual acessar

---

## 🔗 Integração WowAudit

O FairLoot consome a API do WowAudit para:

1. **Wishlists** — Importa a wishlist de cada jogador com % de upgrade por item, por boss, por dificuldade e por instância
2. **Personagens** — Sincroniza a lista de personagens da guild (nome, realm, classe)
3. **Sync automático** — Um `BackgroundService` roda a cada 30 minutos sincronizando personagens de todas as guilds
4. **Raw JSON** — O endpoint de wishlists retorna também o JSON cru do WowAudit, contendo metadados extras como flags `outdated` por item

### Cache

- Wishlists são cacheadas em memória por 30 minutos para evitar requests excessivos (o serviço de background também pré-aquece este cache)
- Wishlists são persistidas no banco de dados (`WishlistCaches.DataJson`) para disponibilidade em cold starts
- Ícones de itens (Wowhead / Blizzard) são cacheados em memória por item ID quando encontrados
- Ícones não encontrados recebem um "null cache" com TTL de 2 horas antes de uma nova tentativa

---

## 🎮 Integração Blizzard API

Se configurada (`Blizzard:ClientId` e `Blizzard:ClientSecret`), a Blizzard API é usada para:

- **OAuth2** — Login e registro via conta Battle.net
- **Realms** — Listagem de realms disponíveis por região (us, eu, kr, tw)
- **Guild Lookup** — Busca de informações de guilds
- **Guild Master Verification** — Verifica se um personagem é GM ou Oficial (rank 0-1) na guild
- **Character Rank** — Obtém o rank do personagem na guild para validar registro
- **User Characters** — Lista todos os personagens WoW vinculados à conta Battle.net
- **Ícones de itens** — Obter ícones oficiais via Item Media endpoint (fallback: scraping do Wowhead)

---

## 🗄 Banco de Dados

### Entidades

```
Guild (1) ──── (*) User
  │                 │
  │                 └── (*) RefreshToken
  │
  ├── (*) Character
  │
  ├── (*) LootDrop
  │
  └── (1) WishlistCache
```

| Tabela | Campos principais |
|--------|-------------------|
| **Guilds** | Id, Name, Server, RealmSlug, Region, WowauditApiKey, PriorityAlpha/Beta/Gamma, MinIlevelNormal/Heroic/Mythic |
| **Users** | Id, Email?, PasswordHash, BattleNetId?, BattleTag?, CharacterName?, GuildId, Role, IsApproved, CreatedAt |
| **Characters** | Id, Name, Realm, Class, Score, IsActive, IsNewPlayer, GuildId |
| **LootDrops** | Id, GuildId, Boss, Difficulty, ItemId, ItemName, AssignedTo, AwardValue, Note?, IsReverted, RevertedAt?, CreatedAt |
| **RefreshTokens** | Id, Token, Expires, CreatedAt, RevokedAt?, ReplacedByToken?, UserId |
| **WishlistCaches** | Id, GuildId, DataJson, UpdatedAt |

### Score dos personagens

- O score é a soma ponderada dos itens recebidos, variando por dificuldade: Normal=`0.5`, Heroic=`1.0`, Mythic=`1.5`
- Itens marcados como transmog (sem candidato com upgrade) não somam score (award = 0)
- Itens com single upgrade (único candidato) não somam score (award = 0)
- O score é usado no fator β do algoritmo de prioridade
- Desfazer uma distribuição subtrai o valor do award do score
- O endpoint `recalculate-scores` recomputa todos os scores a partir do histórico completo

---

## 🎨 Frontend

### Temas

O sistema suporta tema **escuro** (padrão) e **claro**, alternável via botão ☀️/🌙. Ambos os temas compartilham a estética fantasy/roxa que combina com o logo e as imagens de tesouro. As variáveis CSS são definidas em `_layout.scss`:

- `--bg`, `--card`, `--text`, `--muted`, `--accent`
- `--surface`, `--border`, `--input-bg`
- Cores especiais: `--color-transmog`, `--color-heroic`, `--color-mythic`

### Traduções

Todas as strings são traduzidas via `AppContext.tsx`. O idioma é persistido no `localStorage` e alternável via botão PT/EN.

### Páginas

| Rota | Componente | Descrição |
|------|------------|-----------|
| `/` | `Home` | Landing page com login/register inline + imagens laterais |
| `/login` | Redirect | Redireciona para `/` |
| `/register` | Redirect | Redireciona para `/` |
| `/bnet-callback` | `BnetCallback` | Callback do OAuth Battle.net |
| `/guild` | `Guild` | Seleção/criação de guild (rota protegida) |
| `/control` | `Control` > `Dashboard` | Dashboard da guild (rota padrão, role-aware) |
| `/control/loot` | `Loot` | Controle de loot — Admin only |
| `/control/members` | `Members` | Grid de membros da guild |
| `/control/wishlist` | `Wishlist` | Wishlists do WowAudit |
| `/control/history` | `LootHistory` | Histórico de distribuições |
| `/control/admin` | `AdminPanel` | Config da guild — Admin only |

---

## 🌐 Deploy

### Arquitetura de produção

```
Vercel (frontend React)
        │
        │ HTTPS
        ▼
Render (ASP.NET Core API)   ← Docker ou .NET nativo
        │
        ▼
Neon PostgreSQL
```

### Backend — Render (com Docker)

O projeto inclui um `Dockerfile` pronto para deploy:

```dockerfile
# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY FairLoot/FairLoot.csproj FairLoot/
RUN dotnet restore FairLoot/FairLoot.csproj
COPY FairLoot/ FairLoot/
RUN dotnet publish FairLoot/FairLoot.csproj -c Release -o /app/out

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/out .
ENV ASPNETCORE_ENVIRONMENT=Production
CMD ["dotnet", "FairLoot.dll"]
```

1. Crie um **Web Service** no [Render](https://render.com) com **Docker** runtime
2. Aponte para o repositório GitHub
3. Adicione as **Environment Variables** no dashboard do Render:

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `ASPNETCORE_ENVIRONMENT` | `Production` | Modo produção |
| `ConnectionStrings__DefaultConnection` | `Host=...;Database=...;Password=...;SSL Mode=VerifyFull;` | Connection string do Neon PostgreSQL |
| `Jwt__Key` | *(chave de 64+ caracteres)* | Gere com `openssl rand -base64 64` |
| `Jwt__Issuer` | `FairLoot` | Issuer do JWT |
| `Jwt__Audience` | `FairLootUsers` | Audience do JWT |
| `CORS_ORIGINS` | `https://seu-app.vercel.app` | URL do frontend na Vercel |
| `Blizzard__ClientId` | *(seu client id)* | Blizzard API Client ID |
| `Blizzard__ClientSecret` | *(seu client secret)* | Blizzard API Client Secret |

> ⚠️ No Render, variáveis aninhadas usam `__` (dois underscores) em vez de `:`. Exemplo: `Jwt:Key` → `Jwt__Key`

### Backend — Render (sem Docker)

Alternativamente, use o runtime `.NET` nativo:

- **Build Command:** `dotnet publish FairLoot/FairLoot.csproj -c Release -o out`
- **Start Command:** `dotnet out/FairLoot.dll`
- **Environment:** `.NET`

### Frontend — Vercel

1. Crie um projeto no [Vercel](https://vercel.com) apontando para a pasta `client/`
2. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** `client`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

3. Adicione a **Environment Variable**:

| Variável | Valor |
|----------|-------|
| `VITE_API_URL` | `https://seu-app.onrender.com` *(URL do Render)* |

### Gerando uma JWT Key forte

```bash
# Linux / macOS / Git Bash
openssl rand -base64 64

# PowerShell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Max 256 }) -as [byte[]])
```

### Variáveis de ambiente — resumo

| Onde | Variável | Exemplo |
|------|----------|---------|
| **Render** | `ConnectionStrings__DefaultConnection` | `Host=ep-xxx.neon.tech; Database=neondb; ...` |
| **Render** | `Jwt__Key` | `k8Xp2mQ9vL4nR7wJ3bF6yH0t...` (64+ chars) |
| **Render** | `Blizzard__ClientId` | `abc123...` |
| **Render** | `Blizzard__ClientSecret` | `xyz789...` |
| **Render** | `CORS_ORIGINS` | `https://fairloot.vercel.app` |
| **Vercel** | `VITE_API_URL` | `https://fairloot.onrender.com` |

---

## 📄 Licença

Este projeto é open-source. Sinta-se livre para usar, modificar e contribuir.

---

<p align="center">
  Feito com ⚔️ para a comunidade WoW
</p>
