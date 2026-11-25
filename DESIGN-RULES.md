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
**Kiểm khi thay ảnh.** Với bộ nguyên liệu có khung giấy xé, thử thay ảnh trên bản sao và render lại để so lòng khung, góc xoay và các lớp chồng mép. Kiểm riêng viền trắng của ảnh chủ đạo theo số mm trong bố cục. *Vì sao:* ảnh giữ chỗ chỉ cho thấy bố cục. Ảnh thử giúp kiểm mặt nạ và viền trên nội dung thay thế.
   - [TINIX] Dùng ảnh gốc và xem trước theo mặt nạ thật cùng các lớp phủ. Thử căn vị trí ở chế độ Lấp đầy trước. Khi tỷ lệ khung cắt mất người, thử Vừa ảnh và kiểm phần giấy hoặc nền lộ ra. *Vì sao:* vùng nền làm mờ chèn sẵn vào ảnh có thể lộ rõ ở mép và khó sửa sau khi ghép.
   - [TINIX] Với ảnh nhóm, ưu tiên giữ phần chính của mọi khuôn mặt nhìn thấy. Gợi ý điểm căn phải tính cả alpha của giấy, sticker và nhãn phía trên ảnh. Soi lại tóc và chi tiết sát mép trên render. *Vì sao:* một mặt có thể nằm trong lòng khung mà vẫn bị chi tiết phía trên che.
   - [TINIX] Khi ảnh vẫn bị che, xem vùng tô đỏ và thử kéo theo mũi tên. Nếu lớp phủ mới là nguyên nhân, bấm vùng đỏ để chọn đúng sticker hoặc nhãn, dịch lớp đó rồi kiểm lại khung. *Vì sao:* kéo ảnh trong lòng khung hẹp có thể chỉ chuyển phần bị che từ mặt này sang mặt khác. Chọn theo alpha tránh chọn nhầm phần trong suốt của một mảnh phía trên.
   - [TINIX] Khi chỉ còn mép giấy của chính khung che mặt, ưu tiên mức thu nhỏ nhất đã kiểm sạch vùng che và giữ đủ mặt. Giữ nguyên khung sạch, sticker và nhãn. *Vì sao:* thu vừa đủ tạo khoảng thở mà hạn chế phần giấy lộ ra.
2.1. **Đa dạng dáng khung** trong cùng một trang: elip, đám mây, bông hoa, trái tim (`SHAPES`). Không dùng toàn chữ nhật. Dáng mới: thêm hàm bán kính theo góc vào `shapePath`.
2.9. **Dáng khung mở rộng:** ngoài ellipse/cloud/flower/heart còn `arch` (vòm cổng, đứng), `squircle` (vuông bo), `stamp` (tem răng cưa). Mẫu mới phải đổi cả **cấu trúc bố cục** (cột vòm, dải ngang, tâm lệch...) và bộ dáng khung, không chỉ đổi màu/chữ của mẫu trước. *Vì sao:* mẫu Tết đầu tiên bị chê chỉ là Little One đổi màu (2026-11-17).
2.2. **Máy cắt nên đường cong thoải mái;** không còn ràng buộc "đường thẳng dễ cắt tay".
2.3. **Khung giấy trắng dày (~16 px) có bóng đổ,** viền cắt màu **trắng**, không đen. Ảnh tách nền cũng có viền trắng ôm dáng + bóng.
2.4. **Khung to:** ảnh phụ tối thiểu ~560×620 px; ảnh cả nhà dạng ngang ~1300×620. Đừng thu nhỏ để "cho thoáng".
2.5. **Giữ phần nhìn thấy của khung trong mép thành phẩm.** Sau khi đổi kích thước một mảnh sát mép, dùng cảnh báo trên canvas để phát hiện tràn sớm và kiểm lại toàn trang trong bộ xuất. Khi có cảnh báo, kiểm alpha/mask và góc xoay thực tế, đối chiếu chi tiết chủ ý chạm mép với ảnh mẫu trước khi dịch hoặc cắt lớp. *Vì sao:* hộp lớp có thể chứa vùng đệm trong suốt ngoài trang dù toàn bộ hình in nằm trong trang.
   - [TINIX] Với nhãn giấy cần giữ nguyên lòng chữ và họa tiết in, chọn **Chỉ cắt viền ngoài** cho cụm rồi xem lại SVG. *Vì sao:* các khe nhỏ trong hình in có thể tạo đường cắt trong lòng nhãn.
   - [TINIX] Khi bàn giao ZIP, có thể khai báo `cutOuterOnly: true` trên từng mảnh đã xác định chỉ cần viền cắt ngoài. Kiểm lại đường cắt sau khi nhập. *Vì sao:* lựa chọn đi cùng mảnh qua các lượt nhập.
   - [TINIX] Sau khi thay ảnh thử, kiểm khung ảnh và ảnh chủ đạo vẫn có đường cắt riêng ở khổ in. *Vì sao:* bản giữ chỗ chưa kiểm được biên ảnh sau tách nền hoặc lỗi gộp cụm khi thay ảnh liên tiếp.
   - Trong bảng kiểm cả bộ, xác nhận riêng lớp chủ ý chạm hoặc vượt mép sau khi xem bản render. *Vì sao:* phép đo xác định vị trí hình in, còn mục đích đặt sát mép cần đối chiếu bố cục.
