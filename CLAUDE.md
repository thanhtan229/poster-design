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
- Dùng hằng ngày: nhấp đúp `Mo-TinixPoster.cmd` (hoặc `npm run tinix:prod`) → http://127.0.0.1:7001 (bản build, một cổng). Phát triển: `Mo-TinixPoster-Dev.cmd` hoặc `npm run tinix:dev` → http://127.0.0.1:5173 (Vite + service). Nếu service 7001 đang chạy sẵn (bản `tinix:prod` hằng ngày), `tinix:dev` sẽ tranh cổng rồi thoát; khi đó chỉ chạy editor: `npm run dev -- --host 127.0.0.1 --port 5173` (dùng chung service 7001, tức dữ liệu thật — tránh bấm lưu khi thử).
- Cấu hình bí mật: `service/.env` (mẫu `service/.env.example`). Không bao giờ commit `.env`.

## Tính năng chính hiện có (cập nhật 2026-11-12)
- **Trợ lý AI** (nút "Trợ lý AI" trên thanh trên): Gợi ý chữ, Sửa chữ, Tìm font, **Dựng theo mẫu** (chế độ *Giống mẫu* / *Viết nội dung mới*, tùy chọn tự tạo ảnh nền tương tự), Tạo ảnh (upstream), Lịch sử + chi phí, Cài đặt AI (model nhìn ảnh, đơn giá chữ/ảnh, giới hạn tháng).
- **Tệp → Lưu thành mẫu (công khai)** (chỉ admin) biến thiết kế thành mẫu trong thẻ "Mẫu thiết kế".
- Khung ảnh do AI dựng có `fit: 'cover'`: "Thay ảnh" giữ nguyên kích thước khung.
- **Kích thước canvas px | cm** (cập nhật 2026-11-14): px là đơn vị gốc; cm quy đổi theo DPI lưu trong `page.dpi` (mặc định 300). Ảnh PNG/PSD xuất ra mang đúng DPI. Giới hạn canvas/xuất ảnh: tối đa 12.000 px mỗi cạnh và **100 triệu điểm ảnh** (hằng số `MAX_PIXELS` ở `src/utils/tinix/units.ts`, `MAX_EXPORT_PIXELS` ở `service/src/utils/export-limits.ts`; `scripts/tinix-cli.mjs`, `scripts/tinix-mcp.mjs` và `src/utils/tinix/collage-print.ts` có bản sao nên phải đổi cùng lúc). Trên 60 triệu điểm ảnh chỉ cảnh báo (chậm, tốn RAM). Thời gian chờ xuất ảnh tính theo kích thước (`exportTimeoutSec`: tối thiểu 60 giây, +1 giây mỗi triệu điểm ảnh). Đo thật: 8268×11220 (92,8 triệu) chụp ~5–7 giây, Chromium đỉnh ~2,3 GB RAM; 12000×12000 ~10 giây, ~3,1 GB.
- Độ ổn định AI: `postWithRetry` (tự thử lại 429 quá tải/5xx, không thử lại khi hết quota), `modelErrorHint` (model bị ngừng/sai tên). Mọi lần gọi, kể cả tạo ảnh, ghi vào `ai_jobs` và tính vào giới hạn chi phí tháng.
- Bộ tự kiểm tra offline: `npm run tinix:test` (AI nhà cung cấp giả + font + khóa i18n, DB tạm, không cần API key) — chạy sau mỗi thay đổi; riêng phần AI có `npm run tinix:test-ai`.
- Thư mục `.runtime/` (log chạy thử, công cụ tạm) và `psd-test/` (PSD mẫu) không đưa vào git.

