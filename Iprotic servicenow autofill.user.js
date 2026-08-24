// ==UserScript==
// @name         IPROTIC — Auto-preenchimento ServiceNow (Registro de Proatividade)
// @namespace    iprotic.minsait
// @version      1.0.0
// @description  Lê os dados enviados pelo site IPROTIC (via parâmetros de URL) e preenche automaticamente o formulário do item de catálogo no ServiceNow.
// @author       IPROTIC · Minsait / Grupo Indra
// @match        https://petrobras.service-now.com/cs*
// @match        https://petrobras.service-now.com/esc*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * ════════════════════════════════════════════════════════════════
 * COMO FUNCIONA
 * ════════════════════════════════════════════════════════════════
 * 1. O site IPROTIC abre uma aba para cada e-mail informado, usando
 *    o link do item de catálogo "Registro de Proatividade" e
 *    acrescentando os dados do chamado como parâmetros de URL
 *    (ex.: ?...&iprotic_requester=fulano@empresa.com&iprotic_tipo_atendimento=...).
 *
 * 2. Este userscript roda em cada uma dessas abas, lê esses
 *    parâmetros e procura os campos do formulário do ServiceNow
 *    PELO TEXTO DO RÓTULO (label), preenchendo-os automaticamente.
 *
 * 3. Como o ServiceNow carrega o formulário de forma assíncrona
 *    (Angular), o script tenta preencher várias vezes ao longo de
 *    alguns segundos, até conseguir.
 *
 * ════════════════════════════════════════════════════════════════
 * IMPORTANTE — AJUSTES NECESSÁRIOS ANTES DE USAR EM PRODUÇÃO
 * ════════════════════════════════════════════════════════════════
 * Não temos acesso à instância real do ServiceNow da Petrobras para
 * inspecionar os nomes exatos dos campos do formulário. Os textos
 * em FIELD_LABELS abaixo são os melhores palpites com base nos
 * rótulos usados no site IPROTIC — confirme (e ajuste se preciso)
 * abrindo o formulário no ServiceNow, clicando com o botão direito
 * sobre cada campo > Inspecionar, e comparando o texto do rótulo
 * (<label>) que aparece ao lado do campo.
 *
 * O campo de "solicitante" (requester) costuma ser um campo de
 * REFERÊNCIA no ServiceNow (autocomplete: você digita e escolhe um
 * resultado da lista). A função fillReferenceField() tenta lidar
 * com isso digitando o e-mail e clicando na primeira sugestão que
 * aparecer — teste com cuidado, pois o seletor da lista de
 * sugestões (REFERENCE_SUGGESTION_SELECTOR) pode variar.
 */