2.8. **Khung và ảnh tách nền có thể nghiêng nhẹ** (`rot` của `slot`/`hero`, ±2–4°, xen kẽ hướng) cho cảm giác dán tay; nhóm xoay cả khung lẫn ảnh. Khung nghiêng dễ vượt mép: chừa ≥ 40 px so với mép trang.
2.6. Có thể thêm giấy màu hình hoa/tim đặt dưới ảnh tách nền (`paperShape`) để tạo nền nổi cho hình chủ đạo.
2.7. **Giữ đầu người trong khung:** luôn chỉnh vị trí ảnh (`cropY`/vùng cắt) sao cho phần đầu người không bị khung cắt và không bị thành phần nào (chữ, sticker, nhãn, băng dính, ảnh khác) che. Nếu không gian khung không cho phép, chấp nhận mất phần chân. *Vì sao:* người dùng yêu cầu rõ; đầu là phần quan trọng nhất của ảnh gia đình.
   - [TINIX] Với SUBJECT tách nền, đối chiếu tư thế với ảnh gốc. Nếu người ngồi hoặc tựa vào ghế hay đạo cụ, giữ các phần nhìn thấy giúp giải thích tư thế trong cùng mặt nạ. Kiểm lại mép, viền trắng và khoảng trống với khung liền kề sau khi đặt mảnh lên trang. *Vì sao:* bỏ vật đỡ có thể làm người trông như đang lơ lửng.
   - [TINIX] Dùng **Vùng an toàn trên ảnh gốc** để kiểm chữ, nhãn và chi tiết cần giữ gần mép. Khoanh sát phần cần giữ để bảng báo riêng tỷ lệ nằm ngoài mặt nạ và tỷ lệ bị thành phần phía trên che trong vùng khoanh. *Vì sao:* đạt tiêu chí giữ mặt vẫn có thể cắt mất nội dung khác trong ảnh.
   - [TINIX] Khi gợi ý căn theo vùng khoanh, ưu tiên giữ mọi mặt đã phát hiện rồi giảm phần chi tiết bị cắt hoặc che. Xem lại tỷ lệ nền lộ và bản render trước khi duyệt. *Vì sao:* đưa chữ vào khung có thể phải thu ảnh hoặc đổi điểm căn.

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
   - [TINIX] Khi kết xuất chữ từ brief tự do, kiểm bộ ký tự thực tế và chọn font khác nếu thiếu dấu. *Vì sao:* cùng tên họ font trên hai hệ điều hành vẫn có thể thiếu ký tự khác nhau.
4.6. **Chữ không tràn khung:** đặt `h` (cao khung) đủ cho Pacifico/nhiều dòng; chữ xuống dòng cần `h` lớn hơn `size*1.6`.
4.7. Mảnh `raised` mới có thể chồng lên nhau trên trang thành phẩm; bộ xếp tờ cắt xử lý từng mảnh riêng.

4.8. **Chữ cỡ lớn kiểu lettering** (`dieText` với `edge`): viền trắng dày + viền mực mảnh ngoài cùng, nghiêng −6…−9°, cỡ chữ ≥ 120 px. Không đặt lên đầu người (xem 2.7). *Vì sao:* ảnh mẫu scrapbook dùng chữ khổng lồ làm tiêu điểm thứ hai.
4.9. **Nhiều nhãn/ruy băng, mỗi trang 5–8 cái, kiểu khác nhau** (`label`: ribbon, tag, torn, stitch), nghiêng ±2–4° xen kẽ hướng, màu lấy từ bảng màu trang. Nhãn gồm nền + chữ gộp một nhóm = một mảnh cắt.
4.10. **Sticker chủ đề lớn** (`themeSticker`: cake, camera, arrow) cỡ 200–300 px, đặt chồng mép ảnh để lấp chỗ trống; chọn theo chủ đề trang (sinh nhật → bánh, du lịch → máy ảnh). Hình vẽ không nhận ra ngay (máy bay) thì bỏ, không dùng.
4.11. **Chữ ghép giấy màu** (từng chữ cái một ô màu, lệch ±4°) cho từ khóa lớn (ONE, FAMILY). Ô phải đủ cao: `h` ≥ cỡ chữ × 1.4, nếu không bị lỗi `TEXT_OVERFLOW`.
4.12. **Hình phẳng lưu thành SVG đổi màu được** (sao, tim, giấy màu, nền nhãn, sticker chủ đề, mảnh trang trí không chạm mép trang): `createCollageKit` mặc định `vector: true` → lớp `w-svg`, màu tô thành chỗ đặt màu `{{colors[i]}}` (màu giấy trắng `#fffdf8`/`#fffaf0`/`#ffffff` và màu trong bộ lọc giữ cố định). Vẫn để PNG: ảnh tách nền, băng dính kẻ sọc, nền họa tiết/nền trang, mảnh bị cắt theo mép trang. Lý do: người dùng muốn đổi màu sticker ngay trong editor; PNG chỉ đổi được bằng "Đổi màu chính" (gần đúng).
4.13. **Mọi thành phần cắt dán đều có viền trắng** ôm hình, kể cả nhãn và băng dính không có viền trong ảnh mẫu; nền in và ảnh bên trong khung dùng chung viền của mảnh tương ứng. *Vì sao:* thống nhất mép mảnh cắt và tạo khoảng trắng cho đường cắt theo yêu cầu người dùng.
4.14. **Làm sạch và làm mượt đường bao trước khi tạo viền trắng**, dùng đường cong liên tục cho mép cong, kiểm mép ở kích thước thật; không lấy nguyên răng cưa hoặc vệt thừa từ alpha ảnh mẫu làm đường viền. *Vì sao:* viền nở theo alpha gốc hoặc nối bằng đoạn thẳng thưa sẽ phóng đại vệt bẩn hoặc tạo gấp khúc thô.
   - Với sticker trích đã có viền trắng, tính phần viền có sẵn vào bề dày ở khổ in và làm sạch đường ranh trước khi thêm viền. *Vì sao:* viền mới có thể làm dày gấp đôi và để lộ vệt màu giữa hai mép.
