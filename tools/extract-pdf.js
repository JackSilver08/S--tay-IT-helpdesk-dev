// Extracts verbatim text from the source handbook PDF.
// The file has no object streams and every embedded font carries a ToUnicode
// CMap, so glyph codes can be mapped straight back to Unicode.
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const FILE = process.argv[2] || "C:/Users/tuant/Downloads/S\u1ed5 tay IT helpdesk dev/So_Tay_IT_Helpdesk_Can_Ban.pdf";
const raw = fs.readFileSync(FILE);
const latin = raw.toString("latin1");

// ---------- 1. index every "N 0 obj ... endobj" ----------
const objects = new Map();
const objRe = /(\d+)\s+(\d+)\s+obj\b/g;
let m;
while ((m = objRe.exec(latin)) !== null) {
  const num = Number(m[1]);
  const bodyStart = m.index + m[0].length;
  const end = latin.indexOf("endobj", bodyStart);
  if (end === -1) continue;
  objects.set(num, { start: bodyStart, end, body: latin.slice(bodyStart, end) });
}

function streamBytes(obj) {
  const sIdx = obj.body.indexOf("stream");
  if (sIdx === -1) return null;
  let dataStart = obj.start + sIdx + "stream".length;
  if (latin[dataStart] === "\r") dataStart += 1;
  if (latin[dataStart] === "\n") dataStart += 1;
  const eIdx = latin.indexOf("endstream", dataStart);
  if (eIdx === -1) return null;
  let buf = raw.subarray(dataStart, eIdx);
  const dict = obj.body.slice(0, sIdx);
  if (/\/FlateDecode/.test(dict)) {
    try {
      buf = zlib.inflateSync(buf);
    } catch (e) {
      try {
        buf = zlib.inflateRawSync(buf.subarray(1));
      } catch (e2) {
        return null;
      }
    }
  }
  return buf;
}

const ref = (body, key) => {
  const r = new RegExp("\\/" + key + "\\s+(\\d+)\\s+\\d+\\s+R");
  const hit = body.match(r);
  return hit ? Number(hit[1]) : null;
};

// ---------- 2. ToUnicode CMaps ----------
function parseCMap(text) {
  const map = new Map();
  const hex = (h) => {
    // a bfchar/bfrange destination may hold several UTF-16BE code units
    let out = "";
    for (let i = 0; i + 3 < h.length + 1; i += 4) {
      const unit = parseInt(h.slice(i, i + 4), 16);
      if (!Number.isNaN(unit)) out += String.fromCharCode(unit);
    }
    return out;
  };

  const charBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  for (const block of charBlocks) {
    const pairs = block.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) || [];
    for (const pair of pairs) {
      const hits = pair.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
      map.set(parseInt(hits[1], 16), hex(hits[2]));
    }
  }

  const rangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  for (const block of rangeBlocks) {
    const simple = block.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) || [];
    for (const entry of simple) {
      const hits = entry.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
      const lo = parseInt(hits[1], 16);
      const hi = parseInt(hits[2], 16);
      const base = parseInt(hits[3], 16);
      for (let c = lo; c <= hi && c - lo < 65536; c += 1) map.set(c, String.fromCharCode(base + (c - lo)));
    }
  }
  return map;
}

const cmapCache = new Map();
function cmapFor(fontObjNum) {
  if (cmapCache.has(fontObjNum)) return cmapCache.get(fontObjNum);
  const font = objects.get(fontObjNum);
  let map = null;
  if (font) {
    const tuNum = ref(font.body, "ToUnicode");
    if (tuNum && objects.has(tuNum)) {
      const bytes = streamBytes(objects.get(tuNum));
      if (bytes) map = parseCMap(bytes.toString("latin1"));
    }
  }
  cmapCache.set(fontObjNum, map);
  return map;
}

// ---------- 3. walk the page tree ----------
const pageNums = [];
for (const [num, obj] of objects) {
  if (/\/Type\s*\/Page[^s]/.test(obj.body)) pageNums.push(num);
}
pageNums.sort((a, b) => a - b);

