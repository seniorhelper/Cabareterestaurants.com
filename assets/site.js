/* Shared front-end for the restaurant guides. No tracking, no external calls except Leaflet/OSM tiles after a click. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function cfg(id) { var el = document.getElementById(id); if (!el) return null; try { return JSON.parse(el.textContent); } catch (e) { return null; } }

  /* ---------- mobile nav ---------- */
  var nb = $('.nav-btn'), nav = $('#site-nav');
  if (nb && nav) nb.addEventListener('click', function () {
    var open = nav.classList.toggle('open'); nb.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  /* ---------- toggle chips ---------- */
  $$('[data-chips]').forEach(function (group) {
    var single = group.getAttribute('data-chips') === 'single';
    $$('.chip', group).forEach(function (b) {
      if (!b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-pressed') !== 'true';
        if (single) $$('.chip', group).forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        group.dispatchEvent(new CustomEvent('chips:change', { bubbles: true }));
      });
    });
  });
  function picked(scope, key) {
    return $$('[data-k="' + key + '"] .chip[aria-pressed="true"]', scope).map(function (b) { return b.getAttribute('data-v'); });
  }
  function setPicked(scope, key, vals) {
    $$('[data-k="' + key + '"] .chip', scope).forEach(function (b) { b.setAttribute('aria-pressed', vals.indexOf(b.getAttribute('data-v')) > -1 ? 'true' : 'false'); });
  }

  /* ---------- restaurant list filter ---------- */
  $$('[data-filter]').forEach(function (box) {
    var list = document.getElementById(box.getAttribute('data-filter'));
    var count = $('[data-count]', box);
    function apply() {
      var areas = picked(box, 'area'), groups = picked(box, 'group');
      var n = 0;
      $$('.rcard', list).forEach(function (c) {
        var okA = !areas.length || areas.indexOf(c.getAttribute('data-area')) > -1;
        var g = (c.getAttribute('data-groups') || '').split(' ');
        var okG = !groups.length || groups.some(function (x) { return g.indexOf(x) > -1; });
        c.hidden = !(okA && okG); if (!c.hidden) n++;
      });
      if (count) count.textContent = n + (n === 1 ? ' place' : ' places') + ' shown';
    }
    var q0 = new URLSearchParams(location.search);
    ['area', 'group'].forEach(function (k) { if (q0.get(k)) setPicked(box, k, q0.get(k).split(',')); });
    box.addEventListener('chips:change', apply); apply();
  });

  /* ---------- perfect meal picker ---------- */
  var pk = $('[data-picker]');
  if (pk) {
    var conf = cfg('picker-config') || {};
    var out = $('[data-picker-out]', pk);
    var data = null;
    var keys = ['area', 'crave', 'mood', 'meal', 'diet', 'party'];
    // restore from URL
    var qs = new URLSearchParams(location.search);
    keys.forEach(function (k) { if (qs.get(k)) setPicked(pk, k, qs.get(k).split(',')); });
    function load(cb) {
      if (data) return cb();
      fetch('/data/restaurants.json').then(function (r) { return r.json(); }).then(function (j) { data = j.restaurants.filter(function (r) { return r.status === 'open'; }); cb(); })
        .catch(function () { out.innerHTML = '<p class="note">Could not load the restaurant data. Please reload the page.</p>'; });
    }
    function label(k, v) { return (conf.labels && conf.labels[k] && conf.labels[k][v]) || v; }
    function run(push) {
      var sel = {}; keys.forEach(function (k) { sel[k] = picked(pk, k); });
      if (push) {
        var p = new URLSearchParams(); keys.forEach(function (k) { if (sel[k].length) p.set(k, sel[k].join(',')); });
        var s = p.toString(); try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + '#picker'); } catch (e) { }
      }
      load(function () {
        var notes = [];
        var pool = data.slice();
        if (sel.area.length) {
          var near = {}; sel.area.forEach(function (a) { near[a] = 1; (conf.nearby && conf.nearby[a] || []).forEach(function (b) { near[b] = near[b] || 0.5; }); });
          pool = pool.filter(function (r) { return near[r.area]; });
          pool.forEach(function (r) { r._near = near[r.area]; });
        } else pool.forEach(function (r) { r._near = 1; });
        if (sel.crave.length) {
          var f = pool.filter(function (r) { var g = (r.tags && r.tags.groups) || []; return sel.crave.some(function (c) { return g.indexOf(c) > -1; }); });
          if (f.length) pool = f; else notes.push('Nothing in that area matches every craving, so these are the closest matches.');
        }
        pool.forEach(function (r) {
          var t = r.tags || {}, s = 0, why = [];
          if (r._near === 1 && sel.area.length) { s += 2; why.push(r.area_label); }
          else if (r._near === 0.5) { s += 0.5; why.push(r.area_label + ' (short ride)'); }
          var g = t.groups || [];
          sel.crave.forEach(function (c) { if (g.indexOf(c) > -1) { s += 3; why.push(label('crave', c)); } });
          sel.mood.forEach(function (m) { if ((t.moods || []).indexOf(m) > -1) { s += 3; why.push(label('mood', m)); } });
          sel.meal.forEach(function (m) { var ms = r.meals || []; if (ms.indexOf(m) > -1) { s += 2; why.push(label('meal', m)); } else if (ms.length) s -= 1; });
          sel.diet.forEach(function (d) { if ((t.diet || []).indexOf(d) > -1) { s += 4; why.push(label('diet', d) + ' (per sources)'); } });
          if (!why.length) why.push(r.cuisines.join(', '));
          r._s = s; r._why = why;
        });
        pool.sort(function (a, b) { return b._s - a._s || a.name.localeCompare(b.name); });
        var top = pool.slice(0, 5);
        if (sel.diet.length && !top.some(function (r) { return ((r.tags || {}).diet || []).length; }))
          notes.push('None of these places has a sourced ' + sel.diet.map(function (d) { return label('diet', d).toLowerCase(); }).join('/') + ' tag. Many dishes below are typically meat-free, but confirm with the restaurant.');
        if (sel.party.indexOf('6+') > -1) notes.push('For six or more, message or call ahead. We do not list seating capacity.');
        if (sel.meal.length) notes.push('Meal times come from the cited sources and change often; check current hours before you go.');
        var h = '';
        if (!top.length) h = '<p class="note">No matches. Try removing a filter.</p>';
        top.forEach(function (r, i) {
          h += '<div class="res"><h3>' + (i + 1) + '. <a href="' + esc(conf.listPage || '/restaurants/') + '#' + esc(r.slug) + '">' + esc(r.name) + '</a>' + (r.sponsored ? ' <span class="spons">Sponsored</span>' : '') + '</h3>' +
            '<p class="why">Why it matches: ' + esc(r._why.join(' · ')) + '</p><p>' + esc(r.summary_text) + '</p>' + (conf.save ? '<p><button type="button" class="chip" data-save="' + esc(r.name) + '">Save to my list</button></p>' : '') + '</div>';
        });
        // evening plan
        if (conf.evening && top.length) {
          var main = top[0];
          var same = data.filter(function (r) { return r.area === main.area && r.slug !== main.slug; });
          var pick = function (grp) { return same.filter(function (r) { return ((r.tags || {}).groups || []).some(function (g) { return grp.indexOf(g) > -1; }); })[0]; };
          var drink = pick(conf.evening.drinks || []), sweet = pick(conf.evening.sweet || []);
          h += '<div class="plan"><strong>Make it an evening in ' + esc(main.area_label) + '</strong><ol>' +
            '<li>' + (drink ? 'Start with a drink at <a href="' + esc(conf.listPage) + '#' + esc(drink.slug) + '">' + esc(drink.name) + '</a>' : 'Start with a sundowner on the waterfront nearby') + '</li>' +
            '<li>Dinner at <a href="' + esc(conf.listPage) + '#' + esc(main.slug) + '">' + esc(main.name) + '</a></li>' +
            '<li>' + (sweet ? 'Finish at <a href="' + esc(conf.listPage) + '#' + esc(sweet.slug) + '">' + esc(sweet.name) + '</a>' : 'Finish with a walk; we have no sourced dessert stop listed in this area yet') + '</li></ol></div>';
        }
        // dish ideas
        if (conf.dishes) {
          var want = sel.crave.length ? sel.crave : Object.keys(conf.dishes);
          var ds = []; want.forEach(function (c) { (conf.dishes[c] || []).forEach(function (d) { if (ds.length < 4 && ds.indexOf(d) < 0) ds.push(d); }); });
          if (sel.diet.length) ds = (conf.vegDishes || []).slice(0, 4);
          if (ds.length) h += '<div class="res"><h3>What to order</h3><ul>' + ds.map(function (d) { return '<li>' + d + '</li>'; }).join('') + '</ul><p class="why">Typical dishes, not a menu promise. Ask what is fresh today.</p></div>';
        }
        notes.forEach(function (n) { h += '<p class="note">' + esc(n) + '</p>'; });
        out.innerHTML = h;
        if (push && out.scrollIntoView) out.scrollIntoView({ block: 'nearest' });
      });
    }
    var go = $('[data-picker-go]', pk), clr = $('[data-picker-clear]', pk);
    if (go) go.addEventListener('click', function () { run(true); });
    if (clr) clr.addEventListener('click', function () { keys.forEach(function (k) { setPicked(pk, k, []); }); out.innerHTML = ''; try { history.replaceState(null, '', location.pathname); } catch (e) { } });
    if (location.search) run(false);
  }

  /* ---------- my list (save places) ---------- */
  var ml = $('[data-mylist]');
  if (ml) {
    var KEY = ml.getAttribute('data-mylist');
    var get = function () { try { return JSON.parse(store(KEY) || '[]'); } catch (e) { return []; } };
    var render = function () {
      var items = get(), box = $('[data-mylist-items]', ml);
      box.innerHTML = items.length ? '<ol>' + items.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ol>' : '<p class="muted">Nothing saved yet. Use "Save" on any result or card.</p>';
    };
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-save]'); if (!b) return;
      var items = get(), n = b.getAttribute('data-save');
      if (items.indexOf(n) < 0 && items.length < 12) items.push(n);
      store(KEY, JSON.stringify(items)); render(); b.textContent = 'Saved';
    });
    var pr = $('[data-mylist-print]', ml), cl = $('[data-mylist-clear]', ml), em = $('[data-mylist-email]', ml);
    if (pr) pr.addEventListener('click', function () { window.print(); });
    if (cl) cl.addEventListener('click', function () { store(KEY, '[]'); render(); });
    if (em) em.addEventListener('click', function () { location.href = 'mailto:?subject=' + encodeURIComponent(ml.getAttribute('data-title')) + '&body=' + encodeURIComponent(get().join('\n') + '\n\n' + location.origin); });
    render();
  }

  /* ---------- map (Leaflet + OSM, loaded on click only) ---------- */
  $$('[data-map]').forEach(function (wrap) {
    var btn = $('button', wrap), pts = cfg(wrap.getAttribute('data-map')) || [];
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.disabled = true; btn.textContent = 'Loading map...';
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = function () {
        var el = document.createElement('div'); el.id = 'map'; wrap.appendChild(el); btn.remove();
        var m = L.map(el, { scrollWheelZoom: false });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(m);
        var b = [];
        pts.forEach(function (p) { L.marker([p.lat, p.lng], { title: p.name, keyboard: true }).addTo(m).bindPopup('<strong>' + esc(p.name) + '</strong><br>' + esc(p.note || '') + (p.href ? '<br><a href="' + esc(p.href) + '">' + esc(p.link || 'See the guide') + '</a>' : '')); b.push([p.lat, p.lng]); });
        if (b.length > 1) m.fitBounds(b, { padding: [40, 40] }); else if (b.length) m.setView(b[0], 12);
      };
      s.onerror = function () { btn.disabled = false; btn.textContent = 'Map could not load. Try again'; };
      document.head.appendChild(s);
    });
  });

  /* ---------- tip & currency helpers ---------- */
  var tc = $('[data-tipcalc]');
  if (tc) {
    var mode = tc.getAttribute('data-tipcalc');
    var num = function (n) { var v = parseFloat(($('[name="' + n + '"]', tc) || {}).value); return isFinite(v) ? v : 0; };
    var chk = function (n) { var e = $('[name="' + n + '"]', tc); return e && e.checked; };
    var fmt = function (v, cur) { return cur + ' ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var o = $('[data-tip-out]', tc);
    var calc = function () {
      var sub = num('sub'), ppl = Math.max(1, Math.round(num('people')) || 1), extraPct = num('extra');
      var lines = [], total;
      if (mode === 'dr') {
        var add = chk('addtax');
        var serv = add ? sub * 0.10 : 0, tax = add ? sub * 0.18 : 0, extra = sub * extraPct / 100;
        total = sub + serv + tax + extra;
        if (add) { lines.push(['10% legal service charge (propina legal)', fmt(serv, 'RD$')]); lines.push(['18% ITBIS tax', fmt(tax, 'RD$')]); }
        lines.push(['Extra cash tip (' + extraPct + '%)', fmt(extra, 'RD$')]);
        lines.push(['Total', fmt(total, 'RD$')]); lines.push(['Each of ' + ppl, fmt(total / ppl, 'RD$')]);
        var rate = num('rate'); if (rate > 0) { lines.push(['Total in US dollars at your rate', fmt(total / rate, 'US$')]); lines.push(['Each in US dollars', fmt(total / rate / ppl, 'US$')]); }
      } else {
        var cur = ($('[name="cur"]', tc) || {}).value || 'BZD';
        var gst = chk('addgst') ? sub * 0.125 : 0, sc = sub * num('service') / 100, tip = sub * extraPct / 100;
        total = sub + gst + sc + tip;
        var sym = cur === 'BZD' ? 'BZ$' : 'US$';
        if (gst) lines.push(['12.5% GST', fmt(gst, sym)]);
        if (sc) lines.push(['Service charge on bill', fmt(sc, sym)]);
        lines.push(['Tip (' + extraPct + '%)', fmt(tip, sym)]);
        lines.push(['Total', fmt(total, sym)]); lines.push(['Each of ' + ppl, fmt(total / ppl, sym)]);
        var other = cur === 'BZD' ? total / 2 : total * 2; lines.push(['Same total in ' + (cur === 'BZD' ? 'US$' : 'BZ$') + ' (fixed 2:1)', fmt(other, cur === 'BZD' ? 'US$' : 'BZ$')]);
      }
      o.innerHTML = '<table><tbody>' + lines.map(function (l, i) { return '<tr' + (l[0] === 'Total' ? ' style="font-weight:700"' : '') + '><td>' + esc(l[0]) + '</td><td>' + esc(l[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
    };
    tc.addEventListener('input', calc); tc.addEventListener('change', calc); calc();
  }

  /* ---------- seafood season calendar ---------- */
  var sc = $('[data-season]');
  if (sc) {
    var seasons = cfg('season-config') || [];
    var sel = $('select', sc), res = $('[data-season-out]', sc);
    var names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var now = new Date().getMonth();
    if (sel) { sel.innerHTML = names.map(function (n, i) { return '<option value="' + i + '"' + (i === now ? ' selected' : '') + '>' + n + (i === now ? ' (this month)' : '') + '</option>'; }).join(''); }
    var show = function () {
      var m = sel ? parseInt(sel.value, 10) : now;
      res.innerHTML = seasons.map(function (s) {
        var open = s.open.indexOf(m) > -1;
        return '<div class="res"><h3>' + esc(s.name) + ': ' + (open ? 'in season' : 'closed season') + '</h3><p class="why">' + esc(open ? s.inText : s.outText) + '</p></div>';
      }).join('');
      $$('[data-month]', sc).forEach(function (c) { c.classList.toggle('now', parseInt(c.getAttribute('data-month'), 10) === m); });
    };
    if (sel) sel.addEventListener('change', show); show();
  }

  /* ---------- ingredient matcher (rental-kitchen helper) ---------- */
  var im = $('[data-ingredients]');
  if (im) {
    var rules = cfg('ingredient-rules') || [];
    var outI = $('[data-ingredients-out]', im);
    $('[data-ingredients-go]', im).addEventListener('click', function () {
      var have = picked(im, 'ing');
      if (!have.length) { outI.innerHTML = '<p class="note">Tap a few ingredients first.</p>'; return; }
      var hit = null;
      rules.some(function (r) { var ok = r.all.every(function (x) { return have.indexOf(x) > -1; }) && (!r.any || r.any.some(function (x) { return have.indexOf(x) > -1; })); if (ok) hit = r; return ok; });
      outI.innerHTML = hit ? '<div class="res"><h3>' + esc(hit.dish) + '</h3><p>' + esc(hit.text) + '</p>' + (hit.href ? '<p><a href="' + esc(hit.href) + '">' + esc(hit.link) + '</a></p>' : '') + '</div>'
        : '<div class="res"><h3>Your own North Coast creation</h3><p>No classic match for those ' + have.length + ' ingredients. Garlic, onion and cilantro form the base of most Dominican cooking, so add them and build from there.</p></div>';
    });
    var ic = $('[data-ingredients-clear]', im); if (ic) ic.addEventListener('click', function () { setPicked(im, 'ing', []); outI.innerHTML = ''; });
  }

  /* ---------- dish tracker (tried-it list) ---------- */
  var dt = $('[data-tried]');
  if (dt) {
    var TK = dt.getAttribute('data-tried'), saved = []; try { saved = JSON.parse(store(TK) || '[]'); } catch (e) { }
    var boxes = $$('input[type="checkbox"]', dt), meter = $('[data-tried-out]', dt);
    var upd = function () { var n = boxes.filter(function (b) { return b.checked; }).length; meter.textContent = n + ' of ' + boxes.length + ' tried'; store(TK, JSON.stringify(boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; }))); };
    boxes.forEach(function (b) { b.checked = saved.indexOf(b.value) > -1; b.addEventListener('change', upd); });
    upd();
  }


  /* ---------- dish search (decoder) ---------- */
  var ds = $('[data-dishsearch]');
  if (ds) {
    var inp = $('input', ds), cardsD = $$('[data-dish]'), cnt = $('[data-dish-count]', ds);
    var f = function () {
      var q = (inp.value || '').toLowerCase().trim(), n = 0;
      cardsD.forEach(function (c) { var ok = !q || c.textContent.toLowerCase().indexOf(q) > -1; c.hidden = !ok; if (ok) n++; });
      if (cnt) cnt.textContent = n + ' dishes';
    };
    var q1 = new URLSearchParams(location.search).get('q'); if (q1) inp.value = q1;
    inp.addEventListener('input', f); f();
  }

  /* ---------- Belizean meal builder ---------- */
  var mb = $('[data-mealbuilder]');
  if (mb) {
    var D = cfg('dish-data') || [], outM = $('[data-meal-out]', mb);
    $('[data-meal-go]', mb).addEventListener('click', function () {
      var time = picked(mb, 'time')[0] || 'lunch', cult = picked(mb, 'culture'), diet = picked(mb, 'diet'), adv = picked(mb, 'adv')[0] || 'classic';
      var ok = function (d) {
        if (cult.length && cult.indexOf(d.culture) < 0) return false;
        if (diet.indexOf('veg') > -1 && !d.veg) return false;
        if (diet.indexOf('gf') > -1 && !d.gf) return false;
        if (adv === 'classic' && d.adventurous) return false;
        return true;
      };
      var used = {};
      var pick = function (role) {
        var c = D.filter(function (d) { return !used[d.name] && d.roles.indexOf(role) > -1 && d.times.indexOf(time) > -1 && ok(d); });
        if (!c.length) c = D.filter(function (d) { return !used[d.name] && d.roles.indexOf(role) > -1 && d.times.indexOf(time) > -1 && (!diet.length || ((diet.indexOf('veg') < 0 || d.veg) && (diet.indexOf('gf') < 0 || d.gf))); });
        if (!c.length) return null;
        if (adv === 'adventurous') { var a = c.filter(function (d) { return d.adventurous; }); if (a.length) c = a; }
        var r = c[Math.floor(Math.random() * c.length)]; used[r.name] = 1; return r;
      };
      var parts = [['Start with', 'starter'], ['Main', 'main'], ['To drink or finish', 'finish']];
      var h = '<div class="res"><h3>Your Belizean ' + esc(time) + '</h3><ol>';
      parts.forEach(function (p) { var d = pick(p[1]); if (d) h += '<li><strong>' + esc(p[0]) + ':</strong> <a href="' + esc(d.href) + '">' + esc(d.name) + '</a> (' + esc(d.cultureLabel) + '). ' + esc(d.short) + (d.season ? ' <em>' + esc(d.season) + '</em>' : '') + '</li>'; });
      h += '</ol><p class="why">Press again for a different combination. "Typically vegetarian" or "usually gluten-free" are general notes; confirm with the cook.</p></div>';
      var where = {}; cult.forEach(function (c) { where[c] = 1; });
      h += '<p class="note">Where to eat it: our sister site lists named restaurants by town at <a href="https://bestrestaurantsbelize.com/restaurants/">bestrestaurantsbelize.com</a>.</p>';
      outM.innerHTML = h;
    });
  }

  /* ---------- contact forms (FormSubmit AJAX, address assembled at runtime) ---------- */
  var T0 = Date.now();
  function addr(el) { return atob(el.getAttribute('data-a')) + String.fromCharCode(64) + atob(el.getAttribute('data-b')); }
  $$('a.eml[data-a]').forEach(function (a) { var e = addr(a), sj = a.getAttribute('data-s'); a.href = 'mailto:' + e + (sj ? '?subject=' + encodeURIComponent(sj) : ''); if (!a.textContent.trim()) a.textContent = e; });
  $$('form[data-a][data-b]').forEach(function (form) {
    var st = $('.fs-status', form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var hp = $('[name="_honey"]', form); if (hp && hp.value) return;
      if (Date.now() - T0 < 3500) { st.textContent = 'Give the form a moment, then send again.'; return; }
      var req = $$('[required]', form);
      for (var i = 0; i < req.length; i++) { if (!String(req[i].value || '').trim()) { st.textContent = 'Please fill in the required fields.'; req[i].focus(); return; } }
      var b = $('[type="submit"]', form); if (b) b.disabled = true; st.textContent = 'Sending...';
      fetch('https://formsubmit.co/ajax/' + addr(form), { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form) })
        .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
        .then(function (d) { if (d && String(d.success) === 'false') throw new Error('fs'); st.textContent = "Sent. We'll get back to you shortly."; form.reset(); })
        .catch(function () { st.innerHTML = 'That did not go through. Please email <a href="mailto:' + addr(form) + '">' + addr(form) + '</a>.'; })
        .then(function () { if (b) b.disabled = false; });
    });
  });
})();
