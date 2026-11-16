# TinixPoster — hướng dẫn cho AI

App thiết kế ảnh cưới / ảnh truyền thông có Trợ lý AI, **chỉ 1 người dùng, chạy trên máy (localhost)**.
Fork của [palxiao/poster-design](https://github.com/palxiao/poster-design) (AGPL-3.0). Bản thiết kế đầy đủ: `MVP-SPEC.md`.

## Stack
- Frontend (thư mục gốc): Vue 3 + Vite 5 + Pinia + Element Plus, TypeScript. Editor dùng DOM (widget `wText`, `wImage`, `wSvg`, `wGroup`, `wQrcode` trong `src/components/modules/widgets/`). Cổng 5173.
- Service (`service/`): Node.js + Express + better-sqlite3 (`service/data/poster.db`) + Puppeteer (xuất ảnh) + sharp. Cổng 7001. Route khai báo ở `service/src/control/api.ts` (tiền tố `/api`) và `router.ts`.
- Nhập PSD: `ag-psd` trong web worker (`src/utils/tinix/psd-ag.ts`), `psd.js` dự phòng.
- AI có sẵn: `service/src/service/ai.ts` (endpoint tương thích OpenAI, cấu hình ở bảng `ai_settings` qua trang admin).

## Chạy
- Cài phụ thuộc: `npm run tinix:setup`
- Font mới: `npm run tinix:fonts` rồi `npm run tinix:font-previews` (ảnh xem trước trong danh sách chọn font). Font từ `C:\Windows\Fonts`: `npm run tinix:winfonts` (manifest `scripts/tinix-winfonts.json`). Sao lưu DB + file tĩnh: `npm run tinix:backup`.
- Shortcut ngoài Desktop: `npm run tinix:shortcut` (trỏ vào `Mo-TinixPoster.cmd`)
- Dùng hằng ngày: nhấp đúp `Mo-TinixPoster.cmd` (hoặc `npm run tinix:prod`) → http://127.0.0.1:7001 (bản build, một cổng). Phát triển: `Mo-TinixPoster-Dev.cmd` hoặc `npm run tinix:dev` → http://127.0.0.1:5173 (Vite + service)
- Cấu hình bí mật: `service/.env` (mẫu `service/.env.example`). Không bao giờ commit `.env`.

## Tính năng chính hiện có (cập nhật 2026-11-12)
- **Trợ lý AI** (nút "Trợ lý AI" trên thanh trên): Gợi ý chữ, Sửa chữ, Tìm font, **Dựng theo mẫu** (chế độ *Giống mẫu* / *Viết nội dung mới*, tùy chọn tự tạo ảnh nền tương tự), Tạo ảnh (upstream), Lịch sử + chi phí, Cài đặt AI (model nhìn ảnh, đơn giá chữ/ảnh, giới hạn tháng).
- **Tệp → Lưu thành mẫu (công khai)** (chỉ admin) biến thiết kế thành mẫu trong thẻ "Mẫu thiết kế".
- Khung ảnh do AI dựng có `fit: 'cover'`: "Thay ảnh" giữ nguyên kích thước khung.
- **Kích thước canvas px | cm** (cập nhật 2026-11-14): px là đơn vị gốc; cm quy đổi theo DPI lưu trong `page.dpi` (mặc định 300). Ảnh PNG/PSD xuất ra mang đúng DPI. Khổ lớn (> 10.000 px/cạnh hoặc > 60 triệu điểm ảnh) dễ quá thời gian chờ 30 giây khi xuất ảnh phía server.
- Độ ổn định AI: `postWithRetry` (tự thử lại 429 quá tải/5xx, không thử lại khi hết quota), `modelErrorHint` (model bị ngừng/sai tên). Mọi lần gọi, kể cả tạo ảnh, ghi vào `ai_jobs` và tính vào giới hạn chi phí tháng.
- Bộ tự kiểm tra offline: `npm run tinix:test` (AI nhà cung cấp giả + font + khóa i18n, DB tạm, không cần API key) — chạy sau mỗi thay đổi; riêng phần AI có `npm run tinix:test-ai`.
- Thư mục `.runtime/` (log chạy thử, công cụ tạm) và `psd-test/` (PSD mẫu) không đưa vào git.

## Quy ước bắt buộc
- Làm trên nhánh git `tinix`. **Không push lên `origin`** (repo gốc của người khác).
- Code mới đặt trong `service/src/tinix/` (backend) và `src/utils/tinix/`, `src/components/business/ai-assistant/` (frontend).
- Hạn chế sửa file gốc. Mỗi chỗ sửa file gốc: thêm comment `[TINIX]` và ghi vào `TINIX.md`.
- Mọi lời gọi AI đi qua `service/src/tinix/ai/vision.ts` (`callVisionJSON`); kiểm tra JSON bằng `service/src/tinix/ai/validate.ts` (KHÔNG dùng zod: service biên dịch bằng TypeScript 3.9); lịch sử/chi phí ghi vào `ai_jobs`.
- Service dùng TypeScript 3.9: không có `catch (e: any)`, labeled tuple, `satisfies`… Kiểm tra: `cd service && npx tsc --noEmit -p .` (bỏ qua lỗi sẵn có trong `node_modules/axios`).
- Sau khi sửa phần AI: chạy `npm run tinix:test-ai`; sau khi sửa font/admin/i18n: chạy `npm run tinix:test`.
- AI trả tọa độ tỉ lệ 0–1; widget dùng px → đổi bằng kích thước trang.
- Chuỗi giao diện mới của TinixPoster: thêm khóa vào `src/languages/modules/vi/tinix-ui.ts` rồi dùng `$t('tinix.ui.<nhóm>.<khóa>')` / `i18t(...)`, không viết cứng tiếng Việt trong component.
- Ghi chú code mới bằng tiếng Việt hoặc tiếng Anh (code gốc ghi chú tiếng Trung).
- Repo không có test tự động: sau mỗi thay đổi, chạy app và kiểm tra tay (tạo, lưu, mở, thêm chữ, xuất ảnh) trước khi commit.
- Code chép từ Canvix (MIT) phải ghi vào `THIRD_PARTY.md` kèm thông báo bản quyền.
