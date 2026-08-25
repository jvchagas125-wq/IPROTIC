# IPROTIC — Abertura em massa de chamados no ServiceNow

Este pacote atualiza o site para, ao clicar em **Enviar Chamados**, abrir
uma aba do navegador para cada e-mail informado, apontando para o item de
catálogo "Registro de Proatividade" no ServiceNow, com os dados do
formulário passados na própria URL. A automação em Python (agente local
ou script por arquivo — veja o Passo 5) lê esses dados e preenche o
formulário automaticamente em cada aba, via Playwright.

Testado para funcionar em **Chrome, Microsoft Edge e Mozilla Firefox** —
o site usa apenas recursos padrão de navegador, sem nada específico de
um só fabricante.

## Arquivos deste pacote

- `index.html`, `style.css`, `script.js` — site atualizado (substitua os
  três arquivos originais por estes).
- `logo-icon.png`, `favicon.png` — **arquivos novos**, gerados a partir da
  logo que você enviou. Precisam ser adicionados ao repositório na raiz
  (mesma pasta do `index.html`) — sem eles, o ícone do topo e o ícone da
  aba do navegador não aparecem.
- `iprotic_local_agent.py`, `iniciar_agente_iprotic.bat` — agente local
  de automação 100% automática (Opção A do Passo 5).
- `automacao_iprotic.py` — script por arquivo, para rodar sob demanda
  (Opção B do Passo 5).

## Passo 1 — Instalar o Python (se ainda não tiver)

Se o PC já tem Python instalado, pule este passo.

