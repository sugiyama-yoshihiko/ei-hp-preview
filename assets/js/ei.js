/* Native scrolling, stable navigation and accessible contact interactions. */
(function () {
  'use strict';
  var doc = document;
  var root = doc.documentElement;
  root.classList.remove('no-js', 'navin', 'anim', 'intro');
  function $(s, scope) { return (scope || doc).querySelector(s); }
  function $$(s, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(s)); }
  var nav = $('.nav');
  var sections = $$('[data-mark]');
  var ticks = $('.railbar__ticks');
  var sectionLabels = {
    Index: '概要', Intro: 'ページの先頭', Philosophy: '理念', Business: '事業',
    Figures: '会社と事業の概要', Works: '実績', Update: 'お知らせ', Recruit: '採用',
    Contact: 'お問い合わせ', Mission: 'ミッション', Message: '代表メッセージ',
    Company: '会社概要', Network: '連携体制', Overview: '事業概要', Modes: '参画形態',
    Value: '支援内容', Process: '進め方', Cases: '事例', 'Other Works': 'ほかの支援領域',
    Culture: '働き方', Positions: '募集職種', Benefits: '働く環境', Apply: '応募',
    News: 'お知らせ一覧', Inquiry: 'お問い合わせフォーム', Access: '所在地', Policy: '個人情報保護方針'
  };
  if (ticks) sections.forEach(function (section) {
    var button = doc.createElement('button');
    button.type = 'button'; button.className = 'railbar__tick';
    var mark = section.getAttribute('data-mark');
    button.setAttribute('aria-label', sectionLabels[mark] || mark);
    button.addEventListener('click', function () {
      section.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    ticks.appendChild(button); section._tick = button;
  });
  var pending = false;
  function updatePosition() {
    pending = false;
    if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 12);
    var active = sections[0];
    sections.forEach(function (section) {
      if (section.getBoundingClientRect().top < window.innerHeight * .38) active = section;
    });
    sections.forEach(function (section) {
      if (!section._tick) return;
      if (section === active) section._tick.setAttribute('aria-current', 'true');
      else section._tick.removeAttribute('aria-current');
    });
  }
  function schedulePosition() {
    if (!pending) { pending = true; requestAnimationFrame(updatePosition); }
  }
  window.addEventListener('scroll', schedulePosition, { passive: true });
  window.addEventListener('resize', schedulePosition, { passive: true });
  updatePosition();

  var burger = $('.nav__burger');
  var menu = $('.menu');
  var menuOpen = false;
  var background = $$('main, footer, .railbar');
  if (burger && menu) {
    function setMenu(open, restoreFocus) {
      menuOpen = open;
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      menu.classList.toggle('is-open', open);
      menu.inert = !open;
      background.forEach(function (el) { el.inert = open; });
      doc.body.style.overflow = open ? 'hidden' : '';
      if (open) { var first = $('a', menu); if (first) first.focus(); }
      else if (restoreFocus) burger.focus();
    }
    burger.addEventListener('click', function () { setMenu(!menuOpen, menuOpen); });
    $$('a', menu).forEach(function (link) {
      link.addEventListener('click', function () { setMenu(false, false); });
    });
    doc.addEventListener('keydown', function (event) {
      if (!menuOpen) return;
      if (event.key === 'Escape') { event.preventDefault(); setMenu(false, true); return; }
      if (event.key !== 'Tab') return;
      var focusable = [burger].concat($$('a[href],button:not([disabled])', menu));
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    window.addEventListener('resize', function () {
      if (menuOpen && window.innerWidth > 960) setMenu(false, false);
    }, { passive: true });
  }
  var year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  var form = $('#contact-form');
  if (!form) return;
  var query = new URLSearchParams(window.location.search);
  var subject = query.get('subject');
  subject = ({dx:'ai',ma:'capital'})[subject] || subject;
  var select = $('[name="subject"]', form);
  if (subject && select && Array.prototype.some.call(select.options, function (option) { return option.value === subject; })) select.value = subject;
  var position = query.get('position');
  var message = $('[name="message"]', form);
  if (position && message && !message.value) message.value = '応募ポジション：' + position + '\n\n';
  var busy = false;
  form.addEventListener('submit', function (event) {
    if (!window.fetch) return;
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    var button = $('button[type="submit"]', form);
    var original = button ? button.innerHTML : '';
    if (button) { button.disabled = true; button.textContent = '送信中…'; }
    var oldError = $('.form-error', form);
    if (oldError) oldError.remove();
    fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('Request failed');
        form.hidden = true;
        var lead = $('#contact-lead');
        if (lead) lead.hidden = true;
        var thanks = $('#contact-thanks');
        if (thanks) { thanks.hidden = false; thanks.setAttribute('tabindex', '-1'); thanks.focus(); }
      })
      .catch(function () {
        var error = doc.createElement('p');
        error.className = 'form-error'; error.setAttribute('role', 'alert');
        error.textContent = '送信できませんでした。再度お試しいただくか、info@ei-and.co.jp へご連絡ください。';
        form.appendChild(error);
      })
      .finally(function () {
        busy = false;
        if (button) { button.disabled = false; button.innerHTML = original; }
      });
  });
})();
