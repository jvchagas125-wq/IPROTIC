"""
IPROTIC — Automação 100% local via Playwright (sem extensão de navegador)
============================================================================
Lê o arquivo .json exportado pelo site IPROTIC (botão "Baixar dados para
automação Python") e abre + preenche automaticamente um chamado no
ServiceNow para cada e-mail da lista — sem precisar do Tampermonkey nem
de clique manual por aba. Ideal para máquinas onde o TI bloqueia
instalação de extensões de navegador.

Como funciona por baixo dos panos: o Playwright controla o navegador
diretamente pelo protocolo de automação (não injeta JavaScript na página
como o Tampermonkey faria), então ele não esbarra na mesma restrição de
"mesma origem" que impede o site do IPROTIC de preencher a aba do
ServiceNow sozinho.

INSTALAÇÃO (uma vez só):
    pip install playwright

    Não é preciso rodar "playwright install chromium": este script usa o
    Microsoft Edge que já está instalado na máquina (channel="msedge"),
    em vez de baixar um Chromium à parte — evita esbarrar em bloqueios de
    rede corporativos contra download de binário de navegador.

USO:
    python automacao_iprotic.py caminho\\para\\iprotic-chamados.json

Na primeira execução, uma janela do navegador abre para você fazer login
no ServiceNow normalmente (SSO da Petrobras). Depois de logar, volte ao
terminal e pressione ENTER para o script continuar. As próximas execuções
reaproveitam essa sessão (fica salva numa pasta de perfil local), então
você não precisa logar de novo enquanto a sessão não expirar.

AJUSTES QUE PROVAVELMENTE VOCÊ VAI PRECISAR FAZER:
  - FIELD_LABELS abaixo são palpites dos textos dos rótulos do formulário
    real do ServiceNow — confirme/ajuste inspecionando o formulário.
  - AUTO_SUBMIT começa desligado (False) de propósito: o script preenche
    os campos mas não clica em enviar, para você revisar antes. Só ligue
    depois de validar visualmente que o preenchimento está 100% correto.
"""

import argparse
import json
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# ── CONFIGURAÇÃO ────────────────────────────────────────────────────────

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

# Intervalo entre a abertura de cada chamado (segundos) — evita
# sobrecarregar o ServiceNow com muitas abas de uma vez só.
DELAY_BETWEEN_TICKETS = 1.0


# ── LÓGICA DE PREENCHIMENTO ─────────────────────────────────────────────

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
        # Tenta casar pelo texto visível da opção; se não achar, tenta pelo value.
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


# ── FLUXO PRINCIPAL ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Automação IPROTIC — abre e preenche chamados no ServiceNow.")
    parser.add_argument("arquivo_json", help="Caminho do arquivo iprotic-chamados.json baixado do site.")
    parser.add_argument("--headless", action="store_true", help="Não mostra a janela do navegador (não use na primeira execução, precisa ver a tela para logar).")
    args = parser.parse_args()

    data_path = Path(args.arquivo_json)
    if not data_path.exists():
        sys.exit(f"Arquivo não encontrado: {data_path}")

    payload = json.loads(data_path.read_text(encoding="utf-8"))
    tickets = payload.get("tickets", [])
    if not tickets:
        sys.exit("Nenhum e-mail encontrado no arquivo.")

    print(f"{len(tickets)} chamado(s) a processar.")
    print(f"Perfil/sessão do navegador salvo em: {PROFILE_DIR}\n")
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        try:
            # channel="msedge" reaproveita o Microsoft Edge já instalado na
            # máquina (padrão em imagens Petrobras) em vez de baixar um
            # Chromium à parte — evita esbarrar em bloqueios de rede da
            # empresa contra downloads de binário de navegador.
            context = p.chromium.launch_persistent_context(
                str(PROFILE_DIR),
                channel="msedge",
                headless=args.headless,
                viewport={"width": 1280, "height": 900},
            )
        except Exception as exc:
            sys.exit(
                "Não foi possível abrir o Microsoft Edge via Playwright "
                f"(erro: {exc}).\n"
                "Confira se o Edge está instalado no caminho padrão. Se seu "
                "PC usa outro navegador baseado em Chromium, troque "
                'channel="msedge" por channel="chrome" no topo deste bloco '
                "e rode de novo."
            )

        login_page = context.new_page()
        login_page.goto("https://petrobras.service-now.com/", wait_until="domcontentloaded")
        print("Se for pedido login, faça login normalmente na janela do navegador que abriu.")
        print("Depois de estar logado no ServiceNow, volte aqui e pressione ENTER para continuar...")
        try:
            input()
        except EOFError:
            pass
        login_page.close()

        opened_pages = []
        for i, ticket in enumerate(tickets, start=1):
            opened_pages.append(process_ticket(context, ticket, i, len(tickets)))
            if i < len(tickets):
                time.sleep(DELAY_BETWEEN_TICKETS)

        print(f"\nConcluído: {len(opened_pages)} aba(s) aberta(s) e preenchida(s).")
        print("Revise cada uma e confirme o envio manualmente.")
        print("Pressione ENTER aqui para encerrar (as abas continuam abertas no navegador).")
        try:
            input()
        except EOFError:
            pass
        context.close()


if __name__ == "__main__":
    main()
