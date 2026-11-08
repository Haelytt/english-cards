// Локальная версия: без аккаунта Claude данные хранятся в localStorage браузера
if (typeof claude === "undefined") document.documentElement.classList.add("local");

const KEY = "english-modules-v2", OLD = "english-cards-v1";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const seed = () => [
  {id:uid(), name:"Основные слова", cards:[
    {w:"serendipity", t:"счастливая случайность"},{w:"reliable", t:"надёжный"},
    {w:"to figure out", t:"разобраться, понять"},{w:"although", t:"хотя"},{w:"breakthrough", t:"прорыв"}]},
  {id:uid(), name:"В путешествии", cards:[
    {w:"luggage", t:"багаж"},{w:"boarding pass", t:"посадочный талон"},
    {w:"delay", t:"задержка"},{w:"to book", t:"бронировать"}]}
];
let mods = null;
try {
  const s = localStorage.getItem(KEY);
  if (s) mods = JSON.parse(s);
  else {
    const o = localStorage.getItem(OLD);
    mods = seed();
    if (o) { const oc = JSON.parse(o); if (Array.isArray(oc) && oc.length) mods.unshift({id:uid(), name:"Мои слова", cards:oc}); }
  }
} catch (e) {}
if (!Array.isArray(mods)) mods = seed();

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mods)); } catch (e) {} cloudSave(); };
const plural = n => { const a = n % 10, b = n % 100; return (a === 1 && b !== 11) ? "слово" : (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? "слова" : "слов"; };

let cur = null, idx = 0, sure = false;

function renderLib(){
  $("mods").innerHTML = mods.length ? mods.map(m => {
    const n = m.cards.length;
    const pv = m.cards.slice(0, 3).map(c => c.w).join(", ");
    return '<button class="mod" data-id="' + m.id + '"><span><b>' + esc(m.name) + '</b><small>' +
      (pv ? esc(pv) + (n > 3 ? "…" : "") : "Пока пусто") + '</small></span><i>' + n + '</i></button>';
  }).join("") : '<div class="empty">Модулей пока нет. Создайте первый ниже.</div>';
}
$("mods").onclick = e => { const b = e.target.closest(".mod"); if (b) location.hash = "m-" + b.dataset.id; };
function addMod(){
  const n = $("mn").value.trim();
  if (!n) { $("mn").focus(); return; }
  const m = {id:uid(), name:n, cards:[]};
  mods.push(m); save(); $("mn").value = "";
  location.hash = "m-" + m.id;
}
$("mAdd").onclick = addMod;
$("mn").addEventListener("keydown", e => { if (e.key === "Enter") addMod(); });

function renderCard(){
  const n = cur.cards.length;
  $("sub").textContent = n + " " + plural(n);
  $("start").disabled = !n; $("learn").disabled = !n;
  $("start").textContent = n ? "Учить слова" : "Добавьте слова, чтобы начать";
}
let editIdx = -1;
const escA = v => esc(v).replace(/"/g, "&quot;");
const PEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
function renderList(){
  $("list").innerHTML = cur.cards.map((c, i) => i === editIdx
    ? '<li class="ed"><input class="ei" id="ew" value="' + escA(c.w) + '" placeholder="Слово" autocomplete="off" autocapitalize="off">' +
      '<input class="ei" id="et" value="' + escA(c.t) + '" placeholder="Перевод" autocomplete="off">' +
      '<div class="eact"><button class="b pri sm" data-act="save">Сохранить</button><button class="b sm" data-act="cancel">Отмена</button></div></li>'
    : '<li><span class="w">' + esc(c.w) + '</span><span class="t">' + esc(c.t) + '</span>' +
      '<button class="ico" data-act="edit" data-i="' + i + '" aria-label="Изменить ' + escA(c.w) + '">' + PEN + '</button>' +
      '<button data-act="del" data-i="' + i + '" aria-label="Удалить ' + escA(c.w) + '">×</button></li>').join("");
}
function renderStudy(){ renderCard(); renderList(); }

let q = [], total = 0, rep = 0, drag = null, busy = false;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
$("start").onclick = () => { location.hash = "s-" + cur.id; };
function beginStudy(){
  q = cur.cards.slice();
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  total = q.length; rep = 0;
  $("fs").classList.remove("hidden"); document.body.style.overflow = "hidden";
  showCard();
}
function endStudy(){ $("fs").classList.add("hidden"); document.body.style.overflow = ""; }
function flip(){ const c = $("card"); if (c) c.classList.toggle("flip"); }
function showCard(){
  busy = false; drag = null;
  const st = $("fstage");
  $("bar").style.width = (total ? (total - q.length) / total * 100 : 0) + "%";
  $("left").textContent = q.length ? "осталось " + q.length : "";
  $("acts").classList.toggle("hidden", !q.length);
  if (!q.length) {
    st.innerHTML = '<div class="done"><h1>Готово</h1><p class="sub">Выучено слов: ' + total + '. Повторов: ' + rep + '.</p>' +
      '<button class="b pri" id="again">Пройти ещё раз</button><button class="b" id="fin">К модулю</button></div>';
    $("again").onclick = beginStudy; $("fin").onclick = closeStudy; return;
  }
  const c = q[0];
  st.innerHTML = '<div class="sw" id="sw"><span class="tag ok" id="tok">Знаю</span><span class="tag no" id="tno">Повторить</span>' +
    '<div class="card" id="card"><div class="face"><div class="word">' + esc(c.w) + '</div><div class="hint">Нажмите, чтобы увидеть перевод</div></div>' +
    '<div class="face bk"><div class="word">' + esc(c.t) + '</div><div class="hint">' + esc(c.w) + '</div></div></div></div>';
  const sw = $("sw");
  sw.onpointerdown = e => {
    if (busy) return;
    drag = {x: e.clientX, y: e.clientY, dx: 0, dy: 0};
    try { sw.setPointerCapture(e.pointerId); } catch (_) {}
    sw.style.transition = "none";
  };
  sw.onpointermove = e => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y;
    sw.style.transform = "translate(" + drag.dx + "px," + drag.dy * 0.3 + "px) rotate(" + drag.dx / 20 + "deg)";
    $("tok").style.opacity = clamp(drag.dx / 90, 0, 1);
    $("tno").style.opacity = clamp(-drag.dx / 90, 0, 1);
  };
  sw.onpointerup = sw.onpointercancel = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (Math.abs(d.dx) > 90) { decide(d.dx > 0); return; }
    sw.style.transition = "transform .2s";
    sw.style.transform = ""; $("tok").style.opacity = 0; $("tno").style.opacity = 0;
    if (Math.abs(d.dx) < 8 && Math.abs(d.dy) < 8) flip();
  };
}
function decide(known){
  if (busy || !q.length) return; busy = true;
  const sw = $("sw"), dir = known ? 1 : -1;
  sw.style.transition = "transform .25s ease-in, opacity .25s";
  sw.style.transform = "translateX(" + dir * window.innerWidth + "px) rotate(" + dir * 18 + "deg)";
  sw.style.opacity = 0;
  setTimeout(() => {
    const c = q.shift();
    if (!known) { q.push(c); rep++; }
    showCard();
  }, 240);
}
function closeStudy(){ location.hash = "m-" + cur.id; }
$("ok").onclick = () => decide(true);
$("no").onclick = () => decide(false);
$("x").onclick = closeStudy;
function add(){
  const w = $("w").value.trim(), t = $("t").value.trim();
  if (!w || !t) { (w ? $("t") : $("w")).focus(); return; }
  cur.cards.push({w, t}); idx = cur.cards.length - 1; save();
  $("w").value = ""; $("t").value = ""; $("w").focus(); renderStudy();
}
$("addBtn").onclick = add;
[$("w"), $("t")].forEach(el => el.addEventListener("keydown", e => { if (e.key === "Enter") add(); }));
function saveEdit(){
  const w = $("ew").value.trim(), t = $("et").value.trim();
  if (!w || !t) { (w ? $("et") : $("ew")).focus(); return; }
  cur.cards[editIdx] = {w, t}; editIdx = -1; save(); renderStudy();
}
$("list").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  const act = b.dataset.act, i = +b.dataset.i;
  if (act === "edit") { editIdx = i; renderList(); $("ew").focus(); }
  else if (act === "cancel") { editIdx = -1; renderList(); }
  else if (act === "save") saveEdit();
  else if (act === "del") { cur.cards.splice(i, 1); editIdx = -1; save(); renderStudy(); }
};
$("list").addEventListener("keydown", e => {
  if (!e.target.classList.contains("ei")) return;
  if (e.key === "Enter") saveEdit();
  if (e.key === "Escape") { editIdx = -1; renderList(); }
});
$("back").onclick = () => { location.hash = "lib"; };
$("del").onclick = () => {
  if (!sure) { sure = true; $("del").textContent = "Нажмите ещё раз, чтобы удалить модуль"; $("del").classList.add("sure"); return; }
  if (dbh && mine.some(m => m.id === cur.id)) writeMine(mine.filter(m => m.id !== cur.id));
  mods = mods.filter(m => m !== cur); save(); location.hash = "lib";
};
document.addEventListener("keydown", e => {
  if (!cur || $("fs").classList.contains("hidden")) return;
  if (e.key === "ArrowRight") decide(true);
  else if (e.key === "ArrowLeft") decide(false);
  else if (e.key === " ") { e.preventDefault(); flip(); }
  else if (e.key === "Escape") closeStudy();
});