Instale o **Python 3.14 (64 bits)** pelo **Portal da Empresa** ou seguindo
o procedimento da
[base de conhecimento do ServiceNow](https://petrobras.service-now.com/kb_view.do?sys_kb_id=ff487847fb21b2d0e012fc665eefdc81&sysparm_rank=1&sysparm_tsqueryId=e1040317eb760798b0cbf69540d0cd51)
— não instale por fora, para não esbarrar na política de instalação da TI.

## Passo 2 — Permitir pop-ups para o site do IPROTIC

Como o clique em "Enviar Chamados" pode abrir várias abas de uma vez (no
caso de o agente local não estar rodando — veja o Passo 5), o navegador
tende a bloquear a maioria delas como pop-up — isso acontece nos três
navegadores, cada um com sua própria tela de permissões:

**Chrome:** clique no ícone de bloqueio de pop-up que aparece na barra de
endereço após o primeiro envio, ou acesse `chrome://settings/content/popups`
e adicione o endereço do site à lista de permitidos.

**Microsoft Edge:** mesmo processo do Chrome, em `edge://settings/content/popups`.

**Firefox:** na notificação amarela "Firefox impediu que este site abrisse
uma janela pop-up" (aparece no topo da página), clique em **Preferências**
→ **Permitir para [site]**. Ou acesse `about:preferences#privacy` →
seção Permissões → **Bloquear janelas pop-up** → botão **Exceções** →
adicione o endereço do site.

Se ainda assim alguma aba for bloqueada, o site mostra um aviso com um
botão **"Reabrir abas bloqueadas"** — clique nele para tentar novamente
(esse clique conta como uma nova ação do analista, então costuma passar
pelo bloqueio).

## Passo 3 — Confirmar os nomes dos campos no ServiceNow

Não temos acesso direto à instância do ServiceNow da Petrobras para
inspecionar os campos reais do formulário de catálogo. Os scripts Python
(`iprotic_local_agent.py` e `automacao_iprotic.py`) localizam os campos
**pelo texto do rótulo** (label), usando estes palpites iniciais
(editáveis no topo de cada arquivo, em `FIELD_LABELS`):

| Campo do IPROTIC   | Texto de rótulo procurado no ServiceNow                  |
|---------------------|-----------------------------------------------------------|
| E-mail do usuário    | "solicitado para", "e-mail do usuário", "requested for"   |
| Tipo de atendimento  | "tipo de atendimento"                                     |
| Info. adicionais     | "descrição", "observações", "informações adicionais"      |

Antes de usar em produção:

1. Abra manualmente o link do item de catálogo no ServiceNow.
2. Clique com o botão direito sobre cada campo do formulário →
   **Inspecionar** → confira o texto do `<label>` associado.
3. Se o texto real for diferente do que está em `FIELD_LABELS`, edite o
   script Python (`iprotic_local_agent.py` e/ou `automacao_iprotic.py`)
   em um editor de texto e ajuste as listas.
4. Envie um teste com **um único e-mail** e confira visualmente se todos
   os campos foram preenchidos corretamente antes de usar em lote.

O campo de solicitante costuma ser um campo de referência (autocomplete):
o script digita o e-mail e tenta clicar na primeira sugestão que aparece.
Esse é o ponto mais sensível a variações da interface do ServiceNow — se
não funcionar, ajuste o seletor CSS usado em `fill_reference_field()` no
topo do script (inspecione a lista de sugestões que aparece ao digitar
manualmente no campo, e copie o seletor CSS do item da lista).

## Passo 4 — Auto-envio (opcional, use com cautela)

Por padrão, os scripts **não** clicam automaticamente no botão de enviar
do ServiceNow (`AUTO_SUBMIT = False`) — os campos ficam preenchidos, mas
o analista revisa e confirma manualmente em cada aba. Depois de validar
que o preenchimento está correto para todos os campos, você pode mudar
`AUTO_SUBMIT` para `True` no topo do script para que o próprio chamado
seja enviado sem intervenção manual em cada aba.

Recomendação: mantenha `AUTO_SUBMIT = False` até ter certeza de que os
seletores estão corretos — um clique automático em um campo mal
identificado pode enviar um chamado com dados incorretos.

## Passo 5 — Automação 100% automática via Python

O preenchimento automático dos chamados é feito via **Playwright**, que
controla o navegador diretamente pelo protocolo de automação — não é uma
extensão de navegador, então não esbarra em bloqueios de instalação de
extensões da TI. Os dois scripts (`iprotic_local_agent.py` e
`automacao_iprotic.py`) usam `channel="msedge"`, ou seja, reaproveitam o
Microsoft Edge já instalado na máquina em vez de baixar um Chromium à
parte — não é preciso rodar `playwright install chromium`. Há duas
formas de usar, com o mesmo motor por trás:

### Opção A — Agente local (`iprotic_local_agent.py`), instantâneo

- Arquivos: `iprotic_local_agent.py` e `iniciar_agente_iprotic.bat`.
- Fica rodando em segundo plano na máquina do analista, escutando em
  `http://127.0.0.1:8765`. O site detecta esse agente sozinho: ao clicar
  em **"Enviar Chamados"**, os dados são enviados direto para o agente —
  **sem baixar arquivo nenhum e sem rodar nada na hora do envio** — que
  abre e preenche todas as abas automaticamente.
- Se o agente não estiver rodando, o site cai automaticamente no
  comportamento anterior (abre as abas em branco para preenchimento
  manual) — nada quebra para quem ainda não configurou o agente.

**Como usar:**

1. Abra o **Prompt de Comando** do Windows (não é o Python/IDLE —
   pressione `Win+R`, digite `cmd` e Enter) e rode, uma única vez (depois
   de instalar o Python — veja o Passo 1):
   ```
   pip install playwright
   ```
   Não precisa rodar `playwright install chromium` — veja a nota acima
   sobre `channel="msedge"`. Se aparecer um aviso de "atividade de
   download bloqueada pela Companhia", veja **"Se o `pip install`
   for bloqueado"** logo abaixo antes de continuar.
2. Rode `python iprotic_local_agent.py` (ou dê duplo clique em
   `iniciar_agente_iprotic.bat`) e deixe a janela aberta em segundo plano
   (pode minimizar).
3. Na primeira execução do dia, uma janela do navegador abre para você
   fazer login no ServiceNow (SSO da Petrobras) normalmente. Depois de
   logado, volte ao terminal e pressione ENTER — a sessão fica salva
   localmente, então os próximos envios não pedem login de novo enquanto
   ela não expirar.
4. No site, preencha o formulário e clique em **Enviar Chamados**
   normalmente — pronto, sem mais nenhum passo manual.
5. Revise cada aba aberta e confirme o envio manualmente (ou ajuste
   `AUTO_SUBMIT = True` — veja o Passo 4).

**Deixar o agente iniciando sozinho com o Windows (opcional):**
pressione `Win+R`, digite `shell:startup` e Enter para abrir a pasta de
Inicialização do Windows, e copie um **atalho** de
`iniciar_agente_iprotic.bat` para dentro dela. A partir do próximo login,
o agente já sobe sozinho — só o login do SSO continua manual na primeira
vez do dia.

**Segurança:** o agente só aceita conexões vindas do próprio computador
(`127.0.0.1`) — nenhuma máquina da rede consegue chamá-lo. O site também
envia um token simples junto com os dados (não é uma proteção forte, só
evita disparos acidentais de outras páginas abertas no navegador).

### Opção B — Script por arquivo (`automacao_iprotic.py`), sob demanda

Prefere não deixar nada rodando em segundo plano o tempo todo? Use este
modo: você baixa os dados manualmente e roda o script quando quiser.

1. No site, preencha o formulário normalmente e clique em
   **"Baixar dados (Python)"** em vez de "Enviar Chamados". Isso baixa um
   arquivo `iprotic-chamados.json` com os dados de todos os e-mails.
2. Instale as dependências (mesmo passo 1 da Opção A, se ainda não tiver
   feito).
3. Rode o script apontando para o arquivo baixado:
   ```
   python automacao_iprotic.py Downloads\iprotic-chamados.json
   ```
4. Mesmo fluxo de login/sessão da Opção A.
5. O script abre uma aba por e-mail e preenche os campos automaticamente.
   Revise cada uma e clique em enviar manualmente.

Nos dois casos, os textos de rótulo usados para encontrar os campos
(`FIELD_LABELS`, no topo de cada script) são palpites — confirme/ajuste
com um teste de um único e-mail antes de usar em lote (Passo 3).

### Se o `pip install` for bloqueado ("atividade de download bloqueada pela Companhia")

Em máquinas Petrobras, a rede pode bloquear downloads diretos do
repositório público do Python (pythonhosted.org) — o próprio aviso de
bloqueio já indica o caminho aceito. Duas opções:

**A) JFrog Artifactory (caminho oficial):** peça ao System Team da sua
área a URL do proxy PyPI no JFrog e rode:
```
pip install playwright --index-url https://SUA-URL-DO-JFROG-AQUI/simple
```
Para não precisar repetir o parâmetro depois, configure permanentemente:
```
pip config set global.index-url https://SUA-URL-DO-JFROG-AQUI/simple
```

**B) Instalação offline:** peça para alguém com acesso liberado (outra
máquina, ou fora da rede Petrobras) rodar `pip download playwright -d
pasta_playwright` e te repassar essa pasta por um canal interno
aprovado. Depois, instale localmente sem baixar nada:
```
pip install --no-index --find-links=pasta_playwright playwright
```

## Fluxo resumido

1. Analista preenche o formulário no site do IPROTIC e clica em
   **Enviar Chamados**.
2. Se o agente local (`iprotic_local_agent.py`) estiver rodando, os dados
   vão direto para ele — sem download, sem passo manual — e ele abre e
   preenche cada aba sozinho. Caso contrário, o site abre uma aba em
   branco por e-mail para preenchimento manual (ou o analista pode usar
   "Baixar dados (Python)" + `automacao_iprotic.py` depois, em lote).
3. O agente/script preenche o formulário do ServiceNow em cada aba.
4. O analista revisa e clica em enviar em cada aba (ou, com
   `AUTO_SUBMIT = True`, o próprio script envia).
