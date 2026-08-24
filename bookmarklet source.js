/* ============================================================
   IPROTIC — Bookmarklet de auto-preenchimento ServiceNow
   (alternativa ao Tampermonkey, para PCs corporativos que
   bloqueiam instalação de extensões de navegador)
   ============================================================

   Este arquivo é a versão "legível" do bookmarklet. Ele NÃO deve
   ser instalado diretamente — use o link "Instalar bookmarklet"
   gerado a partir dele (ver bookmarklet.html), que já vem no
   formato javascript:... pronto para arrastar para a barra de
   favoritos.

   Como usar: depois de instalado como favorito, o analista clica
   nessa aba (favorito) enquanto estiver na aba do ServiceNow aberta
   pelo site IPROTIC — o script lê os dados da própria URL da aba
   (os mesmos parâmetros iprotic_* que o userscript do Tampermonkey
   já usa) e preenche os campos correspondentes.
*/
(function () {
  'use strict';

  var FIELD_LABELS = {
    requester: ['solicitado para', 'e-mail do usuário', 'usuário', 'requested for', 'chave do usuário'],
    tipoAtendimento: ['tipo de atendimento'],
    infoAdicional: ['descrição', 'observações', 'informações adicionais']
  };

  var LABEL_SELECTOR = 'label, .form-group label, [class*="label"]';
  var REFERENCE_SUGGESTION_SELECTOR = '.dropdown-menu li a, .ui-autocomplete li, [role="option"], .list-group-item';
  var MAX_ATTEMPTS = 8;
  var ATTEMPT_INTERVAL_MS = 400;

  function getIproticData() {
    var p = new URLSearchParams(window.location.search);
    if (!p.has('iprotic_requester')) return null;
    return {
      requester: p.get('iprotic_requester') || '',
      tipoAtendimento: p.get('iprotic_tipo_atendimento') || '',
      infoAdicional: p.get('iprotic_info_adicional') || ''
    };
  }

  function normalize(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\*/g, '')
      .trim();
  }

  function labelMatches(labelText, candidates) {
    var norm = normalize(labelText);
    return candidates.some(function (c) { return norm.indexOf(normalize(c)) !== -1; });
  }

  function findFieldByLabel(candidates) {
    var labels = document.querySelectorAll(LABEL_SELECTOR);
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      if (!labelMatches(label.textContent, candidates)) continue;
      var forAttr = label.getAttribute('for');
      if (forAttr) {
        var el = document.getElementById(forAttr);
        if (el) return el;
      }
      var container = label.closest('.form-group') || label.parentElement;
      if (container) {
        var el2 = container.querySelector('input, select, textarea');
        if (el2) return el2;
      }
    }
    return null;
  }

  function setNativeValue(el, value) {
    var proto = Object.getPrototypeOf(el);
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    setter = setter && setter.set;
    if (setter) { setter.call(el, value); } else { el.value = value; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function fillSimpleField(candidates, value) {
    if (!value) return false;
    var el = findFieldByLabel(candidates);
    if (!el) return false;
    setNativeValue(el, value);
    return true;
  }

  function fillReferenceField(candidates, value, done) {
    if (!value) { done(false); return; }
    var el = findFieldByLabel(candidates);
    if (!el) { done(false); return; }
    setNativeValue(el, value);
    setTimeout(function () {
      var suggestion = document.querySelector(REFERENCE_SUGGESTION_SELECTOR);
      if (suggestion) { suggestion.click(); done(true); } else { done(false); }
    }, 700);
  }

  function tryFillOnce(data, done) {
    var any = false;
    any = fillSimpleField(FIELD_LABELS.tipoAtendimento, data.tipoAtendimento) || any;
    any = fillSimpleField(FIELD_LABELS.infoAdicional, data.infoAdicional) || any;
    fillReferenceField(FIELD_LABELS.requester, data.requester, function (refFilled) {
      done(refFilled || any);
    });
  }

  function waitAndFill(data, attempt) {
    attempt = attempt || 0;
    tryFillOnce(data, function (filled) {
      if (filled) return;
      if (attempt >= MAX_ATTEMPTS) {
        window.alert('IPROTIC: não encontrei os campos do formulário. Preencha manualmente ou avise o responsável pela automação.');
        return;
      }
      setTimeout(function () { waitAndFill(data, attempt + 1); }, ATTEMPT_INTERVAL_MS);
    });
  }

  var data = getIproticData();
  if (!data) {
    window.alert('IPROTIC: esta aba não tem dados da automação (abra pelo botão "Enviar Chamados" do site IPROTIC).');
    return;
  }
  waitAndFill(data);
})();
