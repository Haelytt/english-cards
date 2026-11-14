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
let quotaWarned = false;
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(mods)); }
  catch (e) { if (!quotaWarned) { quotaWarned = true; alert("В хранилище браузера не хватило места — последние изменения (например, фото) могли не сохраниться. Удалите часть фото и попробуйте снова."); } }
  cloudSave();
};
const plural = n => { const a = n % 10, b = n % 100; return (a === 1 && b !== 11) ? "слово" : (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? "слова" : "слов"; };

let cur = null, idx = 0, sure = false;
let viewedFriend = null;
let profileAvatarPending = false, pendingAvatar = undefined, profileSavedTimer = null, avatarStream = null;

function renderLib(){
  const render = list => list.map(m => {
    const n = m.cards.length;
    const pv = m.cards.slice(0, 3).map(c => c.w).join(", ");
    return '<button class="mod" data-id="' + m.id + '"><span><b>' + esc(m.name) + '</b><small>' +
      (pv ? esc(pv) + (n > 3 ? "…" : "") : "Пока пусто") + '</small></span><i>' + n + '</i></button>';
  }).join("");
  const own = mods.filter(m => !m.addedFromFriend), added = mods.filter(m => m.addedFromFriend);
  $("mods").innerHTML = (own.length ? '<h2 class="own-title">Мои модули</h2>' + render(own) : '<div class="empty">Модулей пока нет. Создайте первый выше.</div>') +
    (added.length ? '<h2 class="added-title">Добавленные модули</h2>' + render(added) : "");
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
  $("start").disabled = !n; $("learn").disabled = !n; $("pick").disabled = !n;
  $("start").textContent = n ? "Карточки" : "Добавьте слова, чтобы начать";
}
let editIdx = -1;
const escA = v => esc(v).replace(/"/g, "&quot;");
const PEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const PIC = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.9-3.9a2 2 0 0 0-2.8 0L6 19.5"/></svg>';
function imgTile(f, src, lab){
  return '<button type="button" class="pimg' + (src ? " has" : "") + '" data-act="pic" data-pic="' + f + '">' +
    (src ? '<img class="prev" src="' + src + '" alt="">' : PIC) +
    '<span class="plab">' + (src ? "Заменить фото" : "Добавить фото") + "<small>" + lab + "</small></span>" +
    (src ? '<span class="prm" data-rm="' + f + '" role="button" aria-label="Убрать фото">×</span>' : "") +
    "</button>";
}
function renderList(){
  $("list").innerHTML = cur.cards.map((c, i) => i === editIdx
    ? '<li class="ed"><input class="ei" id="ew" value="' + escA(c.w) + '" placeholder="Слово" autocomplete="off" autocapitalize="off">' +
      '<input class="ei" id="et" value="' + escA(c.t) + '" placeholder="Перевод" autocomplete="off">' +
      '<div class="eimg">' + imgTile("wi", c.wi, "к слову") + imgTile("ti", c.ti, "к переводу") + "</div>" +
      '<div class="eact"><button class="b pri sm" data-act="save">Сохранить</button><button class="b sm" data-act="cancel">Отмена</button></div></li>'
    : '<li>' + (c.wi ? '<img class="th" src="' + c.wi + '" alt="" loading="lazy">' : "") +
      '<span class="w">' + esc(c.w) + '</span><span class="t">' + esc(c.t) + '</span>' +
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
    '<div class="card" id="card"><div class="face' + (c.wi ? " im" : "") + '">' +
    (c.wi ? '<img class="cim" src="' + c.wi + '" alt="" draggable="false">' : "") +
    '<div class="mid"><div class="word">' + esc(c.w) + '</div><div class="hint">Нажмите, чтобы увидеть перевод</div></div></div>' +
    '<div class="face bk' + (c.ti ? " im" : "") + '">' +
    (c.ti ? '<img class="cim" src="' + c.ti + '" alt="" draggable="false">' : "") +
    '<div class="mid"><div class="word">' + esc(c.t) + '</div><div class="hint">' + esc(c.w) + '</div></div></div></div></div>';
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

function ioSettingsMarkup(prefix){
  return '<div class="io-grid">' +
    '<label class="io-field">Между термином и определением<select id="' + prefix + 'Pair"><option value="tab">Табуляция</option><option value="comma">Запятая</option><option value="custom">Свой разделитель</option></select><input class="hidden" id="' + prefix + 'PairCustom" placeholder="Например: -"></label>' +
    '<label class="io-field">Между строками<select id="' + prefix + 'Row"><option value="newline">Разрыв строки</option><option value="semicolon">Точка с запятой</option><option value="custom">Свой разделитель</option></select><input class="hidden" id="' + prefix + 'RowCustom" placeholder="Например: |"></label>' +
    '</div>';
}
function ioSeparator(selectId, customId, fallback){
  const value = $(selectId).value;
  if (value === "tab") return "\t";
  if (value === "comma") return ",";
  if (value === "newline") return "\n";
  if (value === "semicolon") return ";";
  return $(customId).value || fallback;
}
function ioBindSettings(prefix, onChange){
  [["Pair", "PairCustom"], ["Row", "RowCustom"]].forEach(([kind, custom]) => {
    const select = $(prefix + kind), input = $(prefix + custom);
    const update = () => {
      input.classList.toggle("hidden", select.value !== "custom");
      onChange();
    };
    select.addEventListener("change", update);
    input.addEventListener("input", onChange);
    update();
  });
}
function refreshExportText(){
  if (!cur || !$("ioText")) return;
  const pair = ioSeparator("exportPair", "exportPairCustom", "\t");
  const row = ioSeparator("exportRow", "exportRowCustom", "\n");
  let cards = cur.cards.slice();
  if ($("exportSort").checked) cards.sort((a, b) => String(a.w).localeCompare(String(b.w), "ru", {sensitivity: "base"}));
  $("ioText").value = cards.map(c => String(c.w) + pair + String(c.t)).join(row);
}
function parseImportText(){
  if (!$("ioText")) return [];
  const pair = ioSeparator("importPair", "importPairCustom", "\t");
  const row = ioSeparator("importRow", "importRowCustom", "\n");
  return $("ioText").value.split(row).map(line => {
    const text = line.trim(), at = text.indexOf(pair);
    if (!text || at < 1) return null;
    const w = text.slice(0, at).trim(), t = text.slice(at + pair.length).trim();
    return w && t ? {w, t} : null;
  }).filter(Boolean);
}
function refreshImportCount(){
  const msg = $("ioMsg"); if (!msg) return;
  const count = parseImportText().length;
  msg.textContent = count ? "Найдено пар: " + count : "Вставьте строки с термином и определением.";
}
function openIO(mode){
  if (!cur) return;
  const title = $("ioTitle"), content = $("ioContent");
  if (mode === "export") {
    title.textContent = "Экспортировать";
    content.innerHTML = ioSettingsMarkup("export") +
      '<label class="io-check"><input type="checkbox" id="exportSort"> В алфавитном порядке</label>' +
      '<textarea class="io-text" id="ioText" readonly aria-label="Текст для экспорта"></textarea>' +
      '<div class="io-foot"><p class="io-msg" id="ioMsg">Скопируйте текст и вставьте его в другой сервис.</p><button class="b pri" id="ioCopy">Копировать текст</button></div>';
    ioBindSettings("export", refreshExportText);
    $("exportSort").addEventListener("change", refreshExportText);
    refreshExportText();
    $("ioCopy").onclick = ioCopy;
  } else {
    title.textContent = "Импортировать";
    content.innerHTML = '<p class="sub">Вставьте пары из Quizlet или таблицы: один термин и перевод в каждой строке.</p>' +
      ioSettingsMarkup("import") +
      '<textarea class="io-text" id="ioText" placeholder="to be in the limelight\tбыть в центре внимания\nhave an eye for\tразбираться в чём-либо" aria-label="Текст для импорта"></textarea>' +
      '<div class="io-foot"><p class="io-msg" id="ioMsg">Вставьте строки с термином и определением.</p><button class="b pri" id="ioApply">Импортировать</button></div>';
    ioBindSettings("import", refreshImportCount);
    $("ioText").addEventListener("input", refreshImportCount);
    $("ioApply").onclick = importCards;
    refreshImportCount();
  }
  $("iom").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeIO(){
  $("iom").classList.add("hidden");
  if ($("fs").classList.contains("hidden") && $("ln").classList.contains("hidden") && $("pm").classList.contains("hidden")) document.body.style.overflow = "";
}
async function ioCopy(){
  const text = $("ioText").value;
  try {
    await navigator.clipboard.writeText(text);
    $("ioMsg").textContent = "Текст скопирован.";
  } catch (_) {
    $("ioText").focus(); $("ioText").select();
    document.execCommand("copy");
    $("ioMsg").textContent = "Текст скопирован.";
  }
}
function importCards(){
  const cards = parseImportText();
  if (!cards.length) { $("ioMsg").textContent = "Не найдено ни одной пары. Проверьте разделители."; return; }
  cur.cards.push(...cards);
  save(); editIdx = -1; renderStudy(); renderLib(); closeIO();
}
$("importBtn").onclick = () => openIO("import");
$("exportBtn").onclick = () => openIO("export");
$("ioClose").onclick = closeIO;
$("iom").onclick = e => { if (e.target.id === "iom") closeIO(); };
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("iom").classList.contains("hidden")) closeIO(); });

function saveEdit(){
  const w = $("ew").value.trim(), t = $("et").value.trim();
  if (!w || !t) { (w ? $("et") : $("ew")).focus(); return; }
  const old = cur.cards[editIdx], nw = {w, t};
  if (old.wi) nw.wi = old.wi; if (old.ti) nw.ti = old.ti;
  cur.cards[editIdx] = nw; editIdx = -1; save(); renderStudy();
}
$("list").onclick = e => {
  const rm = e.target.closest("[data-rm]");
  if (rm) { if (editIdx > -1 && cur.cards[editIdx]) { delete cur.cards[editIdx][rm.dataset.rm]; save(); renderList(); } return; }
  const b = e.target.closest("button"); if (!b) return;
  const act = b.dataset.act, i = +b.dataset.i;
  if (act === "edit") { editIdx = i; renderList(); const ew = $("ew"); ew.focus(); ew.setSelectionRange(ew.value.length, ew.value.length); }
  else if (act === "cancel") { editIdx = -1; renderList(); }
  else if (act === "save") saveEdit();
  else if (act === "pic") { picField = b.dataset.pic; fileIn.click(); }
  else if (act === "del") { cur.cards.splice(i, 1); editIdx = -1; save(); renderStudy(); }
};
$("list").addEventListener("keydown", e => {
  if (!e.target.classList.contains("ei")) return;
  if (e.key === "Enter") saveEdit();
  if (e.key === "Escape") { editIdx = -1; renderList(); }
});

/* загрузка фото с устройства: сжимаем и храним в данных карточки */
let picField = null;
const fileIn = document.createElement("input");
fileIn.type = "file"; fileIn.accept = "image/*"; fileIn.hidden = true;
document.body.appendChild(fileIn);
fileIn.addEventListener("change", () => {
  const f = fileIn.files && fileIn.files[0];
  fileIn.value = "";
  if (!f || !picField || editIdx < 0 || !cur.cards[editIdx]) { picField = null; return; }
  const fld = picField; picField = null;
  compressImg(f, data => { if (editIdx > -1 && cur.cards[editIdx]) { cur.cards[editIdx][fld] = data; save(); renderList(); } });
});
function compressImg(file, cb){
  const url = URL.createObjectURL(file), im = new Image();
  im.onload = () => {
    const k = Math.min(1, 900 / (Math.max(im.width, im.height) || 1));
    const w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d");
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h);
    cx.drawImage(im, 0, 0, w, h);
    URL.revokeObjectURL(url);
    cb(cv.toDataURL("image/jpeg", 0.82));
  };
  im.onerror = () => { URL.revokeObjectURL(url); };
  im.src = url;
}

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
  const h = location.hash.slice(1), mm = /^([mslp])-([a-z0-9]+)$/.exec(h);
  const friendRoute = /^friend-([0-9a-f-]{36})$/i.exec(h);
  if ((h === "profile" || friendRoute) && user) {
    viewedFriend = friendRoute ? friendRoute[1] : null;
    cur = null; endStudy(); endLearn(); endPick();
    $("lib").classList.add("hidden"); $("study").classList.add("hidden"); $("profile").classList.remove("hidden");
    renderProfile(); if (viewedFriend) loadFriendProfile(); else loadFriends(); window.scrollTo(0, 0); return;
  }
  viewedFriend = null;
  $("profile").classList.add("hidden");
  const m = mm ? mods.find(x => x.id === mm[2]) : null;
  if (!m) {
    cur = null; endStudy(); endLearn(); endPick();
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
  if (mm[1] === "s" && m.cards.length) { endLearn(); endPick(); beginStudy(); }
  else if (mm[1] === "l" && m.cards.length) { endStudy(); endPick(); beginLearn(); }
  else if (mm[1] === "p" && m.cards.length) { endStudy(); endLearn(); beginPick(); }
  else { endStudy(); endLearn(); endPick(); }
}
window.addEventListener("hashchange", route);
const CFG = window.APP_CONFIG || {};
let sb = null, user = null, accState = "connecting", accErr = false, accErrText = "", authBusy = false;
let saveT = null, saving = false, dirty = false, synced = false;
let presenceChannel=null,presenceUserId=null,presenceIdleTimer=null,presenceActive=true;
const presenceStatuses=new Map();
try {
  if (window.supabase && /^https:\/\//.test(CFG.SUPABASE_URL || "") && CFG.SUPABASE_KEY && !/ВСТАВЬТЕ/.test(CFG.SUPABASE_KEY)) {
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
  }
} catch (e) { sb = null; }
const authorName = () => {
  const nick = user && user.user_metadata && String(user.user_metadata.nickname || "").trim();
  return nick || (user && user.email ? user.email.split("@")[0] : "участник");
};
function profileKey(){ return user ? "english-profile-" + user.id : ""; }
function readProfile(){
  if (!user) return {};
  try { return JSON.parse(localStorage.getItem(profileKey()) || "{}") || {}; } catch (_) { return {}; }
}
const invalidNickPattern = /[^\p{L}\p{M}\p{N}_.]/gu;
function cleanNicknameInput(input){
  const start=input.selectionStart, value=input.value.replace(invalidNickPattern,"").replace(/\.{2,}/g,".").replace(/_{2,}/g,"_");
  if(value!==input.value){input.value=value;const caret=Math.min(start,value.length);input.setSelectionRange(caret,caret);}
}
function hasInvalidNicknameChars(value){return /[^\p{L}\p{M}\p{N}_.]/u.test(value)||/\.{2}|_{2}/.test(value);}
function nicknameTakenError(error){
  return !!error && (error.code==="23505" || /profiles_nickname_search_uidx|duplicate key.*nickname|nickname_search/i.test(String(error.message||"")));
}
async function updateNickname(nick){
  if(nick.length<2||nick.length>15||hasInvalidNicknameChars(nick))throw {invalidNickname:true};
  const current=await sb.from("profiles").select("nickname").eq("user_id",user.id).maybeSingle();
  if(current.error)throw current.error;
  const previous=current.data?.nickname||authorName();
  const duplicate=await sb.from("profiles").select("user_id").eq("nickname_search",nick.toLowerCase()).neq("user_id",user.id).maybeSingle();
  if(duplicate.error)throw duplicate.error;
  if(duplicate.data)throw {nicknameTaken:true};
  const profileUpdate=await sb.from("profiles").update({nickname:nick,updated_at:new Date().toISOString()}).eq("user_id",user.id);
  if(profileUpdate.error)throw profileUpdate.error;
  const authUpdate=await sb.auth.updateUser({data:{nickname:nick}});
  if(authUpdate.error){
    await sb.from("profiles").update({nickname:previous,updated_at:new Date().toISOString()}).eq("user_id",user.id);
    throw authUpdate.error;
  }
  user=authUpdate.data.user||user;
}
function avatarMarkup(src){ return src ? '<img src="' + src + '" alt="">' : ""; }
function updateProfileNav(){
  const link = $("profileLink"), me = $("me");
  if (user) {
    link.classList.remove("hidden"); me.classList.add("hidden");
    $("navNick").textContent = authorName();
    const profile=readProfile(), avatar = profile.avatar || "";
    $("navAvatar").src = avatar;
    $("navAvatar").classList.toggle("hidden", !avatar);
    $("navPresence").classList.toggle("hidden",!avatar);
    applyPresenceDot($("navPresence"),presenceStatuses.get(user.id)||"offline");
    link.classList.toggle("no-avatar", !avatar);
  } else { link.classList.add("hidden"); me.classList.remove("hidden"); }
}
function applyPresenceDot(dot,status){
  if(!dot)return;
  dot.classList.remove("status-online","status-idle","status-offline");
  const normalized=["online","idle","offline"].includes(status)?status:"offline";
  dot.classList.add("status-"+normalized);
  const label=normalized==="online"?"В сети":normalized==="idle"?"Неактивен":"Не в сети";
  dot.title=label;dot.setAttribute("aria-label",label);
}
function refreshPresence(){
  const next=new Map(),state=presenceChannel?presenceChannel.presenceState():{};
  Object.entries(state||{}).forEach(([key,entries])=>{
    (entries||[]).forEach(entry=>{
      const id=entry.user_id||key;if(!id)return;
      const status=entry.active?"online":"idle";
      if(status==="online"||!next.has(id))next.set(id,status);
    });
  });
  if(presenceUserId&&!next.has(presenceUserId))next.set(presenceUserId,presenceActive?"online":"idle");
  presenceStatuses.clear();next.forEach((status,id)=>presenceStatuses.set(id,status));
  if(user)applyPresenceDot($("navPresence"),presenceStatuses.get(user.id)||"offline");
  if(user)applyPresenceDot($("profilePresence"),presenceStatuses.get(user.id)||"offline");
  document.querySelectorAll("[data-presence-user]").forEach(dot=>applyPresenceDot(dot,presenceStatuses.get(dot.dataset.presenceUser)||"offline"));
}
function trackPresence(active){
  presenceActive=active;
  if(presenceChannel)presenceChannel.track({user_id:presenceUserId,active,last_active:Date.now()}).catch(()=>{});
  if(presenceUserId)presenceStatuses.set(presenceUserId,active?"online":"idle");
  refreshPresence();
}
function markPresenceActive(){
  if(!user||!presenceChannel)return;
  if(!presenceActive)trackPresence(true);
  clearTimeout(presenceIdleTimer);
  presenceIdleTimer=setTimeout(()=>{if(user&&presenceChannel)trackPresence(false);},300000);
}
function stopPresence(){
  clearTimeout(presenceIdleTimer);presenceIdleTimer=null;
  const channel=presenceChannel;presenceChannel=null;presenceUserId=null;presenceActive=false;
  if(channel&&sb)sb.removeChannel(channel);
  presenceStatuses.clear();refreshPresence();
}
function startPresence(userId){
  if(!sb||!userId)return;
  if(presenceChannel&&presenceUserId===userId)return;
  stopPresence();presenceUserId=userId;presenceActive=true;
  presenceChannel=sb.channel("site-presence",{config:{presence:{key:userId}}})
    .on("presence",{event:"sync"},refreshPresence)
    .on("presence",{event:"join"},refreshPresence)
    .on("presence",{event:"leave"},refreshPresence)
    .subscribe(status=>{
      if(status==="SUBSCRIBED"&&presenceChannel){
        trackPresence(true);clearTimeout(presenceIdleTimer);
        presenceIdleTimer=setTimeout(()=>{if(user&&presenceChannel)trackPresence(false);},300000);
      }
    });
}
["pointerdown","keydown","touchstart","pointermove","wheel","scroll"].forEach(eventName=>window.addEventListener(eventName,markPresenceActive,{passive:true}));
function renderProfile(){
  if (!user) return;
  $("profileTitle").textContent = viewedFriend ? "Профиль друга" : "Профиль";
  $("tabProfile").classList.toggle("hidden", !!viewedFriend);
  $("tabFriends").classList.toggle("hidden", !!viewedFriend);
  $("tabSettings").classList.toggle("hidden", !!viewedFriend);
  $("tabModules").textContent = viewedFriend ? "Модули друга" : "Модули";
  $("profileCard").classList.toggle("hidden", !!viewedFriend);
  $("friendsPanel").classList.add("hidden");
  $("profileModules").classList.toggle("hidden", !viewedFriend);
  if (!viewedFriend) showProfileTab("profile");
  const data = readProfile();
  $("profileNick").value = authorName();
  $("profileDisplayNick").textContent = authorName();
  $("profileBadge").textContent = data.badge || "";
  $("profileBadge").classList.toggle("hidden",!data.badge);
  $("emojiTrigger").classList.toggle("hidden",!!data.badge);
  $("profileBio").value = data.bio || "";
  resizeProfileBio();
  fitProfileNickname();
  $("profileAvatar").src = data.avatar || "";
  $("profileAvatar").classList.toggle("hidden", !data.avatar);
  $("profilePresence").classList.toggle("hidden", !data.avatar);
  applyPresenceDot($("profilePresence"),presenceStatuses.get(user.id)||"offline");
  profileAvatarPending = false; pendingAvatar = undefined;
  syncProfileSave();
}
async function loadFriendProfile(){
  const {data,error}=await sb.from("profiles").select("user_id,nickname").eq("user_id",viewedFriend).maybeSingle();
  if(error || !data){ $("profileModulesList").innerHTML='<p class="amsg err">Не удалось открыть профиль.</p>'; return; }
  $("profileTitle").textContent=data.nickname;
  const res=await sb.rpc("get_friend_modules",{target_user:viewedFriend});
  if(res.error){ $("profileModulesList").innerHTML='<p class="amsg err">Не удалось загрузить модули друга.</p>'; return; }
  renderFriendModules(res.data||[],"profileModulesList");
}
function renderFriendModules(rows,container){
  $(container).innerHTML=rows.length?'<h2>Модули</h2>'+rows.map((m,i)=>
    '<div class="omod"><span><b>'+esc(m.module_name)+'</b><small>'+(m.cards||[]).length+' '+plural((m.cards||[]).length)+'</small></span><button class="b pri" data-import-friend="'+i+'">Добавить к себе</button></div>'
  ).join(""):'<p class="sub">У друзей пока нет модулей.</p>';
  $(container).dataset.modules=JSON.stringify(rows);
}
async function importFriendModule(container,index,button){
  let rows=[]; try{rows=JSON.parse($(container).dataset.modules||"[]")}catch(_){}
  const m=rows[index]; if(!m)return;
  mods.push({id:uid(),name:m.module_name,addedFromFriend:true,cards:(m.cards||[]).map(c=>({w:String(c.w||""),t:String(c.t||""),...(c.wi?{wi:c.wi}:{}),...(c.ti?{ti:c.ti}:{})}))});
  save(); renderLib(); button.textContent="Добавлено"; button.disabled=true;
}
function showFriendsTab(showFriends){
  showProfileTab(showFriends ? "friends" : "profile");
  if (showFriends) loadFriends();
}
function showProfileTab(tab){
  $("profileCard").classList.toggle("hidden",tab!=="profile"||!!viewedFriend);
  $("friendsPanel").classList.toggle("hidden",tab!=="friends"||!!viewedFriend);
  $("profileModules").classList.toggle("hidden",tab!=="modules"&&!viewedFriend);
  $("profileSettings").classList.toggle("hidden",tab!=="settings"||!!viewedFriend);
  $("profileTitle").textContent=tab==="modules"?(viewedFriend?"Модули друга":"Мои модули"):(tab==="friends"?"Друзья":(tab==="settings"?"Настройки":(viewedFriend?"Профиль друга":"Профиль")));
  $("tabProfile").classList.toggle("pri",tab==="profile");
  $("tabFriends").classList.toggle("pri",tab==="friends");
  $("tabModules").classList.toggle("pri",tab==="modules");
  $("tabSettings").classList.toggle("pri",tab==="settings");
}
function friendCard(profile, action){
  const id=profile.user_id||"";
  const avatar = profile.avatar ? '<img class="friend-avatar" src="' + escA(profile.avatar) + '" alt="">' : '<span class="friend-avatar blank"></span>';
  return '<div class="friend-row"><span class="status-avatar friend-avatar-wrap">' + avatar + '<i class="presence-dot status-offline" data-presence-user="' + escA(id) + '" title="Не в сети"></i></span><span class="friend-name">' + esc(profile.nickname) + '</span><div class="friend-action">' + action + '</div></div>';
}
async function searchFriends(){
  const term = $("friendSearch").value.trim();
  const box = $("friendResults");
  if (term.length < 2) { box.innerHTML = '<p class="sub">Введите хотя бы 2 символа.</p>'; return; }
  box.innerHTML = '<p class="sub">Ищем…</p>';
  const {data,error} = await sb.from("profiles").select("user_id,nickname").ilike("nickname_search", term.replace(/[%_]/g,"\\$&") + "%").neq("user_id",user.id).limit(12);
  if (error) { box.innerHTML = '<p class="amsg err">Не удалось выполнить поиск. Примените миграцию Supabase.</p>'; return; }
  if (!data.length) { box.innerHTML = '<p class="sub">Никого не нашли.</p>'; return; }
  const ids = data.map(p => p.user_id);
  const req = await sb.from("friend_requests").select("sender_id,receiver_id,status").or("sender_id.in.(" + ids.join(",") + "),receiver_id.in.(" + ids.join(",") + ")");
  const states = req.error ? [] : req.data;
  box.innerHTML = data.map(p => {
    const r = states.find(x => (x.sender_id === user.id && x.receiver_id === p.user_id) || (x.receiver_id === user.id && x.sender_id === p.user_id));
    let action = '<button class="b pri" data-friend="send" data-id="' + p.user_id + '">Добавить</button>';
    if (r && r.status === "accepted") action = '<span class="friend-state">Уже друзья</span>';
    else if (r && r.status === "pending") action = '<span class="friend-state">' + (r.sender_id === user.id ? "Запрос отправлен" : "Есть входящий запрос") + '</span>';
    return friendCard(p, action);
  }).join("");
  refreshPresence();
}
async function loadFriends(){
  if (!user || !sb) return;
  $("friendIncoming").innerHTML = '<p class="sub">Загружаем…</p>';
  $("friendList").innerHTML = "";
  const {data,error} = await sb.from("friend_requests").select("id,sender_id,receiver_id,status").or("sender_id.eq." + user.id + ",receiver_id.eq." + user.id);
  if (error) { $("friendIncoming").innerHTML = '<p class="amsg err">Не удалось загрузить друзей. Примените миграцию Supabase.</p>'; return; }
  const pending = data.filter(r => r.status === "pending" && r.receiver_id === user.id);
  const accepted = data.filter(r => r.status === "accepted");
  const peerIds = [...new Set([...pending.map(r => r.sender_id),...accepted.map(r => r.sender_id === user.id ? r.receiver_id : r.sender_id)])];
  let profiles = [];
  if (peerIds.length) {
    const p = await sb.from("profiles").select("user_id,nickname").in("user_id",peerIds);
    if (!p.error) profiles = p.data;
  }
  const byId = id => profiles.find(p => p.user_id === id) || {nickname:"Пользователь"};
  $("friendIncoming").innerHTML = pending.length ? pending.map(r => friendCard(byId(r.sender_id),
    '<button class="b pri" data-friend="accept" data-id="' + r.id + '">Принять</button><button class="b" data-friend="reject" data-id="' + r.id + '">Отклонить</button>')).join("") : '<p class="sub">Входящих запросов нет.</p>';
  $("friendList").innerHTML = accepted.length ? accepted.map(r => {
    const id=r.sender_id===user.id?r.receiver_id:r.sender_id, p=byId(id);
    return friendCard(p,'<button class="b" data-open-friend="'+id+'">Профиль</button>');
  }).join("") : '<p class="sub">Вы ещё не добавили друзей.</p>';
  refreshPresence();
}
async function friendAction(action,id){
  if (action === "send") {
    const {error} = await sb.rpc("request_friend",{target_user:id});
    if (error) {
      const details = [error.message,error.details,error.hint,error.code].filter(Boolean).join(" · ");
      $("friendResults").insertAdjacentHTML("afterbegin",'<p class="amsg err friend-error">' + esc(details || "Supabase вернул неизвестную ошибку.") + '</p>');
      return;
    }
    await searchFriends(); await loadFriends();
  } else {
    const {error} = await sb.rpc("respond_friend",{request_id:id,accept_request:action === "accept"});
    if (error) {
      const details = [error.message,error.details,error.hint,error.code].filter(Boolean).join(" · ");
      $("friendIncoming").insertAdjacentHTML("afterbegin",'<p class="amsg err friend-error">' + esc(details || "Supabase вернул неизвестную ошибку.") + '</p>');
      return;
    }
    await loadFriends();
  }
}
function profileMsg(message, error){
  const p = $("profileSettings").classList.contains("hidden") ? $("profileMsg") : $("profileSettingsMsg");
  p.textContent = message; p.className = "amsg" + (error ? " err" : "");
}
function syncProfileSave(){
  const button=$("profileSave");
  if(!button)return;
  const changed=$("profileBio").value !== (readProfile().bio || "") || profileAvatarPending;
  button.classList.toggle("hidden",!changed);
  if(changed){button.textContent="Сохранить";if(profileSavedTimer)clearTimeout(profileSavedTimer);$("profileMsg").textContent="";}
}
function resizeProfileBio(){
  const field=$("profileBio");field.style.height="auto";
  field.style.height=Math.max(42,field.scrollHeight)+"px";
}
function fitProfileNickname(){
  const line=$("profileDisplayNick").parentElement,name=$("profileDisplayNick");
  if(!line||!name)return;
  name.style.fontSize="";
  const base=parseFloat(getComputedStyle(name).fontSize)||24;
  const controls=[...line.children].filter(el=>el!==name&&getComputedStyle(el).display!=="none");
  const gap=parseFloat(getComputedStyle(line).gap)||0;
  const available=line.clientWidth-controls.reduce((sum,el)=>sum+el.getBoundingClientRect().width,0)-gap*Math.max(0,controls.length);
  let size=base;
  name.style.fontSize=size+"px";
  while(name.scrollWidth>available&&size>12){size-=.5;name.style.fontSize=size+"px";}
}
function setMsg(t, err){ const m = $("amsg"); if (m) { m.textContent = t; m.className = "amsg" + (err ? " err" : ""); } }
function authText(e){
  const m = String((e && e.message) || e || "");
  if (e && e.nicknameTaken || nicknameTakenError(e)) return "Этот никнейм уже занят";
  if (/invalid login/i.test(m)) return "Неверная почта или пароль.";
  if (/already registered|already been registered/i.test(m)) return "Эта почта уже зарегистрирована, нажмите «Войти».";
  if (/not confirmed/i.test(m)) return "Подтвердите почту по ссылке из письма.";
  if ((e && e.code) === "over_email_send_rate_limit" || /email rate limit/i.test(m)) return "Сервис сейчас не может отправить письмо (достигнут лимит). Попробуйте позже.";
  if (/once every|only request this/i.test(m)) return "Подождите минуту и попробуйте снова.";
  if (/rate limit|too many/i.test(m)) return "Слишком много попыток, попробуйте позже.";
  if (/password/i.test(m)) return "Пароль слишком короткий или простой.";
  return "Ошибка: " + m;
}
function renderAcc(){
  const me = $("me");
  me.textContent = user ? authorName() : (sb && accState === "connecting" ? "Подключение…" : "Войти");
  me.className = "me" + (user ? " on" : "");
  updateProfileNav();
  let h;
  if (!sb) {
    h = '<b>Аккаунты не настроены</b><p>Заполните файл config.js: вставьте Project URL и Publishable key из Supabase.</p>';
  } else if (accState === "connecting") {
    h = '<p>Проверяем вход…</p>';
  } else if (accState === "recovery") {
    h = '<b>Новый пароль</b><p>Придумайте новый пароль для входа.</p>' +
      '<div class="pwfield"><input class="ei" id="apn" type="password" placeholder="Новый пароль" autocomplete="new-password"><button class="pwtoggle" type="button" data-pass="apn" aria-label="Показать пароль" aria-pressed="false">Показать</button></div>' +
      '<div class="arow"><button class="b pri" id="anew">Сохранить пароль</button></div><p class="amsg" id="amsg"></p>';
  } else if (user) {
    h = '<b>' + esc(authorName()) + '</b><p>Вы вошли. Модули и слова хранятся в вашем аккаунте и доступны на всех устройствах.</p>' +
      '<label class="nicklabel" for="anickEdit">Никнейм</label><div class="arow"><input class="ei" id="anickEdit" type="text" value="' + escA(authorName()) + '" autocomplete="nickname" maxlength="15"><button class="b" id="saveNick">Сохранить</button></div><p class="amsg" id="nmsg"></p>' +
      (accErr ? '<p class="amsg err">Не удалось синхронизировать: ' + esc(accErrText) + '</p>' : '') +
      '<button class="b" id="logout">Выйти</button>';
  } else {
    h = '<b>Вход или регистрация</b><p>Войдите, чтобы сохранять слова в аккаунте и делиться модулями.</p>' +
      '<input class="ei" id="anick" type="text" placeholder="Никнейм (для регистрации)" autocomplete="nickname" maxlength="15">' +
      '<input class="ei" id="aem" type="email" placeholder="Почта" autocomplete="email">' +
      '<div class="pwfield"><input class="ei" id="apw" type="password" placeholder="Пароль (не короче 6 символов)" autocomplete="current-password"><button class="pwtoggle" type="button" data-pass="apw" aria-label="Показать пароль" aria-pressed="false">Показать</button></div>' +
      '<div class="arow"><button class="b pri" id="alogin">Войти</button><button class="b" id="asign">Регистрация</button></div>' +
      '<button class="skip" id="aforgot">Забыли пароль?</button><p class="amsg" id="amsg"></p>';
  }
  $("acc").innerHTML = h;
}
async function doAuth(kind){
  if (!sb || authBusy) return;
  const email = $("aem").value.trim(), nickname = $("anick").value.trim().replace(/\s+/g, " "), password = $("apw").value;
  if (!email || password.length < 6) { setMsg("Введите почту и пароль не короче 6 символов.", true); return; }
  if (kind === "up" && (nickname.length < 2 || nickname.length > 15)) {
    setMsg("Никнейм должен содержать от 2 до 15 символов.", true); return;
  }
  if(kind==="up"&&hasInvalidNicknameChars(nickname)){setMsg("Разрешены буквы, цифры, точка и нижнее подчёркивание; точки и подчёркивания не могут идти подряд.",true);return;}
  authBusy = true; setMsg("Подождите…");
  try {
    if (kind === "up") {
      const availability=await sb.rpc("nickname_available",{target_nickname:nickname});
      if(availability.error)throw availability.error;
      if(availability.data===false)throw {nicknameTaken:true};
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nickname }, emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data.session) setMsg("Проверьте почту: мы отправили письмо для подтверждения.", false);
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (e) {
    let message=authText(e);
    if(kind==="up"&&!nicknameTakenError(e)&&!e.nicknameTaken){
      try{const check=await sb.rpc("nickname_available",{target_nickname:nickname});if(!check.error&&check.data===false)message="Этот никнейм уже занят";}catch(_){}
    }
    setMsg(message, true);
  }
  authBusy = false;
}
function setNickMsg(t, err){
  const m = $("nmsg"); if (m) { m.textContent = t; m.className = "amsg" + (err ? " err" : ""); }
}
function showAuthExpired(){
  user = null; accState = "out"; synced = false;
  renderAcc(); renderOthers(); renderShare();
  $("acc").classList.remove("hidden");
  setMsg("Сессия истекла. Войдите снова и повторите сохранение.", true);
}
async function saveNickname(){
  if (!sb || !user) return;
  const input = $("anickEdit"), nick = input ? input.value.trim().replace(/ +/g, " ") : "";
  if (nick.length < 2 || nick.length > 15) { setNickMsg("Никнейм должен содержать от 2 до 15 символов.", true); return; }
  if(hasInvalidNicknameChars(nick)){setNickMsg("Разрешены буквы, цифры, точка и нижнее подчёркивание; точки и подчёркивания не могут идти подряд.",true);return;}
  const b = $("saveNick"); if (b) b.disabled = true;
  try {
    await updateNickname(nick);
    renderAcc(); renderShare(); updateProfileNav();
    $("profileDisplayNick").textContent=authorName();
    $("profileNick").value=authorName();
    fitProfileNickname();
    setNickMsg("",false);
  } catch (e) {
    if (b) b.disabled = false;
    setNickMsg(authText(e), true);
  }
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
  stopPresence();
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
    if(user)startPresence(user.id);else stopPresence();
    $("acc").classList.remove("hidden"); renderAcc(); return;
  }
  const u = session ? session.user : null;
  if (u && (!user || user.id !== u.id)) {
    user = u; if (accState !== "recovery") accState = "in"; startPresence(user.id);
    renderAcc(); renderShare(); await loadAccount();
  } else if (!u) {
    stopPresence();
    user = null; accState = "out"; synced = false; mineRows = []; others = [];
    renderAcc(); renderOthers(); renderShare();
  } else {
    user = u; if (accState !== "recovery") accState = "in"; startPresence(user.id);
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
$("profileLink").onclick = () => { $("acc").classList.add("hidden"); location.hash = "profile"; route(); };
$("profileBack").onclick = () => { location.hash = "lib"; route(); };
$("tabProfile").onclick = () => showFriendsTab(false);
$("tabFriends").onclick = () => showFriendsTab(true);
$("tabModules").onclick = () => {
  showProfileTab("modules");
  const own=mods.filter(m=>!m.addedFromFriend);
  $("profileModulesList").innerHTML=own.length?'<h2>Мои модули</h2>'+own.map(m=>'<div class="omod"><span><b>'+esc(m.name)+'</b><small>'+m.cards.length+' '+plural(m.cards.length)+'</small></span><button class="b sm" data-rename-module="'+escA(m.id)+'">Переименовать</button></div>').join(""):'<p class="sub">У вас пока нет модулей.</p>';
};
$("tabSettings").onclick = () => showProfileTab("settings");
let friendSearchTimer = null, friendSearchSeq = 0;
$("friendSearch").addEventListener("input", () => {
  clearTimeout(friendSearchTimer);
  const seq = ++friendSearchSeq;
  const term = $("friendSearch").value.trim();
  if (term.length < 2) {
    $("friendResults").innerHTML = '<p class="sub">Введите хотя бы 2 символа.</p>';
    return;
  }
  $("friendResults").innerHTML = '<p class="sub">Ищем…</p>';
  friendSearchTimer = setTimeout(() => {
    if (seq === friendSearchSeq) searchFriends();
  }, 300);
});
document.addEventListener("click", e => {
  const rename=e.target.closest("[data-rename-module]");
  if(rename){
    const module=mods.find(m=>m.id===rename.dataset.renameModule&&!m.addedFromFriend);
    if(module){
      const name=prompt("Введите новое название модуля:",module.name);
      if(name!==null){const clean=name.trim();if(clean){module.name=clean;save();renderLib();$("tabModules").click();}else alert("Название не может быть пустым.");}
    }
    return;
  }
  const b = e.target.closest("[data-friend]");
  if (b) friendAction(b.dataset.friend,b.dataset.id);
  const open = e.target.closest("[data-open-friend]");
  if(open){ location.hash="friend-"+open.dataset.openFriend; route(); }
  const imp=e.target.closest("[data-import-friend]");
  if(imp) importFriendModule(imp.closest("#profileModules")?"profileModules":"omods",+imp.dataset.importFriend,imp);
});
$("avatarPick").onclick = () => $("avatarDialog").classList.remove("hidden");
$("avatarDialogClose").onclick = closeAvatarDialog;
$("avatarDialog").onclick = e => { if(e.target === $("avatarDialog")) closeAvatarDialog(); };
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAvatarDialog();});
$("avatarUpload").onclick = () => { $("avatarDialog").classList.add("hidden"); $("avatarFile").click(); };
$("avatarCamera").onclick = startAvatarCamera;
$("avatarCameraCancel").onclick = () => { stopAvatarCamera(); $("avatarCameraPanel").classList.add("hidden"); $("avatarMenu").classList.remove("hidden"); $("avatarCameraFallback").classList.add("hidden"); };
$("avatarCameraFallback").onclick = () => { closeAvatarDialog();$("avatarCameraFile").click(); };
$("avatarTake").onclick = () => {
  const video=$("avatarVideo");
  if(!video.videoWidth)return;
  const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);
  const dataUrl=canvas.toDataURL("image/jpeg",.88);
  closeAvatarDialog();saveAvatarData(dataUrl);
};
$("avatarDelete").onclick = () => {
  const data=readProfile();
  if(!data.avatar&&!profileAvatarPending){ closeAvatarDialog(); return; }
  closeAvatarDialog();pendingAvatar=null;profileAvatarPending=true;
  $("profileAvatar").src="";$("profileAvatar").classList.add("hidden");$("profilePresence").classList.add("hidden");syncProfileSave();
};
function stopAvatarCamera(){
  if(avatarStream){avatarStream.getTracks().forEach(track=>track.stop());avatarStream=null;}
  $("avatarVideo").srcObject=null;
}
function closeAvatarDialog(){
  stopAvatarCamera();$("avatarDialog").classList.add("hidden");
  $("avatarCameraPanel").classList.add("hidden");$("avatarMenu").classList.remove("hidden");
  $("avatarCameraFallback").classList.add("hidden");$("avatarCameraCancel").textContent="Назад";
}
async function startAvatarCamera(){
  $("avatarMenu").classList.add("hidden");$("avatarCameraPanel").classList.remove("hidden");
  $("avatarCameraFallback").classList.add("hidden");$("avatarCameraCancel").textContent="Назад";
  $("avatarCameraError").textContent="Подключаем камеру…";
  if(!navigator.mediaDevices?.getUserMedia){closeAvatarDialog();$("avatarCameraFile").click();return;}
  try{
    avatarStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});
    if($("avatarDialog").classList.contains("hidden")){stopAvatarCamera();return;}
    $("avatarVideo").srcObject=avatarStream;
    await $("avatarVideo").play();
    $("avatarCameraError").textContent="";
  }catch(_){
    $("avatarCameraError").textContent="Не удалось открыть веб-камеру. Разрешите доступ или выберите фото.";
    $("avatarCameraFallback").classList.remove("hidden");
  }
}
function loadAvatar(input){
  const file = input.files && input.files[0];
  input.value = "";
  if (!file || !user) return;
  if (!file.type.startsWith("image/")) { profileMsg("Выберите файл изображения.", true); return; }
  const reader = new FileReader();
  reader.onload = () => saveAvatarData(reader.result);
  reader.readAsDataURL(file);
}
function saveAvatarData(source){
  const img=new Image();
  img.onload=()=>{
    const side=Math.min(img.width,img.height),sx=(img.width-side)/2,sy=(img.height-side)/2;
    const canvas=document.createElement("canvas");canvas.width=320;canvas.height=320;
    canvas.getContext("2d").drawImage(img,sx,sy,side,side,0,0,320,320);
    pendingAvatar=canvas.toDataURL("image/jpeg",.82);profileAvatarPending=true;
    $("profileAvatar").src=pendingAvatar;$("profileAvatar").classList.remove("hidden");$("profilePresence").classList.remove("hidden");syncProfileSave();
  };
  img.src=source;
}
[$("avatarFile"),$("avatarCameraFile")].forEach(input=>input.onchange=()=>loadAvatar(input));
$("profileSave").onclick = () => {
  if (!user) return;
  const bio = $("profileBio").value.trim();
  if (bio.length > 116) { profileMsg("Описание должно содержать не более 116 символов.", true); return; }
  try {
    const old = readProfile(); old.bio = bio;
    if(profileAvatarPending){if(pendingAvatar)old.avatar=pendingAvatar;else delete old.avatar;}
    localStorage.setItem(profileKey(), JSON.stringify(old));
    profileAvatarPending=false;pendingAvatar=undefined;updateProfileNav();
    const button=$("profileSave");button.textContent="Сохранено";$("profileMsg").textContent="";
    button.classList.remove("hidden");
    if(profileSavedTimer)clearTimeout(profileSavedTimer);
    profileSavedTimer=setTimeout(()=>{button.classList.add("hidden");$("profileMsg").textContent="";button.textContent="Сохранить";},3000);
  } catch (_) { profileMsg("Не удалось сохранить описание.", true); }
};
$("profileBio").addEventListener("input",()=>{resizeProfileBio();syncProfileSave();});
window.addEventListener("resize",()=>{resizeProfileBio();fitProfileNickname();});
$("profileNickSave").onclick = async () => {
  if (!user) return;
  const nick = $("profileNick").value.trim().replace(/\s+/g, " ");
  if (nick.length < 2 || nick.length > 15) { profileMsg("Никнейм должен содержать от 2 до 15 символов.", true); return; }
  if(hasInvalidNicknameChars(nick)){profileMsg("Разрешены буквы, цифры, точка и нижнее подчёркивание; точки и подчёркивания не могут идти подряд.",true);return;}
  $("profileNickSave").disabled = true;
  try {
    await updateNickname(nick);
    renderProfile(); showProfileTab("settings"); renderAcc(); updateProfileNav(); renderShare(); profileMsg("",false);
  } catch (error) { profileMsg(error.invalidNickname?"Никнейм должен содержать 2–15 символов и не иметь знаков подряд.":nicknameTakenError(error)||error.nicknameTaken?"Этот никнейм уже занят":"Не удалось сохранить профиль. Проверьте соединение и сессию.", true); }
  $("profileNickSave").disabled = false;
};
  $("profileNick").addEventListener("input",e=>cleanNicknameInput(e.target));