function route(){
  const h = location.hash.slice(1), mm = /^([msl])-([a-z0-9]+)$/.exec(h);
  const m = mm ? mods.find(x => x.id === mm[2]) : null;
  if (!m) {
    cur = null; endStudy(); endLearn();
    $("study").classList.add("hidden"); $("lib").classList.remove("hidden");
    renderLib(); renderOthers(); window.scrollTo(0, 0); return;
  }
  if (cur !== m) {
    cur = m; sure = false; editIdx = -1;
    $("del").textContent = "Удалить модуль"; $("del").classList.remove("sure");
    $("title").textContent = m.name;
    $("lib").classList.add("hidden"); $("study").classList.remove("hidden");
    window.scrollTo(0, 0);
  }
  renderStudy(); renderShare();
  if (mm[1] === "s" && m.cards.length) { endLearn(); beginStudy(); }
  else if (mm[1] === "l" && m.cards.length) { endStudy(); beginLearn(); }
  else { endStudy(); endLearn(); }
}
window.addEventListener("hashchange", route);
let cloud = null, who = "", accState = "connecting", accErr = false, accReason = "", saveT = null, saving = false, dirty = false;
function renderAcc(){
  const me = $("me");
  me.textContent = accState === "in" ? (who || "Аккаунт") : accState === "connecting" ? "Подключение…" : "Войти";
  me.className = "me" + (accState === "in" ? " on" : "");
  let h;
  if (accState === "in") {
    h = '<b>' + esc(who || "Аккаунт Claude") + '</b><p>Вы вошли. Модули и слова хранятся в вашем аккаунте и доступны на всех устройствах, где вы открываете этот сайт.</p>' +
        (accErr ? '<p class="err">Не удалось сохранить в аккаунт. Слова остались на этом устройстве, изменения отправятся при следующем сохранении.</p>' : '');
  } else if (accState === "connecting") {
    h = '<p>Проверяем вход…</p>';
  } else {
    const why = accReason === "denied"
      ? 'Доступ к аккаунту отклонён. Разрешите его в настройках страницы, затем нажмите «Войти» ещё раз.'
      : accReason === "unavailable"
      ? 'Вход недоступен в этом окне: сайт должен быть открыт в claude.ai или в приложении Claude под вашим аккаунтом.'
      : accReason ? 'Не удалось войти: ' + esc(accReason) + '.'
      : 'Вход выполняется через аккаунт Claude.';
    h = '<b>Вы гость</b><p>' + why + ' Пока вы гость, слова сохраняются только на этом устройстве.</p>' +
        (accReason === "denied" ? '<p><button class="b" id="perm">Открыть настройки доступа</button></p>' : '') +
        '<button class="b pri" id="retry">Войти</button>';
  }
  $("acc").innerHTML = h;
}
async function connect(manual){
  accState = "connecting"; accReason = ""; renderAcc();
  try {
    const perms = await claude.use("permissions");
    if (perms) {
      let st = await perms.state();
      if (manual && (st.db === "prompt" || st.user === "prompt")) st = await perms.request(["db", "user"]);
      if (st.db === "denied" || st.user === "denied") { accReason = "denied"; throw new Error("denied"); }
    }
    const [u, d] = await Promise.all([claude.use("user"), claude.use("db")]);
    const id = u ? await u.id() : null;
    if (!u || !d || !id) { accReason = "unavailable"; throw new Error("unavailable"); }
    let name = ""; try { name = (await u.me()).name || ""; } catch (_) {}
    const ref = d.doc("data/users/" + id + "/library");
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;
    if (data && typeof data.json === "string") {
      const m = JSON.parse(data.json);
      if (Array.isArray(m)) {
        mods = m; cur = null;
        try { localStorage.setItem(KEY, JSON.stringify(mods)); } catch (_) {}
        route();
      }
    } else {
      await ref.set({json: JSON.stringify(mods)});
    }
    dbh = d; myId = id; startShared(u);
    cloud = ref; who = name; accState = "in"; accErr = false;
  } catch (e) {
    cloud = null; accState = "out";
    if (!accReason) accReason = (e && (e.code || e.message)) ? String(e.code || e.message).slice(0, 80) : "ошибка";
  }
  renderAcc();
}
function cloudSave(){
  if (!cloud) return;
  dirty = true; clearTimeout(saveT); saveT = setTimeout(flush, 600);
}
async function flush(){
  if (saving) { saveT = setTimeout(flush, 300); return; }
  if (!dirty || !cloud) return;
  saving = true; dirty = false;
  try { await cloud.set({json: JSON.stringify(mods)}); accErr = false; } catch (e) { accErr = true; }
  saving = false; renderAcc();
}
$("me").onclick = () => $("acc").classList.toggle("hidden");
$("acc").onclick = async e => {
  if (e.target.id === "retry") connect(true);
  if (e.target.id === "perm") {
    try { const perms = await claude.use("permissions"); if (perms) await perms.manage(); } catch (_) {}
    connect(true);
  }
};

