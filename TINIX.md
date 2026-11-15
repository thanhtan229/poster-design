# TinixPoster — hiệu ứng ảnh và nền liên kết

## Sử dụng

Chọn một ảnh trên canvas, mở panel bên phải, mục **Hiệu ứng ảnh**.

- Chọn kiểu Gốc, Trắng đen, Nền mờ hoặc Nền trắng đen mờ; sau đó chỉnh riêng độ mờ, sáng, tương phản, bão hòa.
- Điều chỉnh độ dày/màu viền, bóng, hạt ảnh và vân giấy. Độ trong suốt vẫn nằm trong phần thiết lập ảnh.
- **Đặt lại hiệu ứng** giữ nguyên ảnh, vị trí và cách cắt.
- **Áp dụng cho tất cả ảnh trên trang** sao chép hiệu ứng sang mọi lớp ảnh đang hiển thị, bao gồm nền liên kết.
- **Tạo nền từ ảnh** thêm một lớp phủ kín trang ở dưới cùng, mặc định làm mờ. Khung chính được đánh dấu là khung nhận ảnh; nền không được tính là khung bổ sung.
- Với ảnh nền đã có (ví dụ nhập PSD), chọn lớp đó rồi chọn **Dùng ảnh từ khung** để gắn với khung chính, không cần tạo thêm nền.
- Kéo trực tiếp vùng nền đang lộ ra để căn ảnh bên trong khung nền; giữ Shift khi kéo để di chuyển cả khung. Chỉ chiều có phần ảnh dư mới kéo được; muốn dịch chuyển thêm, vào Cắt ảnh và tăng zoom.
- Chọn nền trong danh sách lớp để chỉnh hiệu ứng/cách căn riêng, chọn khung chính khác hoặc **Tách liên kết ảnh**. Khi tách, nền giữ ảnh hiện tại.

Một mẫu như Be Yourself dùng một khung chính và một nền liên kết: người dùng chỉ cần một ảnh. Thay ảnh chính cập nhật nền tự động; xóa ảnh chính sẽ xóa nền đi kèm. Nhân đôi khung chính sẽ nhân đôi nền và gắn nền mới với khung mới.

## Dữ liệu và xuất ảnh

`effects` lưu trên từng lớp ảnh; các mẫu cũ dùng mặc định không có hiệu ứng. `linkedPhotoId` trỏ đến UUID của khung chính trong cùng trang. Khi áp dụng mẫu hoặc nhân đôi, liên kết được đổi sang UUID mới. Nền có liên kết không tham gia đếm khung, ghép ảnh tự động hoặc số lần sử dụng trong dải ảnh.

Ảnh gốc không bị chỉnh sửa. Editor và trang vẽ xuất PNG dùng cùng bộ lọc/viền/vân; mức mờ và viền tính theo pixel của trang nên không phụ thuộc zoom. Khi xuất PNG, cả khung và nền lấy ảnh gốc chất lượng đầy đủ. Các hiệu ứng không được bảo đảm là lớp chỉnh sửa Photoshop khi xuất PSD.

## Kiểm thử

`npm run tinix:test` bao gồm kiểm thử giá trị mặc định, đếm khung liên kết, thay nguồn, xuất nguồn gốc, đổi UUID và liên kết không hợp lệ. `npm run v-build-hard` kiểm tra TypeScript và build frontend.

## Căn ảnh và vai trò trong mẫu

Chọn ảnh: **Căn ảnh** để kéo nội dung trong khung; **Di chuyển khung** để di chuyển cả khung mà không cần giữ Shift. Thanh **Phóng ảnh** tăng khoảng căn chỉnh. **Căn giữa ảnh** giữ mức phóng hiện tại, **Vừa khung** đặt phóng 1× và căn giữa.

Trong chế độ **Sửa mẫu**, chọn vai trò **Ảnh chính**, **Nền liên kết**, hoặc **Ảnh trang trí**. Chọn Nền liên kết rồi chọn một khung chính để hoàn tất. App không cho đổi vai trò ảnh chính khi còn nền phụ thuộc; hãy đổi nguồn nền hoặc tách liên kết trước. Thanh trạng thái ở trên canvas hiển thị số khung nhận ảnh, nền liên kết và cảnh báo mẫu chưa có khung hoặc nguồn nền bị thiếu/ẩn.

