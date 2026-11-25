// Errori prima che l'app parta (1.77.0): script normale (non modulo) caricato per primo da index.html.
// Se un file dell'app non si carica o non si legge (es. un telefono con il browser vecchio), i moduli non partono affatto
// e js/errori.js non c'è ancora: l'errore si mette da parte qui, nel dispositivo, e js/errori.js lo ripulisce e lo salva
// alla prima apertura che va. Il testo grezzo resta solo nel dispositivo (localStorage), al massimo 20 righe.
(function () {
  var CODA = 'ces.errori.coda';
  function metti(o) {
    if (window.cesErroriPronto) return;   // da qui in poi li raccoglie js/errori.js
    try {
      var a = JSON.parse(localStorage.getItem(CODA) || '[]');
      if (!Array.isArray(a) || a.length >= 20) return;
      o.quando = new Date().toISOString(); a.push(o);
      localStorage.setItem(CODA, JSON.stringify(a));
    } catch (e) { }
  }
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) {
      if (t.tagName === 'SCRIPT' || (t.tagName === 'LINK' && /stylesheet/i.test(t.rel || ''))) metti({ tipo: 'file', file: String(t.src || t.href || '') });
      return;
    }
    var er = e.error;
    metti({ tipo: 'errore', nome: er && er.name ? String(er.name) : '', msg: String((er && er.message) || e.message || ''), pila: String((er && er.stack) || ''), file: String(e.filename || ''), riga: e.lineno || 0 });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    metti({ tipo: 'promessa', nome: r && r.name ? String(r.name) : '', msg: String((r && r.message) || r || ''), pila: String((r && r.stack) || '') });
  });
})();