let L = null;
const norm = v => String(v).trim().toLowerCase().replace(/\s+/g, " ");
const shuf = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
$("learn").onclick = () => { location.hash = "l-" + cur.id; };
$("lx").onclick = () => closeStudy();
function beginLearn(){
  L = {terms: cur.cards.map(c => ({c, stage: 0})), last: null, ok: 0, tries: 0, streak: 0, cur: null, locked: false, mode: "c", opts: [], right: 0};
  $("ln").classList.remove("hidden"); document.body.style.overflow = "hidden";
  nextQ();
}
function endLearn(){
  $("ln").classList.add("hidden"); L = null;
  if ($("fs").classList.contains("hidden")) document.body.style.overflow = "";
}
function lprog(){
  const total = L.terms.length * 2, done = L.terms.reduce((a, t) => a + t.stage, 0), pct = done / total * 100;
  $("lfill").style.width = pct + "%"; $("lbadge").style.left = pct + "%";
  $("lbadge").textContent = done; $("lend").textContent = total;
  $("lbar").classList.toggle("hot", L.streak >= 3);
}
function advance(){ if (L && L.locked) nextQ(); }
function nextQ(){
  if (!L) return;
  lprog();
  const open = L.terms.filter(t => t.stage < 2);
  if (!open.length) return learnDone();
  let pool = open.filter(t => t !== L.last); if (!pool.length) pool = open;
  const t = pool[Math.floor(Math.random() * pool.length)];
  L.cur = t; L.last = t; L.locked = false;
  if (t.stage === 0) renderChoice(t); else renderTyped(t);
}
function renderChoice(t){
  const right = t.c.t, seen = new Set([norm(right)]), d = [];
  for (const o of shuf(L.terms)) {
    if (!seen.has(norm(o.c.t))) { seen.add(norm(o.c.t)); d.push(o.c.t); }
    if (d.length === 3) break;
  }
  if (!d.length) return renderTyped(t);
  const opts = shuf([right].concat(d));
  L.opts = opts; L.right = opts.indexOf(right); L.mode = "c";
  $("lbody").innerHTML = '<div class="lcard"><div class="llab">Слово</div><div class="lq">' + esc(t.c.w) + '</div>' +
    '<div class="llab sp">Выберите перевод</div><div class="opts">' +
    opts.map((o, i) => '<button class="opt" data-i="' + i + '"><b>' + (i + 1) + '</b><span>' + esc(o) + '</span></button>').join("") +
    '</div><div class="lact"><button class="skip" id="skip">Не уверены?</button></div><div id="lfb"></div></div>';
}
function renderTyped(t){
  L.mode = "t";
  $("lbody").innerHTML = '<div class="lcard"><div class="llab">Перевод</div><div class="lq">' + esc(t.c.t) + '</div>' +
    '<div class="llab sp">Введите слово по-английски</div><input class="lin" id="lin" placeholder="Введите ответ" autocomplete="off" autocapitalize="off" spellcheck="false">' +
    '<div class="lact"><button class="skip" id="skip">Не уверены?</button><button class="b pri" id="sub">Ответить</button></div><div id="lfb"></div></div>';
  $("lin").focus();
}
function grade(ok){
  const t = L.cur; L.tries++;
  if (ok) { L.ok++; L.streak++; t.stage = Math.min(2, t.stage + 1); } else { L.streak = 0; t.stage = 0; }
  lprog();
}
function showFb(ok, ans){
  const fb = $("lfb");
  if (ok) { fb.innerHTML = '<p class="fbok">Верно!</p>'; setTimeout(advance, 800); return; }
  fb.innerHTML = '<p class="fbno">Правильный ответ: <b>' + esc(ans) + '</b></p><button class="b pri" id="lnext">Дальше</button>';
  $("lnext").onclick = advance; $("lnext").focus();
}
function pickOpt(i){
  if (!L || L.locked || L.mode !== "c" || i < 0 || i >= L.opts.length) return;
  L.locked = true;
  const bs = $("lbody").querySelectorAll(".opt"), ok = i === L.right;
  bs[L.right].classList.add("ok"); if (!ok) bs[i].classList.add("bad");
  grade(ok); showFb(ok, L.cur.c.t);
}
function submitTyped(){
  if (!L || L.locked || L.mode !== "t") return;
  const v = $("lin").value; if (!v.trim()) return;
  L.locked = true; $("lin").disabled = true;
  const ok = norm(v) === norm(L.cur.c.w);
  grade(ok); showFb(ok, L.cur.c.w);
}
function skipQ(){
  if (!L || L.locked) return; L.locked = true;
  if (L.mode === "c") $("lbody").querySelectorAll(".opt")[L.right].classList.add("ok"); else $("lin").disabled = true;
  grade(false); showFb(false, L.mode === "c" ? L.cur.c.t : L.cur.c.w);
}
function learnDone(){
  const acc = L.tries ? Math.round(L.ok / L.tries * 100) : 0;
  $("lbar").classList.remove("hot");
  $("lbody").innerHTML = '<div class="done"><h1>Все слова выучены</h1><p class="sub">Верных ответов: ' + L.ok + ' из ' + L.tries + ' (' + acc + '%)</p>' +
    '<button class="b pri" id="lagain">Ещё раз</button><button class="b" id="lfin">К модулю</button></div>';
  $("lagain").onclick = beginLearn; $("lfin").onclick = closeStudy;
}
$("lbody").onclick = e => {
  if (!L) return;
  const o = e.target.closest(".opt"); if (o) { pickOpt(+o.dataset.i); return; }
  if (e.target.id === "skip") skipQ();
  else if (e.target.id === "sub") submitTyped();
};
document.addEventListener("keydown", e => {
  if (!L || $("ln").classList.contains("hidden")) return;
  if (e.key === "Escape") { closeStudy(); return; }
  if (e.target.id === "lin") { if (e.key === "Enter") submitTyped(); return; }
  if (/^[1-4]$/.test(e.key) && L.mode === "c") pickOpt(+e.key - 1);
  if (e.key === "Enter" && e.target.tagName !== "BUTTON" && $("lnext")) advance();
});