4.15. **Khi chỉnh đường bao nhãn, kiểm và giữ đầy đủ nét trang trí bên trong**, đặc biệt nét đứt quanh phần lõm. *Vì sao:* mặt nạ mới có thể cắt mất một đoạn nét trang trí của ảnh gốc.
4.16. **Đặt các nét nhấn xòe ra từ vật thể và kiểm màu viền chữ theo ảnh mẫu**, đồng thời giữ viền cắt trắng. *Vì sao:* nét nhấn quay ngược hoặc viền màu thêm ngoài ý muốn làm thay đổi cảm giác của mẫu.
4.17. **Với chữ tiêu đề vẽ riêng, đối chiếu dáng từng nét và dấu trước khi chọn font; giữ các nét nhấn và góc nghiêng của nhãn theo ảnh mẫu.** *Vì sao:* font thay thế sai dáng hoặc nhãn nằm ngang làm mất đặc trưng bố cục.
4.18. **Khi dựng lại nhãn, kiểm cả các biểu tượng và nét nhấn chồng quanh nhãn trong ảnh mẫu.** *Vì sao:* các chi tiết tách thành lớp riêng dễ bị bỏ sót khi dựng giấy và chữ.
4.19. **Soát trang trí nằm trên mép và chỗ giao giữa các khung ảnh, kể cả tim và băng keo.** *Vì sao:* các chi tiết chồng khung dễ bị bỏ sót khi thay ảnh bằng placeholder.
4.20. **Kiểm thứ tự chồng lớp và góc nghiêng của cụm chữ theo ảnh mẫu.** *Vì sao:* sai thứ tự có thể che nét chữ và làm khác cách xếp chữ dán.
4.21. **Khi chuyển chữ từ ảnh mẫu sang SVG, lấy mép nét theo mức phủ mực giữa các pixel, làm mượt bằng Bézier và soi ở 100% để kiểm độ dày, dấu và lòng chữ.** *Vì sao:* ngưỡng màu cứng và đường bao theo lưới pixel dễ làm nét mỏng, gợn hoặc mất chi tiết.
4.22. **Giữ họa tiết gốc của mảnh in khi tách sạch được, dựng bù vùng bị che và tạo lại đường viền trắng; dùng SVG cho hình phẳng hoặc khi bản tách mất chi tiết quan trọng.** *Vì sao:* giữ được vân và màu gốc ở mảnh có chất liệu, còn đường bao dựng lại giúp xử lý viền dính từ các lớp bên cạnh.
4.23. **Kiểm kích thước mảnh trang trí theo khổ in thực. Với cành hoa nhỏ, tăng cỡ bông và nụ khi cần, nối chúng bằng một đường bao giấy trắng liền mảnh; giữ nhụy, lá nhỏ và gân cành dưới dạng nét in bên trong.** *Vì sao:* các chi tiết nhỏ hoặc mảnh rời dễ rách, khó gỡ và khó đặt khi cắt dán.
4.24. **Dựng cụm tia nhấn nhỏ thành một mảnh SVG liền, có các nét ngắn đầu bo xòe từ chung một chân cong. Giữ số nét từng cụm theo ảnh gốc và bám độ cong, độ dài, sự bất đối xứng của từng tia.** *Vì sao:* dáng gọn cho một đường cắt dễ gỡ và dễ đặt, đồng thời giữ hình và nhịp nhấn của ảnh mẫu.

## 5. Quy trình kiểm tra (bắt buộc trước khi báo "xong")
5.1. `drafts validate` rồi `drafts render`, **xem ảnh**: khoảng trống, chữ bị che, dấu tiếng Việt, mép khung.
5.2. Lưu thành thiết kế (`designs create`), rồi `collage export --id <mã> --margin 8 --gap 4`: không được có cảnh báo; xem tờ cắt để chắc mỗi khung là một mảnh.
5.3. Nếu làm cho laser: lấy SVG `/api/tinix/collage-print/<job>/cut/<n>` và chồng lên tờ cắt kiểm tra đường cắt khớp hình.
5.4. Ba cổng frontend (`lint`, `vue-tsc`, `vite build`) và `tinix:test` khi sửa mã app (xem `CLAUDE.md`).
5.5. Chưa cắt thử trên máy thật thì phải nói rõ là chưa kiểm chứng.
   - Trước khi xuất, kiểm đường cắt ở tỉ lệ 1:1 theo mm và xem lại cụm tách rời, lỗ nhỏ, chỗ nối hẹp theo ngưỡng vật liệu. *Vì sao:* mép nhìn sạch ở màn hình vẫn có thể tạo mảnh quá nhỏ hoặc chỗ nối dễ rách khi gỡ giấy.
   - Khi thiếu đường cắt, kiểm hộp xếp của cụm có ôm hết đường bao giấy. Với chữ nhiều nét hoặc khe quá nhỏ, nối và lấp trên đế giấy rồi kiểm lại SVG 1:1. *Vì sao:* nét in giữ nguyên, còn đường bao có thể cắt và gỡ thành một mảnh.
   - Kiểm lại cụm vừa sửa trên hình in và đường cắt trước khi áp dụng bản vá, rồi kiểm đủ các tờ khi duyệt in. *Vì sao:* có thể phát hiện sớm lỗi còn lại của bản vá mà không phải dựng cả bộ tờ cắt ở mỗi lần sửa.
