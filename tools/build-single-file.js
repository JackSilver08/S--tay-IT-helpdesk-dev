// Gop ca ban web vao MOT file HTML duy nhat.
//
//   node tools/build-single-file.js
//
// Ket qua: So_Tay_IT_Helpdesk.html o thu muc goc du an.
// File nay tu chay duoc: nhay doi la mo, khong can server, khong can thu muc di kem,
// va giu nguyen moi tuong tac (tim kiem, cay quyet dinh, checklist, sao chep lenh).
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "So_Tay_IT_Helpdesk.html");

const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

const html = read("index.html");
const css = read("styles.css");
const js = read("app.js");
const icon = fs.readFileSync(path.join(ROOT, "icon.svg"));

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    console.error("Khong tim thay " + label + " trong index.html");
    process.exit(1);
  }
  return source.replace(needle, replacement);
}

let out = html;

// 1. nhung CSS
out = replaceOnce(
  out,
  '<link rel="stylesheet" href="styles.css" />',
  "<style>\n" + css + "\n    </style>",
  "the <link> cua styles.css"
);

// 2. nhung JS
out = replaceOnce(out, '<script src="app.js"></script>', "<script>\n" + js + "\n    </script>", "the <script> cua app.js");

// 3. icon thanh data URI, bo manifest (PWA can nhieu file nen khong dung o day)
out = replaceOnce(
  out,
  '<link rel="icon" href="icon.svg" type="image/svg+xml" />',
  '<link rel="icon" href="data:image/svg+xml;base64,' + icon.toString("base64") + '" />',
  "the <link> cua icon.svg"
);
out = replaceOnce(out, '    <link rel="manifest" href="manifest.webmanifest" />\n', "", "the <link> cua manifest");

// 4. bo cac lien ket toi file PDF: file don co the nam mot minh o bat cu dau,
//    de lai thi thanh lien ket chet.
const pdfLinks = out.match(/<a[^>]*href="[^"]*\.pdf"[^>]*>[\s\S]*?<\/a>\s*/g) || [];
pdfLinks.forEach((link) => {
  out = out.replace(link, "");
});

// 5. ghi chu o dau file cho nguoi mo bang trinh soan thao
out = out.replace(
  "<head>",
  "<head>\n    <!-- Ban gop mot file cua so tay. Sinh tu index.html + styles.css + app.js\n         bang: node tools/build-single-file.js — dung sua truc tiep file nay. -->"
);

fs.writeFileSync(OUTPUT, out, "utf8");

const kb = Math.round(Buffer.byteLength(out, "utf8") / 1024);
console.log("Da tao      : " + path.basename(OUTPUT) + "  (" + kb + " KB, 1 file duy nhat)");
console.log("Da go       : " + pdfLinks.length + " lien ket PDF");
console.log("Con lai     : " + ((out.match(/(href|src)="(?!#|data:|mailto:)[^"]+"/g) || []).length) + " tham chieu ra ngoai (can bang 0)");
