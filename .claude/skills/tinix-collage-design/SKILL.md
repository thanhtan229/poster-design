---
name: tinix-collage-design
description: Dựng hoặc chỉnh trang/mẫu cắt dán (scrapbook, báo chí, sinh nhật...) trong TinixPoster bằng script. Dùng khi người dùng nhờ tạo mẫu mới, đổi phong cách, sửa bố cục, khung ảnh, chữ dán, hoặc xuất tờ cắt/laser cho trang cắt dán.
---

# Dựng trang cắt dán TinixPoster

Quy tắc thiết kế nằm ở **`DESIGN-RULES.md`** (nguồn chính, được cập nhật dần). Đọc file đó trước khi làm.

## Làm theo thứ tự
1. Đọc `DESIGN-RULES.md`. Hàm dựng dùng chung: `scripts/lib/collage-kit.mjs` (`slot`, `hero`, `dieText`, `paperShape`, `shapePath`, `starSticker`, `heartSticker`, `text`...). Mẫu tham khảo: `scripts/tinix-build-newspaper.mjs`.
2. Mẫu mới: sao chép script mẫu, đổi chữ, ảnh (`--photos`), màu, bố cục; **đừng viết lại hàm** đã có trong kit. Thiếu hàm thì thêm vào kit kèm số quy tắc.
3. Dựng: `node scripts/tinix-build-<tên>.mjs --output .runtime/moments/<tên>.draft.json`, rồi `node scripts/tinix-cli.mjs drafts validate|render --input ...` và **xem ảnh xem trước**.
4. Lưu: `node scripts/tinix-cli.mjs designs create --input ... --title ...` (trả về mã thiết kế).
5. Kiểm tra xuất cắt: `node scripts/tinix-cli.mjs collage export --id <mã> --directory .runtime/moments/<tên>-export --margin 8 --gap 4` (không cảnh báo); laser: xem mục 5.3 trong quy tắc.
6. Dịch chuyển/sửa theo nhận xét của người dùng → lặp 3–5 cho đến khi ổn.

## Sau khi người dùng nhận xét
Mỗi nhận xét về cái gì chưa ổn là một quy tắc mới: thêm **một dòng** (kèm *Vì sao*) vào `DESIGN-RULES.md` và ghi vào nhật ký cuối file, cùng commit với thay đổi mẫu. Nếu kiểm được bằng máy thì thêm vào kiểm tra, không chỉ ghi chữ.

## Nhắc nhanh (chi tiết ở file quy tắc)
- Chặt, chồng lấn, ít chỗ trống; ảnh tách nền cỡ lớn là hình chủ đạo.
- Khung ảnh đa dạng (elip, mây, hoa, tim), viền trắng; khung + ảnh là một nhóm.
- Dùng hiệu ứng của app (đen trắng, vân giấy), không nướng sẵn vào ảnh.
- Chữ lớn in nền là `base`; chữ trên ô màu dùng `backgroundColor`; chữ dán die-cut dùng `dieText`.
- Quy ước repo (nhánh, PR, ba cổng frontend, không push `origin`) xem `CLAUDE.md`.