5.6. **Kiểm mép theo lô trước khi render cả trang.** Kiểm tra tự động viền, bóng hoặc chi tiết chạm mép ngoài ý muốn ở các mảnh trong suốt; chỉ soi riêng ở 100% trên nền sáng và tối khi có cảnh báo chưa giải quyết, thấy mép đáng ngờ hoặc dùng PNG mới tách từ ảnh ghép. Sau đó xem bản render toàn trang một lượt. Với mẫu dựng từ ảnh tham chiếu, ưu tiên mảnh sạch, bố cục hợp lý và không lỗi hiển thị; MAE/SSIM chỉ để tham khảo. *Vì sao:* kiểm tự động bắt được lỗi sát khung, còn soi riêng giúp thấy vệt nền bám và viền đứt; tập trung vào mảnh có rủi ro giúp giảm thời gian kiểm và dựng lại.
   - [TINIX] Với bố cục Mixed Handcut, kiểm hai lòng ảnh tự do ngay trên alpha của tờ RGBA và đối chiếu bản trống cùng ô caro. Hai dáng phải khác nhau sau khi bỏ ảnh hưởng của xoay, lật và đổi cỡ. Mỗi khung chỉ có một lỗ trong suốt kín. *Vì sao:* mép xé nhẹ trên một hình chữ nhật vẫn giữ nhịp khung chữ nhật. QA nhiễm ảnh có thể đạt dù bố cục thiếu hình dạng hoặc mép có lỗ nhỏ.
     Khi sửa từng mục, gắn lỗi dấu chữ hoặc chi tiết bị thiếu với vùng ảnh mẫu trong bảng **Cần sửa**. Kiểm lại lớp hoặc cụm vừa sửa trước lượt duyệt cả trang. *Vì sao:* giữ được vị trí đối chiếu và giảm số lượt dựng lại toàn trang trong lúc sửa.
     Khi duyệt lớp phủ, kiểm các khung vàng đánh số trên ảnh mẫu. Gắn vùng với lớp tương ứng nếu chi tiết đã có, hoặc dùng vùng đó để dựng chi tiết còn thiếu. *Vì sao:* vùng chưa gắn lớp có thể đã có chi tiết tương ứng trong bố cục.
