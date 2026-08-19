# FairLoot Discord Bot

Comando `/simc <link>` no Discord que envia um relatório do Raidbots ou QuestionablyEpic
direto pro wowaudit, chamando o endpoint `POST /api/discord/upload-report` do FairLoot.

Roda separado do backend do FairLoot porque precisa manter uma conexão aberta com o Discord
o tempo todo — diferente do Render (free tier), que hiberna o site quando não tem tráfego.

**Esse bot é único e compartilhado**: uma instância só serve qualquer guilda do FairLoot.
Cada guilda se vincula colando o **ID do próprio servidor Discord** nas configurações do
FairLoot (Admin → Bot do Discord) — não precisa subir um bot novo pra cada guilda.

## 1. Criar o bot no Discord (uma vez só, pra todas as guildas)

1. Acesse https://discord.com/developers/applications e crie uma aplicação nova.
2. Aba **Bot** → "Reset Token" → copie o token (isso é o `DISCORD_TOKEN`).
3. Aba **General Information** → copie o "Application ID" (isso é o `DISCORD_CLIENT_ID`).
4. Aba **OAuth2 → URL Generator** → marque os scopes `bot` e `applications.commands` (não
   precisa marcar nenhuma permissão especial) → abra a URL gerada e adicione o bot em
   **cada servidor Discord** que for usar (o mesmo bot, convidado em vários servidores).

## 2. Cada guilda se vincula (repete pra cada guilda nova)

No FairLoot, aba **Admin** → seção "Bot do Discord" → cole o **ID do servidor Discord**
dessa guilda e salve. Pra pegar esse ID: Discord → Configurações → Avançado → ative "Modo
desenvolvedor" → clique com botão direito no ícone do servidor → "Copiar ID do servidor".

## 3. Configurar o bot (uma vez só)

```bash
cd discord-bot
cp .env.example .env
```

Preencha o `.env`:
- `DISCORD_TOKEN` / `DISCORD_CLIENT_ID` — do passo 1.
- `DISCORD_GUILD_ID` — (opcional, só enquanto testa) ID de UM servidor seu, pra o comando
  `/simc` aparecer na hora ali em vez de esperar até 1h globalmente. Remova depois.
- `FAIRLOOT_API_URL` — URL do backend (ex: `https://fairloot.onrender.com`).
- `FAIRLOOT_BOT_SHARED_SECRET` — **o mesmo valor** que está em `Discord:BotSharedSecret`
  no `appsettings.json` do backend (ou na env var `Discord__BotSharedSecret`, se você
  preferir configurar por variável de ambiente no Render em vez do arquivo). Esse valor é
  global do bot, não é por guilda.

```bash
npm install
npm run register   # registra o comando /simc (roda de novo só se mudar o comando)
npm start           # roda o bot localmente, pra testar
```

Teste no Discord: `/simc link: <cole um link do raidbots ou questionablyepic>`.

## 4. Deploy (Fly.io — tem camada free)

```bash
# instalar a CLI (uma vez): https://fly.io/docs/flyctl/install/
fly auth signup   # ou fly auth login se já tiver conta

cd discord-bot
fly launch --no-deploy   # detecta o Dockerfile; escolha "no" pra Postgres/Redis
```

Isso vai ajustar o `fly.toml` (ou usar o daqui, se aceitar). Depois, configure os secrets
(nunca vão pro `fly.toml`/git) e suba:

```bash
fly secrets set DISCORD_TOKEN=xxx DISCORD_CLIENT_ID=xxx FAIRLOOT_API_URL=https://fairloot.onrender.com FAIRLOOT_BOT_SHARED_SECRET=xxx
fly deploy
```

Pra ver se subiu certo:

```bash
fly logs
# procure por "Bot online como <nome>#..."
```

## Sobre o cold-start do Render

O bot responde ao Discord **na hora** ("🔄 pensando...") e só depois chama o FairLoot —
mesmo que o Render esteja hibernado e demore uns 30-60s pra acordar, o usuário só vê a
resposta demorar um pouco mais, sem erro. Não precisa manter o Render sempre ligado por
causa disso.

## Rodando o comando de novo depois de mudar algo

Se editar `src/register-commands.js` (nome/descrição/opções do comando), rode
`npm run register` de novo. Editar `src/index.js` (o que o bot faz) só precisa de um
`fly deploy` novo — os comandos já registrados continuam valendo.
