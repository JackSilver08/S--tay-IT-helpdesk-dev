// Kiem thu ban web cua so tay bang Edge/Chrome headless qua CDP.
// Chi dung Node built-in, khong can cai them goi nao:  node tools/verify.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8765;
const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
if (!BROWSER) {
  console.error("Khong tim thay Edge hoac Chrome de chay kiem thu.");
  process.exit(2);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".pdf": "application/pdf"
};

const results = [];
const consoleErrors = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? "  :: " + detail : ""));
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(ROOT, rel === "/" ? "index.html" : rel);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPageTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch("http://127.0.0.1:9222/json/list");
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch (err) {
      /* browser not ready yet */
    }
    await sleep(250);
  }
  throw new Error("Khong ket noi duoc debugging endpoint");
}

function makeSender(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description || "").join(" "));
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      consoleErrors.push(d.text + " " + ((d.exception && d.exception.description) || ""));
    }
  });
  return (method, params) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
}

(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const profile = path.join(os.tmpdir(), "edge-verify-profile-" + Date.now());
  const browser = spawn(
    BROWSER,
    [
      "--headless=new",
      "--remote-debugging-port=9222",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--user-data-dir=" + profile,
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  const target = await getPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const send = makeSender(ws);

  await send("Runtime.enable");
  await send("Page.enable");

  async function evaluate(expression, userGesture = false) {
    const out = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
    if (out.exceptionDetails) {
      const d = out.exceptionDetails;
      throw new Error(d.text + " " + ((d.exception && d.exception.description) || ""));
    }
    return out.result.value;
  }

  const json = async (expr) => JSON.parse(await evaluate("JSON.stringify(" + expr + ")"));
  const q = (sel) => "document.querySelector(" + JSON.stringify(sel) + ")";

  async function setViewport(width, height) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  }

  async function shot(name) {
    const out = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.mkdirSync(path.join(__dirname, "screenshots"), { recursive: true });
    fs.writeFileSync(path.join(__dirname, "screenshots", name), Buffer.from(out.data, "base64"));
  }

  // Smooth scrolling takes about a second; assert only once the page settles.
  async function waitForScrollSettled() {
    await sleep(450);
    let previous = -1;
    let stableReads = 0;
    for (let i = 0; i < 40; i += 1) {
      const y = await evaluate("Math.round(window.scrollY)");
      stableReads = y === previous ? stableReads + 1 : 0;
      if (stableReads >= 2) return y;
      previous = y;
      await sleep(150);
    }
    return previous;
  }

  // ---------------- desktop ----------------
  await setViewport(1440, 950);
  await send("Page.navigate", { url: "http://127.0.0.1:" + PORT + "/index.html" });
  await sleep(2000);

  check(
    "Trang tai duoc, dung tieu de",
    (await evaluate("document.title")) === "Sổ tay xử lý sự cố căn bản cho IT Helpdesk"
  );

  const structure = await json(
    "{sections: document.querySelectorAll('[data-section]').length, tocLinks: document.querySelectorAll('#desktop-toc [data-nav-link]').length, blocks: document.querySelectorAll('[data-searchable]').length, commands: document.querySelectorAll('.cmd-line code').length}"
  );
  check("Du 14 muc va muc luc khop so section", structure.sections === 14 && structure.tocLinks === 14, JSON.stringify(structure));
  check("Co it nhat 50 lenh CMD kem nut sao chep", structure.commands >= 50, structure.commands + " lenh");

  const feedback = await evaluate(q("#search-feedback") + ".textContent");
  check(
    "Feedback tim kiem bao dung so khoi that",
    feedback.includes(String(structure.blocks)),
    feedback
  );

  // --- cay quyet dinh 4 tang ---
  const d0 = await json(
    "{buttons: document.querySelectorAll('#decision-actions .decision-button').length, counter: " +
      q("#decision-counter") + ".textContent, overline: " + q("#decision-overline") + ".textContent}"
  );
  check("Cay quyet dinh khoi tao o tang 1", d0.buttons === 2 && d0.counter.includes("1 / 4"), JSON.stringify(d0));

  // di het nhanh "co tra loi" -> tang 4 -> phan giai duoc
  for (const step of [1, 2, 3]) {
    await evaluate("document.querySelectorAll('#decision-actions .decision-button')[0].click()");
    await sleep(120);
    const s = await evaluate(q("#decision-counter") + ".textContent");
    if (step === 3) check("Di 3 buoc 'co tra loi' toi tang 4", s.includes("4 / 4"), s);
  }
  await evaluate("document.querySelectorAll('#decision-actions .decision-button')[0].click()");
  await sleep(120);
  const dEnd = await json(
    "{buttons: document.querySelectorAll('#decision-actions .decision-button').length, counter: " +
      q("#decision-counter") + ".textContent, resetHidden: " + q("#decision-reset") + ".hidden}"
  );
  check("Ket luan cuoi hien nut chan doan lai", dEnd.buttons === 0 && dEnd.resetHidden === false, JSON.stringify(dEnd));

  await evaluate(q("#decision-reset") + ".click()");
  await sleep(120);
  check("Reset quay lai tang 1", (await evaluate(q("#decision-counter") + ".textContent")).includes("1 / 4"));

  // nhanh that bai cung phai dung lai
  await evaluate("document.querySelectorAll('#decision-actions .decision-button')[1].click()");
  await sleep(120);
  const dFail = await json(
    "{buttons: document.querySelectorAll('#decision-actions .decision-button').length, counter: " + q("#decision-counter") + ".textContent}"
  );
  check("Nhanh 'khong tra loi' dung ngay o tang 1", dFail.buttons === 0 && dFail.counter.includes("TẦNG 1"), JSON.stringify(dFail));
  await evaluate(q("#decision-reset") + ".click()");

  // --- combo tabs ---
  const tabInit = await json("[...document.querySelectorAll('[data-combo-tab]')].map(t => t.tabIndex)");
  check("Combo tabs khoi tao roving tabindex", JSON.stringify(tabInit) === JSON.stringify([0, -1, -1, -1]), JSON.stringify(tabInit));

  await evaluate("document.querySelector('[data-combo-tab=\"c\"]').click()");
  await sleep(120);
  check(
    "Chuyen Combo C doi dung panel",
    (await evaluate(q("#panel-combo-c") + ".hidden === false && " + q("#panel-combo-a") + ".hidden === true")) === true
  );

  // --- checklist ---
  await evaluate(
    "[...document.querySelectorAll('#checklist input')].slice(0, 3).forEach(b => { b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); })"
  );
  await sleep(120);
  const checked = await json(
    "{label: " + q("#checklist-count") + ".textContent, width: " + q("#checklist-bar") + ".style.width}"
  );
  check("Checklist dem dung 3 / 13", checked.label.replace(/\s/g, "") === "3/13" && parseFloat(checked.width) > 0, JSON.stringify(checked));

  await evaluate(q("#checklist-reset") + ".click()");
  await sleep(120);
  check("Bo chon tat ca dua ve 0 / 13", (await evaluate(q("#checklist-count") + ".textContent")).replace(/\s/g, "") === "0/13");

  // --- sao chep lenh ---
  // Headless chan clipboard theo mac dinh, nen phai cap quyen thi moi kiem
  // duoc duong chinh thay vi nhanh du phong.
  await send("Browser.grantPermissions", {
    origin: "http://127.0.0.1:" + PORT,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"]
  });
  const expectedCommand = await evaluate("document.querySelector('.cmd-line code').textContent.trim()");
  await evaluate("document.querySelector('.cmd-line .copy-button').click()", true);
  await sleep(400);
  const toast = await json("{visible: " + q("#toast") + ".classList.contains('is-visible'), text: " + q("#toast") + ".textContent}");
  check(
    "Bam sao chep thi chep dung lenh",
    toast.visible && toast.text === "Đã sao chép: " + expectedCommand,
    JSON.stringify(toast)
  );
  // Doc lai clipboard khong kiem duoc trong headless ("Document is not focused"),
  // nen phep kiem o tren da la bang chung: writeText resolve thi toast moi bao da chep.

  // --- tim kiem ---
  await evaluate(
    "(() => { const i = document.querySelector('#guide-search'); i.value = 'spooler'; i.dispatchEvent(new Event('input', { bubbles: true })); })()"
  );
  await sleep(200);
  const s = await json(
    "{feedback: " + q("#search-feedback") + ".textContent, hidden: [...document.querySelectorAll('[data-section]')].filter(x => x.hidden).map(x => x.id), muted: [...document.querySelectorAll('#desktop-toc [data-nav-link]')].filter(a => a.classList.contains('is-muted')).length}"
  );
  check("Tim 'spooler' an cac chuong khong khop", s.hidden.length > 0 && s.muted === s.hidden.length, JSON.stringify(s).slice(0, 220));
  check(
    "Chuong may in va trang lenh van hien thi",
    !s.hidden.includes("may-in") && !s.hidden.includes("lenh"),
    s.hidden.join(",")
  );

  await evaluate(q("#guide-search") + ".focus()");
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter" });
  await waitForScrollSettled();
  const hash = await evaluate("location.hash");
  check("Enter nhay toi ket qua dau tien", hash.length > 1, hash);

  await evaluate(
    "(() => { const i = document.querySelector('#guide-search'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })()"
  );
  await sleep(200);
  check(
    "Xoa tim kiem khoi phuc toan bo noi dung",
    (await evaluate(
      "[...document.querySelectorAll('[data-section]')].every(x => !x.hidden) && [...document.querySelectorAll('[data-searchable]')].every(x => !x.hidden)"
    )) === true
  );

  await evaluate("window.scrollTo(0, 0)");
  await sleep(500);
  await shot("desktop-1440.png");

  await evaluate(q("#internet") + ".scrollIntoView()");
  await waitForScrollSettled();
  check(
    "Cuon toi chuong 06 thi muc luc tu sang",
    (await evaluate("document.querySelector('#desktop-toc [data-nav-link=\"internet\"]').classList.contains('is-active')")) === true
  );
  await shot("desktop-chapter.png");

  await evaluate(q("#lenh") + ".scrollIntoView()");
  await waitForScrollSettled();
  await shot("desktop-commands.png");

  // ---------------- mobile ----------------
  await setViewport(390, 844);
  await evaluate("window.scrollTo(0, 0)");
  await sleep(600);
  const widths = await evaluate("document.documentElement.scrollWidth + ' vs ' + window.innerWidth");
  check("Khong tran ngang o 390px", (await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")) === true, widths);
  await shot("mobile-390.png");

  const stacked = await json(
    "(() => { const td = document.querySelector('#quick-ref .data-table tbody td'); const before = getComputedStyle(td, '::before').content; return { thead: getComputedStyle(document.querySelector('#quick-ref .data-table thead')).position, before }; })()"
  );
  check(
    "Bang chuyen thanh the xep doc tren dien thoai",
    stacked.before.includes("Triệu chứng") && stacked.thead === "absolute",
    JSON.stringify(stacked)
  );

  await evaluate(q("#quick-ref") + ".scrollIntoView()");
  await waitForScrollSettled();
  await shot("mobile-table.png");

  await evaluate("window.scrollTo(0, 0)");
  await sleep(500);
  await evaluate("document.querySelector('.nav-toggle').click()");
  await sleep(500);
  const nav = await json(
    "{open: document.querySelector('.mobile-nav').classList.contains('is-open'), expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'), visibility: getComputedStyle(document.querySelector('.mobile-nav')).visibility, scrim: getComputedStyle(document.querySelector('.nav-scrim')).visibility}"
  );
  check("Drawer mobile mo va hien that su", nav.open && nav.visibility === "visible" && nav.scrim === "visible" && nav.expanded === "true", JSON.stringify(nav));
  await shot("mobile-drawer.png");

  await evaluate("document.querySelector('#mobile-nav [data-nav-link=\"may-in\"]').click()");
  const navSnapshot =
    "{open: document.querySelector('.mobile-nav').classList.contains('is-open'), hash: location.hash, y: Math.round(window.scrollY), active: document.querySelector('#mobile-nav [data-nav-link=\"may-in\"]').classList.contains('is-active'), visibility: getComputedStyle(document.querySelector('.mobile-nav')).visibility}";

  await waitForScrollSettled();
  let afterNav = await json(navSnapshot);
  for (let i = 0; i < 15 && !(afterNav.active && afterNav.visibility === "hidden"); i += 1) {
    await sleep(200);
    afterNav = await json(navSnapshot);
  }
  check(
    "Chon muc trong drawer thi dong menu va nhay dung chuong",
    !afterNav.open && afterNav.hash === "#may-in" && afterNav.active && afterNav.visibility === "hidden",
    JSON.stringify(afterNav)
  );
  await sleep(300);
  await shot("mobile-chapter.png");

  check("Khong co loi console", consoleErrors.length === 0, consoleErrors.join(" | "));

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " kiem thu pass");

  ws.close();
  browser.kill();
  server.close();
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error("RUNNER ERROR", err);
  process.exit(2);
});