let dbh = null, myId = null, mine = [], others = [], names = {}, unsub = null, shareErr = "";
function startShared(u){
  try {
    if (unsub) unsub();
    unsub = dbh.collection("shared").onSnapshot(snap => {
      mine = []; others = [];
      snap.docs.forEach(doc => {
        let arr = []; try { arr = JSON.parse((doc.data() || {}).json || "[]"); } catch (_) {}
        if (!Array.isArray(arr)) return;
        if (doc.id === myId) mine = arr;
        else arr.forEach(m => others.push({owner: doc.id, name: String(m.name || ""), cards: Array.isArray(m.cards) ? m.cards : []}));
      });
      const ids = [...new Set(others.map(o => o.owner))];
      const done = () => { renderOthers(); renderShare(); };
      (ids.length ? u.profiles(ids) : Promise.resolve({}))
        .then(ps => { ids.forEach(i => { names[i] = (ps[i] && ps[i].name) || ""; }); done(); })
        .catch(done);
    }, err => { shareErr = (err && (err.code || err.message)) || "ошибка"; renderOthers(); renderShare(); });
  } catch (e) {}
}
function renderOthers(){
  const sec = $("oth");
  if (!dbh) { sec.classList.add("hidden"); return; }
  sec.classList.remove("hidden");
  const own = mine.map(m => {
    const n = (m.cards || []).length, here = mods.some(x => x.id === m.id);
    return '<div class="omod"><span><b>' + esc(m.name) + '</b><small>Ваш модуль, ' + n + ' ' + plural(n) + '</small></span>' +
      (here ? '<button class="b" data-own="' + escA(m.id) + '">Открыть</button>' : '') + '</div>';
  });
  const oth = others.map((o, i) => {
    const n = o.cards.length;
    return '<div class="omod"><span><b>' + esc(o.name) + '</b><small>от ' + esc(names[o.owner] || "участника") + ', ' + n + ' ' + plural(n) + '</small></span>' +
      '<button class="b pri" data-i="' + i + '">Добавить</button></div>';
  });
  $("omods").innerHTML = own.concat(oth).join("") || '<div class="empty">Пока никто не поделился модулями.</div>';
}
$("omods").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.own) { location.hash = "m-" + b.dataset.own; return; }
  const o = others[+b.dataset.i]; if (!o) return;
  mods.push({id: uid(), name: o.name, cards: o.cards.map(c => ({w: String(c.w), t: String(c.t)}))});
  save(); renderLib(); b.textContent = "Добавлено"; b.disabled = true;
};
function renderShare(){
  const box = $("shr"); if (!cur) return;
  if (!dbh) { box.innerHTML = '<p>Войдите в аккаунт, чтобы делиться модулями.</p>'; return; }
  const on = mine.some(m => m.id === cur.id);
  box.innerHTML = (on
    ? '<p>Модуль в общем доступе: его могут добавить себе все, у кого есть доступ к сайту.</p><button class="b" id="shUp">Обновить общую копию</button><button class="b" id="shOff">Закрыть доступ</button>'
    : '<p>Поделитесь модулем: его смогут добавить себе все, у кого есть доступ к сайту. У них будет своя копия.</p><button class="b pri" id="shOn">Поделиться модулем</button>') +
    (shareErr ? '<p class="err">Не удалось: ' + esc(shareErr) + '</p>' : '');
}
async function writeMine(list){
  try { await dbh.doc("shared/" + myId).set({json: JSON.stringify(list)}); mine = list; shareErr = ""; }
  catch (e) { shareErr = (e && (e.code || e.message)) || "ошибка"; }
  renderShare(); renderOthers();
}
$("shr").onclick = e => {
  if (!cur || !dbh) return;
  const id = e.target.id, c = cur;
  if (id === "shOn" || id === "shUp") writeMine(mine.filter(m => m.id !== c.id).concat([{id: c.id, name: c.name, cards: c.cards}]));
  if (id === "shOff") writeMine(mine.filter(m => m.id !== c.id));
};

const TKEY = "english-theme", mq = window.matchMedia("(prefers-color-scheme: dark)");
const effTheme = () => document.documentElement.dataset.theme || (mq.matches ? "dark" : "light");
const SUN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
function renderTheme(){
  const dark = effTheme() === "dark";
  $("theme").innerHTML = dark ? SUN : MOON;
  $("theme").setAttribute("aria-label", dark ? "Включить светлую тему" : "Включить тёмную тему");
}
$("theme").onclick = () => {
  const n = effTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = n;
  try { localStorage.setItem(TKEY, n); } catch (e) {}
  renderTheme();
};
try { mq.addEventListener("change", renderTheme); } catch (e) {}
renderTheme();

route();
renderAcc();
if (!document.documentElement.classList.contains("local")) connect();
