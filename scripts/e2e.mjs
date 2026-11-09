// End-to-end test of the Bingo API with real players. Usage: node scripts/e2e.mjs [baseUrl incl. /classicbingo]
// Rooms are named "e2e-test-…" and deleted at the end (leave as every player, then a DB delete of leftovers
// with the service key as a safety net: env NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, else .env.local).
// Never sends feedback.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = (process.argv[2] ?? "https://games.hailatat.icu/classicbingo").replace(/\/$/, "");
const ORIGIN = new URL(BASE).origin;
const BASE_PATH = new URL(BASE).pathname;
const VERCEL = "https://web-bingo-game.vercel.app" + BASE_PATH;
const created = new Set();
let failures = 0;

function check(cond, msg) {
  if (cond) console.log("  ✓", msg);
  else {
    failures++;
    console.log("  ✗", msg);
  }
}

async function call(path, { token, body, method } = {}) {
  const headers = {};
  if (token) headers["x-player-token"] = token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method: method ?? (body !== undefined ? "POST" : "GET"),
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, region: res.headers.get("x-vercel-id") };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = async (code, p) => (await call(`/api/rooms/${code}/state`, { token: p.token })).data;

/** Rows, columns and the 2 diagonals of an n x n grid (cell indexes). */
function allLines(n) {
  const lines = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  lines.push(Array.from({ length: n }, (_, i) => i * n + i));
  lines.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)));
  return lines;
}
const linesDone = (board, n, set) => allLines(n).filter((l) => l.every((i) => set.has(board[i]))).length;

