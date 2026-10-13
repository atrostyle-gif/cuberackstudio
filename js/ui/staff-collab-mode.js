// STAFFモード専用: Firebase Auth + Firestoreによる共同編集・ToDo。
(function (global) {
  "use strict";
  var state = { started: false, firebase: null, auth: null, db: null, user: null, room: null, unsubs: [], applying: false, lastSnapshot: "", writeTimer: null, presenceTimer: null, snapshotTimer: null };
  var users = global.__STAFF_USERS__ || [];
  var clientId = "staff-" + Math.random().toString(36).slice(2);

  function load(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
  async function ensureFirebase() {
    if (global.firebase && global.firebase.apps) return global.firebase;
    await load("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
    await load("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js");
    await load("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js");
    return global.firebase;
  }
  function roomId() {
    var explicit = String(global.currentProjectId || "").trim().toLowerCase();
    if (explicit) return explicit.replace(/\//g, "-").replace(/\s+/g, "-").slice(0, 120);
    var name = String(global.currentFileName || "").trim().toLowerCase()
      .replace(/\.(mfes\.)?json$/i, "")
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return name && name !== "untitled" && name !== "未保存のデザイン" ? "file-" + name : "";
  }
  function esc(v) { var d = document.createElement("div"); d.textContent = String(v || ""); return d.innerHTML; }
  function host() { return document.getElementById("staff-collab-host"); }
  function renderLogin(message) {
    var el = host(); if (!el) return;
    el.innerHTML = '<p class="admin-menu-hint">共同編集するスタッフを選択し、各スタッフ用パスワードでログインします。</p><div class="staff-user-grid">' + users.map(function (u) { return '<button type="button" class="btn-secondary" data-staff="' + esc(u.id) + '">' + esc(u.name) + '</button>'; }).join("") + '</div><label class="staff-collab-label">パスワード<input id="staff-firebase-password" type="password" autocomplete="current-password"></label><p id="staff-firebase-error" class="admin-menu-login-error">' + esc(message) + '</p><button id="staff-firebase-login" type="button" class="btn-primary btn-full">共同編集を開始</button>';
    var selected = users[0] && users[0].id;
    el.querySelectorAll("[data-staff]").forEach(function (b) { b.addEventListener("click", function () { selected = b.dataset.staff; el.querySelectorAll("[data-staff]").forEach(function (x) { x.classList.toggle("is-selected", x === b); }); b.classList.add("is-selected"); }); });
    var first = el.querySelector("[data-staff]"); if (first) first.classList.add("is-selected");
    el.querySelector("#staff-firebase-login").addEventListener("click", async function () {
      var password = el.querySelector("#staff-firebase-password").value;
      var user = users.filter(function (u) { return u.id === selected; })[0];
      if (!password || !user) return renderLogin("スタッフとパスワードを入力してください。");
      try { await state.auth.signInWithEmailAndPassword(user.email, password); } catch (_) { renderLogin("パスワードが違うか、スタッフアカウントが未設定です。"); }
    });
  }
  function renderActive() {
    var el = host(); if (!el || !state.user) return;
    el.innerHTML = '<div class="staff-collab-status"><strong>' + esc(profileName()) + '</strong> として共同編集に参加中 <button id="staff-collab-logout" type="button" class="admin-menu-logout">共同編集を終了</button></div><div id="staff-presence" class="admin-menu-hint"></div><div class="staff-todo"><strong>ToDo</strong><div id="staff-todo-list"></div><div class="staff-todo-add"><input id="staff-todo-input" placeholder="ToDoを追加"><button id="staff-todo-add" type="button" class="btn-secondary">追加</button></div></div>';
    el.querySelector("#staff-collab-logout").onclick = function () { state.auth.signOut(); };
    el.querySelector("#staff-todo-add").onclick = addTodo;
    el.querySelector("#staff-todo-input").onkeydown = function (e) { if (e.key === "Enter") addTodo(); };
  }
  function profileName() { var hit = users.filter(function (u) { return u.email === state.user.email; })[0]; return hit ? hit.name : state.user.email; }
  function snapshot() { return typeof global.createSnapshot === "function" ? global.createSnapshot() : ""; }
  function writeState() {
    if (!state.user || !state.room || state.applying) return;
    var data = { snapshot: snapshot(), updatedAt: global.firebase.firestore.FieldValue.serverTimestamp(), updatedBy: state.user.uid, updatedByName: profileName() };
    state.db.collection("projects").doc(state.room).set(data, { merge: true });
  }
  function scheduleWrite() { clearTimeout(state.writeTimer); state.writeTimer = setTimeout(writeState, 350); }
  function subscribe() {
    state.unsubs.forEach(function (fn) { fn(); }); state.unsubs = [];
    clearInterval(state.presenceTimer); clearInterval(state.snapshotTimer);
    state.room = roomId();
    if (!state.room) { renderLogin("共同編集には、先にデザインを名前を付けて保存してください。"); return; }
    var project = state.db.collection("projects").doc(state.room);
    state.unsubs.push(project.onSnapshot(function (doc) {
      var d = doc.data() || {}; var next = d.snapshot || "";
      if (!next || d.updatedBy === state.user.uid || next === state.lastSnapshot || typeof global.applySnapshotFromString !== "function") return;
      state.applying = true; try { global.applySnapshotFromString(next); state.lastSnapshot = next; } finally { state.applying = false; }
    }));
    var presence = project.collection("presence");
    state.unsubs.push(presence.onSnapshot(function (q) { var names = q.docs.map(function (d) { return d.data().name; }).filter(Boolean); var el = document.getElementById("staff-presence"); if (el) el.textContent = "オンライン: " + (names.join("、") || "なし"); }));
    state.unsubs.push(project.collection("todos").orderBy("createdAt", "asc").onSnapshot(renderTodos));
    presence.doc(clientId).set({ uid: state.user.uid, name: profileName(), updatedAt: global.firebase.firestore.FieldValue.serverTimestamp() });
    state.lastSnapshot = snapshot(); writeState();
    state.presenceTimer = setInterval(function () { if (state.user && state.room) presence.doc(clientId).set({ uid: state.user.uid, name: profileName(), updatedAt: global.firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); }, 10000);
    state.snapshotTimer = setInterval(function () { if (state.user && snapshot() !== state.lastSnapshot) { state.lastSnapshot = snapshot(); scheduleWrite(); } }, 500);
  }
  function renderTodos(q) { var el = document.getElementById("staff-todo-list"); if (!el) return; el.innerHTML = q.docs.map(function (d) { var x = d.data(); return '<label><input type="checkbox" data-todo="' + d.id + '" ' + (x.done ? "checked" : "") + '> ' + esc(x.text) + '</label>'; }).join("") || '<p class="admin-menu-hint">ToDoはありません。</p>'; el.querySelectorAll("[data-todo]").forEach(function (b) { b.onchange = function () { state.db.collection("projects").doc(state.room).collection("todos").doc(b.dataset.todo).set({ done: b.checked }, { merge: true }); }; }); }
  function addTodo() { var input = document.getElementById("staff-todo-input"); var text = String(input && input.value || "").trim(); if (!text || !state.room) return; state.db.collection("projects").doc(state.room).collection("todos").add({ text: text, done: false, createdAt: Date.now(), author: profileName() }); input.value = ""; }
  async function start() {
    if (state.started) {
      if (state.user) { renderActive(); subscribe(); }
      else renderLogin("");
      return;
    }
    state.started = true;
    try { var firebase = await ensureFirebase(); state.firebase = firebase; state.auth = firebase.apps.length ? firebase.auth() : firebase.initializeApp(global.__STAFF_FIREBASE_CONFIG__).auth(); state.db = firebase.firestore(); state.auth.onAuthStateChanged(function (user) { state.user = user; if (user) { renderActive(); subscribe(); } else renderLogin(""); }); } catch (_) { renderLogin("共同編集の接続を開始できませんでした。"); }
  }
  global.openStaffCollaboration = start;
  global.closeStaffCollaboration = function () {
    state.unsubs.forEach(function (fn) { fn(); }); state.unsubs = [];
    clearInterval(state.presenceTimer); clearInterval(state.snapshotTimer);
    if (state.auth) return state.auth.signOut();
  };
})(window);