function resourcesBody(pageBody) {
  const resRef = ref(pageBody, "Resources");
  return resRef && objects.has(resRef) ? objects.get(resRef).body : pageBody;
}

function fontTable(pageBody) {
  // Both /Resources and the /Font dictionary inside it can be indirect.
  const resBody = resourcesBody(pageBody);
  let fontBody = null;
  const fontRef = ref(resBody, "Font");
  if (fontRef && objects.has(fontRef)) {
    fontBody = objects.get(fontRef).body;
  } else {
    const inline = resBody.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (inline) fontBody = inline[1];
  }
  if (!fontBody) return {};

  const table = {};
  const entryRe = /\/([A-Za-z0-9]+)\s+(\d+)\s+\d+\s+R/g;
  let hit;
  while ((hit = entryRe.exec(fontBody)) !== null) table[hit[1]] = Number(hit[2]);
  return table;
}

function imageNames(pageBody) {
  const resBody = resourcesBody(pageBody);
  const xo = resBody.match(/\/XObject\s*<<([\s\S]*?)>>/);
  if (!xo) return [];
  return [...xo[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+\d+\s+R/g)].map((h) => h[1] + "=obj" + h[2]);
}

// ---------- 4. decode a content stream into positioned text ----------
function decodeContent(content, fonts) {
  const items = [];
  let activeMap = null;
  let activeFont = "";
  let fontSize = 12;

  // Proper text state: Td is relative to the line matrix, not an absolute
  // position, and BT resets both matrices. Accumulating raw offsets instead
  // scrambles the reading order.
  const identity = () => [1, 0, 0, 1, 0, 0];
  let tm = identity();
  let tlm = identity();
  let leading = 12;

  const mul = (m, n) => [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5]
  ];

  const translate = (tx, ty) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm.slice();
  };

  // Named groups only: positional ones are too easy to misnumber once the Tm
  // alternative brings its own capturing groups along.
  const re = new RegExp(
    [
      "\\/(?<font>[A-Za-z0-9]+)\\s+(?<size>[-\\d.]+)\\s+Tf",
      "(?<lead>[-\\d.]+)\\s+TL",
      "(?<bt>BT)\\b",
      "(?<tdx>[-\\d.]+)\\s+(?<tdy>[-\\d.]+)\\s+T[dD]",
      "(?<tm>(?:[-\\d.]+\\s+){5}[-\\d.]+)\\s+Tm",
      "(?<star>T\\*)",
      "\\[(?<tj>(?:[^\\][\\\\]|\\\\.)*)\\]\\s*TJ",
      "\\((?<tjlit>(?:[^()\\\\]|\\\\.)*)\\)\\s*Tj",
      "<(?<tjhex>[0-9A-Fa-f\\s]*)>\\s*Tj"
    ].join("|"),
    "g"
  );

  const decodeLiteral = (lit) => {
    const out = [];
    for (let i = 0; i < lit.length; i += 1) {
      const ch = lit[i];
      if (ch === "\\") {
        const next = lit[i + 1];
        if (next === undefined) break;
        if (next >= "0" && next <= "7") {
          let oct = "";
          let j = i + 1;
          while (j < lit.length && oct.length < 3 && lit[j] >= "0" && lit[j] <= "7") { oct += lit[j]; j += 1; }
          out.push(parseInt(oct, 8));
          i = j - 1;
        } else {
          const esc = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
          out.push(esc[next] !== undefined ? esc[next] : next.charCodeAt(0));
          i += 1;
        }
      } else {
        out.push(ch.charCodeAt(0));
      }
    }
    return out;
  };

  const toText = (codes) => {
    if (!activeMap) return codes.map((c) => String.fromCharCode(c)).join("");
    return codes.map((c) => (activeMap.has(c) ? activeMap.get(c) : "")).join("");
  };

  let hit;
  while ((hit = re.exec(content)) !== null) {
    const g = hit.groups;

    if (g.font !== undefined) {
      activeFont = g.font;
      fontSize = Math.abs(parseFloat(g.size)) || 12;
      activeMap = fonts[activeFont] ? cmapFor(fonts[activeFont]) : null;
      continue;
    }
    if (g.lead !== undefined) { leading = Math.abs(parseFloat(g.lead)) || 12; continue; }
    if (g.bt !== undefined) { tm = identity(); tlm = identity(); continue; }
    if (g.tdx !== undefined) { translate(parseFloat(g.tdx), parseFloat(g.tdy)); continue; }
    if (g.tm !== undefined) {
      tm = g.tm.trim().split(/\s+/).map(Number);
      tlm = tm.slice();
      continue;
    }
    if (g.star !== undefined) { translate(0, -leading); continue; }

    let text = "";
    if (g.tj !== undefined) {
      // TJ array: strings may be literal or hex; kerning numbers only matter
      // when the gap is wide enough to stand in for a space.
      const parts = g.tj.match(/\(((?:[^()\\]|\\.)*)\)|<[0-9A-Fa-f\s]*>|(-?[\d.]+)/g) || [];
      for (const part of parts) {
        if (part.startsWith("(")) {
          text += toText(decodeLiteral(part.slice(1, -1)));
        } else if (part.startsWith("<")) {
          const clean = part.slice(1, -1).replace(/\s+/g, "");
          const codes = [];
          for (let i = 0; i + 1 < clean.length; i += 2) codes.push(parseInt(clean.slice(i, i + 2), 16));
          text += toText(codes);
        } else if (Math.abs(parseFloat(part)) > 180) {
          text += " ";
        }
      }
    } else if (g.tjlit !== undefined) {
      text = toText(decodeLiteral(g.tjlit));
    } else if (g.tjhex !== undefined) {
      const clean = g.tjhex.replace(/\s+/g, "");
      const codes = [];
      for (let i = 0; i + 1 < clean.length; i += 2) codes.push(parseInt(clean.slice(i, i + 2), 16));
      text = toText(codes);
    }

    if (text) items.push({ x: tm[4], y: tm[5], text, font: activeFont, size: fontSize });
  }
  return items;
}

