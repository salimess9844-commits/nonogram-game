import {
  getUser, login, logout, signup, requestPasswordRecovery, updateUser,
  handleAuthCallback, onAuthChange, AuthError, MissingIdentityError,
} from "@netlify/identity";
import { PUZZLES, BASE, clues, pointsFor } from "./puzzles.js";

const GROUPS = [
  { n: 5, title: "Warm-up" },
  { n: 10, title: "Standard" },
  { n: 15, title: "Hard" },
];

const S = {
  view: "puzzles", puzzle: null, grid: null, tool: "fill",
  start: 0, elapsed: 0, done: false, timer: 0, result: null,
  user: null, players: [], boardState: "loading", local: {},
  lbPid: PUZZLES[0].id, randSeed: "",
};

const $ = (id) => document.getElementById(id);
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
const mmss = (ms) => {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const me = () => (S.user ? S.players.find((p) => p.id === S.user.id) : null);
function solves() { return S.user ? (me() || {}).solves || {} : S.local; }
function label(p) {
  if (p.random) return "Random " + p.n + "×" + p.n + " #" + p.seed;
  const idx = PUZZLES.filter((q) => q.n === p.n).indexOf(p) + 1;
  return "No. " + idx;
}
const displayName = (u) => u.name || (u.userMetadata && u.userMetadata.full_name) || "Player";

/* scores API */
async function loadBoard() {
  try {
    const res = await fetch("/api/scores");
    if (!res.ok) throw new Error(res.status);
    S.players = (await res.json()).players;
    S.boardState = "ready";
  } catch {
    S.boardState = "error";
  }
  refresh();
}
async function saveSolve(puzzleId, ms) {
  const res = await fetch("/api/scores", {
    method: "POST", headers: { "content-type": "application/json" },
    credentials: "same-origin", body: JSON.stringify({ puzzleId, ms }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "error " + res.status);
  S.players = data.players;
  S.boardState = "ready";
}

/* random puzzles */
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomPuzzle(n, seed) {
  const rnd = mulberry(seed * 7919 + n);
  const dens = n === 5 ? 0.6 : 0.55;
  const sol = Array.from({ length: n }, () => Array.from({ length: n }, () => (rnd() < dens ? 1 : 0)));
  for (let r = 0; r < n; r++) if (!sol[r].some(Boolean)) sol[r][Math.floor(rnd() * n)] = 1;
  for (let c = 0; c < n; c++) if (!sol.some((row) => row[c])) sol[Math.floor(rnd() * n)][c] = 1;
  return {
    id: "r" + n + "-" + seed, n, name: "Random", random: true, seed, sol,
    rowC: sol.map(clues), colC: sol[0].map((_, c) => clues(sol.map((row) => row[c]))),
  };
}

/* thumbnails */
function art(p, cls) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + p.n + " " + p.n);
  svg.setAttribute("aria-hidden", "true");
  if (cls) svg.setAttribute("class", cls);
  let d = "";
  p.sol.forEach((row, r) => row.forEach((v, c) => { if (v) d += "M" + c + " " + r + "h1v1h-1z"; }));
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}
function blankThumb(n) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + n + " " + n);
  svg.setAttribute("aria-hidden", "true");
  let d = "";
  for (let i = 1; i < n; i++) d += "M" + i + " 0V" + n + "M0 " + i + "H" + n;
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("stroke", "var(--line)");
  path.setAttribute("stroke-width", "0.06");
  path.setAttribute("fill", "none");
  svg.append(path);
  return svg;
}

/* navigation */
function setView(v) {
  S.view = v;
  stopTimer();
  $("tab-puzzles").setAttribute("aria-current", v === "board" ? "false" : "page");
  $("tab-board").setAttribute("aria-current", v === "board" ? "page" : "false");
  render();
  window.scrollTo(0, 0);
  if (v === "board") loadBoard();
}
$("tab-puzzles").addEventListener("click", () => setView("puzzles"));
$("tab-board").addEventListener("click", () => setView("board"));

