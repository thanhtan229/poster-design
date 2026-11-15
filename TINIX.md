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

Mỗi khối chữ dùng hai lượt AI có ghi lịch sử/chi phí: phân tích ảnh vùng chữ; sau đó so sánh ảnh mẫu với bảng chữ được render bằng tệp font đã chuẩn hóa. Kho được lọc theo độ phủ ký tự của cả nội dung gốc và nội dung mới, rồi lấy tối đa 36 họ font theo nhóm/tag/tên nghi ngờ. Các biến thể có thật được render; đo tỉ lệ khối chữ để chọn tối đa 12 ứng viên đưa vào ảnh so sánh. AI chỉ được trả nhãn ứng viên hợp lệ, không được tạo tên font mới.

Kết quả hiển thị ảnh vùng chữ gốc, 3–5 lựa chọn gần nhất nếu có, ảnh render, lý do và độ tin cậy do AI đánh giá. Đây không phải xác suất thống kê hoặc cam kết đúng font gốc. Từ mức 65% app áp dụng ứng viên đầu; dưới mức này giữ font hiện tại để người dùng chọn. Nếu nhà cung cấp lỗi, giữ nguyên font hiện tại và hiện lỗi ngay tại khối chữ.

**Giữ font đã chọn** khóa lựa chọn của một khối trong phiên dựng; so khớp lại sẽ bỏ qua nó. Phân tích lại cùng ảnh giữ khóa khi nội dung và vai trò khối khớp. Chọn ảnh tham chiếu mới xóa kết quả cũ. Các preview so sánh dùng chữ đọc từ ảnh mẫu; chữ mới trong thiết kế vẫn được giữ nguyên.

Khi dựng, đo lại bằng font đã chọn và giới hạn chiều rộng khối chữ theo trang để tránh cắt chữ sau đổi font. Kết quả là lớp chữ sửa được, lưu và xuất PNG qua cùng cơ chế nạp biến thể font đã chuẩn hóa.

Kiểm thử: `npm run tinix:test` kiểm tra crop, danh sách hợp lệ, độ phủ ký tự, render thực qua Chromium và payload so sánh với nhà cung cấp giả. `npm run tinix:test-font-ui` dùng app đang chạy để kiểm tra auto/chọn tay, mức tin cậy thấp, khóa qua phân tích lại, lỗi nhà cung cấp và dựng chữ trong trang; không gọi AI trả phí và không lưu fixture vào dữ liệu người dùng. Đã kiểm thử riêng bằng nhà cung cấp thật với vùng chữ Be Yourself, lưu/mở lại và xuất PNG.
