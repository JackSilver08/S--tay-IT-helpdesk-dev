// Doi chieu ban web voi text trich xuat tu PDF goc.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "tools/noi-dung-goc.txt"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// text thuan cua trang web
const webText = html
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, " ")
  .normalize("NFC");

const squash = (s) => s.replace(/\s+/g, " ").trim();

let missing = 0;
let checked = 0;
function must(label, needle) {
  checked += 1;
  if (!webText.includes(squash(needle))) {
    missing += 1;
    console.log("THIEU  " + label + "  ::  " + needle.slice(0, 90));
  }
}

// ---- 1. tieu de 13 chuong + phu luc ----
const chapters = [
  "Tư duy troubleshooting",
  "Quy trình tiếp nhận và xử lý ticket",
  "Kiểm tra phần cứng và kết nối vật lý",
  "Xử lý Wi-Fi",
  "Xử lý mạng LAN",
  "Xử lý Internet, DNS và DHCP",
  "Xử lý máy in",
  "Điều tra mạng cơ bản",
  "Trang lệnh CMD tham khảo",
  "Checklist IT Helpdesk",
  "Quick Reference"
];
chapters.forEach((c) => must("chuong", c));

// ---- 2. moi lenh trong hai bang tham khao cua chuong 11 ----
const commandLines = source
  .split("\n")
  .filter((l) => l.includes(" ┃ "))
  .map((l) => squash(l.split(" ┃ ")[0]))
  .filter((c) => /^(ipconfig|ping|tracert|pathping|nslookup|arp|route|netstat|netsh|hostname|whoami|systeminfo|driverquery|tasklist|taskkill|sc |net |chkdsk|sfc|DISM|control|printmanagement|devmgmt|eventvwr|msinfo32)/.test(c));
const uniqueCommands = [...new Set(commandLines)];
uniqueCommands.forEach((c) => must("lenh", c));

// ---- 3. cac cau chot khong duoc mat ----
const keySentences = [
  "Luôn xác định lỗi trước khi reset",
  "Reset có thể làm mất cấu hình, gây thêm biến số",
  "Đây thường là địa chỉ APIPA do Windows tự gán",
  "DHCP giúp thiết bị nhận cấu hình mạng như IP, subnet, gateway, DNS",
  "Một hop không trả lời ICMP không nhất thiết là lỗi",
  "Tín hiệu mạnh không đảm bảo Internet tốt",
  "Việc biết SSID không tự động cho phép truy cập vào mạng",
  "Trước khi restart service, ghi nhận trạng thái hiện tại",
  "ưu tiên bảo toàn dữ liệu và quy trình phục hồi của tổ chức",
  "Một Helpdesk giỏi không phải người biết nhiều lệnh nhất",
  // doan "phan biet thiet bi" duoc tach tu van xuoi thanh danh sach co nhan,
  // nen doi chieu tung ve thay vi ca cau
  "Adapter/NIC",
  "là phần giao tiếp mạng của máy",
  "kết nối LAN với mạng khác và thường cấp/định tuyến Internet",
  "Đừng kết thúc ticket ngay khi",
  "Nhiều máy cùng không in được thường làm tăng khả năng"
];
keySentences.forEach((s) => must("cau chot", s));

// ---- 4. canh bao quyen quan tri phai xuat hien du so lan ----
const sourceWarnings = (source.match(/⚠ Quyền quản trị hoặc khởi động lại có thể được yêu cầu/g) || []).length;
const webWarnings = (webText.match(/⚠ Quyền quản trị hoặc khởi động lại có thể được yêu cầu/g) || []).length;
console.log(
  "\nCanh bao quyen quan tri: PDF goc " + sourceWarnings + " lan, ban web " + webWarnings + " lan" +
    (webWarnings >= sourceWarnings ? "  (OK)" : "  (THIEU)")
);

// ---- 5. 13 muc checklist ----
const checklistItems = source
  .split("\n")
  .filter((l) => l.trim().startsWith("□"))
  .map((l) => squash(l.replace("□", "")));
checklistItems.forEach((c) => must("checklist", c));
console.log("So muc checklist trong PDF goc: " + checklistItems.length);

console.log("\nDa doi chieu " + checked + " muc, thieu " + missing);
process.exit(missing === 0 ? 0 : 1);
