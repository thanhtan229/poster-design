# Quy tắc thiết kế trang cắt dán (TinixPoster)

Bộ quy tắc rút ra từ việc dựng trang báo chí cắt dán (`scripts/tinix-build-newspaper.mjs`) cùng người dùng. Áp dụng cho mọi mẫu/trang cắt dán mới (scrapbook, báo chí, sinh nhật...).

- **Cách dùng:** đọc trước khi dựng; dùng hàm trong `scripts/lib/collage-kit.mjs` thay vì tự viết lại (mỗi hàm ghi số quy tắc nó thực hiện).
- **Cách cập nhật:** người dùng nhận xét một chỗ chưa ổn → thêm/sửa **một dòng** ở đây, ghi lý do (*Vì sao*) và ngày; nếu kiểm được bằng máy thì thêm vào `drafts validate`/bộ test thay vì chỉ ghi chữ. Quy tắc sai hoặc lỗi thời thì xóa, không để mâu thuẫn.
- Bối cảnh: người dùng **cắt bằng máy cắt/laser** (không cắt tay), giấy ảnh 230 g, đường cắt nằm giữa viền trắng.

## 1. Bố cục
1.1. **Chặt, ít khoảng trống.** Các thành phần chồng lấn lên nhau (khung đè khung, ảnh tách nền đè khung và giấy màu) như trang scrapbook thật. *Vì sao:* bản xếp rời rạc bị chê "quá nhiều khoảng trống" nhiều lần liên tiếp.
1.2. **Ảnh tách nền là hình chủ đạo:** cỡ lớn (cao 760–1000 px trên trang 1600 px), đè lên khung/giấy nền, đặt ở vùng giữa. Ảnh thường chỉ là ảnh phụ. Mỗi trang nên có 1–3 ảnh tách nền. *Vì sao:* "hình tách nền nên có kích thước lớn nổi bật".
1.3. **Lấp chỗ trống còn lại bằng sticker và chữ dán** (sao, tim, nhãn, băng dính), đặt chồng lên mép ảnh, không để thành đảo rời. Soát lại ảnh xem trước sau mỗi lần dịch chuyển khung: khoảng trống mới thường xuất hiện ở góc dưới và giữa các hình tách nền.
1.4. **Không để chữ che mặt người** và không để sticker/nhãn che phần quan trọng của ảnh (bàn chân, khuôn mặt).
1.5. **Thứ tự lớp = thứ tự dòng trong script** (dòng sau nằm trên). Khung/giấy nền đặt trước, ảnh tách nền sau, chữ và sticker sau cùng.
1.7. **Mật độ cao theo ảnh mẫu scrapbook:** ảnh nghiêng nhẹ, chồng lấn, ít nền lộ; mỗi khoảng trống > 300 px phải có sticker/nhãn.
1.6. **Mỗi trang đổi phong cách hẳn** (báo chí khác scrapbook khác...), không chỉ đổi chữ.

## 2. Khung ảnh
2.1. **Đa dạng dáng khung** trong cùng một trang: elip, đám mây, bông hoa, trái tim (`SHAPES`). Không dùng toàn chữ nhật. Dáng mới: thêm hàm bán kính theo góc vào `shapePath`.
2.9. **Dáng khung mở rộng:** ngoài ellipse/cloud/flower/heart còn `arch` (vòm cổng, đứng), `squircle` (vuông bo), `stamp` (tem răng cưa). Mẫu mới phải đổi cả **cấu trúc bố cục** (cột vòm, dải ngang, tâm lệch...) và bộ dáng khung, không chỉ đổi màu/chữ của mẫu trước. *Vì sao:* mẫu Tết đầu tiên bị chê chỉ là Little One đổi màu (2026-11-17).
2.2. **Máy cắt nên đường cong thoải mái;** không còn ràng buộc "đường thẳng dễ cắt tay".
2.3. **Khung giấy trắng dày (~16 px) có bóng đổ,** viền cắt màu **trắng**, không đen. Ảnh tách nền cũng có viền trắng ôm dáng + bóng.
2.4. **Khung to:** ảnh phụ tối thiểu ~560×620 px; ảnh cả nhà dạng ngang ~1300×620. Đừng thu nhỏ để "cho thoáng".
2.5. **Khung không vượt mép thành phẩm** (bộ xuất cảnh báo "vượt mép").
2.8. **Khung và ảnh tách nền có thể nghiêng nhẹ** (`rot` của `slot`/`hero`, ±2–4°, xen kẽ hướng) cho cảm giác dán tay; nhóm xoay cả khung lẫn ảnh. Khung nghiêng dễ vượt mép: chừa ≥ 40 px so với mép trang.
2.6. Có thể thêm giấy màu hình hoa/tim đặt dưới ảnh tách nền (`paperShape`) để tạo nền nổi cho hình chủ đạo.
2.7. **Giữ đầu người trong khung:** luôn chỉnh vị trí ảnh (`cropY`/vùng cắt) sao cho phần đầu người không bị khung cắt và không bị thành phần nào (chữ, sticker, nhãn, băng dính, ảnh khác) che. Nếu không gian khung không cho phép, chấp nhận mất phần chân. *Vì sao:* người dùng yêu cầu rõ; đầu là phần quan trọng nhất của ảnh gia đình.

