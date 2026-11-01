# Meu Radar

Painel pessoal de política com seis partes:
- **Hoje:** o que mudou desde a sua última visita, alertas, prazos, resumo do dia e economia.
- **Notícias:** assuntos agrupados, comparação entre veículos, palavras vigiadas e equilíbrio do que você leu.
- **Congresso:** medidas provisórias com prazo, pauta do plenário, projetos novos nos seus temas, votações com a bancada do Ceará, discursos com suas palavras e projetos que você segue.
- **Termômetro:** governismo semana a semana e por partido, com série que cresce a cada dia.
- **Leitura:** modo leitura acessível. Tira menus, anúncios, cookies e pop-ups, mantém o texto íntegro em Markdown, com fonte ajustável, alto contraste e leitura em voz alta. Abre o texto completo da Agência Brasil, da Agência Câmara e da Agência Senado, e qualquer endereço quando você configura o seu leitor (abaixo). Não remove bloqueios de assinatura.
- **Agências públicas na Leitura:** texto integral das matérias da Agência Brasil, da Agência Câmara e da Agência Senado, coletado a cada 3 horas, sempre com crédito e link do original. Os endereços de RSS ficam em `agencias.json`. Confira os termos de uso de cada agência no site dela.
- **Salvas** e **Fontes**.

Tem também o **modo calmo**, que mostra só o resumo, os alertas e a leitura.

Tudo roda de graça no GitHub: as automações coletam os dados e o GitHub Pages publica o site.

## Colocar no ar (cerca de 15 minutos, uma vez)

1. Crie um repositório **público** chamado `meu-radar` em github.com/new.
2. Envie todos os arquivos desta pasta, mantendo as pastas: `.github`, `assets`, `coletor`, `config` e `data`. Pelo site: Add file > Upload files, e arraste o conteúdo da pasta.
3. Em **Settings > Actions > General > Workflow permissions**, marque **Read and write permissions** e salve.
4. Em **Actions > Coletar dados**, clique em **Run workflow**. A primeira coleta completa leva de 5 a 10 minutos.
5. Em **Settings > Pages**, escolha **Deploy from a branch**, depois `main` e `/ (root)`, e salve.
6. O painel fica em `https://SEU-USUARIO.github.io/meu-radar/`.

## Resumo diário no Telegram (opcional)

1. No Telegram, fale com **@BotFather**, mande `/newbot` e guarde a chave (token).
2. Mande qualquer mensagem para o seu bot. Depois abra `https://api.telegram.org/bot<TOKEN>/getUpdates` e copie o número em `"chat":{"id": ...}`.
3. No GitHub, vá em **Settings > Secrets and variables > Actions > New repository secret** e crie `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID`.
4. O resumo chega todo dia por volta das 6h de Brasília.

## Leitor para qualquer endereço (opcional, cerca de 10 minutos)

Quase todo site bloqueia a leitura feita direto de outro site. O seu leitor é um pequeno serviço gratuito na Cloudflare que busca a página como um visitante comum e entrega ao painel. Ele não contorna bloqueios de assinatura: se a matéria for só para assinantes, o painel avisa.

1. Crie uma conta gratuita em dash.cloudflare.com.
2. Vá em **Workers & Pages > Create > Create Worker**, dê o nome `meu-leitor` e clique em **Deploy**.
3. Clique em **Edit code**, apague o que estiver lá, cole o conteúdo de `worker.js` e clique em **Deploy**.
4. Em **Settings > Variables and Secrets**, adicione:
   - um segredo `CHAVE` com uma senha que você inventar;
   - opcionalmente, `ORIGEM` = `https://SEU-USUARIO.github.io`, para só o seu painel usar o leitor.
5. No painel, aba **Leitura > Configurar o seu leitor**, cole o endereço do worker (algo como `https://meu-leitor.SEU-NOME.workers.dev`) e a chave.

O plano gratuito da Cloudflare permite 100 mil leituras por dia.

## Ajustar

Os ajustes ficam nos arquivos .json, editados direto no GitHub:
- `fontes.json` define buscas, veículos e grupos, temas, palavras vigiadas (`vigiar`) e palavras procuradas em projetos novos (`temas_projetos`).
- `agencias.json` lista os RSS da Agência Brasil, da Agência Câmara e da Agência Senado, de onde vem o texto integral da aba Leitura. Se um parar de funcionar (veja a aba Fontes), troque o endereço.
- `seguir.json` lista os projetos que você quer acompanhar passo a passo, por sigla, número e ano.

## Frequência

| Dado | Quando |
| --- | --- |
| Notícias | De hora em hora |
| Congresso e economia | A cada 3 horas |
| Agências públicas (texto integral) | A cada 3 horas |
| Agências públicas (texto integral) | A cada 3 horas |
| Discursos e resumo do dia | Uma vez por dia |

## Observações

- O repositório precisa ser público para o GitHub Pages gratuito. Ele guarda só dados públicos: títulos, links e dados oficiais. Quem tiver o link vê o painel. Lidas, salvas e palavras extras ficam só no seu navegador.
- O prazo das MPs é estimado pela Constituição (art. 62), sem contar o recesso. A data oficial está no site do Congresso.
- Se alguma coleta falhar, a aba **Fontes** mostra qual. A próxima tentativa é automática.
- O modo leitura funciona com páginas que você pode acessar. A maioria dos jornais não deixa outro site ler a página direto. Nesse caso, salve a página (Ctrl+S) e carregue o arquivo, ou cole o código-fonte.
