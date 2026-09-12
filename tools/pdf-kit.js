// Doc va sua PDF do Skia (Chrome/Edge) sinh ra.
//
//   node tools/pdf-kit.js fill   <file.pdf>              - do do day tung trang
//   node tools/pdf-kit.js number <file.pdf> [out.pdf]    - chen so trang o chan trang
//
// Skia ghi PDF khong dung object stream va xref van la bang co dien, nen doc
// bang regex "N 0 obj" va ghi them bang incremental update la du - khong can
// thu vien ngoai.
const fs = require("fs");
const zlib = require("zlib");

const BACKSLASH = String.fromCharCode(92);

/* ----------------------------- doc file ----------------------------- */

function load(file) {
  const raw = fs.readFileSync(file);
  const latin = raw.toString("latin1");
  const objects = new Map();
  const re = /(?:^|[^0-9])(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(latin)) !== null) {
    const num = Number(m[1]);
    const start = m.index + m[0].length;
    const end = latin.indexOf("endobj", start);
    if (end === -1) continue;
    objects.set(num, { num, start, end, body: latin.slice(start, end) });
    re.lastIndex = start;
  }
  return { file, raw, latin, objects };
}

// Tra ve noi dung stream da giai nen cua mot object.
function streamOf(pdf, num) {
  const o = pdf.objects.get(num);
  if (!o) return null;
  const i = o.body.indexOf("stream");
  if (i === -1) return null;
  const dict = o.body.slice(0, i);
  let d = o.start + i + "stream".length;
  if (pdf.latin[d] === "\r") d += 1;
  if (pdf.latin[d] === "\n") d += 1;
  const e = pdf.latin.indexOf("endstream", d);
  let buf = pdf.raw.subarray(d, e);
  if (dict.indexOf("FlateDecode") !== -1) {
    try {
      buf = zlib.inflateSync(buf);
    } catch (err) {
      buf = zlib.inflateRawSync(buf.subarray(1));
    }
  }
  return buf.toString("latin1");
}

// Duyet cay /Pages theo dung thu tu de lay danh sach so object cua tung trang.
function pageOrder(pdf) {
  const rootNum = Number((pdf.latin.match(/\/Root\s+(\d+)\s+0\s+R/) || [])[1]);
  const root = pdf.objects.get(rootNum);
  const pagesNum = Number((root.body.match(/\/Pages\s+(\d+)\s+0\s+R/) || [])[1]);
  const out = [];
  (function walk(num) {
    const o = pdf.objects.get(num);
    if (!o) return;
    if (/\/Type\s*\/Page[^s]/.test(o.body)) { out.push(num); return; }
    const kids = (o.body.match(/\/Kids\s*\[([^\]]*)\]/) || [])[1] || "";
    const refs = kids.match(/(\d+)\s+0\s+R/g) || [];
    for (const r of refs) walk(Number(r.split(/\s+/)[0]));
  })(pagesNum);
  return out;
}

function mediaBox(pdf, pageNum) {
  const b = (pdf.objects.get(pageNum).body.match(/\/MediaBox\s*\[([^\]]*)\]/) || [])[1];
  const n = b.trim().split(/\s+/).map(Number);
  return { width: n[2] - n[0], height: n[3] - n[1] };
}

/* --------------------- doc noi dung mot trang ------------------------ */

