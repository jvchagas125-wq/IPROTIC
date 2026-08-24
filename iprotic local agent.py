"""
IPROTIC — Agente local (roda em segundo plano, sem passo manual)
=================================================================
Este script fica rodando em segundo plano na máquina do analista,
escutando em http://127.0.0.1:8765. Quando o site do IPROTIC percebe
que esse agente está ativo, o botão "Enviar Chamados" envia os dados
do formulário DIRETO para cá — sem baixar arquivo nenhum e sem
precisar rodar nada na mão a cada envio. Este script então abre e
preenche os chamados no ServiceNow sozinho, via Playwright (mesma
técnica do automacao_iprotic.py).

Diferença para o automacao_iprotic.py (modo "arquivo"):
  - automacao_iprotic.py: você clica em "Baixar dados (Python)", pega
    o .json e roda o script na mão a cada lote de chamados.
  - iprotic_local_agent.py (este arquivo): fica sempre rodando; ao
    clicar em "Enviar Chamados" no site, o preenchimento começa na
    hora, sem nenhum passo manual depois que o agente já está de pé.

Os dois arquivos podem conviver — use o que for mais prático para
cada analista.

INSTALAÇÃO (uma vez só, requer Python 3 instalado na máquina):
    pip install playwright
    playwright install chromium

COMO USAR:
    python iprotic_local_agent.py

Deixe a janela do terminal aberta (pode minimizar) enquanto for usar
a automação — é ela que mantém o agente e a sessão do navegador
ativos. Feche com Ctrl+C quando não precisar mais.

Na primeira execução do dia, uma janela do navegador abre para você
fazer login no ServiceNow (SSO da Petrobras) normalmente. Depois de
logado, volte ao terminal e pressione ENTER — a sessão fica salva
localmente (pasta de perfil), então os próximos envios não pedem
login de novo enquanto ela não expirar.

DEIXAR O AGENTE INICIANDO SOZINHO COM O WINDOWS (opcional):
    1. Use o arquivo "iniciar_agente_iprotic.bat" (incluído junto).
    2. Pressione Win+R, digite "shell:startup" e Enter — abre a pasta
       de Inicialização do Windows.
    3. Copie um ATALHO do "iniciar_agente_iprotic.bat" para dentro
       dessa pasta.
    4. A partir do próximo login no Windows, o agente já sobe sozinho
       em segundo plano — você só precisa completar o login do SSO
       na primeira vez que for usar no dia.

AJUSTES QUE VOCÊ PROVAVELMENTE VAI PRECISAR FAZER:
  - FIELD_LABELS abaixo são palpites dos textos dos rótulos do
    formulário real do ServiceNow — confirme/ajuste inspecionando o
    formulário (mesmo procedimento do automacao_iprotic.py).
  - AUTO_SUBMIT começa desligado (False) de propósito: o agente
    preenche os campos mas não clica em enviar, para o analista
    revisar. Só ligue depois de validar visualmente que o
    preenchimento está 100% correto.

SEGURANÇA: este servidor só aceita conexões vindas do próprio
computador (127.0.0.1) — nenhuma outra máquina da rede consegue
chamá-lo. Ainda assim, qualquer página aberta nesse navegador
poderia, em teoria, tentar chamá-lo; por isso o site só envia dados
junto com um token simples (TOKEN abaixo). Isso não é uma proteção
forte — é só uma barreira contra disparos acidentais de outras
páginas, não contra alguém com acesso ao próprio computador.
"""

import json
import queue
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# ── CONFIGURAÇÃO ────────────────────────────────────────────────────────

HOST = "127.0.0.1"
PORT = 8765

# Precisa ser IDÊNTICO ao valor de LOCAL_AGENT_TOKEN em script.js.
TOKEN = "iprotic-local-2026"

SERVICENOW_CATALOG_URL = (
    "https://petrobras.service-now.com/cs?id=sc_cat_item"
    "&sys_id=26e4bc991ba9c2d8feb132681b4bcb84&table=sc_cat_item"
    "&searchTerm=registro%20de%20proatividade"
)

# Onde a sessão logada do navegador fica salva entre execuções.
PROFILE_DIR = Path.home() / ".iprotic_browser_profile"