function render() {
  const v = $("view");
  v.replaceChildren();
  if (S.view === "board") v.append(boardView());
  else if (S.view === "play") v.append(playView());
  else v.append(libraryView());
}
function refresh() {
  renderChip();
  if (S.view === "puzzles" || S.view === "board") render();
}
function renderChip() {
  const c = $("chip");
  c.replaceChildren();
  if (S.user) {
    if (S.user.pictureUrl) c.append(el("img", { src: S.user.pictureUrl, alt: "" }));
    c.append(el("span", { text: displayName(S.user) }),
      el("button", { class: "btn", type: "button", onclick: () => logout().catch(() => {}) }, "Sign out"));
  } else {
    c.append(el("span", { text: "Guest" }),
      el("button", { class: "btn primary", type: "button", onclick: () => openAuth("login") }, "Sign in"));
  }
}

/* library */
function accessNote() {
  if (S.user) return null;
  return el("div", { class: "note info" }, "You are playing as a guest. ",
    el("button", { class: "linkish", type: "button", onclick: () => openAuth("signup") }, "Create an account"),
    " or ", el("button", { class: "linkish", type: "button", onclick: () => openAuth("login") }, "sign in"),
    " to save times and appear on the leaderboard.");
}
function libraryView() {
  const sv = solves();
  const real = PUZZLES.filter((p) => sv[p.id]);
  const pts = real.reduce((a, p) => a + sv[p.id].pts, 0);
  const root = el("div", {});
  const note = accessNote();
  if (note) root.append(note);
  root.append(el("div", { class: "lib-head" },
    el("h2", { text: "Pick a puzzle" }),
    el("span", { class: "stat", text: real.length + " / " + PUZZLES.length + " solved · " + pts + " pts" })));
  for (const g of GROUPS) {
    const list = PUZZLES.filter((p) => p.n === g.n);
    const cards = el("div", { class: "cards" });
    list.forEach((p, i) => {
      const s = sv[p.id];
      const thumb = el("div", { class: "thumb" });
      thumb.append(s ? art(p) : blankThumb(p.n));
      cards.append(el("button", { class: "card" + (s ? " solved" : ""), type: "button", onclick: () => startPuzzle(p) },
        thumb,
        el("div", { class: "t", text: s ? p.name : "No. " + (i + 1) }),
        el("div", { class: "m" },
          el("span", { text: s ? mmss(s.ms) : g.n + "×" + g.n }),
          el("span", { text: s ? s.pts + " pts" : "up to " + BASE[g.n] * 2 }))));
    });
    root.append(el("section", { class: "group" },
      el("h3", { text: g.title }, el("small", { text: g.n + "×" + g.n + " · " + list.length + " puzzles" })),
      cards));
  }
  const seed = el("input", { id: "seed", type: "number", min: "1", max: "999999", value: S.randSeed, placeholder: "e.g. 4821" });
  seed.addEventListener("input", () => { S.randSeed = seed.value; });
  // An empty seed field means "surprise me": pick a fresh seed every time instead of remembering the last one.
  const play = (n) => {
    const typed = parseInt(S.randSeed, 10);
    const sd = typed >= 1 && typed <= 999999 ? typed : 1 + Math.floor(Math.random() * 999999);
    startPuzzle(randomPuzzle(n, sd));
  };
  root.append(el("section", { class: "group" },
    el("h3", { text: "Random" }, el("small", { text: "practice only, no points" })),
    el("div", { class: "rand" },
      el("label", { class: "field", for: "seed" }, "Seed (optional)", seed),
      [5, 10, 15].map((n) => el("button", { class: "btn", type: "button", onclick: () => play(n) }, n + "×" + n)))));
  return root;
}

