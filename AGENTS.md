# AGENTS.md — hướng dẫn cho Codex (và các agent khác)

Dự án TinixPoster: app thiết kế ảnh cưới/truyền thông, chỉ một người dùng, chạy localhost. Tài liệu đầy đủ: `CLAUDE.md` (quy ước repo, stack, lệnh) và `TINIX.md` (ghi chú kỹ thuật).

## Dựng trang cắt dán (scrapbook, báo chí, mẫu sinh nhật...)
Khi được nhờ tạo mẫu mới, đổi phong cách, sửa bố cục, khung ảnh, chữ dán, hoặc xuất tờ cắt/laser:

1. Đọc `DESIGN-RULES.md` (ở gốc repo). Đây là nguồn quy tắc thiết kế, đánh số và có kèm lý do.
2. Dùng hàm trong `scripts/lib/collage-kit.mjs` (`slot`, `hero`, `dieText`, `paperShape`, `shapePath`, sticker...). Không viết lại hàm đã có. Mẫu tham khảo: `scripts/tinix-build-newspaper.mjs`.
3. Quy trình:
   - Dựng: `node scripts/tinix-build-<tên>.mjs --output .runtime/moments/<tên>.draft.json`
   - Kiểm tra: `node scripts/tinix-cli.mjs drafts validate --input ...` rồi `drafts render --input ... --output ...`, và **xem ảnh xem trước**.
   - Lưu: `node scripts/tinix-cli.mjs designs create --input ... --title "..."` (trả về mã thiết kế).
   - Xuất cắt: `node scripts/tinix-cli.mjs collage export --id <mã> --directory <thư mục> --margin 8 --gap 4`. Không được có cảnh báo.
4. Khi người dùng nhận xét một chỗ chưa ổn: thêm **một dòng** quy tắc vào `DESIGN-RULES.md` kèm lý do (*Vì sao*) và ghi vào nhật ký cuối file, cùng commit với thay đổi mẫu.

## Quy ước repo (bắt buộc)
- Làm trên nhánh git riêng từ `main`. **Không push lên `origin`** (repo gốc của người khác); chỉ push lên remote `fork`.
- PR vào `main` của `fork` (`thanhtan229/poster-design`). Chỉ merge khi người dùng yêu cầu, bằng merge commit.
- Code mới: backend trong `service/src/tinix/`, frontend trong `src/utils/tinix/` và `src/components/business/ai-assistant/`.
- Service dùng TypeScript 3.9: không dùng `satisfies`, `catch (e: any)`, labeled tuple. Kiểm tra: `npm run tinix:typecheck-service`.
- Frontend phải qua ba cổng trước khi commit: `npm run lint` (0 lỗi), `npx vue-tsc --noEmit` (0 lỗi), `npx vite build`.
- Sau khi sửa phần AI: `npm run tinix:test-ai`. Sau khi sửa font/admin/i18n: `npm run tinix:test`.
- Chuỗi giao diện mới: thêm khóa vào `src/languages/modules/vi/tinix-ui.ts`, không viết cứng tiếng Việt trong component.
- Mỗi chỗ sửa file gốc của dự án: thêm comment `[TINIX]` và ghi vào `TINIX.md`.
- Mọi lời gọi AI đi qua `service/src/tinix/ai/vision.ts` (`callVisionJSON`), kiểm tra JSON bằng `service/src/tinix/ai/validate.ts` (không dùng zod).

## Không làm
- Không commit file `.env`, `service/data/poster.db`, hoặc thư mục `.runtime/`.
- Không đổi quyền hệ thống hay cấu hình máy (ví dụ đăng ký tác vụ Task Scheduler): chỉ dùng `-DryRun` nếu cần xem trước.
- Đừng tự tạo ảnh/chữ thay người dùng khi không có yêu cầu; ảnh lấy từ thư viện `user_images` mà người dùng đã cho phép.