// Chay qua content stream, theo doi ma tran CTM va mau to hien tai. Moi lenh cm
// trong file Skia deu co dang "a 0 0 d e f" nen chi can nhan don gian.
function scanPage(pdf, pageNum) {
  const page = pdf.objects.get(pageNum);
  const refs = (page.body.match(/\/Contents\s*(?:\[([^\]]*)\]|(\d+)\s+0\s+R)/) || []);
  const nums = refs[1] ? (refs[1].match(/(\d+)\s+0\s+R/g) || []).map((r) => Number(r.split(/\s+/)[0])) : [Number(refs[2])];
  const content = nums.map((n) => streamOf(pdf, n) || "").join("\n");

  const mul = (m, n) => [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  let ctm = [1, 0, 0, 1, 0, 0];
  let clip = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
  const stack = [];
  let fill = [0, 0, 0];
  const rects = [];   // {x0,y0,x1,y1,color}
  const marks = [];   // y cua moi lan dat text

  const tokens = content.split(/\s+/);
  const nums6 = [];
  let pendingRect = null;
  let clipPending = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === "") continue;
    const asNum = Number(t);
    if (!Number.isNaN(asNum) && /^[-.0-9]/.test(t)) { nums6.push(asNum); if (nums6.length > 8) nums6.shift(); continue; }

    if (t === "q") { stack.push({ ctm: ctm.slice(), clip: { ...clip } }); }
    else if (t === "Q") {
      const prev = stack.pop();
      ctm = prev ? prev.ctm : [1, 0, 0, 1, 0, 0];
      clip = prev ? prev.clip : { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
    }
    else if (t === "cm" && nums6.length >= 6) { ctm = mul(nums6.slice(-6), ctm); }
    else if (t === "rg" && nums6.length >= 3) { fill = nums6.slice(-3); }
    else if (t === "g" && nums6.length >= 1) { const v = nums6[nums6.length - 1]; fill = [v, v, v]; }
    else if (t === "k" && nums6.length >= 4) {
      const c = nums6.slice(-4);
      fill = [(1 - c[0]) * (1 - c[3]), (1 - c[1]) * (1 - c[3]), (1 - c[2]) * (1 - c[3])];
    }
    else if (t === "re" && nums6.length >= 4) {
      const r = nums6.slice(-4);
      const p1 = apply(ctm, r[0], r[1]);
      const p2 = apply(ctm, r[0] + r[2], r[1] + r[3]);
      pendingRect = { x0: Math.min(p1[0], p2[0]), x1: Math.max(p1[0], p2[0]), y0: Math.min(p1[1], p2[1]), y1: Math.max(p1[1], p2[1]) };
    }
    // Skia hay to mot hinh chu nhat tran trang roi cat bang clip path, nen mau
    // chi dung neu lay phan giao voi vung clip dang hieu luc.
    else if (t === "W" || t === "W*") { clipPending = true; }
    else if (t === "n") {
      if (clipPending && pendingRect) {
        clip = {
          x0: Math.max(clip.x0, pendingRect.x0), y0: Math.max(clip.y0, pendingRect.y0),
          x1: Math.min(clip.x1, pendingRect.x1), y1: Math.min(clip.y1, pendingRect.y1)
        };
      }
      clipPending = false;
      pendingRect = null;
    }
    else if ((t === "f" || t === "f*" || t === "B" || t === "b") && pendingRect) {
      const r = {
        x0: Math.max(pendingRect.x0, clip.x0), y0: Math.max(pendingRect.y0, clip.y0),
        x1: Math.min(pendingRect.x1, clip.x1), y1: Math.min(pendingRect.y1, clip.y1)
      };
      if (r.x1 > r.x0 && r.y1 > r.y0) rects.push({ ...r, color: fill.slice() });
      pendingRect = null;
      clipPending = false;
    }
    else if (t === "Tm" && nums6.length >= 6) {
      const p = apply(ctm, nums6[nums6.length - 2], nums6[nums6.length - 1]);
      marks.push(p[1]);
    }
    if (t !== "" && Number.isNaN(asNum)) nums6.length = 0;
  }

  return { rects, marks, content };
}

// Mau nen tai mot diem: hinh chu nhat to sau cung phu diem do.
function bgAt(rects, x, y) {
  let c = [1, 1, 1];
  for (const r of rects) {
    if (x >= r.x0 - 0.5 && x <= r.x1 + 0.5 && y >= r.y0 - 0.5 && y <= r.y1 + 0.5) c = r.color;
  }
  return c;
}

const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/* --------------------------- lenh: fill ----------------------------- */