5.7. **Tự triển khai, kiểm tra và sửa lỗi trong phạm vi được giao cho đến khi đạt, không dừng để xin xác nhận các bước sửa thông thường.** *Vì sao:* giảm số lần trao đổi và bảo đảm bản bàn giao đã được kiểm tra, sửa các lỗi phát hiện.
5.8. **Đối chiếu từng lớp trên bản render có placeholder và loại vùng ảnh giữ chỗ khỏi điểm số; xem bản đồ lệch cùng ảnh thật trước khi chọn lớp cần sửa.** *Vì sao:* viền và sticker chồng lên khung vẫn cần được tính, còn bản đồ giúp thấy chi tiết bị thiếu mà điểm trên phần lớp đang hiện có thể bỏ sót.
5.9. **Khi có bộ ba ảnh nguyên liệu, dùng ảnh mẫu để căn bố cục, lấy nền và mảnh từ file riêng.** Kiểm tra alpha của tấm mảnh trước khi tách theo vùng liên thông. Loại nhiễu alpha thấp nối các mảnh với nhau, giữ chuyển tiếp mềm ở biên, rồi kiểm mép ở kích thước đặt thực tế. Khung ảnh và ảnh chủ đạo dùng lớp giữ chỗ thay riêng được. *Vì sao:* giảm thao tác tách nền và phục hồi mảnh, đồng thời tránh đưa ảnh người mẫu vào bản nháp.
   - [TINIX] Với khung PNG có lòng trong suốt khép kín, dùng **Tách mảnh từ PNG** để tự tạo mặt nạ từ lòng ảnh và cho ảnh lấn nhẹ dưới mép giấy. Kiểm số khung nhận được và soát họa tiết trang trí có khoảng rỗng lớn trước khi đưa lên canvas. Thử thay ảnh màu trong bản render để phát hiện khe hở và kiểm cụm có một đường cắt ngoài. *Vì sao:* tận dụng đúng lòng khung có sẵn và tránh khoanh lại các mép bo, răng cưa hoặc chỗ có băng dính chồng lên.
   - [TINIX] Nếu ảnh minh họa, viền, nhãn và băng dính đã ghép thành một PNG, dùng **Khoanh lòng ảnh** đi theo mép trong và vòng qua chi tiết chồng lên ảnh. Phóng to và kéo điểm hoặc đoạn mép ngắn ở chỗ còn vệt, rồi kiểm mép sau khi đưa lên canvas. Khi chuẩn bị nguyên liệu mới, ưu tiên lòng ảnh trống và mặt nạ riêng. *Vì sao:* alpha ngoài chỉ xác định đường bao của cả mảnh, còn phần ảnh thay thế có thể nhỏ hơn và nằm dưới nhãn hoặc băng dính.
   - [TINIX] Khi sinh demo bằng composition có lớp riêng, xuất kit từ cùng manifest trước khi duyệt, giữ ảnh minh họa ở lớp preview và khóa SHA-256 của ZIP được chọn. *Vì sao:* dựng lại từ ảnh đã gộp dễ giữ sót pixel người trong nền, khung hoặc sticker.
   - [TINIX] Khi nghi ảnh dính, xem bản tắt ảnh và bản bảy sentinel theo mặt nạ thật, rồi kiểm nguồn của từng lớp tĩnh. Chỉ thay lớp lỗi bằng nguồn sạch trên revision và duyệt lại. *Vì sao:* ảnh cũ nằm trong nền vẫn có thể xuất hiện khi thay ảnh dù lòng khung trong suốt và bộ ZIP hợp lệ.
     Với vệt dài, chọn hai đầu theo cùng một mép và khóa vùng băng dính chồng lên trước khi kéo. Xem lại đoạn nối ở hai đầu và biên trang trí sau khi kéo. *Vì sao:* dịch nhiều điểm trong một lượt giảm thao tác, nhưng đường nối có thể khấc nếu hai đoạn cần dịch khác hướng.
     Với vệt chạy quanh góc bo, dùng chế độ kéo vuông góc và đặt hai đầu ngoài đoạn có vệt để giữ chuyển tiếp ở mép sạch. *Vì sao:* hướng dịch thay đổi dọc góc bo và độ dịch được giảm ở hai đầu đoạn.
     Với đoạn nối còn khấc sau khi kéo, dùng **Làm mượt đoạn đã chọn**, giữ hai đầu trên phần mép sạch và khóa trang trí lân cận. Kiểm lại vệt màu ở kích thước gốc. *Vì sao:* làm mượt giảm gấp khúc cục bộ, còn vệt ảnh nằm ngoài đường khoanh cần căn lại theo mép trong.
     Với viền giấy có màu riêng, chọn đoạn ngắn và lấy mẫu màu ở phần viền sạch để gợi ý bám mép trong. Xem đường đề xuất trước khi áp dụng. *Vì sao:* vùng ảnh cùng màu với giấy hoặc họa tiết chồng lên có thể làm gợi ý bỏ sót đoạn mép.
   - [TINIX] Khi sơ đồ đánh mã khung, gán cùng mã cho mảnh PNG và kiểm tâm, kích thước, góc xoay sau khi ghép. Khi gợi ý sai vị trí hoặc kích thước, kéo khung đích ngay trên ảnh mẫu. Căn góc trên bản xem trước và chọn cạnh ưu tiên theo mép cần khớp. Kiểm phần có thể vượt ở cạnh còn lại. Bật vùng kéo vượt mép khi đặt giấy nền chủ ý tràn và xem giao tuyến với mép trang trên render. *Vì sao:* mã giúp phân biệt các khung giống nhau. Xoay làm thay đổi kích thước thấy được, còn thay tỷ lệ để khớp cả hai cạnh có thể làm biến dạng hình.
     Khi nhận bộ nguyên liệu mới, so vị trí khung giữa sơ đồ và ảnh hoàn chỉnh trước khi dùng nhãn để giới hạn vùng tìm. Với nhãn chỉ có mã, kiểm xem bộ nhận diện có đọc được. Kiểm khoảng trong suốt giữa các mảnh để phát hiện dải alpha mờ nối khung với trang trí. *Vì sao:* khác vị trí hoặc dính alpha có thể làm sai cả bước đặt khung dù PNG có đủ lòng ảnh.
     Trước khi bàn giao ZIP, chạy **Kiểm ZIP trước khi nhập** để phát hiện mảnh dính alpha, hộp `source` lệch và vùng PNG chưa khai báo trong JSON. Bấm từng cảnh báo để xem vùng được khoanh trên PNG nguồn, rồi đối chiếu với sơ đồ trước khi thêm mã. Nếu băng dính hoặc nơ đã liền với khung PNG, chọn **Trùng với khung…** để báo người tạo nguyên liệu giữ chi tiết trên khung và bỏ bản rời trùng. Dùng **Sao chép báo cáo** để bàn giao hai nhóm kèm hộp pixel gốc, rồi chạy lại cùng bảng kiểm trên gói trả về. *Vì sao:* alpha mờ có thể nối mảnh và việc thêm mã cho bản rời trùng có thể đặt họa tiết hai lần khi nhập.
     Khi dựng tự động, dùng `drafts from-material-zip` để lấy báo cáo kiểm và bản nháp có ảnh giữ chỗ. Xem ảnh render trước khi duyệt. *Vì sao:* gói sạch về alpha và tọa độ nguồn vẫn cần kiểm vị trí, thứ tự lớp và bố cục.
     Với nhãn mã ngắn, dùng một ô nền sáng phẳng, chữ đậm tối, ba ký tự trên một hàng và chừa lề trong quanh chữ. Mỗi mã chỉ xuất hiện một lần dưới dạng nhãn trên sơ đồ. *Vì sao:* công cụ có thể đọc từ lòng sáng ngay cả khi viền tối dính vào chi tiết trên ảnh mẫu. Mã xác định vùng tìm, còn kích thước và góc vẫn cần kiểm riêng.
     Nếu xuất được `layout.json` từ cùng bố cục, ghi mã và hộp alpha của mảnh trên tấm PNG, tâm và kích thước trước xoay trên ảnh mẫu, cùng góc xoay. Kiểm các gợi ý trên canvas bằng ảnh giữ chỗ. *Vì sao:* dữ liệu lớp giữ được kích thước đầy đủ của khung bị che một phần và giảm bước gán mã, kéo, đổi cỡ.
     Khi xuất khung nghiêng, lấy tâm sau khi áp dụng phép xoay quanh gốc của lớp và giữ chiều rộng, chiều cao trước xoay. Tính hộp nguồn từ alpha sau khi xếp tấm mảnh. *Vì sao:* tâm hộp lớp chưa xoay và tọa độ của mảnh trước khi xếp có thể lệch dù mã khung đúng.
     Trước khi duyệt nhiều khung từ `layout.json`, phủ viền đề xuất lên ảnh mẫu và kiểm các đoạn mép còn nhìn thấy. Đánh dấu riêng khung nghi lệch để kiểm vị trí. *Vì sao:* mã và vùng cắt có thể đúng dù tọa độ đặt được lấy từ bố cục khác.
     Khi xuất thêm mảnh trang trí trong `layout.json`, lấy tọa độ và thứ tự chồng từ cùng bố cục nguồn. Dùng chung thứ tự cho khung, trang trí và ảnh chủ đạo ở các chỗ chồng mép. *Vì sao:* đúng vị trí vẫn có thể che mất nhãn, băng dính hoặc viền ảnh nếu sai thứ tự.
     Khai báo vùng ảnh chủ đạo bằng tâm, kích thước, góc và thứ tự lớp trong JSON. Dùng vùng đó để tạo lớp giữ chỗ tách nền thay riêng khi nhập trên trang trống. *Vì sao:* giữ đúng bố cục và cho phép thay ảnh chủ đạo độc lập với các khung phụ.
     Nếu biết khổ thành phẩm, ghi chiều rộng và chiều cao theo mm cùng DPI trong `layout.json`. Xuất ảnh mẫu cùng tỷ lệ với khổ in. *Vì sao:* canvas trống có thể nhận đúng khổ ngay khi nhập, giữ tỷ lệ các mảnh.
     Khi hai ảnh lệch bố cục, dùng mã để giữ đúng danh tính khung và dùng đường bao hiện rõ trên ảnh hoàn chỉnh để mở rộng vùng tìm. Với khung vòm bị ảnh chủ đạo che chân, kiểm lại chiều cao trước khi nhận gợi ý từ ảnh hoàn chỉnh. *Vì sao:* mép ảnh chủ đạo có thể tạo cạnh đáy giả dù điểm khớp cục bộ cao.
     Khi thử bám cả mép giấy và lòng ảnh của vòm bị che, dùng các đoạn vòm và cạnh bên còn thấy để căn. Kiểm chiều cao theo sơ đồ và căn tay nếu tâm hoặc kích thước vẫn vượt ngưỡng. *Vì sao:* hai đường mép phía trên vẫn có thể trùng theo nhiều vị trí khi chân khung bị che.
     Nếu vòm bị che đáy và gợi ý còn lệch, đặt một điểm ở giữa mép giấy dưới cùng trên sơ đồ rồi xem lại vị trí gợi ý. *Vì sao:* điểm đáy bổ sung mốc chiều cao cho những đoạn vòm còn nhìn thấy.
     Với Polaroid hoặc khung tem còn lệch kích thước, dùng **Chọn cạnh chuẩn** trên ảnh hoàn chỉnh. Kéo đủ hai đầu của cạnh lòng ảnh rõ nhất, rồi kiểm cả chiều còn lại trên bản xem trước. *Vì sao:* một cạnh nhìn rõ chốt được một chiều và hướng xoay khi những cạnh khác bị che.
     Với khung vòm, xem gợi ý bám mép lòng ảnh sau khi đã ghép mã. Kiểm tỷ lệ vòm và giữ mặt nạ đi cùng lớp giấy khi chỉnh riêng chiều rộng và chiều cao. *Vì sao:* băng dính hoặc nơ có thể trùng màu ở nhiều nơi, còn mép lòng ảnh cho biết cả dáng vòm và độ cao của khung.
     Với Polaroid, dùng mã trên sơ đồ để giới hạn vùng tìm rồi kiểm bốn cạnh lòng ảnh trên ảnh mẫu. Ưu tiên đường tiếp giáp giữa ảnh và phần giấy sáng ở phía ngoài. *Vì sao:* cạnh mạnh bên trong ảnh có thể kéo gợi ý sai, nhất là khi khung bị hoa hoặc băng dính che một phần.
     Với khung tem bị ảnh chủ đạo che một cạnh, kiểm ba cạnh còn rõ và giữ tâm gần nhãn mã. Với khung bo góc, kiểm cả đường cong ở góc lẫn tín hiệu trên bốn phía. *Vì sao:* mép của lớp che dễ bị nhận nhầm là mép khung, còn chỉ khớp các đoạn thẳng có thể làm lệch góc bo.

