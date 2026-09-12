// Xuat so tay ra PDF tu chinh trang web.
// Noi dung giu nguyen theo So_Tay_IT_Helpdesk_Can_Ban.pdf, chi khac bo cuc.
//
//   node tools/export-pdf.js
//
// Tao hai file o thu muc goc du an:
//   So_Tay_IT_Helpdesk_Ban_Web.pdf  - giu nguyen mau, de doc tren man hinh
//   So_Tay_IT_Helpdesk_Ban_In.pdf   - den trang, de in ra giay
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const os = require("os");
const { numberPages } = require("./pdf-kit.js");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8772;
const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
if (!BROWSER) {
  console.error("Khong tim thay Edge hoac Chrome de xuat PDF.");
  process.exit(2);
}

const MODES = [
  {
    label: "mau  ",
    file: "So_Tay_IT_Helpdesk_Ban_Web.pdf",
    colour: true,
    printBackground: true,
    // Khong chua le: nen mau tran ra tan mep giay, phan le do CSS lo.
    margin: 0
  },
  {
    label: "in   ",
    file: "So_Tay_IT_Helpdesk_Ban_In.pdf",
    colour: false,
    printBackground: false,
    margin: 0.55
  }
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".pdf": "application/pdf"
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(ROOT, rel === "/" ? "index.html" : rel);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const countPages = (buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const profile = path.join(os.tmpdir(), "edge-export-" + Date.now());
  const browser = spawn(
    BROWSER,
    ["--headless=new", "--remote-debugging-port=9230", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + profile, "about:blank"],
    { stdio: "ignore" }
  );

  let page;
  for (let i = 0; i < 80 && !page; i += 1) {
    try {
      const list = await (await fetch("http://127.0.0.1:9230/json/list")).json();
      page = list.find((t) => t.type === "page");
    } catch (err) { /* chua san sang */ }
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
    }
  });
  const send = (method, params) =>
    new Promise((resolve, reject) => { id += 1; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params: params || {} })); });

  await send("Runtime.enable");
  await send("Page.enable");
  const ev = async (expr) => {
    const out = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.text);
    return out.result.value;
  };

  await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://127.0.0.1:" + PORT + "/index.html" });
  await sleep(2500);

  // styles.css dat @page margin cho nguoi bam Ctrl+P, de header/footer cua
  // trinh duyet khong de len chu. Le o day do printToPDF quyet dinh, nen phai
  // go rule do ra - neu khong hai le cong don, nen mau thoi tran mep giay va
  // tai lieu phinh them mot trang.
  await ev(
    "(() => { const s = document.createElement('style');" +
    " s.textContent = '@page { size: auto; margin: 0 }';" +
    " document.head.appendChild(s); return true; })()"
  );

  const blocks = await ev("document.querySelectorAll('[data-searchable]').length");
  const commands = await ev("document.querySelectorAll('.cmd-line code').length");
  console.log("Noi dung   : " + blocks + " khoi, " + commands + " lenh");

  for (const mode of MODES) {
    await ev(
      "document.documentElement.classList." + (mode.colour ? "add" : "remove") + "('pdf-color')"
    );
    await sleep(600);

    const pdf = await send("Page.printToPDF", {
      printBackground: mode.printBackground,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: mode.margin,
      marginBottom: mode.margin,
      marginLeft: mode.margin,
      marginRight: mode.margin,
      preferCSSPageSize: false
    });

    const buffer = Buffer.from(pdf.data, "base64");
    const dest = path.join(ROOT, mode.file);
    fs.writeFileSync(dest, buffer);
    console.log(
      "Da xuat " + mode.label + ": " + mode.file + "  (" + Math.round(buffer.length / 1024) + " KB, " + countPages(buffer) + " trang)"
    );

    // Chrome chi biet dat so trang trong le giay, ma ban mau khong co le - nen
    // ve thang vao PDF sau khi xuat.
    numberPages(dest);
  }

  // Doc lai ban mau bang chinh trinh duyet de chup bang chung trang bia.
  const colourPdf = path.join(ROOT, MODES[0].file);
  await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "file:///" + colourPdf.replace(/\\/g, "/") });
  await sleep(3000);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(path.join(__dirname, "screenshots"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "screenshots", "pdf-page-1.png"), Buffer.from(shot.data, "base64"));
  console.log("Anh kiem tra: tools/screenshots/pdf-page-1.png");

  ws.close();
  browser.kill();
  server.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
