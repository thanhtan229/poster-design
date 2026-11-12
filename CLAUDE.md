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
- Chạy cả hai: nhấp đúp `Mo-TinixPoster.cmd`, hoặc `npm run tinix:dev` → http://127.0.0.1:5173
- Cấu hình bí mật: `service/.env` (mẫu `service/.env.example`). Không bao giờ commit `.env`.

## Quy ước bắt buộc
- Làm trên nhánh git `tinix`. **Không push lên `origin`** (repo gốc của người khác).
- Code mới đặt trong `service/src/tinix/` (backend) và `src/utils/tinix/`, `src/components/business/ai-assistant/` (frontend).
- Hạn chế sửa file gốc. Mỗi chỗ sửa file gốc: thêm comment `[TINIX]` và ghi vào `TINIX.md`.
- Mọi lời gọi AI đi qua `service/src/tinix/ai/vision.ts` (`callVisionJSON`); kiểm tra JSON bằng `service/src/tinix/ai/validate.ts` (KHÔNG dùng zod: service biên dịch bằng TypeScript 3.9); lịch sử/chi phí ghi vào `ai_jobs`.
- Service dùng TypeScript 3.9: không có `catch (e: any)`, labeled tuple, `satisfies`… Kiểm tra: `cd service && npx tsc --noEmit -p .` (bỏ qua lỗi sẵn có trong `node_modules/axios`).
- Sau khi sửa phần AI: chạy `npm run tinix:test-ai`.
- AI trả tọa độ tỉ lệ 0–1; widget dùng px → đổi bằng kích thước trang.
- Ghi chú code mới bằng tiếng Việt hoặc tiếng Anh (code gốc ghi chú tiếng Trung).
- Repo không có test tự động: sau mỗi thay đổi, chạy app và kiểm tra tay (tạo, lưu, mở, thêm chữ, xuất ảnh) trước khi commit.
- Code chép từ Canvix (MIT) phải ghi vào `THIRD_PARTY.md` kèm thông báo bản quyền.
