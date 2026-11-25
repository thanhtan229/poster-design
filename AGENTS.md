# AGENTS.md — hướng dẫn cho Codex (và các agent khác)

Dự án TinixPoster: app thiết kế ảnh cưới/truyền thông, chỉ một người dùng, chạy localhost. Tài liệu đầy đủ: `CLAUDE.md` (quy ước repo, stack, lệnh) và `TINIX.md` (ghi chú kỹ thuật).

## Đề xuất cải tiến sau mỗi task

Cuối mỗi task TinixPoster, chủ động đề xuất các bước hợp lý tiếp theo để dựng mẫu nhanh và hiệu quả hơn. Dựa vào vướng mắc, thao tác lặp hoặc thời gian chờ vừa quan sát được. Chọn một bước ưu tiên, giải thích ngắn vì sao và nêu cách đo hiệu quả khi có thể. Đối chiếu với công cụ hiện có để tránh đề xuất trùng. Nếu chưa có cải tiến đáng làm, nói rõ. Triển khai đề xuất mới khi người dùng duyệt hoặc khi nó đã thuộc phạm vi task hiện tại.

## Dựng trang cắt dán (scrapbook, báo chí, mẫu sinh nhật...)
Khi được nhờ tạo mẫu mới, đổi phong cách, sửa bố cục, khung ảnh, chữ dán, hoặc xuất tờ cắt/laser:

1. Đọc `DESIGN-RULES.md` (ở gốc repo). Đây là nguồn quy tắc thiết kế, đánh số và có kèm lý do.
2. Dùng hàm trong `scripts/lib/collage-kit.mjs` (`slot`, `hero`, `dieText`, `paperShape`, `shapePath`, sticker...). Không viết lại hàm đã có. Mẫu tham khảo: `scripts/tinix-build-newspaper.mjs`.
3. Quy trình:
   - Dựng: `node scripts/tinix-build-<tên>.mjs --output .runtime/moments/<tên>.draft.json`
   - Kiểm tra: `node scripts/tinix-cli.mjs drafts validate --input ...` rồi `drafts render --input ... --output ...`, và **xem ảnh xem trước**.
   - Lưu: `node scripts/tinix-cli.mjs designs create --input ... --title "..."` (trả về mã thiết kế).
   - Xuất cắt: `node scripts/tinix-cli.mjs collage export --id <mã> --directory <thư mục> --margin 8 --gap 4`. Không được có cảnh báo.
4. Sau khi xử lý phản hồi của người dùng, đối chiếu với `DESIGN-RULES.md`. Chủ động bổ sung hoặc sửa quy tắc khi bài học áp dụng được cho mẫu sau, nêu lý do (*Vì sao*) và ghi nhật ký cuối file ngay trong lượt làm việc. Gộp vào quy tắc sẵn có khi trùng nội dung. Ghi chi tiết riêng của mẫu vào hồ sơ bản nháp. Chỉ commit khi phạm vi người dùng cho phép.

## Dựng mẫu cắt dán từ MỘT ảnh tham chiếu (ảnh chụp trang scrapbook)
Khi người dùng đưa một ảnh mẫu và nhờ "dựng giống ảnh này" thì dùng đường này (không viết script dựng tay). Tài liệu đầy đủ: mục **"Dựng mẫu cắt dán từ ảnh tham chiếu"** trong `TINIX.md` (định dạng spec, các điều đã thử không hiệu quả). Không gọi AI trả phí.

**Điều kiện trước khi làm**
- App phải đang chạy ở `http://127.0.0.1:7001` (tải font, tách nền BiRefNet). Nếu sandbox chặn kết nối tới `127.0.0.1`, xin người dùng cho phép mạng thay vì bỏ qua bước.
- Phải **tự xem được ảnh** trên máy (ảnh lưới, ảnh render, ảnh so sánh). Không xem được thì dừng và báo người dùng; đừng đoán toạ độ.
- Tệp làm việc để trong `.runtime/reference/<tên>/` (không commit).

**Quy trình**
```text
node scripts/tinix-cli.mjs reference grid --input ref.png --output ref-grid.png
#   xem ref-grid.png, đọc toạ độ (px của ảnh gốc) rồi viết spec.json
node scripts/tinix-cli.mjs drafts from-reference --reference ref.png --spec spec.json --output draft.json --photos placeholder
node scripts/tinix-cli.mjs drafts validate --input draft.json
node scripts/tinix-cli.mjs drafts check-edges --input draft.json
node scripts/tinix-cli.mjs drafts render --input draft.json --output render.png
node scripts/tinix-cli.mjs reference compare --reference ref.png --draft draft.json --spec spec.json --output cmp.png
#   xem hai ảnh, ưu tiên lớp có sai khác thấy rõ; sau khi sửa, kiểm và render lại
node scripts/tinix-cli.mjs templates save-collage --input draft.json --name "Tên mẫu"   # CHỈ khi người dùng đã duyệt
```

**Viết spec** (mẫu có sẵn: `scripts/examples/smile-darling.spec.json`, `scripts/examples/luna-frame.spec.json`)
- `elements` theo thứ tự lớp từ dưới lên: `frame` (khung giấy + ảnh bên trong), `photo` (ảnh có mask), `label` (nhãn + chữ), `sticker` (cắt từ ảnh mẫu).
- Toạ độ, kích thước, góc xoay do mình đọc từ ảnh lưới; máy tự lo màu giấy/nền/mực, cắt ảnh khung đã duỗi thẳng, tách sticker và khớp cỡ chữ.
- `textInk` phải bao sát chữ (không lấn viền giấy/nền tối), nếu không chữ nhiều dòng bị giãn dòng quá thưa.
- Biểu tượng nhỏ trong nhãn: thêm `sticker` với `keep: "box"` đặt SAU nhãn. Sticker bị BiRefNet cắt hụt: dùng `keep: "box"`.
- **Người/ảnh khách trong ảnh mẫu không được thành sticker**: đặt chỗ đó là `frame`/`photo` (khung ảnh trống). Mẫu chỉ lưu bố cục; ảnh người của ảnh mẫu không đi vào thư viện mẫu.
- Sửa lệch bằng tay theo `reference compare`. Đừng thêm bước tự tinh chỉnh khung (leo đồi, `reference nudge`): đã thử hai lần, kết quả tệ hơn (xem `TINIX.md`).

**Lưu và bàn giao**
- Giữ mặc định `--photos placeholder` khi dựng bản để lưu. `--photos reference` chỉ để đo độ khớp, không lưu bản đó.
- `templates save-collage` ghi thẳng vào thư viện mẫu thật (và tài nguyên vào `service/static/collage/<tên>/`). Trước khi lưu: gửi người dùng `render.png` (và số MAE/SSIM của `reference compare`), chờ đồng ý.
- Sau khi lưu, báo mã mẫu. Người dùng mở mẫu trong app để chỉnh tiếp và lưu bằng Tệp → Lưu đè mẫu.

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
