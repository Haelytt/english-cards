const KEY = "english-modules-v2", OLD = "english-cards-v1";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const seed = () => [];
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
  if (sb && user && cur.sharedId) sb.from("shared_modules").delete().eq("id", cur.sharedId).then(() => loadShared());
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
    renderLib(); renderOthers(); if (user && synced) loadShared(); window.scrollTo(0, 0); return;
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
const CFG = window.APP_CONFIG || {};
let sb = null, user = null, accState = "connecting", accErr = false, accErrText = "", authBusy = false;
let saveT = null, saving = false, dirty = false, synced = false;
try {
  if (window.supabase && /^https:\/\//.test(CFG.SUPABASE_URL || "") && CFG.SUPABASE_KEY && !/ВСТАВЬТЕ/.test(CFG.SUPABASE_KEY)) {
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
  }
} catch (e) { sb = null; }
const authorName = () => (user && user.email ? user.email.split("@")[0] : "участник");
function setMsg(t, err){ const m = $("amsg"); if (m) { m.textContent = t; m.className = "amsg" + (err ? " err" : ""); } }
function authText(e){
  const m = String((e && e.message) || e || "");
  if (/invalid login/i.test(m)) return "Неверная почта или пароль.";
  if (/already registered|already been registered/i.test(m)) return "Эта почта уже зарегистрирована, нажмите «Войти».";
  if (/not confirmed/i.test(m)) return "Подтвердите почту по ссылке из письма.";
  if (/rate limit|too many/i.test(m)) return "Слишком много попыток, попробуйте позже.";
  if (/password/i.test(m)) return "Пароль слишком короткий или простой.";
  return "Ошибка: " + m;
}
function renderAcc(){
  const me = $("me");
  me.textContent = user ? authorName() : (sb && accState === "connecting" ? "Подключение…" : "Войти");
  me.className = "me" + (user ? " on" : "");
  let h;
  if (!sb) {
    h = '<b>Аккаунты не настроены</b><p>Заполните файл config.js: вставьте Project URL и Publishable key из Supabase.</p>';
  } else if (accState === "connecting") {
    h = '<p>Проверяем вход…</p>';
  } else if (accState === "recovery") {
    h = '<b>Новый пароль</b><p>Придумайте новый пароль для входа.</p>' +
      '<input class="ei" id="apn" type="password" placeholder="Новый пароль" autocomplete="new-password">' +
      '<div class="arow"><button class="b pri" id="anew">Сохранить пароль</button></div><p class="amsg" id="amsg"></p>';
  } else if (user) {
    h = '<b>' + esc(user.email || "Аккаунт") + '</b><p>Вы вошли. Модули и слова хранятся в вашем аккаунте и доступны на всех устройствах.</p>' +
      (accErr ? '<p class="amsg err">Не удалось синхронизировать: ' + esc(accErrText) + '</p>' : '') +
      '<button class="b" id="logout">Выйти</button>';
  } else {
    h = '<b>Вход или регистрация</b><p>Войдите, чтобы сохранять слова в аккаунте и делиться модулями.</p>' +
      '<input class="ei" id="aem" type="email" placeholder="Почта" autocomplete="email">' +
      '<input class="ei" id="apw" type="password" placeholder="Пароль (не короче 6 символов)" autocomplete="current-password">' +
      '<div class="arow"><button class="b pri" id="alogin">Войти</button><button class="b" id="asign">Регистрация</button></div>' +
      '<button class="skip" id="aforgot">Забыли пароль?</button><p class="amsg" id="amsg"></p>';
  }
  $("acc").innerHTML = h;
}
async function doAuth(kind){
  if (!sb || authBusy) return;
  const email = $("aem").value.trim(), password = $("apw").value;
  if (!email || password.length < 6) { setMsg("Введите почту и пароль не короче 6 символов.", true); return; }
  authBusy = true; setMsg("Подождите…");
  try {
    if (kind === "up") {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data.session) setMsg("Проверьте почту: мы отправили письмо для подтверждения.", false);
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (e) { setMsg(authText(e), true); }
  authBusy = false;
}
async function forgot(){
  const email = $("aem").value.trim();
  if (!email) { setMsg("Введите почту, на которую отправить ссылку.", true); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  setMsg(error ? authText(error) : "Если такая почта зарегистрирована, мы отправили письмо со ссылкой.", !!error);
}
async function setNewPassword(){
  const pw = $("apn").value;
  if (pw.length < 6) { setMsg("Пароль не короче 6 символов.", true); return; }
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) { setMsg(authText(error), true); return; }
  accState = "in"; renderAcc();
  if (!synced) loadAccount();
}
async function logout(){
  await sb.auth.signOut();
  mods = seed(); cur = null; synced = false; dirty = false; clearTimeout(saveT);
  try { localStorage.setItem(KEY, JSON.stringify(mods)); } catch (e) {}
  location.hash = "lib"; route();
}
async function loadAccount(){
  try {
    const { data, error } = await sb.from("libraries").select("data").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (data && Array.isArray(data.data)) {
      mods = data.data; cur = null;
      try { localStorage.setItem(KEY, JSON.stringify(mods)); } catch (_) {}
      route();
    } else {
      const r = await sb.from("libraries").upsert({ user_id: user.id, data: mods });
      if (r.error) throw r.error;
    }
    synced = true; accErr = false;
    await loadShared();
  } catch (e) { accErr = true; accErrText = (e && e.message) || "ошибка"; }
  renderAcc();
}
async function onSession(event, session){
  if (event === "PASSWORD_RECOVERY") {
    user = session ? session.user : null; accState = "recovery";
    $("acc").classList.remove("hidden"); renderAcc(); return;
  }
  const u = session ? session.user : null;
  if (u && (!user || user.id !== u.id)) {
    user = u; if (accState !== "recovery") accState = "in";
    renderAcc(); renderShare(); await loadAccount();
  } else if (!u) {
    user = null; accState = "out"; synced = false; mineRows = []; others = [];
    renderAcc(); renderOthers(); renderShare();
  } else {
    user = u; if (accState !== "recovery") accState = "in";
  }
}
function initAuth(){
  if (!sb) { accState = "out"; renderAcc(); return; }
  sb.auth.onAuthStateChange((event, session) => { setTimeout(() => onSession(event, session), 0); });
}
function cloudSave(){
  if (!sb || !user || !synced) return;
  dirty = true; clearTimeout(saveT); saveT = setTimeout(flush, 600);
}
async function flush(){
  if (saving) { saveT = setTimeout(flush, 300); return; }
  if (!dirty || !user) return;
  saving = true; dirty = false;
  const { error } = await sb.from("libraries").upsert({ user_id: user.id, data: mods });
  const was = accErr; accErr = !!error; accErrText = error ? error.message : "";
  saving = false; if (was !== accErr) renderAcc();
}
$("me").onclick = () => $("acc").classList.toggle("hidden");
$("acc").onclick = e => {
  const id = e.target.id;
  if (id === "alogin") doAuth("in");
  else if (id === "asign") doAuth("up");
  else if (id === "aforgot") forgot();
  else if (id === "logout") logout();
  else if (id === "anew") setNewPassword();
};
$("acc").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.id === "aem" || e.target.id === "apw") doAuth("in");
  if (e.target.id === "apn") setNewPassword();
});

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