function cmdFill(file) {
  const pdf = load(file);
  const pages = pageOrder(pdf);
  console.log(file + " - " + pages.length + " trang");
  console.log("trang  day%  nen");
  let thin = 0;
  pages.forEach((p, idx) => {
    const box = mediaBox(pdf, p);
    const { rects, marks } = scanPage(pdf, p);
    // Text duoc dat bang Tm; y thap nhat cho biet noi dung cham toi dau.
    const lowest = marks.length ? Math.min(...marks) : box.height;
    const used = Math.max(0, Math.min(1, (box.height - lowest) / box.height));
    const bg = bgAt(rects, box.width / 2, 24);
    const pct = Math.round(used * 100);
    if (pct < 55) thin += 1;
    console.log(
      String(idx + 1).padStart(5) + "  " + String(pct).padStart(4) +
      "  rgb(" + bg.map((v) => Math.round(v * 255)).join(",") + ")" + (pct < 55 ? "   <- hut" : "")
    );
  });
  console.log("Trang duoi 55%: " + thin + "/" + pages.length);
}

/* -------------------------- lenh: number ---------------------------- */

// Be rong chu Courier la 600/1000 em, dung de can giua.
const courierWidth = (text, size) => text.length * 0.6 * size;

function cmdNumber(file, out) {
  const pdf = load(file);
  const pages = pageOrder(pdf);
  const total = pages.length;
  const maxObj = Math.max(...pdf.objects.keys());

  let nextObj = maxObj + 1;
  const fontObj = nextObj; nextObj += 1;
  const saveObj = nextObj; nextObj += 1;
  const added = [];   // {num, text}
  const changed = []; // {num, text}

  added.push({
    num: fontObj,
    text: "<</Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding>>"
  });

  // Skia mo trang bang ".24 0 0 -.24 0 841.92 cm" ma khong boc trong q/Q, nen
  // khi stream goc ket thuc, CTM van dang lat truc y va thu nho bon lan. Cac
  // stream trong mot /Contents dung chung trang thai do thi, nen phai chen mot
  // "q" truoc stream goc va mo stream cua minh bang "Q" de ve tren he toa do
  // that cua trang.
  const saveOps = "q\n";
  added.push({ num: saveObj, text: "<</Length " + saveOps.length + ">>\nstream\n" + saveOps + "endstream" });

  pages.forEach((pageNum, idx) => {
    const human = idx + 1;
    if (human === 1) return; // trang bia khong danh so

    const box = mediaBox(pdf, pageNum);
    const { rects } = scanPage(pdf, pageNum);

    const size = 7.6;
    const baseline = 26;
    const label = human + " / " + total;
    const x = (box.width - courierWidth(label, size)) / 2;

    // Mau chu lay tuong phan voi chinh nen duoi chan trang: bang mau kem thi
    // chu muc, nen toi (chuong 06, trang bia chuong) thi chu sang.
    const bg = bgAt(rects, box.width / 2, baseline);
    const dark = luma(bg) < 0.5;
    const ink = dark ? ".84 .82 .78" : ".31 .35 .40";

    const escaped = label.replace(/[()]/g, function (ch) { return BACKSLASH + ch; });
    const ops = [
      "Q",
      "q",
      ink + " rg",
      "BT",
      "/FPGN " + size + " Tf",
      "1 0 0 1 " + x.toFixed(2) + " " + baseline + " Tm",
      "(" + escaped + ") Tj",
      "ET",
      "Q",
      ""
    ].join("\n");

    const streamObj = nextObj; nextObj += 1;
    added.push({
      num: streamObj,
      text: "<</Length " + ops.length + ">>\nstream\n" + ops + "endstream"
    });

    // Noi stream moi vao sau /Contents cu va khai bao font trong /Resources.
    const page = pdf.objects.get(pageNum);
    let body = page.body;
    const cm = body.match(/\/Contents\s*(?:\[([^\]]*)\]|(\d+)\s+0\s+R)/);
    const list = cm[1] ? cm[1].trim() : cm[2] + " 0 R";
    body = body.replace(cm[0], "/Contents [" + saveObj + " 0 R " + list + " " + streamObj + " 0 R]");

    if (/\/Font\s*<</.test(body)) {
      body = body.replace(/\/Font\s*<</, "/Font <</FPGN " + fontObj + " 0 R ");
    } else {
      body = body.replace(/\/Resources\s*<</, "/Resources <</Font <</FPGN " + fontObj + " 0 R>> ");
    }
    changed.push({ num: pageNum, text: body.trim() });
  });

  // Incremental update: file cu giu nguyen, chi noi them phan moi vao cuoi.
  const chunks = [pdf.raw];
  let offset = pdf.raw.length;
  const offsets = new Map();
  const all = added.concat(changed).sort((a, b) => a.num - b.num);
  for (const o of all) {
    const piece = Buffer.from(o.num + " 0 obj\n" + o.text + "\nendobj\n", "latin1");
    offsets.set(o.num, offset);
    chunks.push(piece);
    offset += piece.length;
  }

  const prev = Number((pdf.latin.match(/startxref\s+(\d+)\s+%%EOF\s*$/) || [])[1]);
  const trailer = pdf.latin.slice(pdf.latin.lastIndexOf("trailer"));
  const rootRef = (trailer.match(/\/Root\s+(\d+\s+0\s+R)/) || [])[1];
  const infoRef = (trailer.match(/\/Info\s+(\d+\s+0\s+R)/) || [])[1];

  // Gom cac so object lien nhau thanh tung doan xref.
  const sorted = all.map((o) => o.num).sort((a, b) => a - b);
  const runs = [];
  for (const n of sorted) {
    const last = runs[runs.length - 1];
    if (last && n === last.start + last.items.length) last.items.push(n);
    else runs.push({ start: n, items: [n] });
  }

  let xref = "xref\n";
  for (const r of runs) {
    xref += r.start + " " + r.items.length + "\n";
    for (const n of r.items) xref += String(offsets.get(n)).padStart(10, "0") + " 00000 n \n";
  }
  const size = Math.max(...sorted) + 1;
  const tail = xref + "trailer\n<</Size " + size + "\n/Root " + rootRef +
    (infoRef ? "\n/Info " + infoRef : "") + "\n/Prev " + prev + ">>\nstartxref\n" + offset + "\n%%EOF\n";
  chunks.push(Buffer.from(tail, "latin1"));

  const dest = out || file;
  fs.writeFileSync(dest, Buffer.concat(chunks));
  console.log("Da danh so " + (total - 1) + "/" + total + " trang (bo trang bia) -> " + dest);
}

