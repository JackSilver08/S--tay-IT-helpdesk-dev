// Chup anh tung trang cua mot file PDF de soi bo cuc.
//   node tools/pdf-pages.js <file.pdf> <trang1> <trang2> ...
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const os = require("os");

const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const FILE = path.resolve(process.argv[2]);
const PAGES = process.argv.slice(3).map(Number);
const OUT = path.join(__dirname, "screenshots", "pages");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = path.join(os.tmpdir(), "edge-pages-" + Date.now());
  const browser = spawn(BROWSER, ["--headless=new", "--remote-debugging-port=9241", "--disable-gpu", "--no-first-run", "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });

  let target;
  for (let i = 0; i < 80 && !target; i += 1) {
    try {
      const list = await (await fetch("http://127.0.0.1:9241/json/list")).json();
      target = list.find((t) => t.type === "page");
    } catch (e) { /* chua san sang */ }
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  });
  const send = (method, params) => new Promise((resolve, reject) => { id += 1; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); });

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 820, height: 1340, deviceScaleFactor: 1, mobile: false });
  const url = "file:///" + FILE.split(String.fromCharCode(92)).join("/");

  await send("Page.navigate", { url: url });
  await sleep(3500);

  // Thu nho cho ca trang lot vao khung nhin, neu khong chan trang bi cat.
  for (let i = 0; i < 3; i += 1) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", modifiers: 2, key: "-", code: "Minus", windowsVirtualKeyCode: 189 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 2, key: "-", code: "Minus", windowsVirtualKeyCode: 189 });
    await sleep(350);
  }

  // Viewer bo qua #page= nen di bang phim PageDown - moi lan dung mot trang.
  let at = 1;
  for (const n of PAGES.slice().sort((a, b) => a - b)) {
    for (let step = at; step < n; step += 1) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34, nativeVirtualKeyCode: 34 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34, nativeVirtualKeyCode: 34 });
      await sleep(180);
    }
    at = n;
    await sleep(1400);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const dest = path.join(OUT, path.basename(FILE, ".pdf") + "-p" + String(n).padStart(2, "0") + ".png");
    fs.writeFileSync(dest, Buffer.from(shot.data, "base64"));
    console.log("trang " + n + " -> " + dest);
  }
  ws.close(); browser.kill(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
