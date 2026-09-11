# Bản web cho sổ tay IT Helpdesk — ghi chú triển khai

## Mục tiêu

Dựng lại bố cục cho `So_Tay_IT_Helpdesk_Can_Ban.pdf` thành một bản web mobile-first,
**giữ nguyên toàn bộ nội dung kỹ thuật**, nhưng trình bày để tra cứu và áp dụng
được ngay khi đang xử lý sự cố.

## Nguồn nội dung

Nội dung được **trích xuất nguyên văn** từ PDF gốc, không chép tay.

`tools/extract-pdf.js` đọc thẳng cấu trúc PDF: lập chỉ mục object, giải nén stream
FlateDecode bằng `zlib`, đọc ToUnicode CMap của từng font nhúng để ánh xạ mã glyph
về Unicode, và dựng lại ma trận text để giữ đúng thứ tự đọc cùng ranh giới cột bảng.
Kết quả nằm ở `tools/noi-dung-goc.txt` (25 trang) và là bản đối chiếu khi review.

PDF gốc chỉ có 10 ảnh, tất cả là hoa văn đầu/chân trang lặp lại — không có sơ đồ nội
dung nào. Mọi hình ảnh trực quan trong bản web đều là dựng mới từ chính nội dung chữ.

## Nội dung được chuyển thành hình ảnh trực quan

| Trong PDF gốc | Trong bản web |
| --- | --- |
| Câu mục tiêu 6 bước, một dòng chữ | Dải 6 ô đánh số ngay dưới bìa |
| "Nguyên tắc kiểm tra từ gần đến xa", danh sách 5 dòng | Thang 5 bậc có số và mô tả |
| Mô hình chẩn đoán 4 tầng, bảng 3 cột | Khối 4 tầng xếp chồng: lệnh kèm nút sao chép và kết luận "nếu thất bại" |
| Mẫu ghi chú `Symptom → … → Kết quả` | Chuỗi 6 mắt xích nối dọc |
| "Phân biệt thiết bị", một đoạn văn | Bốn thiết bị có mã màu riêng |
| Cảnh báo `169.254.x.x` nằm lẫn trong bước | Khối cảnh báo APIPA đứng riêng, cỡ lớn |
| Checklist 60 giây, 13 dòng có ô vuông | Checklist tick được, có thanh tiến độ |
| Combo A–D, 4 khối lệnh nối nhau | Bốn tab chuyển qua lại |
| "Ghi nhớ" xương sống chẩn đoán, một dòng | Dải 7 chặng có mốc nối |
| Bảng 2–3 cột | Bảng có thể lọc; tự xếp thành thẻ dọc ở ≤720px |

Ngoài ra bản web thêm một cây quyết định đi theo đúng mô hình 4 tầng của chương 6 —
không thêm kiến thức mới, chỉ biến bảng tra thành luồng hỏi Có/Không.

## Kiểm chứng

`node tools/verify.js` — 24 phép kiểm thử qua Edge/Chrome headless (CDP, không thêm
dependency): cấu trúc 14 mục, cây quyết định cả nhánh thành công lẫn nhánh dừng,
combo tabs, checklist, sao chép lệnh chép đúng nội dung, lọc tìm kiếm, mục lục tự
sáng khi cuộn, drawer mobile, bảng xếp thành thẻ dọc, không tràn ngang ở 390px,
không lỗi console. Ảnh chụp lưu ở `tools/screenshots/`.

`node tools/export-pdf.js` — in bản web ra `So_Tay_IT_Helpdesk_Ban_Web.pdf` qua
stylesheet `@media print`, và chụp lại trang bìa để kiểm.

## Ràng buộc đã chọn

- Không dependency, không bước build. Mở `index.html` là chạy.
- Không thêm, bớt hay diễn giải lại nội dung kỹ thuật của bản gốc.
- Mọi cảnh báo quyền quản trị và cảnh báo an toàn dữ liệu giữ nguyên vị trí tương ứng.
