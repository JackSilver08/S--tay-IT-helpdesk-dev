# Sổ tay xử lý sự cố căn bản cho IT Helpdesk — bản web

Bản web dựng lại bố cục cho `So_Tay_IT_Helpdesk_Can_Ban.pdf`.
**Nội dung giữ nguyên theo bản gốc**; chỉ khác cách trình bày, điều hướng và các khối tương tác.

Mobile-first, không cần build, không phụ thuộc thư viện ngoài.

## Mở bản xem trước

Mở `index.html` bằng trình duyệt là đủ để đọc và thử mọi tương tác.

Để thử PWA/offline, cần phục vụ thư mục qua một static server rồi truy cập bằng `http://localhost`
(service worker không chạy trên `file://`). Ví dụ:

```bash
npx serve .
# hoặc
python -m http.server 8000
```

## Cấu trúc

```text
index.html                          nội dung 12 chương + phụ lục
styles.css                          hệ thống thị giác, responsive, bản in
app.js                              điều hướng, tìm kiếm, cây quyết định, combo, checklist, copy
sw.js                               cache offline (network-first cho trang)
manifest.webmanifest, icon.svg      cài đặt PWA
So_Tay_IT_Helpdesk.html             ★ BẢN GỌN MỘT FILE — mang đi đâu cũng chạy
So_Tay_IT_Helpdesk_Can_Ban.pdf      tài liệu gốc — nguồn nội dung
So_Tay_IT_Helpdesk_Ban_Web.pdf      PDF giữ nguyên màu, để đọc trên màn hình
So_Tay_IT_Helpdesk_Ban_In.pdf       PDF đen trắng, để in ra giấy
tools/extract-pdf.js                trích xuất nguyên văn text từ PDF gốc
tools/noi-dung-goc.txt              kết quả trích xuất, dùng để đối chiếu nội dung
tools/fidelity.js                   đối chiếu nội dung web với bản gốc
tools/verify.js                     bộ kiểm thử trình duyệt (chỉ dùng Node built-in)
tools/build-single-file.js          gộp tất cả vào một file HTML
tools/check-single-file.js          kiểm chứng file gộp chạy độc lập
tools/export-pdf.js                 xuất lại hai bản PDF
```

## Mang sổ tay đi đâu cũng đọc được

Có ba cách, chọn theo nhu cầu:

| Cần gì | Dùng file nào |
| --- | --- |
| Giữ đủ tương tác, một file, mang đi USB / gửi mail | **`So_Tay_IT_Helpdesk.html`** — nhảy đôi là mở |
| Đọc trên điện thoại, máy không có trình duyệt tốt, gửi cho người khác | `So_Tay_IT_Helpdesk_Ban_Web.pdf` (giữ nguyên màu) |
| In ra giấy | `So_Tay_IT_Helpdesk_Ban_In.pdf` (đen trắng, tiết kiệm mực) |

`So_Tay_IT_Helpdesk.html` là **một file duy nhất 151 KB** đã nhúng sẵn CSS, JS và icon —
không tham chiếu ra ngoài, không cần thư mục đi kèm, không cần server. Mọi tương tác
vẫn còn: tìm kiếm, cây quyết định, checklist, sao chép lệnh.

```bash
node tools/build-single-file.js     # dựng lại sau khi sửa nội dung
node tools/check-single-file.js     # copy ra thư mục trống rồi mở, chứng minh chạy độc lập
```

## Đối chiếu nội dung với bản gốc

```bash
node tools/fidelity.js
```

So từng mục của bản web với `tools/noi-dung-goc.txt`: tiêu đề chương, toàn bộ lệnh
trong hai bảng tham khảo, 13 mục checklist, các câu chốt, và đếm số lần xuất hiện của
cảnh báo quyền quản trị. Hiện tại: **80/80 khớp, cảnh báo 10/10 đúng vị trí.**

## Nội dung

Đầy đủ theo bản gốc: 12 chương và phụ lục, 61 lệnh CMD, mọi bảng và mọi cảnh báo
“⚠ Quyền quản trị hoặc khởi động lại có thể được yêu cầu” đều được giữ đúng chỗ.