/* play */
function startPuzzle(p) {
  S.puzzle = p; S.view = "play"; S.done = false; S.result = null;
  S.grid = Array.from({ length: p.n }, () => Array(p.n).fill(0));
  S.start = 0; S.elapsed = 0; S.tool = "fill";
  $("tab-puzzles").setAttribute("aria-current", "page");
  $("tab-board").setAttribute("aria-current", "false");
  stopTimer();
  render();
  window.scrollTo(0, 0);
}
function stopTimer() { if (S.timer) { clearInterval(S.timer); S.timer = 0; } }
function tick() {
  S.elapsed = Date.now() - S.start;
  const t = $("timer");
  if (t) t.textContent = mmss(S.elapsed);
}

let cellEls = [], rowEls = [], colEls = [];

function playView() {
  const p = S.puzzle, n = p.n;
  const root = el("div", {});
  const note = p.random ? null : accessNote();
  if (note) root.append(note);
  const timer = el("span", { class: "timer", id: "timer", text: mmss(S.elapsed) });
  root.append(el("div", { class: "play-head" },
    el("button", { class: "btn", type: "button", onclick: () => setView("puzzles") }, "← Puzzles"),
    el("h2", { text: S.done && !p.random ? p.name : label(p) + " · " + n + "×" + n }),
    timer));

  const fillBtn = el("button", { type: "button", "aria-pressed": "true" }, el("span", { class: "sw" }), "Fill");
  const crossBtn = el("button", { type: "button", "aria-pressed": "false" }, "× Cross");
  const setTool = (t) => {
    S.tool = t;
    fillBtn.setAttribute("aria-pressed", String(t === "fill"));
    crossBtn.setAttribute("aria-pressed", String(t === "cross"));
  };
  fillBtn.addEventListener("click", () => setTool("fill"));
  crossBtn.addEventListener("click", () => setTool("cross"));
  root.append(el("div", { class: "toolbar" },
    el("div", { class: "seg", role: "group", "aria-label": "Tool" }, fillBtn, crossBtn),
    el("button", { class: "btn", type: "button", onclick: () => startPuzzle(S.puzzle) }, "Restart")));
  root.append(el("p", { class: "hint", text: "Drag to paint a row or column. Numbers fade once a line matches. Right-click also marks a cross." }));

  const colClues = el("div", { class: "colclues" });
  colEls = p.colC.map((cl) => { const e = el("div", { class: "colclue" }, cl.map((v) => el("span", { text: v }))); colClues.append(e); return e; });
  const rowClues = el("div", { class: "rowclues" });
  rowEls = p.rowC.map((cl) => { const e = el("div", { class: "rowclue" }, cl.map((v) => el("span", { text: v }))); rowClues.append(e); return e; });
  const cells = el("div", { class: "cells", id: "cells" });
  cellEls = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const e = el("div", { class: "cell" + (c % 5 === 4 && c < n - 1 ? " gr" : "") + (r % 5 === 4 && r < n - 1 ? " gb" : "") });
      e.dataset.r = r; e.dataset.c = c;
      cells.append(e); cellEls.push(e);
    }
  }
  const board = el("div", { class: "board", id: "board", style: "--n:" + n }, el("div", {}), colClues, rowClues, cells);
  const host = el("div", { class: "board-host", id: "host" }, board);
  root.append(host);
  bindBoard(cells);
  paint();
  requestAnimationFrame(fit);
  if (S.done && S.result) root.append(resultCard());
  return root;
}

function fit() {
  const host = $("host"), board = $("board");
  if (!host || !S.puzzle) return;
  const n = S.puzzle.n;
  const maxRow = Math.max(...S.puzzle.rowC.map((c) => c.length));
  const avail = host.clientWidth - 28;
  const cap = n === 5 ? 56 : n === 10 ? 40 : 34;
  let cs = Math.floor((avail - 10) / (n + maxRow * 0.95));
  cs = Math.max(16, Math.min(cap, cs));
  board.style.setProperty("--cs", cs + "px");
  board.style.setProperty("--fs", Math.max(10, Math.round(cs * 0.48)) + "px");
}
window.addEventListener("resize", fit);