$("acc").addEventListener("input",e=>{
  if(e.target.id==="anick"||e.target.id==="anickEdit")cleanNicknameInput(e.target);
});
function openEmojiPicker(e){
  e.stopPropagation();
  const picker=$("emojiPicker");
  picker.classList.toggle("hidden");
  if(!picker.classList.contains("hidden")){$("emojiInput").value=readProfile().badge||"";$("emojiInput").focus();}
}
$("emojiTrigger").onclick=openEmojiPicker;
$("profileBadge").onclick=openEmojiPicker;
function applyProfileEmoji(value){
  const text=value.trim();
  const isEmoji=value=>/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u.test(value);
  if(!isEmoji(text)){ $("emojiInput").focus(); return; }
  const segmenter=window.Intl&&Intl.Segmenter?new Intl.Segmenter(undefined,{granularity:"grapheme"}):null;
  const emoji=segmenter?[...segmenter.segment(text)].map(part=>part.segment).find(isEmoji):Array.from(text).find(isEmoji);
  if(!emoji){$("emojiInput").focus();return;}
  $("emojiInput").value=emoji;
  const data=readProfile();
  try{
    data.badge=emoji;
    localStorage.setItem(profileKey(),JSON.stringify(data));
    $("profileBadge").textContent=emoji;
    $("profileBadge").classList.remove("hidden");
    $("emojiTrigger").classList.add("hidden");
    updateProfileNav();
    fitProfileNickname();
    $("emojiPicker").classList.add("hidden");
  }catch(_){profileMsg("Не удалось сохранить смайлик.",true);}
}
$("emojiApply").onclick=()=>applyProfileEmoji($("emojiInput").value);
$("emojiInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();applyProfileEmoji(e.currentTarget.value);}});
 $("emojiInput").addEventListener("input",()=>{
  const value=$("emojiInput").value, segmenter=window.Intl&&Intl.Segmenter?new Intl.Segmenter(undefined,{granularity:"grapheme"}):null;
  const isEmoji=part=>/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u.test(part);
  const one=segmenter?[...segmenter.segment(value)].map(part=>part.segment).find(isEmoji):Array.from(value).find(isEmoji);
  if(one&&value!==one)$("emojiInput").value=one;
});
$("emojiRemove").onclick=()=>{
  const data=readProfile();delete data.badge;
  try{localStorage.setItem(profileKey(),JSON.stringify(data));$("profileBadge").textContent="";$("profileBadge").classList.add("hidden");$("emojiTrigger").classList.remove("hidden");updateProfileNav();fitProfileNickname();$("emojiPicker").classList.add("hidden");}
  catch(_){profileMsg("Не удалось убрать смайлик.",true);}
};
document.addEventListener("click",e=>{
  if(!e.target.closest(".emoji-picker-wrap"))$("emojiPicker").classList.add("hidden");
});
$("acc").onclick = e => {
  const toggle = e.target.closest("[data-pass]");
  if (toggle) {
    const input = $(toggle.dataset.pass);
    if (!input) return;
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    toggle.textContent = visible ? "Показать" : "Скрыть";
    toggle.setAttribute("aria-label", visible ? "Показать пароль" : "Скрыть пароль");
    toggle.setAttribute("aria-pressed", String(!visible));
    return;
  }
  const id = e.target.id;
  if (id === "alogin") doAuth("in");
  else if (id === "asign") doAuth("up");
  else if (id === "aforgot") forgot();
  else if (id === "logout") logout();
  else if (id === "anew") setNewPassword();
  else if (id === "saveNick") saveNickname();
};
$("acc").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.id === "aem" || e.target.id === "anick" || e.target.id === "apw") doAuth("in");
  if (e.target.id === "apn") setNewPassword();
  if (e.target.id === "anickEdit") saveNickname();
});