## Nhật ký thay đổi quy tắc
- 2026-11-25: bổ sung kiểm hình học lòng ảnh Mixed Handcut trên alpha ở mục 5.6 sau lượt P4.
- 2026-11-24: bổ sung kiểm và giữ phần vật đỡ tư thế trong mặt nạ SUBJECT sau lượt sửa Sweet Memories.
- 2026-11-23: thêm ưu tiên khuôn mặt khi gợi ý căn theo vùng khoanh.
- 2026-11-23: bổ sung khoanh chi tiết và đọc cảnh báo ngay trong bảng kiểm crop.
- 2026-11-23: bổ sung kiểm chi tiết sát mép bằng lớp phủ trên ảnh gốc sau lượt kiểm F02 của Cuối tuần bên biển.
- 2026-11-23: thêm tiêu chí thu nhẹ khi mép giấy là lớp duy nhất còn che mặt sau khi dời sticker.
- 2026-11-23: bổ sung chọn trực tiếp lớp che qua vùng đỏ để kiểm lại ảnh nhóm F02 và F04.
- 2026-11-23: bổ sung dấu vùng mặt bị che và kiểm hướng kéo trên F02 và F04 có sticker chồng mặt.
- 2026-11-23: bổ sung kiểm alpha của lớp phủ khi căn ảnh nhóm sát mép sau lượt thử F02 và F04.
- 2026-11-23: thêm kiểm ảnh nhóm sau khi thử gợi ý điểm căn trên F02 và F04 của Cuối tuần bên biển.
 - 2026-11-23: bổ sung kiểm Lấp đầy/Vừa ảnh theo mặt nạ thật sau ca F02 và F04 của Cuối tuần bên biển.

- 2026-11-22: bổ sung cách đối chiếu hộp `source` và mảnh ghép sẵn vào 5.9 sau lượt thử Sweet Memories.

- 2026-11-22: bổ sung kiểm cụm cắt riêng sau khi thay ảnh thử vào 2.5.

- 2026-11-22: bổ sung bước kiểm ZIP trước khi nhập và khoanh vùng PNG theo từng cảnh báo vào quy trình bàn giao bộ nguyên liệu.
- 2026-11-22: bổ sung cách sao chép mã cảnh báo và tọa độ gốc để bàn giao sửa nguyên liệu.
- 2026-11-22: bổ sung việc đối chiếu bản rời trùng khung trước khi thêm mã và kiểm lại ZIP sau khi sửa.
- 2026-11-22: bổ sung đánh dấu bản rời trùng theo mã khung trong báo cáo bàn giao.
- 2026-11-22: bổ sung gợi ý theo hình và họa tiết, giữ xác nhận tay trước khi đánh dấu bản rời trùng.
- 2026-11-22: bổ sung luồng nhận ZIP qua CLI, chỉ render bản nháp khi từng mảnh đã ghép được với dữ liệu bố cục.
- 2026-11-23: bổ sung lượt kiểm thay ảnh trên bản sao cho khung giấy xé và viền ảnh chủ đạo.
- 2026-11-22: bổ sung tùy chọn cắt viền ngoài theo từng mảnh trong `layout.json` vào 2.5.

- 2026-11-22: bổ sung cách cắt viền ngoài cho nhãn giấy vào 2.5.

- 2026-11-22: bổ sung khổ in và DPI cho gói nguyên liệu vào 5.9.

- 2026-11-22: bổ sung quy tắc khai báo vùng ảnh chủ đạo thay riêng trong gói nguyên liệu vào 5.9.