Các mẫu minh họa dùng ảnh thư viện hiện có: Be Yourself (trắng đen/mờ), New (vân giấy, ảnh chồng lớp, băng dính), Unveiling (tông ấm, hạt và nền mờ). Tông ấm có thanh riêng trong Hiệu ứng ảnh.

## Chọn nhiều lớp và menu chuột phải

- Ctrl+kéo vùng chọn thay thế; Ctrl+Shift+kéo thêm vùng; Ctrl+bấm thêm/bớt một lớp. Lớp ẩn/khóa không tham gia.
- Chuột phải trên vùng chọn giữ nguyên các lớp đang chọn. Menu có sao chép/dán/nhân đôi, nhóm/bỏ nhóm, sắp lớp, căn chỉnh, phân bố đều, khóa/ẩn và xóa. Phân bố đều cần ít nhất 3 lớp.
- Menu danh sách lớp có hiện/mở khóa tất cả, chọn tất cả/đảo lựa chọn và xóa tất cả trong trang hiện tại. Xóa tất cả có hoàn tác/làm lại và không tác động trang khác.
- `npm run tinix:test-ui` kiểm tra tương tác bằng trình duyệt tự động trên app đang chạy, không dùng chuột hệ thống. Có thể đặt `TINIX_APP_URL` để đổi địa chỉ. Các fixture chỉ nằm trong bộ nhớ trình duyệt, không lưu vào dữ liệu người dùng.

## Hồ sơ kỹ thuật font trước khi AI chọn font

Vào **Quản lý font → Chuẩn hóa font**, hoặc chạy `npm run tinix:normalize-fonts` khi server đang mở. Cần Python có `fontTools` và hỗ trợ Brotli để đọc WOFF2. Tiến trình sao lưu SQLite trước khi cập nhật và ghi báo cáo trong `.runtime/font-normalize/`.

Hồ sơ `fonts.technical` phiên bản 1 được trích từ tệp: family/subfamily, weight, width, italic, các trục biến thiên, đơn vị em, cap-height/x-height khi tệp có cung cấp và các dải Unicode. Từng nguồn được tải thử qua FontFace trong trình duyệt. Bốn nguồn font bên ngoài được lưu bản xác minh cục bộ để editor và server dùng cùng tệp. Tên định danh, alias, nhóm, tag và nguồn tag không bị thay đổi; cờ tiếng Việt được tính lại khi hồ sơ xác minh thành công.

AI chỉ nhận font có hồ sơ hợp lệ và còn khớp URL, kích thước và thời gian sửa tệp. Khi thêm font hoặc thay tệp, hãy chuẩn hóa lại. Lọc ứng viên theo từng ký tự nội dung (NFC), không suy đoán ngôn ngữ chỉ từ tên font. Font thiếu metadata vẫn có thể chọn thủ công, nhưng không được AI tự chọn. Khi AI dùng font thay thế hoặc điều chỉnh về biến thể thực có sẵn, kết quả dựng ghi chú rõ; gợi ý chữ đánh dấu font thay thế.

Editor, đo chữ và trang xuất PNG dùng chung đăng ký FontFace với weight/style/stretch chính xác; font biến thiên khai báo dải weight/width. Không ưu tiên font cùng tên đã cài trên hệ điều hành. Nếu trang xuất không tải được font có URL được yêu cầu, xuất ảnh báo lỗi thay vì âm thầm chụp font dự phòng.

Kết quả chuẩn hóa tại thời điểm triển khai: 1.275 bản ghi, 1.274 xác minh đầy đủ và 1 metadata chưa đủ; sửa 5 cờ tiếng Việt thành tổng 283 font. Đây là chuẩn hóa đầu vào; chưa triển khai so sánh hình ảnh để tìm font giống mẫu. Hồ sơ kỹ thuật không xác minh độ giống mẫu hoặc độ chính xác của các tag phong cách.

## So khớp hình ảnh chữ khi dựng theo mẫu