async function httpChecks() {
  console.log("HTTP (pages, assets, PWA)");
  const page = await fetch(BASE);
  const html = await page.text();
  check(page.status === 200, `GET ${BASE_PATH} = ${page.status}`);
  // The settings panel (with the version) is only on the room page: collect the chunks of both pages.
  const roomHtml = await (await fetch(`${BASE}/room/XXXXXX`)).text();
  const assets = [...new Set((html + roomHtml).match(new RegExp(`${BASE_PATH}/_next/static/[^"'\\\\]+\\.(?:js|css)`, "g")) ?? [])];
  check(assets.length > 0, `${assets.length} /_next assets referenced under the base path`);
  const assetStatus = await Promise.all(assets.map(async (a) => (await fetch(ORIGIN + a)).status));
  check(assetStatus.every((s) => s === 200), `all /_next assets 200 (${assetStatus.filter((s) => s !== 200).length} failed)`);
  const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  let hasVersion = false;
  for (const a of assets.filter((x) => x.endsWith(".js"))) if ((await (await fetch(ORIGIN + a)).text()).includes(`"${version}"`)) hasVersion = true;
  check(hasVersion, `client JS contains version ${version}`);

  const man = await fetch(`${BASE}/manifest.webmanifest`);
  const manifest = await man.json().catch(() => null);
  check(man.status === 200 && manifest?.start_url === `${BASE_PATH}/`, `manifest 200, start_url ${manifest?.start_url}`);
  for (const icon of manifest?.icons ?? []) {
    const r = await fetch(ORIGIN + icon.src);
    check(r.status === 200 && (r.headers.get("content-type") ?? "").includes("image/png"), `icon ${icon.src} = ${r.status}`);
  }
  for (const href of [...new Set(html.match(new RegExp(`${BASE_PATH}/(?:favicon\\.ico|pwa-icons/[^"'\\\\]+)`, "g")) ?? [])]) {
    check((await fetch(ORIGIN + href)).status === 200, `head icon ${href} = 200`);
  }
  check((await fetch(`${BASE}/sounds/line.mp3`)).status === 200, "line sound 200");
  check((await fetch(`${BASE}/room/XXXXXX`)).status === 200, "GET /room/XXXXXX = 200 (client shows the join form)");

  const v = await fetch(VERCEL);
  const vHtml = await v.text();
  const title = (h) => h.match(/<title>([^<]*)<\/title>/)?.[1];
  check(v.status === 200 && title(vHtml) === title(html), `${VERCEL} = ${v.status}, same page (title ${title(vHtml)})`);
  const chunk = (h) => (h.match(/_next\/static\/[^"']+\.js/g) ?? []).sort().join();
  check(chunk(vHtml) === chunk(html), "vercel.app serves the same build (same chunks)");
}

async function main() {
  console.log(`E2E against ${BASE}`);
  await httpChecks();

  console.log("Create, list, join, rejoin");
  const tag = `e2e-test-${Date.now().toString(36)}`;
  const dev = { A: randomUUID(), B: randomUUID(), C: randomUUID() };
  const r = await call("/api/rooms", { body: { name: tag, nickname: "Ana", password: "pw", size: 5, linesToWin: 1, deviceId: dev.A } });
  check(r.status === 200 && /^[A-Z2-9]{6}$/.test(r.data.code ?? ""), `create room (${r.status}) region=${r.region}`);
  const code = r.data.code;
  if (!code) throw new Error("no room");
  created.add(code);
  const A = { ...r.data, name: "Ana" };
  check((await call(`/api/rooms/${code}/join`, { body: { nickname: "Bob", password: "nope" } })).status === 403, "wrong password = 403");
  check((await call(`/api/rooms/${code}/join`, { body: { nickname: "Bob" } })).status === 403, "missing password = 403");
  const join = async (nickname, deviceId) => ({ ...(await call(`/api/rooms/${code}/join`, { body: { nickname, password: "pw", deviceId } })).data, name: nickname });
  const B = await join("Bob", dev.B);
  const C = await join("Cris", dev.C);
  check(!!B.token && !!C.token && B.playerId !== C.playerId, "Bob and Cris joined");
  check((await call(`/api/rooms/${code}/join`, { body: { nickname: "bob", password: "pw", deviceId: randomUUID() } })).status === 409, "nickname of a connected seat from another device = 409");
  check((await call(`/api/rooms/${code}/join`, { body: { nickname: "", password: "pw" } })).status === 400, "empty nickname = 400");
  check((await call(`/api/rooms/${code}/join`, { body: { nickname: "x".repeat(11), password: "pw" } })).status === 400, "nickname > 10 = 400");
  const list = await call("/api/rooms");
  const item = list.data.rooms?.find((x) => x.code === code);
  check(item?.name === tag && item.hasPassword && item.players === 3 && item.size === 5, "room in public list, 🔒, 3 players");
  check(!JSON.stringify(list.data).includes("password_hash") && !JSON.stringify(list.data).includes("scrypt"), "list leaks no password hash");

  // Rejoin with the saved token = /state works; rejoin from the same device = same seat, new token.
  check((await call(`/api/rooms/${code}/state`, { token: B.token })).status === 200, "saved token still works");
  const B2 = await join("bob", dev.B);
  check(B2.playerId === B.playerId && B2.token !== B.token, "rejoin from the same device = same seat, new token");
  check((await call(`/api/rooms/${code}/state`, { token: B.token })).status === 401, "old token = 401 after rejoin");
  Object.assign(B, B2, { name: "Bob" });
  check((await call(`/api/rooms/${code}/state`, { token: "bogus" })).status === 401, "bad token = 401");
  check((await call(`/api/rooms/${code}/state`)).status === 401, "no token = 401");
  check((await call(`/api/rooms/ZZZZZZ/state`, { token: A.token })).status === 404, "unknown room = 404");

  console.log("Settings and boards");
  check((await call(`/api/rooms/${code}/settings`, { token: B.token, body: { size: 3 } })).status === 403, "non-host settings = 403");
  check((await call(`/api/rooms/${code}/settings`, { token: A.token, body: { size: 11 } })).status === 400, "size 11 = 400");
  check((await call(`/api/rooms/${code}/settings`, { token: A.token, body: { linesToWin: 4 } })).status === 400, "4 lines = 400");
  check((await call(`/api/rooms/${code}/settings`, { token: A.token, body: { size: 4, linesToWin: 1 } })).status === 200, "host sets 4x4, 1 line");
  const n = 4;
  check((await call(`/api/rooms/${code}/board`, { token: B.token, body: { cells: [1, 2, 3] } })).status === 400, "short board = 400");
  const dup = Array.from({ length: 16 }, (_, i) => i + 1);
  dup[15] = 1;
  check((await call(`/api/rooms/${code}/board`, { token: B.token, body: { cells: dup } })).status === 400, "duplicate numbers = 400");
  check((await call(`/api/rooms/${code}/ready`, { token: B.token, body: {} })).status === 409, "ready without board = 409");
  const manual = Array.from({ length: 16 }, (_, i) => 16 - i);
  const bb = await call(`/api/rooms/${code}/board`, { token: B.token, body: { cells: manual } });
  check(bb.status === 200 && bb.data.board.join() === manual.join(), "manual board saved");
  for (const p of [A, C]) await call(`/api/rooms/${code}/board`, { token: p.token, body: { generate: true } });
  let sA = await state(code, A);
  check(sA.board?.length === 16 && new Set(sA.board).size === 16, "generated board 1..16");

  console.log("Ready and start");
  check((await call(`/api/rooms/${code}/start`, { token: A.token, body: {} })).status === 409, "start with players not ready = 409");
  for (const p of [A, B, C]) await call(`/api/rooms/${code}/ready`, { token: p.token, body: {} });
  check((await call(`/api/rooms/${code}/board`, { token: B.token, body: { generate: true } })).status === 409, "board locked after ready = 409");
  check((await call(`/api/rooms/${code}/start`, { token: B.token, body: {} })).status === 403, "non-host start = 403");
  check((await call(`/api/rooms/${code}/start`, { token: A.token, body: {} })).status === 200, "host starts");
  check((await call(`/api/rooms/${code}/start`, { token: A.token, body: {} })).status === 409, "double start = 409");
  check((await call(`/api/rooms/${code}/reorder`, { token: A.token, body: { order: [A.playerId, B.playerId, C.playerId] } })).status === 409, "reorder mid-game = 409");

  console.log("Spectators");
  const devE = randomUUID();
  const devD = randomUUID();
  const joinRes = (nickname, deviceId) => call(`/api/rooms/${code}/join`, { body: { nickname, password: "pw", deviceId } });
  const dRes = await joinRes("Dan", devD);
  check(dRes.status === 200 && dRes.data.role === "spectator", "joining a running room = spectator");
  const D = { ...dRes.data, name: "Dan" };
  const eRes = await joinRes("Eli", devE);
  const E = { ...eRes.data, name: "Eli" };
  check(eRes.status === 200 && E.role === "spectator", "second spectator");
  check((await joinRes("dan", randomUUID())).status === 409, "nickname of a connected spectator from another device = 409");
  const sD = await state(code, D);
  check(sD.role === "spectator" && sD.board === null && sD.marks.length === 0 && sD.hintsLeft === 0 && sD.reveal === null, "spectator state: no board, no marks, no reveal");
  check(sD.spectators.map((x) => x.nickname).join() === "Dan,Eli" && sD.players.length === 3 && sD.me.id === D.playerId, "spectator sees players and spectators");
  const rawD = JSON.stringify(sD);
  check(![A, B, C].some((o) => rawD.includes(o.token)) && !rawD.includes("token_hash") && !rawD.includes("device_hash"), "spectator state leaks no tokens or hashes");
  check((await state(code, A)).spectators.length === 2 && (await state(code, A)).role === "player", "players see the spectators too");
  for (const [path, body] of [["call", { number: 9 }], ["mark", { number: 9, marked: true }], ["hint", {}], ["validate", {}], ["skip", {}], ["ready", {}], ["start", {}], ["new-round", {}], ["kick", { playerId: A.playerId }], ["reorder", { order: [] }], ["board", { generate: true }], ["settings", { size: 5 }]]) {
    const res = await call(`/api/rooms/${code}/${path}`, { token: D.token, body });
    check(res.status === 403, `spectator ${path} = 403 (${res.status})`);
  }
  check((await call(`/api/rooms/${code}/queue`, { token: A.token, body: {} })).status === 409, "a player cannot queue");
  check((await call(`/api/rooms/${code}/queue`, { token: D.token, body: {} })).data.queued === true, "Dan queues for the next round");
  check((await call(`/api/rooms/${code}/queue`, { token: D.token, body: {} })).data.queued === false, "queue is a toggle (Dan out)");
  check((await call(`/api/rooms/${code}/queue`, { token: E.token, body: {} })).data.queued === true, "Eli queues first");
  check((await call(`/api/rooms/${code}/queue`, { token: D.token, body: {} })).data.queued === true, "Dan queues second");
  check((await state(code, D)).spectators.map((x) => x.nickname).join() === "Eli,Dan", "queue order: Eli, Dan");
  const D2 = await joinRes("Dan", devD);
  check(D2.data.playerId === D.playerId && D2.data.role === "spectator" && D2.data.token !== D.token, "spectator rejoins from the same device = same id, new token");
  D.token = D2.data.token;
  check((await call(`/api/rooms/${code}/state`, { token: D2.data.token })).data.queued === true, "queue survives the rejoin");
  check((await call(`/api/rooms/${code}/settings`, { token: A.token, body: { size: 5 } })).status === 409, "settings mid-game = 409");

  const players = { [A.playerId]: A, [B.playerId]: B, [C.playerId]: C };
  const boards = {};
  for (const p of [A, B, C]) {
    const s = await state(code, p);
    boards[p.playerId] = s.board;
    const raw = JSON.stringify(s);
    const others = [A, B, C].filter((o) => o !== p);
    check(s.reveal === null && s.players.every((x) => !("board" in x) && !("token" in x) && !("marks" in x)), `${p.name} sees no other board (reveal null)`);
    check(!raw.includes("token_hash") && !raw.includes("device_hash") && !raw.includes("password_hash"), `${p.name}'s state leaks no hashes`);
    check(others.every((o) => !raw.includes(o.token)), `${p.name}'s state leaks no other tokens`);
  }
  check(boards[B.playerId].join() === manual.join(), "Bob plays with his manual board");
  sA = await state(code, A);
  check(sA.room.status === "playing" && sA.room.currentTurnPlayerId === A.playerId, "host calls first");
  check(sA.players.map((p) => p.id).join() === [A, B, C].map((p) => p.playerId).join(), "turn order = host, then join order");

  console.log("Calls, marks, invalid moves");
  check((await call(`/api/rooms/${code}/call`, { token: B.token, body: { number: 5 } })).status === 403, "call out of turn = 403");
  check((await call(`/api/rooms/${code}/call`, { token: A.token, body: { number: 17 } })).status === 400, "number 17 on 4x4 = 400");
  check((await call(`/api/rooms/${code}/call`, { token: A.token, body: { number: "x" } })).status === 400, "non-numeric call = 400");
  check((await call(`/api/rooms/${code}/call`, { token: "bogus", body: { number: 1 } })).status === 401, "call with bad token = 401");
  check((await call(`/api/rooms/${code}/call`, { token: A.token, body: { number: 1 } })).status === 200, "Ana calls 1");
  check((await call(`/api/rooms/${code}/call`, { token: A.token, body: { number: 2 } })).status === 403, "Ana calls twice = 403");
  check((await call(`/api/rooms/${code}/call`, { token: B.token, body: { number: 1 } })).status === 409, "already called number = 409");
  let sB = await state(code, B);
  check(sB.called.length === 1 && sB.called[0].number === 1 && sB.called[0].playerId === A.playerId, "Bob sees the called 1");
  check(sB.room.currentTurnPlayerId === B.playerId, "turn passes to Bob");
  check(sB.marks.length === 0, "Bob's marks are manual (none yet)");
  check((await state(code, A)).marks.includes(1), "caller's own number auto-marked");
  check((await call(`/api/rooms/${code}/mark`, { token: B.token, body: { number: 1, marked: "yes" } })).status === 400, "bad mark body = 400");
  check((await call(`/api/rooms/${code}/skip`, { token: B.token, body: {} })).status === 403, "non-host skip = 403");

  // Cris marks numbers that were never called, then tries to validate: rejected.
  const cBoard = boards[C.playerId];
  for (const num of allLines(n)[0].map((i) => cBoard[i])) await call(`/api/rooms/${code}/mark`, { token: C.token, body: { number: num, marked: true } });
  const fake = await call(`/api/rooms/${code}/validate`, { token: C.token, body: {} });
  check(fake.status === 200 && fake.data.won === false, `validate with uncalled marks = not won ("${fake.data.message}")`);
  for (const num of allLines(n)[0].map((i) => cBoard[i])) await call(`/api/rooms/${code}/mark`, { token: C.token, body: { number: num, marked: false } });
  check((await state(code, C)).marks.length === 0, "unmark works");
  // Bob's marks are private: Ana's state does not change.
  await call(`/api/rooms/${code}/mark`, { token: B.token, body: { number: 1, marked: true } });
  const unmark = await call(`/api/rooms/${code}/mark`, { token: B.token, body: { number: 1, marked: false } });
  check(unmark.status === 409, `a called number cannot be un-ticked (${unmark.status})`);
  check((await call(`/api/rooms/${code}/mark`, { token: A.token, body: { number: 1, marked: false } })).status === 409, "not even by the one who called it");
  check((await state(code, A)).marks.join() === "1" && (await state(code, B)).marks.join() === "1", "marks are per player");

  console.log("Hint, kick with Ignoră, skip, rejoin mid-game");
  const h = await call(`/api/rooms/${code}/hint`, { token: C.token, body: {} });
  check(h.status === 200 && h.data.hintsLeft === 4, "hint spent (4 left)");
  check((await state(code, C)).hintsLeft === 4, "hintsLeft in state");
  check((await call(`/api/rooms/${code}/kick`, { token: B.token, body: { playerId: C.playerId } })).status === 403, "non-host kick = 403");
  check((await call(`/api/rooms/${code}/kick`, { token: A.token, body: { playerId: C.playerId } })).data.pending === true, "kick mid-game is pending");
  check((await state(code, C)).me.kickRemainingMs > 0, "kicked player sees the countdown");
  check((await call(`/api/rooms/${code}/kick/ignore`, { token: B.token, body: {} })).data.cleared === false, "another player cannot clear it");
  check((await call(`/api/rooms/${code}/kick/ignore`, { token: C.token, body: {} })).data.cleared === true, "Ignoră");
  check((await state(code, A)).players.every((p) => p.kickRemainingMs === null), "kick cleared for everyone");
  const skip = await call(`/api/rooms/${code}/skip`, { token: A.token, body: {} });
  check(skip.status === 200 && (await state(code, A)).room.currentTurnPlayerId === C.playerId, "host skips Bob, Cris on turn");
  const C2 = await join("Cris", dev.C);
  check(C2.playerId === C.playerId, "Cris rejoins mid-game, same seat");
  Object.assign(C, C2, { name: "Cris" });
  const sC = await state(code, C);
  check(sC.board.join() === cBoard.join() && sC.hintsLeft === 4 && sC.room.currentTurnPlayerId === C.playerId, "same board, hints and turn after rejoin");

  console.log("Play to the end");
  let s = await state(code, A);
  // Everyone catches up on the numbers called so far (Cris never ticked the first one).
  for (const q of [A, B, C]) for (const c of s.called) await call(`/api/rooms/${code}/mark`, { token: q.token, body: { number: c.number, marked: true } });
  let winner = null;
  let guard = 0;
  while (s.room.status === "playing" && guard++ < 20) {
    const p = players[s.room.currentTurnPlayerId];
    const calledSet = new Set(s.called.map((c) => c.number));
    const myBoard = boards[p.playerId];
    // Pick the uncalled number that completes most of the caller's lines.
    const pick = myBoard.filter((x) => !calledSet.has(x)).sort((x, y) => linesDone(myBoard, n, new Set([...calledSet, y])) - linesDone(myBoard, n, new Set([...calledSet, x])))[0];
    const res = await call(`/api/rooms/${code}/call`, { token: p.token, body: { number: pick } });
    if (res.status !== 200) {
      check(false, `call failed: ${res.status} ${res.data.error}`);
      break;
    }
    calledSet.add(pick);
    // Everyone marks the new number; anyone with a full line validates.
    for (const q of [A, B, C]) {
      if (q !== p) await call(`/api/rooms/${code}/mark`, { token: q.token, body: { number: pick, marked: true } });
    }
    for (const q of [A, B, C]) {
      if (linesDone(boards[q.playerId], n, calledSet) >= 1) {
        const v = await call(`/api/rooms/${code}/validate`, { token: q.token, body: {} });
        if (v.data.won) {
          winner = q;
          break;
        }
        check(v.status === 409, `late validation rejected (${v.status} ${JSON.stringify(v.data)})`);
      }
    }
    s = await state(code, A);
  }
  check(winner !== null && s.room.status === "finished" && s.room.winnerPlayerId === winner.playerId, `game over after ${s.called.length} calls, winner ${winner?.name}`);
  const others = [A, B, C].filter((q) => q !== winner);
  check((await call(`/api/rooms/${code}/validate`, { token: others[0].token, body: {} })).status === 409, "validate after the end = 409");
  check((await call(`/api/rooms/${code}/call`, { token: others[0].token, body: { number: 16 } })).status === 409, "call after the end = 409");
  for (const q of [A, B, C]) {
    const st = await state(code, q);
    check(st.reveal?.length === 3 && st.reveal.every((rb) => rb.board.join() === boards[rb.playerId].join()), `${q.name} sees all 3 boards revealed`);
  }

  console.log("New round, lobby kick, leave");
  check((await call(`/api/rooms/${code}/new-round`, { token: B.token, body: {} })).status === 403, "non-host new round = 403");
  check((await call(`/api/rooms/${code}/new-round`, { token: A.token, body: {} })).status === 200, "host new round");
  check((await call(`/api/rooms/${code}/new-round`, { token: A.token, body: {} })).status === 409, "double new round = 409");
  s = await state(code, B);
  check(s.room.status === "lobby" && s.room.round === 2 && s.board === null && s.called.length === 0 && s.hintsLeft === 5 && s.players.every((p) => !p.ready), "round 2: clean lobby");
  check(s.players.map((p) => p.nickname).join() === "Bob,Cris,Ana,Eli,Dan", `seats rotated, queued spectators joined in queue order (${s.players.map((p) => p.nickname).join()})`);
  check(s.spectators.length === 0, "queue emptied");
  check((await state(code, D)).role === "player" && (await call(`/api/rooms/${code}/state`, { token: E.token })).data.role === "player", "spectator tokens still work, now as players");
  for (const q of [D, E]) check((await call(`/api/rooms/${code}/leave`, { token: q.token, body: {} })).status === 200, `${q.name} leaves the lobby`);
  check((await call(`/api/rooms/${code}/reorder`, { token: B.token, body: { order: [] } })).status === 403, "non-host reorder = 403");
  check((await call(`/api/rooms/${code}/reorder`, { token: A.token, body: { order: [A.playerId, B.playerId] } })).status === 409, "reorder with a missing player = 409");
  check((await call(`/api/rooms/${code}/reorder`, { token: A.token, body: { order: [A.playerId, A.playerId, B.playerId] } })).status === 409, "reorder with a duplicate = 409");
  check((await call(`/api/rooms/${code}/reorder`, { token: A.token, body: { order: [B.playerId, A.playerId, C.playerId] } })).status === 200, "host reorders: Bob, Ana, Cris");
  s = await state(code, C);
  check(s.players.map((p) => p.nickname).join() === "Bob,Ana,Cris", "everyone sees the new order");

  // Round 2: 3 players, pending kick enforced after 12 s, then Bob leaves -> Ana wins alone.
  for (const p of [A, B, C]) {
    await call(`/api/rooms/${code}/board`, { token: p.token, body: { generate: true } });
    await call(`/api/rooms/${code}/ready`, { token: p.token, body: {} });
  }
  check((await call(`/api/rooms/${code}/start`, { token: A.token, body: {} })).status === 200, "round 2 started");
  s = await state(code, A);
  check(s.room.currentTurnPlayerId === B.playerId, "round 2 starts with the next player (Bob)");
  await call(`/api/rooms/${code}/kick`, { token: A.token, body: { playerId: C.playerId } });
  await sleep(12_500);
  check((await call(`/api/rooms/${code}/state`, { token: C.token })).status === 401, "pending kick enforced after 12 s");
  s = await state(code, A);
  check(s.players.length === 2 && s.room.status === "playing", "2 players left, game goes on");
  check((await call(`/api/rooms/${code}/leave`, { token: B.token, body: {} })).status === 200, "Bob leaves on his turn");
  s = await state(code, A);
  check(s.room.status === "finished" && s.room.winnerPlayerId === A.playerId, "last player in the game wins");

  // Lobby kick is immediate.
  await call(`/api/rooms/${code}/new-round`, { token: A.token, body: {} });
  const F = await join("Fay", randomUUID());
  check(!!F.token, "Fay joins the lobby");
  check((await call(`/api/rooms/${code}/kick`, { token: A.token, body: { playerId: A.playerId } })).status === 400, "host cannot kick himself");
  check((await call(`/api/rooms/${code}/kick`, { token: A.token, body: { playerId: "not-a-uuid" } })).status === 404, "kick unknown id = 404");
  const k = await call(`/api/rooms/${code}/kick`, { token: A.token, body: { playerId: F.playerId } });
  check(k.status === 200 && !k.data.pending, "lobby kick is immediate");
  check((await call(`/api/rooms/${code}/state`, { token: F.token })).status === 401, "kicked player = 401");

  console.log("Cleanup");
  const last = await call(`/api/rooms/${code}/leave`, { token: A.token, body: {} });
  check(last.data.roomClosed === true, "last one out closes the room");
  check((await call(`/api/rooms/${code}/join`, { body: { nickname: "X", password: "pw" } })).status === 404, "room gone");
  created.delete(code);
}

/** Supabase URL + service key: environment (GitHub Actions secrets) first, else .env.local. */
function supabaseEnv() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (NEXT_PUBLIC_SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) return { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };
  return Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
  );
}

/** Safety net: delete rooms left behind by a failed run, straight in the DB (service key from env or .env.local). */
async function cleanup() {
  if (created.size === 0) return;
  try {
    const env = supabaseEnv();
    const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/classicbingo_rooms?code=in.(${[...created].join(",")})&name=like.e2e-test-*`;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await fetch(url, { method: "DELETE", headers: { apikey: key, authorization: `Bearer ${key}` } });
    console.log(`  cleanup: deleted leftover rooms ${[...created].join(", ")} (${res.status})`);
  } catch (err) {
    console.log("  cleanup failed, delete these rooms by hand:", [...created].join(", "), err.message);
  }
}

try {
  await main();
} catch (err) {
  failures++;
  console.error(err);
} finally {
  await cleanup();
}
console.log(failures === 0 ? "\nE2E OK" : `\nE2E FAILED: ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