- 2026-11-22: bổ sung tọa độ và thứ tự chung cho trang trí trong `layout.json` vào 5.9.

- 2026-11-21: bổ sung kiểm viền trên ảnh mẫu trước khi duyệt nhiều khung vào 5.9.

- 2026-11-21: bổ sung cách lấy tâm khung nghiêng và hộp alpha khi xuất `layout.json` sau lượt thử sáu khung Wedding Memories.

- 2026-11-21: bổ sung quy ước xuất tọa độ khung từ cùng bố cục vào 5.9 sau lượt thử F02 Wedding Memories.

- 2026-11-21: bổ sung cách làm nhãn mã ngắn nền sáng vào 5.9 sau lượt thử Wedding Memories.

- 2026-11-21: thêm chọn cạnh chuẩn cho Polaroid và khung tem vào 5.9.

- 2026-11-21: thêm điểm đáy vòm làm mốc căn khung bị che vào 5.9.

- 2026-11-21: bổ sung kiểm hai đường mép của khung vòm bị che trong 5.9 sau lượt thử F02 trên New2.

- 2026-11-21: bổ sung đối chiếu mép lòng ảnh giữa sơ đồ và ảnh hoàn chỉnh trong 5.9 sau lượt kiểm New2.

- 2026-11-21: bổ sung kiểm lệch giữa sơ đồ và ảnh hoàn chỉnh, nhãn chỉ có mã và dải alpha nối mảnh trong 5.9 sau lượt thử Wedding Memories New2.

- 2026-11-21: thêm cách kiểm khung tem bị che và khung bo góc vào 5.9 sau lượt thử F05 và F06 của Wedding Memories.

- 2026-11-21: thêm cách bám bốn cạnh lòng Polaroid vào 5.9 sau lượt thử F01 và F04 của Wedding Memories.

- 2026-11-21: thêm cách kiểm gợi ý bám mép lòng vòm trong 5.9 sau lượt thử khung F02 của Wedding Memories.

- 2026-11-21: bổ sung ghép theo mã khung và kiểm lại hình học trong 5.9 sau lượt thử Wedding Memories.

- 2026-11-21: hướng dẫn kiểm kết quả tự nhận lòng khung của Tách mảnh từ PNG trong 5.9.

- 2026-11-21: bổ sung cách lấy lòng khung khép kín từ alpha vào 5.9 sau bản thử Wedding Memories.

- 2026-11-21: bổ sung gợi ý bám mép trong theo màu viền giấy vào 5.9.

- 2026-11-21: bổ sung làm mượt đoạn giữ hai đầu và vùng khóa trong 5.9.

- 2026-11-21: bổ sung cách kéo vuông góc để sửa vệt quanh góc bo trong 5.9.
- 2026-11-21: bổ sung chọn hai đầu đoạn và khóa trang trí trong 5.9 sau bản thử Team Memories.
- 2026-11-21: bổ sung kéo đoạn mép ngắn vào 5.9 để sửa vệt chạy dọc theo viền.
- 2026-11-21: bổ sung phóng to và kéo điểm ở đoạn còn vệt vào 5.9.
- 2026-11-21: cập nhật 5.9 với công cụ Khoanh lòng ảnh để giữ nhãn, băng dính và viền của khung ghép.
- 2026-11-21: bổ sung cách xem trước góc xoay và chọn cạnh cần khớp trong khung đích vào 5.9.
- 2026-11-21: cập nhật 5.9 để dùng vùng kéo ngoài ảnh khi căn giấy nền chủ ý tràn mép.
- 2026-11-21: thêm cách đặt khung đích và kiểm riêng mảnh khác tỷ lệ hoặc tràn mép vào 5.9.
- 2026-11-21: bổ sung cách giữ viền và trang trí khi thay ảnh minh họa đã ghép trong 5.9 sau bản thử “Ngôi nhà đầu tiên”.

- 2026-11-20: bổ sung xác nhận chủ ý đặt sát mép trong bảng kiểm cả bộ vào 2.5.

- 2026-11-20: bổ sung cách xử lý viền trắng có sẵn khi tách sticker vào 4.14 sau thử nghiệm hoa đào.

- 2026-11-20: thêm vào 5.5 bước kiểm riêng cụm sau bản vá để giảm số lần dựng lại cả bộ tờ.

- 2026-11-20: làm rõ cách xác minh cảnh báo vượt mép trong 2.5 sau khi kiểm bản sao #68.
- 2026-11-20: thêm kiểm sớm mép trên canvas sau khi đổi kích thước mảnh vào 2.5.
- 2026-11-20: bổ sung cách gắn lỗi đối chiếu và kiểm lại từng mục trên canvas vào 5.6.
- 2026-11-20: bổ sung kiểm vùng chưa gắn lớp trên ảnh mẫu vào 5.6.
- 2026-11-20: thêm quy trình dùng bộ ba ảnh nguyên liệu và xử lý nhiễu alpha vào 5.9 sau bản thử “Những nơi mình đã qua”.

- 2026-11-20: bổ sung cách xử lý cụm thiếu đường cắt, chữ tách mảnh và khe cắt nhỏ vào 5.5 từ bản sao #68.