Trong **Trợ lý AI → Dựng theo mẫu**, chọn ảnh tham chiếu và bấm **Phân tích mẫu**. Tùy chọn **Tự so khớp ảnh chữ sau phân tích** được bật mặc định. Có thể tắt để phân tích bố cục trước rồi dùng **Tìm font gần mẫu** trên từng khối, hoặc **So khớp các khối chưa khóa**.

Mỗi khối chữ dùng 2–3 lượt AI có ghi lịch sử/chi phí: phân tích ảnh vùng chữ; sau đó so sánh ảnh mẫu với bảng chữ được render bằng tệp font đã chuẩn hóa. Kho được lọc theo độ phủ ký tự của cả nội dung gốc và nội dung mới. Nhóm/tag/tên nghi ngờ chỉ ưu tiên thứ tự, không còn giới hạn 36 font. Toàn bộ font hợp lệ được render theo từng lô nhỏ, dùng biến thể thật và thử các mức độ đậm của font biến thiên. So hình dáng nét chữ trên vùng mực đã bỏ khoảng trắng (hỗ trợ chữ sáng trên nền tối), tỉ lệ và mật độ nét để giữ 10 họ gần nhất; bổ sung lựa chọn theo metadata đến tối đa 14 họ đưa vào bảng AI so sánh. Mỗi họ chỉ chiếm một vị trí, tránh biến thể của cùng font lấn hết bảng. AI chỉ được trả nhãn ứng viên hợp lệ, không được tạo tên font mới.

Kết quả hiển thị ảnh vùng chữ gốc, 3–5 lựa chọn gần nhất nếu có, ảnh render, lý do và độ tin cậy do AI đánh giá. Đây không phải xác suất thống kê hoặc cam kết đúng font gốc. App chỉ tự áp dụng khi AI đạt từ 65%, điểm nét chữ đủ phù hợp, xếp hạng có khoảng cách rõ và các lượt đánh giá thống nhất. Khi có bất đồng hoặc bằng chứng yếu, giữ font hiện tại để người dùng chọn. Mức tin cậy AI cao không bỏ qua bước này. Nếu nhà cung cấp lỗi, giữ nguyên font hiện tại và hiện lỗi ngay tại khối chữ.

**Giữ font đã chọn** khóa lựa chọn của một khối trong phiên dựng; so khớp lại sẽ bỏ qua nó. Phân tích lại cùng ảnh giữ khóa khi nội dung và vai trò khối khớp. Chọn ảnh tham chiếu mới xóa kết quả cũ. Các preview so sánh dùng chữ đọc từ ảnh mẫu; chữ mới trong thiết kế vẫn được giữ nguyên.

Khi dựng, đo lại bằng font đã chọn và giới hạn chiều rộng khối chữ theo trang để tránh cắt chữ sau đổi font. Kết quả là lớp chữ sửa được, lưu và xuất PNG qua cùng cơ chế nạp biến thể font đã chuẩn hóa.

Kiểm thử: `npm run tinix:test` kiểm tra crop, danh sách hợp lệ, độ phủ ký tự, render thực qua Chromium và payload so sánh với nhà cung cấp giả. `npm run tinix:test-font-ui` dùng app đang chạy để kiểm tra auto/chọn tay, mức tin cậy thấp, khóa qua phân tích lại, lỗi nhà cung cấp và dựng chữ trong trang; không gọi AI trả phí và không lưu fixture vào dữ liệu người dùng. Đã kiểm thử riêng bằng nhà cung cấp thật với vùng chữ Be Yourself, lưu/mở lại và xuất PNG.

## Chỉnh vùng chữ trước so khớp và đo chất lượng

Trong mỗi khối ở **Dựng theo mẫu**, mở **Chỉnh vùng chữ và nội dung mẫu**. Kéo trên ảnh để chọn lại vùng, hoặc nhập X/Y/W/H theo phần trăm. Vùng chọn được chặn trong ảnh và hỗ trợ kéo từ mọi hướng. Thay đổi vùng không thay đổi vị trí/bố cục khối chữ của thiết kế; chỉ thay dữ liệu gửi so khớp. Các kết quả so sánh cũ bị xóa để không áp dụng nhầm.