// ---------- 5. emit ----------
const out = [];
pageNums.forEach((num, index) => {
  const page = objects.get(num);
  const fonts = fontTable(page.body);

  let contentNums = [];
  const single = ref(page.body, "Contents");
  if (single) contentNums = [single];
  else {
    const arr = page.body.match(/\/Contents\s*\[([^\]]*)\]/);
    if (arr) contentNums = [...arr[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((h) => Number(h[1]));
  }

  let items = [];
  for (const cn of contentNums) {
    if (!objects.has(cn)) continue;
    const bytes = streamBytes(objects.get(cn));
    if (bytes) items = items.concat(decodeContent(bytes.toString("latin1"), fonts));
  }

  // group into lines by y, then order left to right
  const lines = new Map();
  for (const it of items) {
    const key = Math.round(it.y / 2) * 2;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(it);
  }
  const ordered = [...lines.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, group]) => {
      // A wide horizontal jump is a table column boundary, not a space.
      const sorted = group.sort((p, q) => p.x - q.x);
      let line = "";
      let cursor = null;
      for (const item of sorted) {
        if (cursor !== null && item.x - cursor > item.size * 1.2) line += "  ┃  ";
        line += item.text;
        cursor = item.x + item.text.length * item.size * 0.5;
      }
      return line.replace(/[ \t]+/g, " ").trim();
    })
    .filter((line) => line.length > 0);

  const imgs = imageNames(page.body);
  out.push("\n========== TRANG " + (index + 1) + " ==========" + (imgs.length ? "  [hinh: " + imgs.join(", ") + "]" : ""));
  out.push(ordered.join("\n"));
});

const result = out.join("\n").normalize("NFC");
const dest = path.join(__dirname, "pdf-text.txt");
fs.writeFileSync(dest, result, "utf8");
console.log("Da ghi " + dest + " (" + result.length + " ky tu, " + pageNums.length + " trang)");