/* ------------------------------- lenh: bg --------------------------- */

// Soi xem hinh chu nhat nao duoc coi la nen o chan mot trang.
function cmdBg(file, human) {
  const pdf = load(file);
  const pages = pageOrder(pdf);
  const pageNum = pages[Number(human) - 1];
  const box = mediaBox(pdf, pageNum);
  const { rects } = scanPage(pdf, pageNum);
  const x = box.width / 2;
  const y = 24;
  console.log("trang " + human + " - kho " + box.width.toFixed(1) + "x" + box.height.toFixed(1) + ", diem (" + x.toFixed(1) + ", " + y + ")");
  rects.forEach((r, i) => {
    if (x < r.x0 - 0.5 || x > r.x1 + 0.5 || y < r.y0 - 0.5 || y > r.y1 + 0.5) return;
    console.log(
      "  #" + i + " x " + r.x0.toFixed(1) + ".." + r.x1.toFixed(1) +
      "  y " + r.y0.toFixed(1) + ".." + r.y1.toFixed(1) +
      "  rong " + Math.round((r.x1 - r.x0) / box.width * 100) + "%" +
      "  cao " + Math.round((r.y1 - r.y0) / box.height * 100) + "%" +
      "  rgb(" + r.color.map((v) => Math.round(v * 255)).join(",") + ")"
    );
  });
}

/* ------------------------------ chay ------------------------------- */

module.exports = { numberPages: cmdNumber, measure: cmdFill };

if (require.main === module) {
  const [cmd, file, out] = process.argv.slice(2);
  if (cmd === "fill") cmdFill(file);
  else if (cmd === "number") cmdNumber(file, out);
  else if (cmd === "bg") cmdBg(file, out);
  else { console.error("Dung: node tools/pdf-kit.js fill|number|bg <file.pdf> [out.pdf|trang]"); process.exit(2); }
}