**Chữ trong ảnh mẫu** cho phép sửa chữ OCR sai, xuống dòng như mẫu; để trống nếu muốn AI tự đọc. Đây là nội dung dùng render ứng viên, tách biệt với nội dung mới trong thiết kế. **Khôi phục vùng chữ ban đầu** trả về bbox AI phân tích ban đầu và bỏ phần sửa chữ mẫu. Khi khóa font, vùng và chữ mẫu cũng khóa; phân tích lại khối cùng nội dung/vai trò giữ các điều chỉnh đã khóa.

Đánh giá định lượng có thể chạy lại:

1. `npm run tinix:font-quality-fixtures`: tạo 10 ảnh chữ sạch từ font đã biết, gồm serif/sans/script/display và tiếng Việt, lưu manifest/ảnh trong `.runtime/font-quality/`.
2. `npm run tinix:font-quality -- --live --manifest .runtime/font-quality/cases.json`: gọi AI thật, có tính chi phí; lưu kết quả, ID công việc, danh sách font, Top 1/Top 3, font gốc vào shortlist và bảng render. Dùng `--resume` để không gọi lại ca đã có kết quả.

Top 3 được tính theo ID họ font khác nhau; biến thể cùng họ không chiếm nhiều vị trí. Sai ID dù hình dáng gần vẫn tính sai. Bộ đo này dùng ảnh render sạch và biết trước font, không đại diện mọi ảnh chụp, chữ méo, chữ hiệu ứng hoặc font không có trong kho. Mức tin cậy của AI chưa được hiệu chỉnh thống kê. So sánh với ứng viên đầu shortlist chỉ là mốc metadata của thuật toán hiện tại, không phải đo đầy đủ phiên bản dựng cũ.

Kiểm thử app `npm run tinix:test-font-ui` đã bao gồm vùng chọn kéo ngược, sửa chữ mẫu tách khỏi chữ thiết kế, chặn biên, khôi phục, vô hiệu hóa kết quả cũ, khóa và dựng chữ không bị cắt.

### Kết quả đo ban đầu (2026-11-15)

Đã chạy 10 ca qua nhà cung cấp AI thật: Top 1 đúng ID font = 1/10; Top 3 theo họ font khác nhau = 1/10; font gốc vào shortlist 4/10 và bảng render 1/10. Mốc ứng viên đầu shortlist dùng metadata đạt 0/10; không được diễn giải đây là cải thiện có ý nghĩa thống kê. Một số font khác có nét gần, nhưng không tính là đúng font gốc.

Điểm yếu chính là lọc theo tag/nhóm và tỉ lệ trước khi render, thường bỏ font đúng quá sớm. Kết quả hiện tại chưa đủ để coi độ tin cậy AI cao là đã xác định đúng font. Đây là mốc trước cải tiến shortlist; kết quả chạy lại cùng manifest được ghi bên dưới.

Báo cáo, kết quả JSON, ID lượt AI và trang so sánh nằm tại `.runtime/font-quality/REPORT.md`, `results.json`, `summary.json`, `review.html`. Ảnh và dữ liệu thử không đưa vào Git; công cụ tạo fixture và chạy đo được lưu trong repository để tái lập.

### Shortlist theo hình dáng nét chữ (2026-11-15)

Đã bỏ việc loại sớm theo nhóm/tag và tỉ lệ khối thô. Thuật toán `shape-scan-v2` đo mọi font đủ ký tự trước khi thu hẹp bảng so sánh; metadata là đường bổ sung để giảm lệ thuộc phép đo ảnh. Đo ảnh cục bộ không thay quyết định cuối của AI và không đồng nghĩa đã xác nhận đúng font. Với chữ nghiêng, nền phức tạp, khoảng cách chữ hoặc vùng cắt chưa chính xác, người dùng vẫn nên chỉnh vùng và xem các lựa chọn.

