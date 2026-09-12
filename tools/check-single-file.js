// Copy file HTML don ra mot thu muc trong roi mo bang file:// de chung minh
// no chay doc lap, khong can server va khong can thu muc di kem.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const SOURCE = path.join(path.resolve(__dirname, ".."), "So_Tay_IT_Helpdesk.html");
const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"
];
const EDGE = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const consoleErrors = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? "  :: " + detail : ""));
};

(async () => {
  // thu muc trong, khong co gi ngoai file html
  const isolated = path.join(os.tmpdir(), "so-tay-mot-file-" + Date.now());
  fs.mkdirSync(isolated, { recursive: true });
  const target = path.join(isolated, "So_Tay_IT_Helpdesk.html");
  fs.copyFileSync(SOURCE, target);
  console.log("Thu muc thu nghiem: " + isolated);
  console.log("Noi dung thu muc  : " + fs.readdirSync(isolated).join(", "));

  const profile = path.join(os.tmpdir(), "edge-single-" + Date.now());
  const edge = spawn(EDGE, ["--headless=new", "--remote-debugging-port=9233", "--disable-gpu", "--no-first-run", "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });

  let page;
  for (let i = 0; i < 80 && !page; i += 1) {
    try {
      const list = await (await fetch("http://127.0.0.1:9233/json/list")).json();
      page = list.find((t) => t.type === "page");
    } catch (e) {}
    if (!page) await sleep(250);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(JSON.stringify(m.error)));
      else p.resolve(m.result);
      return;
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description || "").join(" "));
    }
    if (m.method === "Runtime.exceptionThrown") {
      consoleErrors.push(m.params.exceptionDetails.text);
    }
  });
  const send = (method, params) => new Promise((resolve, reject) => { id += 1; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");

  // ghi lai moi request that bai -> chung minh khong con phu thuoc file ngoai
  const failed = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Network.loadingFailed") failed.push(m.params.errorText);
  });

  const ev = async (expr) => {
    const out = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.text);
    return out.result.value;
  };

  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "file:///" + target.replace(/\\/g, "/") });
  await sleep(2500);

  check("Mo duoc bang file:// tu thu muc trong", (await ev("document.title")) === "Sổ tay xử lý sự cố căn bản cho IT Helpdesk");
  check("CSS da nhung (sidebar co vien phai)", (await ev("getComputedStyle(document.querySelector('.sidebar')).borderRightWidth")) === "1px");
  check("JS da nhung (cay quyet dinh khoi tao)", (await ev("document.querySelectorAll('#decision-actions .decision-button').length")) === 2);
  check("Du 14 muc noi dung", (await ev("document.querySelectorAll('[data-section]').length")) === 14);
  check("Du 61 lenh", (await ev("document.querySelectorAll('.cmd-line code').length")) === 61);

  // tim kiem
  await ev("(() => { const i = document.querySelector('#guide-search'); i.value = 'spooler'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await sleep(200);
  check("Tim kiem loc duoc", (await ev("[...document.querySelectorAll('[data-section]')].filter(x => x.hidden).length")) > 0);

  // checklist
  await ev("[...document.querySelectorAll('#checklist input')].slice(0,2).forEach(b => { b.checked = true; b.dispatchEvent(new Event('change', {bubbles:true})); })");
  await sleep(150);
  check("Checklist dem duoc", (await ev("document.querySelector('#checklist-count').textContent")).replace(/\s/g, "") === "2/13");

  check("Khong con tham chieu file ngoai bi loi", failed.length === 0, failed.join(" | "));
  check("Khong co loi console", consoleErrors.length === 0, consoleErrors.join(" | "));

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(__dirname, "single-file.png"), Buffer.from(shot.data, "base64"));

  const bad = results.filter((r) => !r).length;
  console.log("\n" + (results.length - bad) + "/" + results.length + " kiem thu pass");

  ws.close();
  edge.kill();
  fs.rmSync(isolated, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