(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // CONFIGURAÇÃO — ajuste aqui se os campos não forem encontrados
  // ──────────────────────────────────────────────────────────

  // Textos (ou trechos de texto) dos rótulos de cada campo no
  // formulário do ServiceNow. Comparação é case-insensitive e
  // ignora acentos. Pode listar mais de uma opção por campo.
  const FIELD_LABELS = {
    requester: ['solicitado para', 'e-mail do usuário', 'usuário', 'requested for', 'chave do usuário'],
    tipoAtendimento: ['tipo de atendimento'],
    infoAdicional: ['descrição', 'observações', 'informações adicionais'],
  };

  // Seletor usado para localizar rótulos candidatos na página.
  const LABEL_SELECTOR = 'label, .form-group label, [class*="label"]';

  // Seletor da lista de sugestões que aparece ao digitar em campos
  // de referência (autocomplete). Ajuste conforme o portal usado.
  const REFERENCE_SUGGESTION_SELECTOR =
    '.dropdown-menu li a, .ui-autocomplete li, [role="option"], .list-group-item';

  // true = clica automaticamente no botão de enviar após preencher.
  // Mantenha false até validar visualmente que o preenchimento está
  // correto em todos os campos.
  const AUTO_SUBMIT = false;

  // Texto candidato do botão de envio do catálogo, usado somente
  // se AUTO_SUBMIT = true.
  const SUBMIT_BUTTON_LABELS = ['enviar', 'submit', 'order now', 'solicitar'];

  // Quantas vezes (e com qual intervalo) tentar preencher o
  // formulário enquanto ele ainda está carregando.
  const MAX_ATTEMPTS = 30;
  const ATTEMPT_INTERVAL_MS = 500;

  // ──────────────────────────────────────────────────────────
  // LEITURA DOS PARÂMETROS ENVIADOS PELO SITE IPROTIC
  // ──────────────────────────────────────────────────────────
  function getIproticData() {
    const p = new URLSearchParams(window.location.search);
    if (!p.has('iprotic_requester')) return null; // aba não veio do IPROTIC
    return {
      requester: p.get('iprotic_requester') || '',
      paraOutraPessoa: p.get('iprotic_para_outra_pessoa') || '',
      oQueDeseja: p.get('iprotic_o_que_deseja') || '',
      tipoAtendimento: p.get('iprotic_tipo_atendimento') || '',
      mesaResponsavel: p.get('iprotic_mesa_responsavel') || '',
      infoAdicional: p.get('iprotic_info_adicional') || '',
    };
  }

  // ──────────────────────────────────────────────────────────
  // UTILITÁRIOS DE TEXTO
  // ──────────────────────────────────────────────────────────
  function normalize(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // remove acentos (marcas diacríticas após NFD)
      .replace(/\*/g, '')
      .trim();
  }

  function labelMatches(labelText, candidates) {
    const norm = normalize(labelText);
    return candidates.some(c => norm.includes(normalize(c)));
  }

  // ──────────────────────────────────────────────────────────
  // LOCALIZAÇÃO DE CAMPOS PELO RÓTULO
  // ──────────────────────────────────────────────────────────
  function findFieldByLabel(candidates) {
    const labels = document.querySelectorAll(LABEL_SELECTOR);
    for (const label of labels) {
      if (!labelMatches(label.textContent, candidates)) continue;

      // 1) label com atributo for="id-do-campo"
      const forAttr = label.getAttribute('for');
      if (forAttr) {
        const el = document.getElementById(forAttr);
        if (el) return el;
      }

      // 2) campo dentro do mesmo container (.form-group ou pai direto)
      const container = label.closest('.form-group') || label.parentElement;
      if (container) {
        const el = container.querySelector('input, select, textarea');
        if (el) return el;
      }
    }
    return null;
  }

  // ──────────────────────────────────────────────────────────
  // PREENCHIMENTO DE CAMPOS (compatível com Angular / React)
  // ──────────────────────────────────────────────────────────
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function fillSimpleField(candidates, value, label) {
    if (!value) return false;
    const el = findFieldByLabel(candidates);
    if (!el) {
      console.warn(`[IPROTIC] Campo "${label}" não encontrado (rótulos testados: ${candidates.join(', ')}). Ajuste FIELD_LABELS no userscript.`);
      return false;
    }
    setNativeValue(el, value);
    console.log(`[IPROTIC] Campo "${label}" preenchido com:`, value);
    return true;
  }

  // Campo de referência (autocomplete) — digita e tenta escolher a
  // primeira sugestão da lista.
  function fillReferenceField(candidates, value, label) {
    if (!value) return Promise.resolve(false);
    const el = findFieldByLabel(candidates);
    if (!el) {
      console.warn(`[IPROTIC] Campo de referência "${label}" não encontrado. Ajuste FIELD_LABELS no userscript.`);
      return Promise.resolve(false);
    }
    setNativeValue(el, value);
    console.log(`[IPROTIC] Digitado em "${label}":`, value, '— aguardando sugestões...');

    return new Promise(resolve => {
      setTimeout(() => {
        const suggestion = document.querySelector(REFERENCE_SUGGESTION_SELECTOR);
        if (suggestion) {
          suggestion.click();
          console.log(`[IPROTIC] Sugestão selecionada para "${label}".`);
          resolve(true);
        } else {
          console.warn(`[IPROTIC] Nenhuma sugestão apareceu para "${label}". Ajuste REFERENCE_SUGGESTION_SELECTOR ou preencha manualmente.`);
          resolve(false);
        }
      }, 700);
    });
  }

  function clickSubmitButton() {
    const buttons = document.querySelectorAll('button, input[type="submit"], a.btn');
    for (const btn of buttons) {
      const text = normalize(btn.textContent || btn.value || '');
      if (SUBMIT_BUTTON_LABELS.some(l => text.includes(normalize(l)))) {
        btn.click();
        console.log('[IPROTIC] Botão de envio acionado automaticamente.');
        return true;
      }
    }
    console.warn('[IPROTIC] Botão de envio não encontrado para auto-submit.');
    return false;
  }

  // ──────────────────────────────────────────────────────────
  // LOOP PRINCIPAL — tenta preencher até conseguir ou desistir
  // ──────────────────────────────────────────────────────────
  async function tryFillOnce(data) {
    let anyFilled = false;
    anyFilled = fillSimpleField(FIELD_LABELS.tipoAtendimento, data.tipoAtendimento, 'Tipo de atendimento') || anyFilled;
    anyFilled = fillSimpleField(FIELD_LABELS.infoAdicional, data.infoAdicional, 'Informações adicionais') || anyFilled;
    const refFilled = await fillReferenceField(FIELD_LABELS.requester, data.requester, 'Solicitante / e-mail');
    anyFilled = refFilled || anyFilled;
    return anyFilled;
  }

  function waitAndFill(data, attempt = 0) {
    tryFillOnce(data).then(filledSomething => {
      if (filledSomething) {
        console.log('[IPROTIC] Preenchimento concluído (aba para:', data.requester + ').');
        if (AUTO_SUBMIT) {
          setTimeout(clickSubmitButton, 500);
        }
        return;
      }
      if (attempt >= MAX_ATTEMPTS) {
        console.warn('[IPROTIC] Não foi possível localizar os campos do formulário após várias tentativas. Verifique FIELD_LABELS.');
        return;
      }
      setTimeout(() => waitAndFill(data, attempt + 1), ATTEMPT_INTERVAL_MS);
    });
  }

  // ──────────────────────────────────────────────────────────
  // PONTO DE ENTRADA
  // ──────────────────────────────────────────────────────────
  const iproticData = getIproticData();
  if (iproticData) {
    console.log('[IPROTIC] Dados recebidos da automação:', iproticData);
    waitAndFill(iproticData);
  }
})();