Để so sánh mà không ghi đè mốc cũ, đặt `TINIX_QUALITY_OUT=.runtime/font-quality-v2` rồi chạy bộ đo với manifest cũ. Sau khi có kết quả, `node scripts/tinix-font-quality.cjs --report-only --manifest .runtime/font-quality/cases.json --baseline .runtime/font-quality` tạo lại báo cáo và bảng trước/sau, không gọi AI. `--report-only` cũng bổ sung số biến thể đã đo và vị trí font gốc trong xếp hạng hình học từ các kết quả đã lưu. Không tạo lại fixture khi muốn so sánh cùng bộ ảnh.

Đã chạy lại đúng 10 ảnh/vùng chữ cũ bằng nhà cung cấp thật: thành công 10/10, không lỗi. Top 1 tăng từ **1/10 lên 7/10**, Top 3 từ **1/10 lên 9/10**. Font gốc còn trong pool từ 4/10 lên 10/10; được đưa vào bảng AI so sánh từ 1/10 lên 10/10. Xếp hình học cục bộ đặt font gốc đầu tiên 10/10 trên bộ ảnh sạch này. AI vẫn xếp Playfair Display thứ ba, Lora thứ tư và Bebas Neue thứ hai, nên không coi shortlist tốt là quyết định cuối đã hoàn hảo. Không suy rộng kết quả 10 ca sang mọi ảnh thực tế.

Trung vị thời gian 55 giây/ca, bao gồm render kho và hai lượt AI; mở rộng độ phủ có chi phí thời gian. Báo cáo so sánh và JSON ở `.runtime/font-quality-v2/REPORT.md`, `results.json`, `summary.json`, từng `case-N-match.json`; giữ nguyên baseline `.runtime/font-quality/`.

Xác minh: 14/14 nhóm kiểm thử offline đạt, kiểm thử tương tác font/crop/khóa/lỗi nhà cung cấp đạt, frontend build và service TypeScript đạt. Kiểm thử riêng trên app dùng ảnh Montserrat đã biết, gọi so khớp thật, chọn Montserrat 700, dựng, lưu/mở lại thiết kế QA số 17 và xuất PNG thành công (`.runtime/font-shortlist-export.png`). Phân tích bố cục trong ca QA này dùng fixture một khối chữ để kiểm tra riêng so khớp font; API so khớp và xuất ảnh chạy thật. Không ghi đè thiết kế người dùng.

## Xếp hạng font kết hợp và so sánh chi tiết

Sau bảng so sánh rộng, lấy tối đa 5 ứng viên từ ba font đầu theo hình dáng và ba font đầu theo AI. Thử các mức độ đậm lân cận của font biến thiên, kiểu nghiêng nếu tệp thực sự hỗ trợ và khoảng cách chữ từ −2 đến 4 px ở cỡ đo 72 px. Chỉ giữ thay đổi làm điểm nét gần hơn. Khoảng cách chữ được quy đổi theo phần trăm cỡ chữ để dựng, lưu và xuất nhất quán.

Lượt AI thứ ba so toàn văn và các ký tự phóng lớn (chỉ lấy ký tự có trong mẫu), chú ý chân chữ, đầu nét, hình dáng và dấu tiếng Việt. Nếu chỉ có một ứng viên thì bỏ qua lượt này. **Xem so sánh chi tiết ký tự** mở bảng render; nhãn trên bảng có tên font đối chiếu. Mỗi lựa chọn hiển thị thứ hạng theo nét, AI và chi tiết; dấu “–” nghĩa là font không được lượt đó xếp hạng.

Xếp hạng cuối kết hợp thứ hạng hình dáng và hai lượt AI. Trọng số hình dáng giảm khi sai khác ảnh lớn; đây là heuristic, không phải xác suất đúng font gốc. Khi có bất đồng, AI tin cậy thấp, nét không khớp hoặc hai ứng viên quá sát, app yêu cầu duyệt và không tự thay font. Chọn tay vẫn áp dụng được; **Giữ font đã chọn** cũng giữ khoảng cách chữ khi phân tích lại.

### Bộ kiểm chứng mở rộng