## Quy ước bắt buộc
- Làm trên nhánh git `tinix`. **Không push lên `origin`** (repo gốc của người khác) — chỉ push lên remote `fork` (`thanhtan229/poster-design`).
- Quy trình PR: nhánh việc → push `fork` → PR vào `main` của `fork` → merge bằng merge commit → về `main`/`tinix`, xóa nhánh đã merge (local + `fork`). `gh pr edit` và `gh pr view --json` có thể lỗi thiếu quyền `read:org`; khi đó dùng REST: `gh api -X PATCH repos/thanhtan229/poster-design/pulls/<n> -F body=@file` và `gh api -X PUT repos/thanhtan229/poster-design/pulls/<n>/merge -f merge_method=merge -f sha=<head>`.
- Code mới đặt trong `service/src/tinix/` (backend) và `src/utils/tinix/`, `src/components/business/ai-assistant/` (frontend).
- Hạn chế sửa file gốc. Mỗi chỗ sửa file gốc: thêm comment `[TINIX]` và ghi vào `TINIX.md`.
- Mọi lời gọi AI đi qua `service/src/tinix/ai/vision.ts` (`callVisionJSON`); kiểm tra JSON bằng `service/src/tinix/ai/validate.ts` (KHÔNG dùng zod: service biên dịch bằng TypeScript 3.9); lịch sử/chi phí ghi vào `ai_jobs`.
- Service dùng TypeScript 3.9: không có `catch (e: any)`, labeled tuple, `satisfies`… Kiểm tra: `npm run tinix:typecheck-service` (ở thư mục gốc). **Đừng dùng `tsc --noEmit` trần trong `service`**: các khai báo kiểu mới trong `node_modules` có cú pháp TS 3.9 không đọc nổi (163 lỗi cú pháp), và khi có lỗi cú pháp `tsc` bỏ qua toàn bộ bước kiểm tra kiểu, nên nó luôn báo lỗi mà không kiểm tra mã dự án. Lệnh trên dùng TypeScript API và chỉ tính file ngoài `node_modules`. Lib DOM của TS 3.9 thiếu API mới (`FontFace`, `document.fonts`, `replaceChildren`, `letterSpacing`): mã chạy trong Chromium thì ép `any`.
- Sau khi sửa phần AI: chạy `npm run tinix:test-ai`; sau khi sửa font/admin/i18n: chạy `npm run tinix:test`.
- AI trả tọa độ tỉ lệ 0–1; widget dùng px → đổi bằng kích thước trang.
- Chuỗi giao diện mới của TinixPoster: thêm khóa vào `src/languages/modules/vi/tinix-ui.ts` rồi dùng `$t('tinix.ui.<nhóm>.<khóa>')` / `i18t(...)`, không viết cứng tiếng Việt trong component.
- Ghi chú code mới bằng tiếng Việt hoặc tiếng Anh (code gốc ghi chú tiếng Trung).
- Frontend phải qua 3 cổng trước khi commit: `npm run lint` (hiện **0 lỗi**, giữ nguyên như vậy), `npx vue-tsc --noEmit` (0 lỗi) và `npx vite build`; sửa `service/` thì thêm `npm run tinix:typecheck-service`. Bản CI (chạy đúng các bước này + `tinix:test`) nằm ở `.github/ci.yml.example`, chưa bật vì token đẩy mã thiếu quyền `workflow` (xem đầu file đó). Lưu ý: `vite build` KHÔNG kiểm tra kiểu, nên luôn chạy `vue-tsc`.
- Lint — những điều đã gặp:
  - Đừng dùng `eslint --fix` bừa với `vue/v-on-function-call`: nó đổi `@click="fn()"` thành `@click="fn"` và làm sự kiện bị truyền vào làm tham số. Với hàm có tham số, viết `@click="() => fn()"`.
  - Đừng gỡ import trong `src/types/*.d.ts` (cần để file là module khi `declare module` mở rộng kiểu của `vue`); nếu import thừa thì thay bằng `export {}`.
  - Biến/tham số cố ý không dùng thì đặt tên bắt đầu bằng `_`. Không đổi tên thuộc tính trong destructuring (`{ a }` thành `{ _a }` là đòi thuộc tính khác): bỏ hẳn tên đó khỏi mẫu.
  - `max-params` và `complexity` đã tắt có chủ ý (code canvas/PSD).
- Repo không có test giao diện tự động: ngoài các cổng trên và `npm run tinix:test`, chạy app và kiểm tra tay (tạo, lưu, mở, thêm chữ, xuất ảnh) trước khi commit.
- Ảnh nhúng trong test phải là PNG/JPEG hợp lệ: `sharp` 0.35 (libvips 8.18) từ chối PNG hỏng CRC mà bản 0.33 từng bỏ qua (từng làm nhóm "AI (nhà cung cấp giả)" lỗi `libpng read error`).
- Code chép từ Canvix (MIT) phải ghi vào `THIRD_PARTY.md` kèm thông báo bản quyền.