const lineOk = (line, want) => same(clues(line.map((v) => (v === 1 ? 1 : 0))), want);
function paint() {
  const p = S.puzzle, n = p.n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const v = S.grid[r][c];
    cellEls[r * n + c].classList.toggle("f", v === 1);
    cellEls[r * n + c].classList.toggle("x", v === 2 && !S.done);
  }
  for (let r = 0; r < n; r++) rowEls[r].classList.toggle("ok", lineOk(S.grid[r], p.rowC[r]));
  for (let c = 0; c < n; c++) colEls[c].classList.toggle("ok", lineOk(S.grid.map((row) => row[c]), p.colC[c]));
}
function isSolved() {
  const p = S.puzzle, n = p.n;
  for (let r = 0; r < n; r++) if (!lineOk(S.grid[r], p.rowC[r])) return false;
  for (let c = 0; c < n; c++) if (!lineOk(S.grid.map((row) => row[c]), p.colC[c])) return false;
  return true;
}

function bindBoard(cells) {
  let drag = null;
  const put = (cell, first) => {
    if (!cell || !cell.classList.contains("cell")) return;
    const r = +cell.dataset.r, c = +cell.dataset.c, g = S.grid[r][c];
    if (first) { S.grid[r][c] = drag.val; }
    else if (drag.val === 0) { if (g === drag.from) S.grid[r][c] = 0; else return; }
    else { if (g === 0) S.grid[r][c] = drag.val; else return; }
    if (!S.start) { S.start = Date.now(); S.timer = setInterval(tick, 250); }
    paint();
  };
  cells.addEventListener("contextmenu", (e) => e.preventDefault());
  cells.addEventListener("pointerdown", (e) => {
    if (S.done) return;
    const cell = e.target.closest(".cell");
    if (!cell) return;
    e.preventDefault();
    const r = +cell.dataset.r, c = +cell.dataset.c, cur = S.grid[r][c];
    const want = e.button === 2 || S.tool === "cross" ? 2 : 1;
    drag = { from: cur, val: cur === want ? 0 : want };
    cells.setPointerCapture(e.pointerId);
    put(cell, true);
  });
  cells.addEventListener("pointermove", (e) => {
    if (!drag) return;
    put(document.elementFromPoint(e.clientX, e.clientY), false);
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    if (!S.done && isSolved()) finish();
  };
  cells.addEventListener("pointerup", end);
  cells.addEventListener("pointercancel", end);
}

async function finish() {
  S.done = true;
  stopTimer();
  S.elapsed = Date.now() - S.start;
  const p = S.puzzle, ms = S.elapsed;
  const pts = pointsFor(p, ms);
  const prev = solves()[p.id];
  S.result = { ms, pts, best: !prev || ms < prev.ms, prevMs: prev ? prev.ms : null, saved: false, msg: "" };
  paint();
  render();
  const again = () => { if (S.view === "play" && S.puzzle === p) render(); };
  if (p.random) { S.result.msg = "Random puzzles are for practice, so they do not score."; again(); return; }
  if (!S.result.best) { S.result.msg = "Your best time on this puzzle is " + mmss(prev.ms) + ", so the score stays as it was."; again(); return; }
  if (S.user) {
    try {
      await saveSolve(p.id, ms);
      S.result.saved = true;
    } catch (e) {
      S.result.msg = "Your time could not be saved (" + e.message + "). Check your connection and try again.";
    }
  } else {
    S.local[p.id] = { ms, pts };
    S.result.msg = "Guest times are kept only until you close the page. Sign in to save them to the leaderboard.";
  }
  again();
}
function resultCard() {
  const p = S.puzzle, r = S.result;
  return el("div", { class: "result" },
    el("div", { class: "art" }, art(p)),
    el("div", {},
      el("h3", { text: p.random ? "Solved in " + mmss(r.ms) : "It's a " + p.name.toLowerCase() + "! " + mmss(r.ms) }),
      el("p", {}, p.random ? "" : el("span", { class: "ok-text", text: "+" + r.pts + " pts" }),
        p.random ? "" : (r.best ? (r.prevMs ? " · new personal best" : " · first solve") : ""),
        r.saved ? " · saved to the leaderboard" : ""),
      r.msg ? el("p", { text: r.msg }) : null,
      el("div", { class: "acts" },
        el("button", { class: "btn primary", type: "button", onclick: () => setView("puzzles") }, "More puzzles"),
        el("button", { class: "btn", type: "button", onclick: () => { S.lbPid = p.random ? S.lbPid : p.id; setView("board"); } }, "Leaderboard"))));
}

/* leaderboard */
function boardView() {
  const root = el("div", {});
  const note = accessNote();
  if (note) root.append(note);
  root.append(el("div", { class: "lib-head" }, el("h2", { text: "Leaderboard" }),
    el("span", { class: "stat", text: S.players.length + (S.players.length === 1 ? " player" : " players") })));
  const uid = S.user && S.user.id;
  const whoCell = (p) => el("div", { class: "who" }, el("span", { text: p.name + (p.id === uid ? " (you)" : "") }));

  const total = PUZZLES.length;
  const rows = S.players.filter((p) => p.points > 0).sort((a, b) => (b.points - a.points) || (b.count - a.count) || (a.id < b.id ? -1 : 1));
  const panel = el("div", { class: "panel" });
  if (S.boardState === "error" && !S.players.length) panel.append(el("div", { class: "empty" }, el("strong", { text: "Leaderboard unavailable" }), "The standings could not be loaded. Try again in a moment."));
  else if (S.boardState === "loading" && !S.players.length) panel.append(el("div", { class: "empty" }, el("strong", { text: "Loading standings…" })));
  else if (!rows.length) panel.append(el("div", { class: "empty" }, el("strong", { text: "No scores yet" }), "Solve a puzzle and you take the first place."));
  else {
    const tb = el("tbody", {});
    rows.forEach((p, i) => tb.append(el("tr", { class: p.id === uid ? "me" : "" },
      el("td", { class: "rank", text: "#" + (i + 1) }), el("td", {}, whoCell(p)),
      el("td", { class: "num", text: p.count + " / " + total }), el("td", { class: "num", text: p.points }))));
    panel.append(el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "Rank" }), el("th", { text: "Player" }), el("th", { class: "num", text: "Solved" }), el("th", { class: "num", text: "Points" }))), tb));
  }
  root.append(el("h3", { class: "row-h", text: "Standings" }), panel);

  const sel = el("select", { class: "sel", id: "lbsel", "aria-label": "Puzzle" });
  PUZZLES.forEach((p) => { const o = el("option", { value: p.id, text: p.n + "×" + p.n + " · " + label(p) }); if (p.id === S.lbPid) o.selected = true; sel.append(o); });
  sel.addEventListener("change", () => { S.lbPid = sel.value; render(); });
  root.append(el("div", { class: "row-h" }, el("h3", { text: "Fastest times" }), sel));
  const times = S.players.filter((p) => p.solves[S.lbPid]).map((p) => ({ p, ms: p.solves[S.lbPid].ms })).sort((a, b) => a.ms - b.ms).slice(0, 10);
  const p2 = el("div", { class: "panel" });
  if (!times.length) p2.append(el("div", { class: "empty" }, el("strong", { text: "Nobody has solved this one" }), "Be the first on the clock."));
  else {
    const tb = el("tbody", {});
    times.forEach((t, i) => tb.append(el("tr", { class: t.p.id === uid ? "me" : "" }, el("td", { class: "rank", text: "#" + (i + 1) }), el("td", {}, whoCell(t.p)), el("td", { class: "num", text: mmss(t.ms) }))));
    p2.append(el("table", {}, el("thead", {}, el("tr", {}, el("th", { text: "Rank" }), el("th", { text: "Player" }), el("th", { class: "num", text: "Time" }))), tb));
  }
  root.append(p2);
  root.append(el("p", { class: "hint", text: "Points: 10 for a 5×5, 30 for a 10×10, 80 for a 15×15, doubled for a very fast solve and scaled down as time grows. Only your best time per puzzle counts." }));
  return root;
}