`npm run tinix:font-quality-expanded` tạo riêng 12 ca khó và manifest gộp 22 ca, không ghi đè 10 ca cũ. Có 6 ca phát triển và 6 ca holdout được cố định trước triển khai. Điều kiện gồm nền tối, gradient, tiếng Việt, nhiều dòng, giãn chữ, kiểu nghiêng thật và JPEG chất lượng thấp. Đây là ảnh tổng hợp có font gốc xác định, chưa phải dữ liệu ảnh chụp thực tế; các lượt đo gửi đúng nội dung chữ mẫu đã xác nhận để kiểm tra chọn font, không đo độ chính xác OCR. Công cụ từ chối tạo lại khi manifest đã tồn tại.

Dùng `TINIX_QUALITY_OUT` để tách mốc trước/sau; `--resume` chạy lại ca lỗi và bỏ qua ca đã thành công. Bộ đo kiểm tra nội dung, font, vùng chữ và hash ảnh khi tiếp tục. `--report-only --baseline <thư mục kết quả cũ>` tạo báo cáo trên các ca thực sự trùng nhau, tách development/holdout/regression và điều kiện ảnh; không gọi AI. Báo cáo ghi thêm số ca cho tự áp dụng và số ca đúng trong nhóm đó để tránh tăng tự động hóa bằng cách che giấu bất đồng.

### Kết quả xếp hạng kết hợp (2026-11-15)

Đã chạy 22/22 ca qua nhà cung cấp AI thật, không lỗi. Giữ nguyên 10 ca cũ, bổ sung 12 ca khó cố định trước triển khai; không chỉnh trọng số theo kết quả holdout.

|Nhóm|Chọn đúng đầu tiên trước|Sau|
|---|---:|---:|
|10 ca hồi quy|7/10|10/10|
|6 ca phát triển|5/6|6/6|
|6 ca kiểm chứng|1/6|6/6|

Tổng: Top 1 và Top 3 đều 22/22; font gốc trong bảng so sánh 22/22. Có 8 ca được phép tự áp dụng, 8 ca đúng; 14 ca yêu cầu duyệt. Đây là cờ đủ điều kiện của thuật toán khi chạy API, không phải số lần người dùng bấm xác nhận. Trung vị 69 giây/ca (gồm ba lượt AI), so với mốc v2 khoảng 55 giây trên bộ 10 ca cũ; các thời gian này còn phụ thuộc độ trễ nhà cung cấp.

Kết quả là trên ảnh tổng hợp có font gốc xác định và chữ mẫu đã xác nhận; chưa chứng minh độ chính xác 100% trên ảnh chụp, chữ hiệu ứng hoặc font ngoài kho. Mức tin cậy AI và điểm kết hợp chưa phải xác suất thống kê. Các font gần giống nhưng khác ID vẫn tính sai.

Báo cáo so sánh 12 ca mới: `.runtime/font-quality-v3/REPORT.md`; dữ liệu/ID lượt gọi: `results.json`, `summary.json`, từng `case-N-match.json`; trang xem ảnh: `review.html`. Mốc 10 ca cũ được giữ tại `.runtime/font-quality-v2/`, mốc 12 ca mới tại `.runtime/font-quality-expanded-baseline/`; manifest gộp tại `.runtime/font-quality-expanded/all-cases.json`.

Đã kiểm thử giao diện: giữ font khi AI tin cậy cao nhưng bất đồng; mở bảng chi tiết và tên font đối chiếu; chọn tay/khóa; vùng cắt; lỗi nhà cung cấp; dựng không cắt chữ. 14/14 nhóm kiểm thử offline, TypeScript service và build frontend đều đạt. Kiểm thử trên app gọi so khớp thật cho Playfair Display, dựng/lưu/mở lại thiết kế QA số 18 và xuất PNG tiếng Việt. Kiểm thử Raleway dùng lại kết quả AI thật đã lưu (không gọi lại nhà cung cấp), dựng/lưu/mở lại thiết kế QA số 19 và xác nhận giữ độ giãn chữ 1.3888888889%; xuất PNG thành công. Phân tích bố cục trong hai ca QA dùng fixture một khối chữ để kiểm tra riêng luồng font.

Ảnh xuất: `.runtime/font-v3-main-export.png` và `.runtime/font-v3-tracking-export.png`. Server chính phục vụ tại `http://127.0.0.1:7001`; server QA cổng 7002 được tắt sau khi hoàn tất đo.