## 3. Ảnh và hiệu ứng
3.1. **Dùng ảnh gốc + hiệu ứng của app** (`effects.grayscale`, `contrast`, `paper`, `grain`), không nướng sẵn ảnh đen trắng. *Vì sao:* chọn "Gốc" trong app phải đưa ảnh về màu.
3.2. **Không phải ảnh nào cũng đen trắng:** có ảnh màu (tách nền) cho nổi bật.
3.3. **Nền giấy dùng hiệu ứng vân giấy sẵn có của app** (`effects.paper`, `effects.grain`). `imageLayer()` bỏ qua `effects` truyền vào: gán `layer.effects = {...}` sau khi tạo.
3.4. Lớp phủ vân giấy/hạt không được đè lên các lớp khác (đã sửa `ImageAppearance.vue`: bỏ `z-index:1`).
3.6. **Nền họa tiết theo chủ đề** (`patternBackground`: hearts, stripes, dots, check) + hiệu ứng giấy/hạt của app; ảnh màu (không đen trắng) khi trang nền pastel.
3.5. Ảnh người dùng chỉ lấy từ thư viện được phép (mã `user_images` do người dùng cho phép); không dùng pixel của ảnh mẫu tham chiếu.

## 4. Chữ và mảnh cắt
4.1. **Chữ lớn in thẳng lên nền** (tên báo, dòng số báo, chân trang, tác giả) phải `printRole: 'base'` (`base: true`); nếu không bộ xếp coi là mảnh cắt quá khổ.
4.2. **Một mảnh vật lý = một lớp/nhóm.** Khung + ảnh gộp **một nhóm** (`slot`), chữ trên ô màu dùng `backgroundColor` của chính lớp chữ. Đừng vẽ ô riêng rồi đặt chữ lên: ra hai mảnh rời, một mảnh trống. *Vì sao:* từng ra mảnh giấy trắng trống riêng và chữ màu kem lẻ loi.
4.3. **Chữ dán die-cut** (`dieText`): viền trắng ôm nét chữ bằng hiệu ứng chữ của app. Lớp viền vẽ đè chữ gốc nên bắt buộc có lớp tô màu trên cùng.
4.4. **Chữ có nền/khung sáng tạo** (ô giấy màu, nhãn băng, ô đen, chữ ghép kiểu "tống tiền"), không chỉ chữ trần trên nền.
4.5. **Font Pacifico thiếu dấu nặng** (ạ, ị...): tránh từ có dấu nặng với font này. Kiểm ảnh xem trước xem dấu tiếng Việt có hiện đủ không.
4.6. **Chữ không tràn khung:** đặt `h` (cao khung) đủ cho Pacifico/nhiều dòng; chữ xuống dòng cần `h` lớn hơn `size*1.6`.
4.7. Mảnh `raised` mới có thể chồng lên nhau trên trang thành phẩm; bộ xếp tờ cắt xử lý từng mảnh riêng.

4.8. **Chữ cỡ lớn kiểu lettering** (`dieText` với `edge`): viền trắng dày + viền mực mảnh ngoài cùng, nghiêng −6…−9°, cỡ chữ ≥ 120 px. Không đặt lên đầu người (xem 2.7). *Vì sao:* ảnh mẫu scrapbook dùng chữ khổng lồ làm tiêu điểm thứ hai.
4.9. **Nhiều nhãn/ruy băng, mỗi trang 5–8 cái, kiểu khác nhau** (`label`: ribbon, tag, torn, stitch), nghiêng ±2–4° xen kẽ hướng, màu lấy từ bảng màu trang. Nhãn gồm nền + chữ gộp một nhóm = một mảnh cắt.
4.10. **Sticker chủ đề lớn** (`themeSticker`: cake, camera, arrow) cỡ 200–300 px, đặt chồng mép ảnh để lấp chỗ trống; chọn theo chủ đề trang (sinh nhật → bánh, du lịch → máy ảnh). Hình vẽ không nhận ra ngay (máy bay) thì bỏ, không dùng.
4.11. **Chữ ghép giấy màu** (từng chữ cái một ô màu, lệch ±4°) cho từ khóa lớn (ONE, FAMILY). Ô phải đủ cao: `h` ≥ cỡ chữ × 1.4, nếu không bị lỗi `TEXT_OVERFLOW`.

## 5. Quy trình kiểm tra (bắt buộc trước khi báo "xong")
5.1. `drafts validate` rồi `drafts render`, **xem ảnh**: khoảng trống, chữ bị che, dấu tiếng Việt, mép khung.
5.2. Lưu thành thiết kế (`designs create`), rồi `collage export --id <mã> --margin 8 --gap 4`: không được có cảnh báo; xem tờ cắt để chắc mỗi khung là một mảnh.
5.3. Nếu làm cho laser: lấy SVG `/api/tinix/collage-print/<job>/cut/<n>` và chồng lên tờ cắt kiểm tra đường cắt khớp hình.
5.4. Ba cổng frontend (`lint`, `vue-tsc`, `vite build`) và `tinix:test` khi sửa mã app (xem `CLAUDE.md`).
5.5. Chưa cắt thử trên máy thật thì phải nói rõ là chưa kiểm chứng.

## Nhật ký thay đổi quy tắc
- 2026-11-17: thêm 2.7 (giữ đầu người trong khung, chấp nhận mất chân khi thiếu chỗ) theo yêu cầu người dùng.
- 2026-11-17: tạo từ phiên dựng trang báo chí (khung đa dạng, bố cục chồng lấn, ảnh tách nền cỡ lớn, chữ die-cut, gộp khung với ảnh một mảnh, chữ in nền `base`).
- 2026-11-17: thêm quy tắc từ 6 ảnh scrapbook tham khảo (1.7, 2.8, 3.6, 4.8–4.11): khung/ảnh nghiêng, nền họa tiết, nhãn nhiều kiểu, sticker chủ đề, chữ lớn die-cut viền mực; mẫu thử `scripts/tinix-build-little-one.mjs`.
- 2026-11-17: thêm 2.9 (dáng khung arch/squircle/stamp; mẫu mới phải khác cả bố cục). Mẫu Tết dựng lại hoàn toàn: nền đỏ ô vàng, hai vòm cổng, ba ảnh tách nền hai bên.