/* sign-in dialog */
function authMessage(err) {
  if (err instanceof MissingIdentityError) return "Accounts are not available on this site right now.";
  if (err instanceof AuthError) {
    if (err.status === 401) return "Invalid email or password.";
    if (err.status === 403) return "New sign-ups are closed.";
    if (err.status === 422) return "Check your email and password (at least 8 characters).";
    return err.message || "Something went wrong.";
  }
  return "Something went wrong. Try again.";
}
function openAuth(mode) {
  const dlg = $("auth");
  const errP = el("p", { class: "err", role: "alert" });
  const okP = el("p", { class: "ok", role: "status" });
  const input = (name, labelText, type, extra) =>
    el("label", { class: "field" }, labelText, el("input", Object.assign({ name, type, required: true }, extra)));
  const switchTo = (m) => el("button", { class: "linkish", type: "button", onclick: () => openAuth(m) },
    { login: "Have an account? Sign in", signup: "New here? Create an account", forgot: "Forgot password?" }[m]);
  const titles = { login: "Sign in", signup: "Create an account", forgot: "Reset your password", reset: "Choose a new password" };
  const fields = {
    login: [input("email", "Email", "email", { autocomplete: "email" }), input("password", "Password", "password", { autocomplete: "current-password" })],
    signup: [input("name", "Display name (shown on the leaderboard)", "text", { maxlength: "40", autocomplete: "nickname" }),
      input("email", "Email", "email", { autocomplete: "email" }), input("password", "Password", "password", { autocomplete: "new-password", minlength: "8" })],
    forgot: [input("email", "Email", "email", { autocomplete: "email" })],
    reset: [input("password", "New password", "password", { autocomplete: "new-password", minlength: "8" })],
  }[mode];
  const links = {
    login: [switchTo("signup"), switchTo("forgot")],
    signup: [switchTo("login")],
    forgot: [switchTo("login")],
    reset: [],
  }[mode];
  const submit = el("button", { class: "btn primary", type: "submit" }, titles[mode]);
  const form = el("form", { novalidate: false },
    el("h3", { text: titles[mode] }), fields, errP, okP,
    links.length ? el("div", { class: "links" }, links) : null,
    el("div", { class: "acts" },
      mode === "reset" ? null : el("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Cancel"),
      submit));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    errP.textContent = ""; okP.textContent = "";
    submit.disabled = true;
    try {
      if (mode === "login") {
        await login(f.get("email"), f.get("password"));
        dlg.close();
      } else if (mode === "signup") {
        const u = await signup(f.get("email"), f.get("password"), { full_name: String(f.get("name")).trim() });
        if (u.confirmedAt) dlg.close();
        else okP.textContent = "Check your email for a confirmation link, then come back to sign in.";
      } else if (mode === "forgot") {
        await requestPasswordRecovery(f.get("email"));
        okP.textContent = "If that address has an account, a reset link is on its way.";
      } else if (mode === "reset") {
        await updateUser({ password: f.get("password") });
        dlg.close();
      }
    } catch (err) {
      errP.textContent = authMessage(err);
    } finally {
      submit.disabled = false;
    }
  });
  dlg.replaceChildren(form);
  if (!dlg.open) dlg.showModal();
  const first = form.querySelector("input");
  if (first) first.focus();
}

/* boot */
function setUser(u) {
  S.user = u;
  refresh();
}

async function boot() {
  setView("puzzles");
  onAuthChange((event, u) => { setUser(u || null); });
  try {
    const cb = await handleAuthCallback();
    if (cb && cb.type === "recovery") openAuth("reset");
  } catch (err) {
    // Expired or already-used links land here; the page still works as normal.
    console.warn("Auth callback failed", err);
  }
  setUser(await getUser());
  loadBoard();
}
boot();