# Textos de rótulo procurados no formulário do ServiceNow (ajuste se
# os campos não forem encontrados — veja o aviso impresso no terminal).
FIELD_LABELS = {
    "requester": ["solicitado para", "e-mail do usuário", "usuário", "requested for", "chave do usuário"],
    "tipo_atendimento": ["tipo de atendimento"],
    "info_adicional": ["descrição", "observações", "informações adicionais"],
}

# True = clica automaticamente em enviar depois de preencher.
# Mantenha False até confirmar visualmente que o preenchimento está correto.
AUTO_SUBMIT = False
SUBMIT_BUTTON_TEXT = "Enviar"

# Intervalo entre a abertura de cada chamado (segundos).
DELAY_BETWEEN_TICKETS = 1.0


# ── LÓGICA DE PREENCHIMENTO (mesma técnica do automacao_iprotic.py) ─────

def find_field(page, candidates):
    """Procura, na ordem, um campo associado a algum dos rótulos candidatos."""
    for candidate in candidates:
        locator = page.get_by_label(candidate, exact=False)
        try:
            if locator.count() > 0:
                return locator.first
        except Exception:
            continue
    return None


def fill_simple_field(page, candidates, value, label_name):
    if not value:
        return False
    field = find_field(page, candidates)
    if not field:
        print(f'    [aviso] campo "{label_name}" não encontrado (ajuste FIELD_LABELS no script).')
        return False

    tag = field.evaluate("el => el.tagName").upper()
    if tag == "SELECT":
        try:
            field.select_option(label=value)
        except Exception:
            try:
                field.select_option(value=value)
            except Exception:
                print(f'    [aviso] nenhuma opção de "{label_name}" corresponde a "{value}" — confira as opções do select.')
                return False
    else:
        field.fill(value)

    print(f'    [ok] "{label_name}" preenchido.')
    return True


def fill_reference_field(page, candidates, value, label_name):
    """Campo de referência (autocomplete): digita e clica na primeira sugestão."""
    if not value:
        return False
    field = find_field(page, candidates)
    if not field:
        print(f'    [aviso] campo "{label_name}" não encontrado (ajuste FIELD_LABELS no script).')
        return False
    field.click()
    field.fill(value)
    try:
        suggestion = page.locator(
            ".dropdown-menu li a, .ui-autocomplete li, [role='option'], .list-group-item"
        ).first
        suggestion.wait_for(timeout=3000)
        suggestion.click()
        print(f'    [ok] "{label_name}" preenchido e sugestão selecionada.')
        return True
    except PWTimeout:
        print(f'    [aviso] nenhuma sugestão apareceu para "{label_name}" — confira manualmente.')
        return False


def build_url(ticket):
    params = {
        "iprotic_requester": ticket.get("email", ""),
        "iprotic_para_outra_pessoa": ticket.get("para_outra_pessoa", ""),
        "iprotic_o_que_deseja": ticket.get("o_que_deseja", ""),
        "iprotic_tipo_atendimento": ticket.get("tipo_atendimento", ""),
        "iprotic_mesa_responsavel": ticket.get("mesa_responsavel", ""),
        "iprotic_info_adicional": ticket.get("info_adicional", ""),
    }
    sep = "&" if "?" in SERVICENOW_CATALOG_URL else "?"
    return f"{SERVICENOW_CATALOG_URL}{sep}{urlencode(params)}"


def process_ticket(context, ticket, index, total):
    email = ticket.get("email", "?")
    print(f"[{index}/{total}] Abrindo chamado para {email}...")
    page = context.new_page()
    page.goto(build_url(ticket), wait_until="domcontentloaded")

    filled_any = False
    filled_any = fill_simple_field(page, FIELD_LABELS["tipo_atendimento"], ticket.get("tipo_atendimento", ""), "Tipo de atendimento") or filled_any
    filled_any = fill_simple_field(page, FIELD_LABELS["info_adicional"], ticket.get("info_adicional", ""), "Informações adicionais") or filled_any
    filled_any = fill_reference_field(page, FIELD_LABELS["requester"], email, "Solicitante / e-mail") or filled_any

    if not filled_any:
        print(f"    [erro] nenhum campo foi preenchido para {email} — confira manualmente essa aba.")
    elif AUTO_SUBMIT:
        try:
            page.get_by_role("button", name=SUBMIT_BUTTON_TEXT, exact=False).first.click(timeout=3000)
            print(f"    [ok] chamado enviado automaticamente para {email}.")
        except PWTimeout:
            print(f"    [aviso] botão de envio não encontrado para {email} — envie manualmente.")

    return page