let mineRows = [], others = [], shareErr = "";
async function loadShared(){
  if (!sb || !user) return;
  const { data, error } = await sb.from("shared_modules").select("id,owner_id,author,name,cards").order("name");
  if (error) shareErr = error.message;
  else { shareErr = ""; mineRows = data.filter(r => r.owner_id === user.id); others = data.filter(r => r.owner_id !== user.id); }
  renderOthers(); renderShare();
}
function renderOthers(){
  const sec = $("oth");
  if (!user) { sec.classList.add("hidden"); return; }
  sec.classList.remove("hidden");
  const own = mineRows.map(r => {
    const n = (r.cards || []).length, m = mods.find(x => x.sharedId === r.id);
    return '<div class="omod"><span><b>' + esc(r.name) + '</b><small>Ваш модуль, ' + n + ' ' + plural(n) + '</small></span>' +
      (m ? '<button class="b" data-own="' + escA(m.id) + '">Открыть</button>' : '') + '</div>';
  });
  const oth = others.map((o, i) => {
    const n = (o.cards || []).length;
    return '<div class="omod"><span><b>' + esc(o.name) + '</b><small>от ' + esc(o.author || "участника") + ', ' + n + ' ' + plural(n) + '</small></span>' +
      '<button class="b pri" data-i="' + i + '">Добавить</button></div>';
  });
  $("omods").innerHTML = own.concat(oth).join("") || '<div class="empty">Пока никто не поделился модулями.</div>';
}
$("omods").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.own) { location.hash = "m-" + b.dataset.own; return; }
  const o = others[+b.dataset.i]; if (!o) return;
  mods.push({id: uid(), name: o.name, cards: (o.cards || []).map(c => ({w: String(c.w), t: String(c.t)}))});
  save(); renderLib(); b.textContent = "Добавлено"; b.disabled = true;
};
function renderShare(){
  const box = $("shr"); if (!cur) return;
  if (!user) { box.innerHTML = '<p>Войдите в аккаунт, чтобы делиться модулями.</p>'; return; }
  const on = !!cur.sharedId && mineRows.some(r => r.id === cur.sharedId);
  box.innerHTML = (on
    ? '<p>Модуль в общем доступе: его могут добавить себе все пользователи сайта.</p><button class="b" id="shUp">Обновить общую копию</button><button class="b" id="shOff">Закрыть доступ</button>'
    : '<p>Поделитесь модулем: его смогут добавить себе все пользователи сайта. У них будет своя копия. Ваше имя в каталоге: <b>' + esc(authorName()) + '</b> (часть почты до @).</p><button class="b pri" id="shOn">Поделиться модулем</button>') +
    (shareErr ? '<p class="err">Не удалось: ' + esc(shareErr) + '</p>' : '');
}
async function shareNow(){
  const c = cur; if (!c || !user) return;
  const row = { name: c.name, cards: c.cards, author: authorName() };
  let error = null;
  if (c.sharedId && mineRows.some(r => r.id === c.sharedId)) {
    ({ error } = await sb.from("shared_modules").update(row).eq("id", c.sharedId));
  } else {
    const res = await sb.from("shared_modules").insert(row).select("id").single();
    error = res.error;
    if (!error) { c.sharedId = res.data.id; save(); }
  }
  shareErr = error ? error.message : "";
  await loadShared();
}
async function unshare(){
  const c = cur; if (!c || !user || !c.sharedId) return;
  const { error } = await sb.from("shared_modules").delete().eq("id", c.sharedId);
  if (!error) { delete c.sharedId; save(); }
  shareErr = error ? error.message : "";
  await loadShared();
}
$("shr").onclick = e => {
  if (!cur || !user) return;
  const id = e.target.id;
  if (id === "shOn" || id === "shUp") { e.target.disabled = true; shareNow(); }
  if (id === "shOff") { e.target.disabled = true; unshare(); }
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
initAuth();