| Chương | Nội dung |
| --- | --- |
| 01 | Tư duy troubleshooting |
| 02 | Quy trình tiếp nhận và xử lý ticket |
| 03 | Kiểm tra phần cứng và kết nối vật lý |
| 04 | Xử lý Wi-Fi |
| 05 | Xử lý mạng LAN |
| 06 | Xử lý Internet, DNS và DHCP |
| 07 | Xử lý máy in |
| 08 | Xử lý Windows, process, service và driver |
| 09 | Xử lý Windows và ổ đĩa |
| 10 | Điều tra mạng cơ bản |
| 11 | Trang lệnh CMD tham khảo |
| 12 | Checklist IT Helpdesk |
| PL | Quick Reference |

Để đối chiếu nội dung web với bản gốc, xem `tools/noi-dung-goc.txt` (trích xuất nguyên văn).

## Những gì bản web làm được mà PDF không làm được

- **Mục lục bám theo khi cuộn** trên desktop, drawer trượt trên điện thoại.
- **Tìm kiếm bỏ dấu tiếng Việt**: gõ `169.254`, `spooler` hay `dns` để lọc; chương không còn kết quả
  tự ẩn và mờ đi trong mục lục. `Enter` nhảy tới chương khớp đầu tiên.
- **Cây quyết định 4 tầng** (chương 6): trả lời Có/Không theo từng tầng
  `ping 127.0.0.1` → gateway → `8.8.8.8` → `nslookup`, mỗi nhánh dừng lại ở đúng kết luận khoanh vùng.
- **Sao chép lệnh một chạm** ở cả 61 lệnh.
- **Checklist 60 giây có thanh tiến độ**, tick ngay trên trang khi đang xử lý sự cố.
- **Combo A–D** chuyển tab thay vì lật trang.
- **Bảng tự xếp thành thẻ dọc** trên điện thoại — bảng 3 cột của PDF không đọc được ở 390px.
- Bản in đen trắng (Ctrl+P) và hoạt động offline sau lần truy cập đầu.

## Kiểm thử

```bash
node tools/verify.js
```

Script tự mở Edge (hoặc Chrome) ở chế độ headless, dựng static server tạm, chạy
kiểm thử và lưu ảnh chụp vào `tools/screenshots/`. Không cần cài gói nào.

Kết quả hiện tại: **24/24 pass** ở 1440px và 390px — cấu trúc 14 mục khớp mục lục,
cây quyết định đi đủ cả nhánh thành công lẫn nhánh dừng, combo tabs, checklist đếm đúng,
sao chép lệnh chép đúng nội dung, lọc tìm kiếm, mục lục tự sáng khi cuộn, drawer mobile,
bảng xếp thành thẻ dọc, không tràn ngang ở 390px, không lỗi console.

## Xuất lại bản PDF

```bash
node tools/export-pdf.js
```

Sinh cùng lúc hai file và chụp lại trang bìa để kiểm tra:

- `So_Tay_IT_Helpdesk_Ban_Web.pdf` — nền màu tràn mép giấy, mỗi chương mở ở đầu trang mới.
- `So_Tay_IT_Helpdesk_Ban_In.pdf` — đen trắng, gọn trang.

Hai bản dùng chung `@media print`; bản màu bật bằng class `pdf-color` trên thẻ `html`,
nên `Ctrl+P` trực tiếp trên trình duyệt vẫn ra bản đen trắng tiết kiệm mực.

## Ghi chú kỹ thuật

`--serif` **không dùng Georgia làm font đầu tiên** vì Georgia thiếu một số glyph tiếng Việt
(ồ, ự, ộ…), khiến trình duyệt độn Times New Roman ngay giữa từ. Stack hiện tại
(Cambria → Constantia → Palatino Linotype…) render toàn bộ tiếng Việt bằng một font.

Tiêu đề lớn dùng `cqi` để co theo cột chứa nó, và `line-height` không được nhỏ hơn `0.95`
— dưới mức đó dấu tiếng Việt chạm vào dòng trên.

Khi cập nhật nội dung, nhớ tăng `CACHE_NAME` trong `sw.js` để máy đã cài PWA nhận bản mới.

## Trước khi phát hành nội bộ

Nội dung kỹ thuật giữ nguyên theo sổ tay gốc phiên bản 1.0. Trước khi đưa vào vận hành,
hãy gắn owner và ngày review cho từng chương, và xác nhận các lệnh cần quyền quản trị
phù hợp với chính sách của tổ chức.
