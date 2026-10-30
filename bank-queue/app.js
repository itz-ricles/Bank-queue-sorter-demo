// Interface only: every queue operation is in BankQueue.cpp
const SERVICES = ["Deposit", "Withdrawal", "Open account", "Enquiry"];
const MINUTES  = [3, 3, 10, 2];
const enc = new TextEncoder(), dec = new TextDecoder();
let w;                                   // the WebAssembly exports

const $ = id => document.getElementById(id);
const bytes = () => new Uint8Array(w.memory.buffer);
const label = (lane, n) => (lane === 1 ? "V-" : "R-") + String(n).padStart(3, "0");

function say(text, ok = true) {
  const m = $("message");
  m.textContent = text;
  m.className = ok ? "ok" : "err";
}
function putName(str) {                  // write the typed name into the C++ array
  const b = enc.encode(str.trim()).subarray(0, w.name_len() - 1);
  const p = w.name_buffer();
  bytes().set(b, p);
  bytes()[p + b.length] = 0;
}
function getText(ptr) {                  // read text back out of C++
  const m = bytes();
  let e = ptr; while (m[e]) e++;
  return dec.decode(m.subarray(ptr, e));
}

function drawLane(lane, listEl, countEl, isNext) {
  const n = w.queue_size(lane);
  countEl.textContent = `(${n} of ${w.capacity()})`;
  listEl.innerHTML = "";
  listEl.className = "line" + (lane === 1 ? " vipl" : "");
  if (n === 0) { listEl.innerHTML = '<li class="empty">Nobody waiting.</li>'; return; }
  for (let p = 0; p < n; p++) {
    const li = document.createElement("li");
    if (p === 0 && isNext) li.className = "next";
    const wait = w.wait_minutes(lane, p);
    li.innerHTML = `<span class="tk"></span><span class="who"><b></b><span></span></span>`;
    li.querySelector(".tk").textContent = label(lane, w.ticket_at(lane, p));
    li.querySelector("b").textContent = getText(w.name_at(lane, p));
    li.querySelector(".who span").textContent = `${SERVICES[w.service_at(lane, p)]} \u2022 wait about ${wait} min`;
    if (p === 0 && isNext) { const t = document.createElement("span"); t.className = "tag"; t.textContent = "NEXT"; li.appendChild(t); }
    listEl.appendChild(li);
  }
}

function drawArray(lane, el) {           // the raw circular array: F = front, R = next free slot
  const cap = w.capacity(), f = w.front_slot(lane), r = w.rear_slot(lane);
  el.className = "arr" + (lane === 1 ? " vipa" : "");
  el.innerHTML = "";
  for (let s = 0; s < cap; s++) {
    const t = w.slot_ticket(lane, s);
    const mark = (s === f ? "F" : "") + (s === r ? "R" : "");
    const cell = document.createElement("div");
    cell.className = "slot";
    cell.innerHTML = `<div class="mark">${mark}</div><div class="box${t ? " occ" : ""}">${t ? t : "\u00B7"}</div><div class="idx">${s}</div>`;
    el.appendChild(cell);
  }
}

function draw() {
  const vip = w.queue_size(1), reg = w.queue_size(0);
  const nextLane = vip ? 1 : (reg ? 0 : -1);
  $("waiting").textContent = vip + reg;
  $("served").textContent = w.served_count();
  $("serveBtn").disabled = nextLane === -1;
  $("nextInfo").textContent = nextLane === -1 ? "No one is waiting."
    : `Next up: ${label(nextLane, w.ticket_at(nextLane, 0))} (${getText(w.name_at(nextLane, 0))})`;
  if (w.served_count() > 0) {
    $("servTicket").textContent = label(w.served_lane(), w.served_ticket());
    $("servMeta").textContent = `${getText(w.served_name())} \u2022 ${SERVICES[w.served_service()]}${w.served_lane() === 1 ? " \u2022 VIP" : ""}`;
  } else {
    $("servTicket").textContent = "-";
    $("servMeta").textContent = "Nobody has been called yet.";
  }
  drawLane(1, $("vipList"), $("vipCount"), nextLane === 1);
  drawLane(0, $("regList"), $("regCount"), nextLane === 0);
  drawArray(1, $("vipArr"));
  drawArray(0, $("regArr"));
}

function addCustomer(name, service, lane) { putName(name); return w.add_customer(lane, service); }

function onAdd() {
  const lane = $("vip").checked ? 1 : 0;
  const r = addCustomer($("name").value, Number($("service").value), lane);
  if (r === 0) {
    const n = w.queue_size(lane);
    const t = w.ticket_at(lane, n - 1);
    say(`Ticket ${label(lane, t)} issued. ${n - 1} ahead in the ${lane ? "VIP" : "regular"} lane.`);
    $("name").value = ""; $("name").focus();
  } else {
    say(`The ${lane ? "VIP" : "regular"} lane is full: its array has no free slot. Call someone first.`, false);
  }
  draw();
}

function onServe() {
  const r = w.serve_next();
  if (r === 0) say("Nobody is waiting.", false);
  else say(`Called ${label(w.served_lane(), w.served_ticket())}${r === 2 ? " (VIP goes first)" : ""}.`);
  draw();
}

function onSample() {
  w.clear_all();
  const names = ["Kofi", "Ama", "Yaw", "Efua", "Kwame", "Selasi", "Akosua", "Nana", "Esi", "Kojo", "Abena", "Yaa", "Kobby", "Adjoa"];
  let k = 0;
  const reg = () => addCustomer(names[k], k++ % 4, 0);
  for (let i = 0; i < 8; i++) reg();                 // 8 customers join
  for (let i = 0; i < 6; i++) w.serve_next();        // 6 are served, so the front moves on
  for (let i = 0; i < 6; i++) reg();                 // 6 more join: the rear wraps past slot 9
  addCustomer("Dr. Mensah", 2, 1); addCustomer("Auntie Grace", 0, 1);
  say("Sample loaded. Look at the regular lane array: the rear wrapped around to slot 0.");
  draw();
}

async function start() {
  const url = "bank_queue.wasm";
  try {
    w = (await WebAssembly.instantiateStreaming(fetch(url), {})).instance.exports;
  } catch (e) {                          // server without the wasm MIME type
    const buf = await (await fetch(url)).arrayBuffer();
    w = (await WebAssembly.instantiate(buf, {})).instance.exports;
  }
  SERVICES.forEach((s, i) => $("service").add(new Option(`${s} (${MINUTES[i]} min)`, i)));
  $("addBtn").onclick = onAdd;
  $("serveBtn").onclick = onServe;
  $("sampleBtn").onclick = onSample;
  $("clearBtn").onclick = () => { w.clear_all(); say("Everything cleared."); draw(); };
  $("name").onkeydown = e => { if (e.key === "Enter") onAdd(); };
  draw();
}
start().catch(err => say("Could not load the C++ module: " + err.message, false));