- 2026-11-20: bổ sung kiểm khả năng cắt ở khổ in thật vào 5.5.
- 2026-11-20: bổ sung vào 4.24 yêu cầu giữ số nét riêng của từng cụm khi áp dụng lại dáng tia.
- 2026-11-20: sửa 4.24 sau khi đế nối của các tia nhấn chưa khớp dáng tia ngắn, đầu bo và chân cong của hình mẫu.
- 2026-11-20: thêm 4.24 theo phản hồi nên nối các tia nhấn ở chân để mỗi cụm cắt thành một mảnh.
- 2026-11-20: thêm 4.23 sau khi cành mai cạnh nhãn “Yêu thương” quá nhỏ để cắt dán.
- 2026-11-20: thêm 4.22 và 5.8 từ quy trình đã kiểm trên mẫu #68, sau khi giữ lại họa tiết mảnh trích và dùng đối chiếu theo lớp để sửa viền, chữ và nét nhấn.
- 2026-11-20: thêm 4.21 sau khi sửa nét mỏng và gợn trên năm nhãn chữ SVG của mẫu Tết bên nhau.
- 2026-11-19: thêm 4.20 sau khi chỉnh chữ Tết nằm trên nhãn bên nhau và tăng góc nghiêng của nhãn.
- 2026-11-19: thêm 4.19 sau khi thiếu tim ở khung mây và băng keo ở khung ảnh bên dưới.
- 2026-11-19: thêm 4.18 sau khi nhãn Lì xì thiếu trái tim và các nét nhấn.
- 2026-11-19: thêm 4.17 sau nhận xét chữ Tết khác dáng, thiếu nét nhấn và ba nhãn chưa nghiêng như ảnh mẫu.
- 2026-11-19: thêm 4.16 sau nhận xét về hướng ba nét nhấn cạnh lì xì và viền đỏ không có trong chữ Tết mẫu.
- 2026-11-19: thêm 5.7 theo yêu cầu tự triển khai, kiểm tra và sửa lỗi đến khi đạt, không dừng xác nhận các bước thông thường.
- 2026-11-19: thêm 4.15 sau khi nét đứt cam bên trái nhãn chúc năm mới bị mất trong v18.
- 2026-11-19: sửa 4.14 sau nhận xét viền nhãn chúc Tết v16 bị gấp khúc vì đơn giản hóa đường bao thành đoạn thẳng.
- 2026-11-19: thêm 4.14 sau nhận xét viền trắng mẫu Tết v15 bị răng cưa vì bám mép alpha ảnh trích.
- 2026-11-19: thêm 4.13 theo yêu cầu luôn có viền trắng cho mọi thành phần cắt dán, kể cả nhãn chúc năm mới và băng dính.
- 2026-11-19: sửa 5.6 sau khi người dùng duyệt mẫu Tết v10. Chuyển sang soi mép theo rủi ro và ưu tiên chất lượng mảnh hơn độ khớp pixel với ảnh mẫu.
- 2026-11-19: thêm 5.6 sau khi kiểm theo lô mẫu Tết v9 phát hiện bốn cụm nét SVG sát mép, còn các lỗi ở chữ Tết, lì xì, bánh chưng và dưa hấu nằm trong tài nguyên PNG trích từ ảnh ghép.
- 2026-11-19: thêm 4.12 (hình phẳng → lớp SVG đổi màu được, `scripts/lib/svg-layer.mjs`) theo yêu cầu người dùng: tách phần tử không thấy nhóm SVG vì bộ dựng chuyển hết sang PNG.
- 2026-11-17: thêm 2.7 (giữ đầu người trong khung, chấp nhận mất chân khi thiếu chỗ) theo yêu cầu người dùng.
- 2026-11-17: tạo từ phiên dựng trang báo chí (khung đa dạng, bố cục chồng lấn, ảnh tách nền cỡ lớn, chữ die-cut, gộp khung với ảnh một mảnh, chữ in nền `base`).
- 2026-11-17: thêm quy tắc từ 6 ảnh scrapbook tham khảo (1.7, 2.8, 3.6, 4.8–4.11): khung/ảnh nghiêng, nền họa tiết, nhãn nhiều kiểu, sticker chủ đề, chữ lớn die-cut viền mực; mẫu thử `scripts/tinix-build-little-one.mjs`.
- 2026-11-17: thêm 2.9 (dáng khung arch/squircle/stamp; mẫu mới phải khác cả bố cục). Mẫu Tết dựng lại hoàn toàn: nền đỏ ô vàng, hai vòm cổng, ba ảnh tách nền hai bên.
- 2026-11-19: thêm quy trình "dựng theo ảnh mẫu bằng spec + ảnh chồng" (TINIX.md): đo spec trước, kiểm bằng `reference check-layout`/`overlay`, không chỉnh bằng mắt; mẫu Tết 64 dựng lại theo spec.
- 2026-11-19: sticker SVG của mẫu Tết có bộ lọc chung `STICK` (loang màu, vân giấy, sợi giấy, viền tối trong, viền trắng dày 8): giống giấy dán hơn nét vẽ phẳng. Vệt sợi dọc lộ ở vật thể đỏ trơn (đèn lồng, hộp quà): nếu chê thì giảm alpha ở `fibre`.
- 2026-11-19: sticker SVG bị cắt ngang mép (tim cụt mũi) do đệm PNG cố định 14 px < tầm với bộ lọc STICK (~24 đơn vị) và công thức tim lệch tâm. Đệm nay tính theo `FILTER_REACH`, vùng lọc STICK rộng 260%, `decoBox` cảnh báo nếu mép PNG còn điểm ảnh không trong suốt (bỏ qua cạnh nằm ngoài trang).
- 2026-11-18: SỬA CHẨN ĐOÁN dòng trước: viền trắng sticker bị cụt phẳng ở mũi nhọn (tim, lá) vì `feMorphology dilate` dùng hạt nhân HÌNH VUÔNG, không phải do đệm PNG. Nay viền làm bằng nhòe alpha + ngưỡng (tròn đều). Đệm PNG và kiểm tra mép vẫn giữ. Quy tắc: không dùng feMorphology dilate để tạo viền sticker có góc nhọn.
- [TINIX] 2026-11-25: bổ sung chọn font theo ký tự và xuất demo cùng kit khóa hash sau thử nghiệm scrapbook P1. Font Georgia trên máy thử thiếu hai chữ có dấu trong tiêu đề sinh nhật.
- [TINIX] 2026-11-25: bổ sung kiểm sentinel và thay nguồn trên revision ở 5.9 sau khi phát hiện ảnh minh họa thử vẫn hiện trong nền dù kit giữ đủ sáu lòng trong.