def process_tickets(tickets):
    """Processa um lote de chamados recebido do site. Roda sempre na
    MESMA thread que criou o contexto do Playwright (thread principal
    — ver main()), nunca dentro do handler HTTP."""
    print(f"\n[iprotic-agent] Recebido {len(tickets)} chamado(s) — abrindo e preenchendo...")
    for i, ticket in enumerate(tickets, start=1):
        try:
            process_ticket(_browser_context, ticket, i, len(tickets))
        except Exception as exc:
            print(f"    [erro] falha ao processar {ticket.get('email', '?')}: {exc}")
        if i < len(tickets):
            time.sleep(DELAY_BETWEEN_TICKETS)
    print(f"[iprotic-agent] Concluído: {len(tickets)} chamado(s) processado(s). Revise e confirme o envio em cada aba.\n")


# ── SERVIDOR HTTP LOCAL ──────────────────────────────────────────────────
#
# O Playwright (modo síncrono) só pode ser chamado a partir da mesma
# thread que criou o contexto do navegador. Por isso o servidor HTTP
# roda em background (ThreadingHTTPServer) só para RECEBER as
# requisições e colocar os chamados numa fila (queue) — quem de fato
# processa os chamados no navegador é a thread principal, dentro de
# main(), tirando itens da fila um lote de cada vez.

_browser_context = None
_job_queue = queue.Queue()


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self):
        # Permite que o site (em outro domínio) chame esse servidor local.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Iprotic-Token")

    def do_OPTIONS(self):
        # Pré-checagem de CORS que o navegador envia antes do POST real.
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        # Só para checagem manual — abrir http://127.0.0.1:8765/ no
        # navegador deve responder com {"status": "ok", ...}.
        self._send_json(200, {"status": "ok", "servico": "iprotic-local-agent"})

    def do_POST(self):
        if self.path != "/enviar":
            self._send_json(404, {"status": "erro", "mensagem": "rota não encontrada"})
            return

        if self.headers.get("X-Iprotic-Token", "") != TOKEN:
            self._send_json(403, {"status": "erro", "mensagem": "token inválido"})
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b""

        try:
            payload = json.loads(raw.decode("utf-8")) if raw else {}
            tickets = payload.get("tickets", [])
        except Exception:
            tickets = []

        if not tickets:
            self._send_json(400, {"status": "erro", "mensagem": "nenhum chamado no payload"})
            return

        _job_queue.put(tickets)
        # Responde na hora — o preenchimento continua em segundo plano,
        # então o site não fica esperando todas as abas terminarem.
        self._send_json(200, {"status": "ok", "recebidos": len(tickets)})

    def log_message(self, format, *args):
        print(f"[iprotic-agent] {self.address_string()} - {format % args}")


def main():
    global _browser_context

    print("IPROTIC — Agente local de automação")
    print("=" * 44)
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Perfil/sessão do navegador salvo em: {PROFILE_DIR}\n")

    with sync_playwright() as p:
        _browser_context = p.chromium.launch_persistent_context(
            str(PROFILE_DIR),
            headless=False,
            viewport={"width": 1280, "height": 900},
        )

        login_page = _browser_context.new_page()
        login_page.goto("https://petrobras.service-now.com/", wait_until="domcontentloaded")
        print("Se for pedido login, faça login normalmente na janela do navegador que abriu.")
        print("Depois de estar logado no ServiceNow, volte aqui e pressione ENTER para continuar...")
        try:
            input()
        except EOFError:
            pass
        login_page.close()

        server = ThreadingHTTPServer((HOST, PORT), Handler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()

        print(f"\nAgente pronto em http://{HOST}:{PORT} — deixe esta janela aberta (pode minimizar).")
        print('No site do IPROTIC, preencha o formulário e clique em "Enviar Chamados" normalmente:')
        print("os chamados serão abertos e preenchidos aqui automaticamente, sem mais nenhum passo manual.")
        print("Pressione Ctrl+C aqui para encerrar o agente.\n")

        try:
            while True:
                tickets = _job_queue.get()  # bloqueia até o site enviar um lote
                process_tickets(tickets)
        except KeyboardInterrupt:
            print("\nEncerrando o agente...")
        finally:
            server.shutdown()
            _browser_context.close()


if __name__ == "__main__":
    main()