let L = null;
const norm = v => String(v).trim().toLowerCase().replace(/\s+/g, " ");
const shuf = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
$("learn").onclick = () => { location.hash = "l-" + cur.id; };
$("lx").onclick = () => closeStudy();
function beginLearn(){
  L = {terms: cur.cards.map(c => ({c, stage: 0})), last: null, ok: 0, tries: 0, streak: 0, pct: 0, cur: null, locked: false, mode: "c", opts: [], right: 0};
  $("ln").classList.remove("hidden"); document.body.style.overflow = "hidden";
  nextQ();
}
function endLearn(){
  $("ln").classList.add("hidden"); L = null;
  if ($("fs").classList.contains("hidden")) document.body.style.overflow = "";
}
function lprog(){
  const total = L.terms.length * 2, done = L.terms.reduce((a, t) => a + t.stage, 0), pct = done / total * 100;
  const bar = $("lbar"), fill = $("lfill"), badge = $("lbadge"), fire = $("lfire");
  const prevPct = L.pct || 0, hot = L.streak >= 5, activating = hot && !bar.classList.contains("hot");
  const setPos = value => {
    fill.style.width = value + "%";
    badge.style.left = value + "%";
    fire.style.left = value + "%";
  };
  if (activating) {
    setPos(prevPct);
    bar.classList.add("hot");
    const session = L;
    requestAnimationFrame(() => { if (L === session) setPos(pct); });
  } else {
    bar.classList.toggle("hot", hot);
    setPos(pct);
  }
  badge.textContent = done; $("lend").textContent = total;
  L.pct = pct;
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
  $("lbody").innerHTML = '<div class="lcard"><div class="lrow">' +
    (t.c.wi ? '<img class="lqim" src="' + t.c.wi + '" alt="">' : "") +
    '<div><div class="llab">Слово</div><div class="lq">' + esc(t.c.w) + '</div></div></div>' +
    '<div class="llab sp">Выберите перевод</div><div class="opts">' +
    opts.map((o, i) => '<button class="opt" data-i="' + i + '"><b>' + (i + 1) + '</b><span>' + esc(o) + '</span></button>').join("") +
    '</div><div class="lact"><button class="skip" id="skip">Не уверены?</button></div><div id="lfb"></div></div>';
}
function renderTyped(t){
  L.mode = "t";
  $("lbody").innerHTML = '<div class="lcard"><div class="lrow">' +
    (t.c.ti ? '<img class="lqim" src="' + t.c.ti + '" alt="">' : "") +
    '<div><div class="llab">Перевод</div><div class="lq">' + esc(t.c.t) + '</div></div></div>' +
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
  if (ok) { fb.innerHTML = '<p class="fbok">Верно!</p>'; setTimeout(advance, 650); return; }
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

/* подбор: сопоставьте слово и перевод, порциями по 6 пар (12 плиток) */
let P = null;
$("pick").onclick = () => { location.hash = "p-" + cur.id; };
$("px").onclick = () => closeStudy();
function beginPick(){
  P = {cards: shuf(cur.cards.slice()), pos: 0, matched: 0, total: cur.cards.length, errors: 0, batchLeft: 0, sel: null, lock: false, t0: 0, iv: null};
  $("pm").classList.remove("hidden"); document.body.style.overflow = "hidden";
  startTimer();
  nextBatch();
}
function endPick(){
  stopTimer(); $("pm").classList.add("hidden"); P = null;
  if ($("fs").classList.contains("hidden") && $("ln").classList.contains("hidden")) document.body.style.overflow = "";
}
function pprog(){
  $("pbar").style.width = (P.matched / P.total * 100) + "%";
  $("pleft").textContent = P.matched + "/" + P.total;
}
function nextBatch(){
  const batch = P.cards.slice(P.pos, P.pos + 6);
  P.pos += batch.length; P.batchLeft = batch.length; P.sel = null; P.lock = false;
  const tiles = shuf(batch.flatMap(c => [{c, side: "w"}, {c, side: "t"}]));
  P.tiles = tiles;
  const num = Math.ceil(P.pos / 6), all = Math.ceil(P.total / 6);
  $("pbody").innerHTML = '<div class="pmeta">Комбинация ' + num + " из " + all + " — соберите пары</div>" +
    '<div class="pgrid">' + tiles.map((t, i) =>
      '<button class="mtile" data-i="' + i + '">' + esc(t.side === "w" ? t.c.w : t.c.t) + "</button>").join("") + "</div>";
  pprog();
}
function tileEl(i){ return $("pbody").querySelector('.mtile[data-i="' + i + '"]'); }
$("pbody").onclick = e => {
  const b = e.target.closest(".mtile"); if (!b || !P || P.lock) return;
  if (b.classList.contains("ok")) return;
  const i = +b.dataset.i, t = P.tiles[i];
  if (P.sel === null) { P.sel = i; b.classList.add("sel"); return; }
  if (P.sel === i) { P.sel = null; b.classList.remove("sel"); return; }
  const a = P.tiles[P.sel], elA = tileEl(P.sel);
  P.sel = null; elA.classList.remove("sel");
  const hit = a.side !== t.side && (a.c === t.c || (norm(a.c.w) === norm(t.c.w) && norm(a.c.t) === norm(t.c.t)));
  if (hit) {
    elA.classList.add("ok"); b.classList.add("ok");
    P.matched++; P.batchLeft--;
    pprog();
    if (!P.batchLeft) setTimeout(() => { if (P) (P.matched >= P.total ? pickDone() : nextBatch()); }, 700);
  } else {
    P.errors++; P.lock = true;
    elA.classList.add("bad"); b.classList.add("bad");
    setTimeout(() => { elA.classList.remove("bad"); b.classList.remove("bad"); if (P) P.lock = false; }, 550);
  }
};
const CROWN_SRC = "crown.png";
const fmtT = (ms, tenth) => {
  const s = ms / 1000, m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m + ":" + String(r).padStart(2, "0") + (tenth ? "." + Math.floor((ms % 1000) / 100) : "");
};
function startTimer(){ stopTimer(); P.t0 = performance.now(); tickTimer(); P.iv = setInterval(tickTimer, 250); }
function tickTimer(){ if (P) $("ptime").textContent = fmtT(performance.now() - P.t0); }
function stopTimer(){ if (P && P.iv) { clearInterval(P.iv); P.iv = null; } }
/* ключ рейтинга: одинаковый набор слов и переводов даёт одну и ту же таблицу результатов */
function modKey(cards){
  const s = cards.map(c => norm(c.w) + "\u0001" + norm(c.t)).sort().join("\u0002");
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
    h2 = (Math.imul(h2 + ch, 2246822519) >>> 0) ^ (h2 >>> 13);
  }
  return h1.toString(16) + (h2 >>> 0).toString(16) + "-" + cards.length;
}
function boardHtml(rows, note){
  const row = (r, pos) => '<div class="brow' + (r.user_id === user.id ? " mine" : "") + '"><span class="bpos">' + pos + '</span><span class="bname">' +
    (pos === 1 ? '<img class="crown" src="' + CROWN_SRC + '" alt="1 место">' : "") + esc(r.user_id === user.id ? authorName() : (r.author || "участник")) +
    '</span><span class="btime">' + fmtT(r.time_ms, true) + '</span></div>';
  const mineIdx = rows.findIndex(r => r.user_id === user.id);
  let h = '<h2>Рейтинг по этому набору слов</h2>' + (note ? '<p class="sub">' + esc(note) + '</p>' : "") +
    rows.slice(0, 10).map((r, i) => row(r, i + 1)).join("");
  if (mineIdx >= 10) h += '<div class="bgap">…</div>' + row(rows[mineIdx], mineIdx + 1);
  if (rows.length < 2) h += '<p class="sub">Пока вы один. Поделитесь модулем, чтобы друзья могли соревноваться с вами.</p>';
  return h;
}
async function showBoard(key, ms, n){
  const box = $("board"); if (!box || !sb) return;
  if (!user) { box.innerHTML = '<p class="sub">Войдите в аккаунт, чтобы сохранить время и попасть в рейтинг.</p>'; return; }
  box.innerHTML = '<p class="sub">Загружаем рейтинг…</p>';
  try {
    let note;
    const mine = await sb.from("match_scores").select("time_ms").eq("module_key", key).eq("user_id", user.id).maybeSingle();
    if (mine.error) throw mine.error;
    const best = mine.data ? mine.data.time_ms : null;
    if (best === null || ms < best) {
      const r = await sb.from("match_scores").upsert({ module_key: key, user_id: user.id, author: authorName(), time_ms: ms, words: n });
      if (r.error) throw r.error;
      note = best === null ? "Ваш результат сохранён." : "Новый личный рекорд!";
    } else note = "Ваш рекорд: " + fmtT(best, true);
    const res = await sb.from("match_scores").select("user_id,author,time_ms").eq("module_key", key).order("time_ms", { ascending: true }).limit(100);
    if (res.error) throw res.error;
    if ($("board")) $("board").innerHTML = boardHtml(res.data || [], note);
  } catch (e) {
    if ($("board")) $("board").innerHTML = '<p class="err">Не удалось загрузить рейтинг: ' + esc((e && e.message) || "ошибка") + '</p>';
  }
}
function pickDone(){
  stopTimer();
  const ms = Math.round(performance.now() - P.t0), n = P.total, errs = P.errors;
  const acc = Math.round(n / (n + errs) * 100);
  $("ptime").textContent = fmtT(ms);
  $("pbody").innerHTML = '<div class="done"><h1>Все пары собраны</h1><div class="ptimebig">' + fmtT(ms, true) + '</div>' +
    '<p class="sub">Ошибок: ' + errs + " · точность " + acc + '%</p><div class="board" id="board"></div>' +
    '<button class="b pri" id="pagain">Ещё раз</button><button class="b" id="pfin">К модулю</button></div>';
  $("pagain").onclick = beginPick; $("pfin").onclick = closeStudy;
  showBoard(modKey(cur.cards), ms, n);
}
document.addEventListener("keydown", e => {
  if (!P || $("pm").classList.contains("hidden")) return;
  if (e.key === "Escape") closeStudy();
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
  loadFriendFeed();
}
async function loadFriendFeed(){
  if(!user||!sb)return;
  const box=$("omods"); box.innerHTML='<p class="sub">Загружаем модули друзей…</p>';
  const {data,error}=await sb.from("friend_requests").select("sender_id,receiver_id").eq("status","accepted").or("sender_id.eq."+user.id+",receiver_id.eq."+user.id);
  if(error){box.innerHTML='<p class="amsg err">Не удалось загрузить модули друзей.</p>';return}
  const ids=data.map(r=>r.sender_id===user.id?r.receiver_id:r.sender_id);
  const all=[];
  for(const id of ids){
    const [p,m]=await Promise.all([
      sb.from("profiles").select("nickname").eq("user_id",id).maybeSingle(),
      sb.rpc("get_friend_modules",{target_user:id})
    ]);
    if(!m.error)(m.data||[]).forEach(x=>all.push({...x,friendId:id,friendName:p.data?.nickname||"Друг"}));
  }
  others=all;
  renderFriendModules(all.map(x=>({module_name:x.module_name,cards:x.cards,friendName:x.friendName})).map(x=>({...x,module_name:x.friendName+" · "+x.module_name})),"omods");
}
$("omods").onclick = e => { const b=e.target.closest("[data-import-friend]"); if(b)importFriendModule("omods",+b.dataset.importFriend,b); };
function renderShare(){
  const box = $("shr"); if (!cur) return;
  if (!user) { box.innerHTML = '<p>Войдите в аккаунт, чтобы делиться модулями.</p>'; return; }
  const on = !!cur.sharedId && mineRows.some(r => r.id === cur.sharedId);
  box.innerHTML = (on
    ? '<p>Модуль в общем доступе: его могут добавить себе все пользователи сайта.</p><button class="b" id="shUp">Обновить общую копию</button><button class="b" id="shOff">Закрыть доступ</button>'
    : '<p>Поделитесь модулем: его смогут добавить себе все пользователи сайта. У них будет своя копия. Ваш никнейм в каталоге: <b>' + esc(authorName()) + '</b>.</p><button class="b pri" id="shOn">Поделиться модулем</button>') +
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

/* темы: палитры на выбор, шрифты не меняются */
const TKEY = "english-theme", mq = window.matchMedia("(prefers-color-scheme: dark)");
const PALS = [
  {id: "classic", name: "Классика", d: ["#f5ede3", "#fcf8f3", "#4d6080", "#f4721e"]},
  {id: "dark", name: "Тёмная", d: ["#182133", "#222e46", "#8ea5ca", "#ff9a5c"]},
  {id: "forest", name: "Лес", d: ["#f4f2e2", "#fefae0", "#606c38", "#283618"]},
  {id: "denim", name: "Деним", d: ["#eae5d8", "#f9f5ed", "#5e83ae", "#b85c3f"]},
  {id: "haze", name: "Туман", d: ["#ffffff", "#f5f6f7", "#4f6b85", "#565a60"]},
  {id: "rose", name: "Роза", d: ["#f2e4e6", "#fdf0f1", "#c15f74", "#a04a58"]},
  {id: "bubble", name: "Баблгам", d: ["#ffedf1", "#fff8fa", "#ff5c89", "#c2185b"]}
];
const curPal = () => document.documentElement.dataset.theme || (mq.matches ? "dark" : "classic");
const PALI = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".9" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r=".9" fill="currentColor" stroke="none"/><circle cx="8.5" cy="7.5" r=".9" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12.5" r=".9" fill="currentColor" stroke="none"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.7 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H17c3 0 5.5-2.5 5.5-5.5C22.5 6 18 2 12 2z"/></svg>';
function renderPal(){
  const themeButton=$("theme");
  if(themeButton){themeButton.innerHTML=PALI;themeButton.setAttribute("aria-label","Выбрать тему");}
  const on = curPal();
  const choices = $("themeChoices");
  if (!choices) return;
  choices.innerHTML = PALS.map(p =>
    '<button class="palopt' + (p.id === on ? " on" : "") + '" data-pal="' + p.id + '">' +
    '<span class="pdots">' + p.d.map(c => '<i style="background:' + c + '"></i>').join("") + '</span><span class="pname">' + p.name + '</span></button>').join("");
}
if($("theme")) $("theme").onclick = e => { e.stopPropagation(); renderPal(); $("themeChoices").classList.toggle("hidden"); };
$("themeChoices").onclick = e => {
  const b = e.target.closest(".palopt"); if (!b) return;
  document.documentElement.dataset.theme = b.dataset.pal;
  try { localStorage.setItem(TKEY, b.dataset.pal); } catch (err) {}
  renderPal();
};
try { mq.addEventListener("change", () => { if (!localStorage.getItem(TKEY)) renderPal(); }); } catch (e) {}
renderPal();

route();
renderAcc();
initAuth();
