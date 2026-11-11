# TINIX — nhật ký sửa file gốc

Mọi chỗ TinixPoster sửa vào file của poster-design gốc (đánh dấu `[TINIX]` trong code).
Dùng khi cập nhật từ repo gốc: `git fetch origin && git merge origin/main` rồi kiểm tra lại các chỗ dưới đây.

## File gốc đã sửa

| File | Thay đổi | Lý do |
|---|---|---|
| `service/src/main.ts` | Import `./tinix/env` đầu tiên, rồi `./tinix/process-guard`; `app.listen(port, listenHost)` | Nạp `service/.env`; không sập khi xuất ảnh quá giờ; chỉ nghe 127.0.0.1 |
| `service/src/db/index.ts` | Import + gọi `migrateTinix(instance)` cuối `initDB()` | Thêm cột font + bảng `ai_jobs` |
| `package.json` | Script `tinix:setup`, `tinix:dev`, `tinix:fonts` | Chạy được trên Windows; nhập font |
| `.gitignore` | Bỏ ignore `CLAUDE.md`; ignore `.runtime/` | Theo dõi hướng dẫn AI trong git; bỏ log chạy thử |
| `src/languages/index.ts` | Thêm locale `vi`, `fallbackLocale: 'vi'`, `getBrowserLang()` luôn trả `'vi'` | Giao diện mặc định tiếng Việt |
| `src/views/Index.vue` | Nhãn header (Tệp, Trợ giúp, Trợ lý AI, Đổi mật khẩu, Quản trị, Đăng xuất, Đăng nhập, Hủy) → `$t('tinix.menu.*')` | Việt hóa |
| `src/views/components/Folder.vue`, `Helper.vue` | Mục menu Tệp / Trợ giúp → `$t('tinix.folder.*' / 'tinix.helper.*')` | Việt hóa |
| `src/components/business/login-dialog/index.vue`, `ChangePassword.vue` | Nhãn, placeholder, thông báo → `t('tinix.login.*' / 'tinix.password.*')`; lỗi server qua `viServerMsg()` | Việt hóa |
| `src/views/Psd.vue` | Thông báo "chỉ admin nhập được PSD" → tiếng Việt | Việt hóa |

## File mới (không đụng file gốc)

| File | Mục đích |
|---|---|
| `service/src/tinix/env.ts` | Nạp `service/.env` (Node `process.loadEnvFile`), cảnh báo nếu thiếu `AUTH_SECRET`, cấu hình `HOST` |
| `service/src/tinix/process-guard.ts` | Ghi log thay vì tắt service khi có unhandled rejection |
| `service/src/tinix/db/migrate.ts` | Cột `fonts.category/tags/supports_vietnamese/license`; bảng `ai_jobs` (idempotent) |
| `service/.env.example` | Mẫu biến môi trường (AUTH_SECRET, HOST, PORT, DEFAULT_ADMIN_*) |
| `scripts/tinix-dev.mjs` | Chạy editor + service cùng lúc, Ctrl+C dừng cả hai |
| `scripts/tinix-fonts.json` | 46 font Google Fonts có chữ Việt, giấy phép OFL, kèm nhóm + tag |
| `scripts/tinix-import-fonts.mjs` | Tải font về `service/static/fonts/` (+ `licenses/`) và ghi bảng `fonts` |
| `src/languages/modules/vi/index.ts` | Toàn bộ chuỗi tiếng Việt (`header.*`, `tinix.*`) — Việt hóa thêm thì thêm khóa ở đây |
| `src/utils/tinix/server-msg.ts` | `viServerMsg()`: dịch thông báo lỗi tiếng Trung của service sang tiếng Việt |
| `CLAUDE.md`, `MVP-SPEC.md`, `TINIX.md` | Tài liệu |

## Cách dùng nhanh

- **Chạy app:** `npm run tinix:dev` → http://127.0.0.1:5173
- **Nhập / cập nhật font:** sửa `scripts/tinix-fonts.json` rồi `npm run tinix:fonts` (chạy lại an toàn). Thêm `-- --dry` để chỉ xem danh sách.
- **Nhập mẫu PSD** (cần đăng nhập tài khoản admin):
  1. Đăng nhập ở góc trên bên phải editor (登录 / 注册).
  2. Mở http://127.0.0.1:5173/psd (hoặc trang admin → nút nhập PSD).
  3. Chọn file `.psd` → chờ phân tích → chỉnh nếu cần → lưu thành mẫu.
  4. Layer chữ trong PSD sẽ thành widget chữ chỉnh được; nếu font trong PSD không có trong kho thì đổi sang font tương tự trong kho.
- **Trang admin:** http://127.0.0.1:5173/admin (quản lý font, mẫu, cấu hình AI).

## Lỗi đã biết của repo gốc

- Mẫu chỉ hiện/xuất được khi `templates.state = 1`.
- Xuất ảnh quá giờ (`截图超时`): service không còn bị tắt (nhờ `process-guard`), nhưng request đó không nhận được phản hồi lỗi — hàng đợi `queueRun` gốc không chuyển lỗi về. Xử lý sau nếu gặp thường xuyên.
- Service biên dịch bằng **TypeScript 3.9** → không dùng cú pháp mới (labeled tuple, `satisfies`, …) trong `service/`.
- File tĩnh trong `/static` bị gắn `Content-Type: application/json` (middleware gốc) — trình duyệt vẫn nạp font/ảnh bình thường.

## Ghi chú
- Vite đã sẵn `host: '127.0.0.1'` trong `vite.config.ts` → không cần sửa.
- Đổi `AUTH_SECRET` làm mất phiên đăng nhập cũ → đăng nhập lại.
- Font tải về (`service/static/`) và database (`service/data/`) không nằm trong git → sao lưu riêng hai thư mục này.
