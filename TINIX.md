# TinixPoster — hiệu ứng ảnh và nền liên kết

## Cắt dán ảnh thật · bản đầu

### Quản lý đơn khách

Bấm **Đơn cắt dán** trên thanh trên để tìm tên khách, tiêu đề hoặc mã #ID; lọc trạng thái, xem ảnh đại diện/khổ in, mở thiết kế ở tab riêng và tải lại JPG trong danh sách bản khách đã duyệt. Trạng thái mặc định của đơn cũ là Đang làm. Chuyển **Đã duyệt** yêu cầu có bản khách đã duyệt; chuyển **Đã in** phải chọn cụ thể bản duyệt thuộc đơn; **Hoàn thành** yêu cầu đã ghi nhận bản in. Trạng thái được người làm cập nhật thủ công, không tự gửi duyệt hoặc tự in. Mở **Lịch sử trạng thái** để xem các lần chuyển và mã bản in; khi trở về trạng thái làm việc, lịch sử in trước vẫn còn.

Thông tin trạng thái lưu trong `collage_orders`, lịch sử bất biến theo thao tác trong `collage_order_events`, cùng SQLite nên nằm trong backup DB. Không di chuyển/xóa thiết kế hay bản duyệt cũ. Kiểm tra `node scripts/tinix-orders-test.cjs` trên server thử cổng 7009.

### Quản lý cụm trực quan

Trong mục Cắt dán, phần **Cụm in và cắt nổi trên trang** nằm ngay đầu panel. Bấm tên để đánh dấu khung bao trên canvas; chọn ảnh trực tiếp trên canvas cũng chọn cụm tương ứng. Tick nhiều cụm rồi **Gộp cụm đã chọn** để xuất chung một mảnh, không thay đổi tọa độ hoặc nhóm thiết kế. Cụm ghép mặc định Cắt nổi nếu ít nhất một cụm nguồn là Cắt nổi; có thể đổi lại. Đổi tên cụm dùng `printName`, không đổi tên từng lớp. Chọn một cụm ghép rồi **Tách cụm in/cắt** để bỏ liên kết `printGroup`; nhóm thiết kế và lớp con vẫn giữ nguyên. Cách in, gộp/tách và đổi tên có hoàn tác và được lưu trong thiết kế, dùng chung với bộ xuất JPG.

**Xem nền sạch trên canvas** chỉ tạm ẩn các cụm cắt nổi, không sửa `hidden`, không thay đổi thiết kế đã lưu hay bản khách đã duyệt. Có banner báo chế độ và nút Xem thành phẩm. Chuyển panel/trang hoặc mở lại thiết kế sẽ thoát chế độ này. Khung đánh dấu không tham gia xuất JPG; server dựng lại từ dữ liệu gốc theo `printRole`/`printGroup`, không chụp giao diện mô phỏng. `node scripts/tinix-print-groups-ui-test.cjs` kiểm tra chọn/đánh dấu, view không lưu, gộp/tách/đổi tên, vị trí không đổi, hoàn tác và mở lại.

### Bản khách đã duyệt và in lại

Trong hộp xuất: **Người làm đã xem file** chỉ cho phép tải bộ làm việc, không tự gắn trạng thái khách duyệt. Sau khi khách xác nhận đúng bộ JPG, tick riêng **Khách đã duyệt đúng bộ ảnh đang xem**, nhập ghi chú nếu cần rồi bấm **Lưu cố định bản khách đã duyệt**. Việc này ghi nhận xác nhận do người vận hành nhập; app không tự gửi ảnh hoặc thu thập phê duyệt từ khách.

Mỗi lần duyệt tạo bản lưu riêng theo ID thiết kế, không ghi đè bản duyệt trước. Snapshot đầy đủ của nền/tờ cắt/thành phẩm, cấu hình dàn tờ, tên đơn, thời điểm UTC và hai xác nhận được lưu trong bảng `approved_prints`. JPG được sao chép từ chính cache ảnh đã xem, không render lại. Bản lưu không phụ thuộc file ảnh nguồn còn tồn tại để in lại; snapshot JSON vẫn giữ dữ liệu thiết kế/tài nguyên tham chiếu, không phải bản sao nhúng toàn bộ ảnh nguồn để chỉnh sửa offline.

Nút **Bản khách đã duyệt** trên thanh trên tải danh sách cho thiết kế hiện tại, kèm thời điểm theo giờ máy và ghi chú; bấm xem hoặc tải lại bộ JPG. Mỗi file được kiểm tra SHA-256 trước khi trả về; thiếu/hỏng sẽ báo lỗi, tuyệt đối không âm thầm render thiết kế hiện tại. API không có thao tác sửa/xóa bản duyệt. Sửa thiết kế làm việc hoặc khởi động lại app không đổi JPG đã duyệt.

Lưu trữ lâu dài: `service/data/approved-prints/<id>/` (JPG + snapshot.json) và `service/data/poster.db`. Không nằm trong cache dọn ảnh của thư viện. `npm run tinix:backup` đã bao gồm thư mục `approved-prints`; khi khôi phục cần đưa cả DB và thư mục này về `service/data/`. Sao lưu đầy đủ thư mục dữ liệu vẫn cần thiết để phòng hỏng ổ đĩa.

Kiểm thử `node scripts/tinix-approved-print-test.cjs`: duyệt riêng, chặn bộ chưa đầy đủ, retry không nhân đôi, thay thiết kế/xóa job tạm không đổi bytes và phát hiện file hỏng. UI test kiểm tra duyệt, xem lịch sử và byte JPG trong lịch sử khớp bộ đã xem.

### Xuất bộ JPG cho cắt thủ công

**Cập nhật khổ in và duyệt trước khi tải:** mọi JPG (nền, tất cả tờ chi tiết cắt, thành phẩm) dùng chính chiều rộng/cao pixel và DPI của trang thành phẩm; không còn lựa chọn A4/A3/khổ riêng. Chỉ chỉnh lề và khoảng cách; nếu thiếu chỗ tự thêm tờ cùng khổ. Mảnh không vừa sẽ yêu cầu giảm lề hoặc sửa cụm, không tự thu nhỏ.

Nút **Kiểm tra và tạo ảnh xem trước** lưu thiết kế, kiểm tra nguồn ảnh/font, cảnh báo độ phân giải hiệu dụng dưới 150 DPI, chữ dưới 8 pt, mảnh nhỏ hơn 5 mm và nội dung vượt trang. Lỗi tài nguyên hoặc chữ tràn khung khi render sẽ chặn xuất. Khi thành công, hộp xuất hiển thị JPG thật của từng file, bấm ảnh để xem lớn. Đánh dấu đã xem rồi **Tải bộ JPG (ZIP)**; ZIP chứa đúng blob JPG đã duyệt, không render lại. Thay đổi thiết kế hoặc thiết lập sau khi tạo preview sẽ vô hiệu xác nhận; cần tạo lại preview cho thiết lập mới. Đóng hộp giải phóng URL xem trước. Không thay thế việc kiểm tra bản in vật lý hoặc kiểm định màu máy in.

Kiểm tra bổ sung: `node scripts/tinix-print-preflight-test.cjs`, planner test, API test và UI test kiểm chứng mọi ảnh cùng khổ, duyệt trước khi tải và byte JPG trong ZIP giống ảnh xem trước.

Luồng hiện tại thay cho in hai bản giống nhau: **Xuất bộ JPG cắt dán** trên thanh trên → xác nhận khổ thành phẩm, chỉnh lề và khoảng cách → chọn từng cụm **In trên nền** hoặc **Cắt nổi** → **Kiểm tra và tạo ảnh xem trước** → duyệt từng JPG → **Tải bộ JPG (ZIP)**.

ZIP gồm `01_nen.jpg` (nền sạch chỉ giữ cụm in nền), `02_chi_tiet_cat_01.jpg`… (các mảnh đầy đủ trên giấy trắng), `03_thanh_pham.jpg` (ảnh hoàn thiện để duyệt/lắp). App không tự thu nhỏ hoặc xoay mảnh; dàn theo khung bao có tính góc xoay, chừa lề/khoảng cách và thêm tờ khi thiếu chỗ. Mảnh quá lớn sẽ yêu cầu giảm lề hoặc điều chỉnh cụm trong thiết kế. Mọi file ghi cùng DPI nguồn, kích thước mảnh giữ nguyên pixel theo trang nguồn. In đúng kích thước / 100%, không Fit to Page.

`printRole` lưu trên lớp; `printGroup` ghép khung và ảnh thành một mảnh trong mẫu mới. Nhóm thông thường và các lớp con cũng là một cụm. Mẫu cũ mặc định chủ thể có `cutoutEdit` và lớp tên chứa “cắt nổi” là mảnh nổi, còn lại in nền; có thể đổi trong hộp xuất. Với mẫu cũ chưa liên kết khung/ảnh, nhóm các lớp cần cắt chung bằng công cụ nhóm của editor trước khi xuất. Ảnh nền phải là tài nguyên đầy đủ sẵn có, không suy diễn hay sinh bù phần nền bị che.

Xuất sẽ lưu thiết kế một lần rồi tạo snapshot độc lập trên server; nền, tờ cắt và ảnh hoàn thiện đều dựng từ snapshot này, kể cả khi thiết kế được sửa sau đó. Snapshot giải phóng sau xuất hoặc hết hạn 30 phút. Xuất tuần tự, đóng gói khi toàn bộ JPG thành công; không tải bộ thiếu file.

Kiểm thử: `node scripts/tinix-collage-print-test.cjs` (39 tình huống dàn tờ và các bất biến), `node scripts/tinix-collage-print-api-test.cjs` (tạo thiết kế QA từ mẫu 39, xuất nhiều tờ và kiểm tra snapshot), `node scripts/tinix-collage-print-ui-test.cjs` (thiết kế QA 41, chọn cụm/giấy và tải ZIP qua UI). Bản in vật lý cần được kiểm tra trên máy in của người dùng.

### Duyệt và sửa tách nền

Ổn định WebView2: xem thử viền dùng ảnh tạm cạnh dài tối đa 700 px, thumbnail cao 100 px; ảnh in giữ nguyên độ phân giải nguồn. Canvas sửa dùng CPU backing và được tái sử dụng khi rê cọ. Hoàn tác giới hạn ngân sách khoảng 64 MB (tối thiểu một nét), canvas/bitmap được giải phóng khi đóng hoặc hoàn tất xử lý. Giới hạn canvas sửa 32 triệu pixel, 12000 px/cạnh; vượt giới hạn báo lỗi để chọn ảnh nhỏ hơn. Đây là giảm tải phía app, không phải kết luận nguyên nhân mọi lỗi WebView2 `0x80000003`.

Sau khi bấm tạo trang, cửa sổ duyệt mở trước khi dựng: chọn nền sáng/tối/ô caro, phóng 100–300%, cọ Xóa hoặc Giữ (khôi phục từ ảnh nguồn), hoàn tác tối đa 8 nét và đặt lại mặt nạ lúc mở. Viền trắng chỉnh 0–5 mm; hình nhỏ bên dưới cho xem riêng kết quả có viền. Nền kiểm tra không xuất ra JPG.

Ảnh nguồn, alpha đã sửa, ảnh chủ thể và ảnh viền lưu thành tài nguyên độc lập. `cutoutEdit` giữ URL nguồn/alpha, thông số mm và khung nguồn; `cutoutBorderUrl` hiển thị bên dưới ảnh cùng một widget để kéo/đổi kích thước cùng nhau. Chọn **Sửa chủ thể trên trang** trong mục Cắt dán để sửa tiếp sau khi lưu/mở lại. Thay viền hoặc sửa mặt nạ không gọi lại BiRefNet. Viền tính theo khổ mẫu 30 × 20 cm / 300 DPI, với chỗ trống cố định cho tối đa 5 mm; khi sửa trên trang dùng tỷ lệ hiện tại để tính viền. Nếu đổi khổ hoặc kéo giãn ảnh, mở sửa và áp dụng lại viền để xác lập độ dày vật lý mới. Ảnh từ phiên bản cũ đã gộp viền không có dữ liệu nguồn này; tạo lại trang để dùng tính năng sửa riêng.

> **Đã bỏ (2026-11-18):** luồng "Kỷ niệm" (một ảnh chính) dưới đây cùng `CollagePanel.vue`, `CutoutReview.vue`, `utils/tinix/collage.ts`, `cutout-edit.ts`, `collage-templates.json` và hai script test của nó đã xóa; mẫu cắt dán mới (TemplateLibrary) thay thế. Phần dưới chỉ để tra lịch sử. API service `/api/tinix/cutout/birefnet` vẫn giữ.

Mở mục **Cắt dán** ở thanh trái. Chọn mẫu, nhập **Tên khách / mã đơn**, chọn ảnh chính và 0–2 ảnh phụ từ thư viện hoặc file trên máy. Bấm **Tạo thiết kế cho khách mới**, duyệt mặt nạ/viền, bấm **Dùng kết quả này**. App luôn tạo bản ghi thiết kế mới (không gửi id cũ), lưu tên khách và phiên bản mẫu vào dữ liệu trang. Bấm **Mở thiết kế của khách** để mở tab riêng, chỉnh ảnh/chữ, Lưu và Xuất JPG. Thiết kế đang mở, kể cả phần chưa lưu, không bị thay đổi bởi thao tác tạo khách mới.

Tài nguyên, khổ in, giới hạn ảnh, vị trí khung/chủ thể, sticker, vùng chữ và font của mẫu nằm trong `src/assets/data/collage-templates.json`. Bộ dựng dùng cấu hình này và tạo UUID/lớp mới cho mỗi khách; không sinh ảnh lại và không sửa cấu hình mẫu. Để thay riêng một ảnh đã đặt: chọn ảnh trên canvas, vào Cắt dán → **Thay ảnh đang chọn từ thư viện**. Ảnh phụ giữ nguyên khung; chủ thể mới đi qua bước tách nền/duyệt và căn lại trong vùng hiện có, các lớp khác giữ nguyên.

Kiểm tra tách biệt khách, chọn thư viện, dùng lại tài nguyên, thay ảnh và JPG: `node scripts/tinix-collage-customer-test.cjs` trên app cổng 7001. Test dùng ảnh local có sẵn, giữ nguyên thiết kế mẫu 28 và tạo hai thiết kế QA khách A/B để kiểm chứng.

Mặc định **Chất lượng cao · BiRefNet / RTX 3090**: Python worker chạy CUDA FP16, model nạp một lần và tự nhả sau hai phút không xử lý. Chế độ **Nhanh · U²-Net** tiếp tục chạy ONNX trong trình duyệt. Không gọi dịch vụ sinh ảnh hoặc tải model trong lúc xử lý khách. PNG đã tách nền có tùy chọn bỏ qua suy luận; cả hai cách đều thêm viền trắng. Trong cùng phiên, dựng lại từ cùng ảnh chính và chế độ sẽ dùng kết quả đã xử lý. Nên chọn ảnh một người rõ ràng; ảnh nhiều người hiện chưa có bước chọn riêng một người.

Cài lần đầu: `powershell -ExecutionPolicy Bypass -File scripts/setup-birefnet.ps1`. Môi trường Python riêng ở `.runtime/birefnet-venv`; trọng số/code chính thức tại `.runtime/birefnet-model`, revision `e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4` của `ZhengPeng7/BiRefNet` (MIT). PyTorch 2.6.0 + CUDA 12.4 / torchvision 0.21.0, transformers 4.48.3. Có thể đặt `TINIX_BIREFNET_PYTHON` trỏ tới Python khác tương thích. GPU không khả dụng sẽ báo lỗi, không âm thầm chuyển CPU hoặc U²-Net.

API `POST /api/tinix/cutout/birefnet` nhận một multipart `file` tối đa 40 MB, trả PNG có alpha ở kích thước nguồn sau xoay EXIF. Giữ RGB nguồn, chỉ dự đoán alpha ở 1024 px rồi nội suy lên kích thước gốc. Cache tại `service/static/cutouts` theo SHA-256 ảnh + revision + thông số; một GPU job tại một thời điểm, tác vụ khác nhận 409 để thử lại. Worker đọc trọng số hoàn toàn offline. Ảnh cache/thiết kế đã lưu vẫn dùng được sau restart. Kiểm tra API/cache/lỗi và phục hồi: `node scripts/tinix-birefnet-test.cjs` trên app đang chạy (mặc định cổng 7009, đổi bằng `TINIX_APP_URL`).

Nút **Xuất JPG để in** lưu thiết kế rồi xuất trang hiện tại với ảnh đầy đủ, JPEG chất lượng 100/4:4:4, nền được ghép kín và mật độ DPI của trang. Mẫu mặc định 3543 × 2362 px / 300 DPI, tương ứng khoảng 30 × 20 cm. Nút này xuất ảnh hoàn thiện đơn lẻ; để sản xuất cắt dán hãy dùng Xuất bộ JPG theo hướng dẫn ở trên. Không xuất PDF, SVG đường cắt hoặc file hướng dẫn riêng trong luồng này. Những định dạng của editor thông thường vẫn được giữ.

Kiểm tra: `npm run v-build-hard`, `npm run tinix:test`. Kiểm tra trọn luồng với ba ảnh local có sẵn: `$env:TINIX_APP_URL='http://127.0.0.1:7009'; node scripts/tinix-collage-smoke.cjs` (cần app chạy, tạo một thiết kế mẫu để duyệt và lưu JPG vào `.runtime/collage-print.jpg`). Chưa xác minh trên máy in/cắt giấy vật lý.

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

Kéo khung ảnh là di chuyển khung (từ 2026-11-19; trước đó mặc định là kéo ảnh bên trong). Chỉnh ảnh bên trong: xem mục "Chế độ chỉnh ảnh trong khung" bên dưới. Thanh **Phóng ảnh** tăng khoảng căn chỉnh. **Căn giữa ảnh** giữ mức phóng hiện tại, **Vừa khung** đặt phóng 1× và căn giữa.

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


## Duyệt font trên ảnh mẫu thực tế (2026-11-16)

Trong **Trợ lý AI → Dựng theo mẫu**, sau khi tìm font cho một khối, bấm **Duyệt và chỉnh font**. Màn hình mới đặt ảnh vùng chữ cạnh chữ render cùng nội dung mẫu; chuyển ứng viên bằng nút Trước/Sau hoặc phím ←/→ khi không nhập liệu. Có phóng xem 100/150/200%, độ đậm, kiểu nghiêng và giãn chữ (%). Font tĩnh chỉ dùng độ đậm/kiểu có thật; font biến thiên được chỉnh trong giới hạn hồ sơ. Preview tải tệp font thật; nếu tải lỗi, không cho xác nhận bằng font dự phòng.

Các thay đổi trong màn hình này là bản nháp: **Hủy** không đổi font, không ghi lịch sử. Chọn **Gần mẫu** hoặc **Chấp nhận được**, rồi **Xác nhận và dùng font** để áp dụng font/độ đậm/kiểu nghiêng/giãn chữ. Chọn **Chưa đạt** chỉ lưu nhận xét, giữ font hiện tại. Điều này ghi nhận mức gần giống do người duyệt xác nhận, không xác minh font gốc. Khóa font ngăn thay đổi thông số; vẫn có thể mở xem đối chiếu.

Lịch sử lưu tối đa 100 vùng trong localStorage của trình duyệt/cổng app đang dùng, không đồng bộ sang máy khác. Khóa SHA-256 bao gồm ảnh, vùng cắt, chữ mẫu và chữ thiết kế để tránh dùng nhầm đánh giá. Mở lại cùng vùng cho thấy lần duyệt trước; chọn font thủ công khác hoặc thay vùng xóa trạng thái xác nhận trên khối, không xóa lịch sử. **Xuất lịch sử duyệt** tải JSON gồm thông số và ghi chú, không nhúng ảnh tham chiếu. Nếu trình duyệt không lưu được lịch sử, hiện lỗi và không báo xác nhận thành công.

### Bộ ca ảnh thực tế và báo cáo duyệt

`npm run tinix:font-real-cases` lấy bốn ảnh poster người dùng đã gửi (Be Yourself, Tomorrow, New, Unveiling), đóng băng 22 vùng chữ vào `.runtime/font-real/cases.json`, sao chép ảnh tham chiếu, lưu hash, vùng cắt và chữ chép tay. `crops.html` giúp rà soát các vùng. Script từ chối ghi đè manifest đã tồn tại; ảnh và kết quả trong `.runtime/` không đưa vào Git. Chỉ lấy ảnh tham chiếu có sẵn, không thay bằng ảnh dựng tổng hợp.

`npm run tinix:font-real-quality -- --live` gọi API AI thật cho từng vùng; tự bỏ qua ca đã thành công và chạy lại ca lỗi khi chạy tiếp. Mỗi ca có chữ mẫu được xác nhận để đo so khớp font, không phải đo OCR. Ảnh/nội dung/vùng/nhãn ground truth thay đổi thì bộ đo từ chối dùng lại kết quả cũ. Có thể đặt `TINIX_APP_URL`, `TINIX_REAL_CASES_OUT`, `TINIX_REAL_QUALITY_OUT` hoặc truyền `--manifest` để chọn nơi chạy và nơi lưu.

Font gốc của bốn ảnh chưa được xác minh: các ca mang `groundTruth.kind=unknown`. Báo cáo không tính chúng thành đúng/sai Top 1/Top 3; chỉ tính độ chính xác trên ca có `groundTruth.kind=verified` và `fontId` xác minh riêng. Lỗi/không đọc được vùng vẫn hiện trong báo cáo, không bị loại âm thầm. Nhiều vùng cùng một poster không phải nhiều nguồn dữ liệu độc lập.

Kết quả nằm tại `.runtime/font-real-results/REPORT.md`, `summary.json`, `results.json`, từng `*-match.json` và `review.html`. Trang `review.html` đặt ảnh mẫu cạnh từng bản render, cho chọn font, mức gần giống và ghi chú, rồi xuất JSON. Dùng `npm run tinix:font-real-quality -- --report-only --reviews <file.json>` để nhập đánh giá và tạo lại báo cáo mà không gọi AI. Chỉ nhận đánh giá khớp mã ca/chữ ký và font trong danh sách. Có thể nhập lịch sử xuất từ app khi ảnh, bbox, chữ mẫu và chữ thiết kế trùng chính xác ca đo. Duyệt độ gần giống luôn tách khỏi nhãn font gốc; chưa duyệt thì ghi rõ chờ duyệt.

Kiểm thử bổ sung: `npm run tinix:test-font-review-ui` kiểm tra bản nháp/hủy, lưu/chọn ứng viên, lịch sử, nhận xét chưa đạt, tải font lỗi, điều khiển font tĩnh và dựng không cắt chữ. Bộ offline kiểm tra giới hạn kiểu font, khóa định danh vùng/nội dung, lịch sử tối đa 100 mục, dữ liệu lưu hỏng, tách font gốc/đánh giá gần giống và phát hiện manifest thay đổi.


Kiểm tra toàn luồng duyệt trên app bằng kết quả AI thật đã lưu của vùng THURSDAY: chọn Montserrat, chỉnh độ đậm 500 và giãn chữ 3%, xác nhận, dựng một khối chữ, lưu/mở lại và xuất PNG. Phân tích bố cục được cố định một khối để kiểm tra riêng font; không giả lập xuất PNG. Nhận xét do tự động hóa QA tạo ra không được nhập vào nhãn đánh giá con người của bộ ảnh thực tế. Công cụ tái lập: `npm run tinix:test-font-review-app` (cần các artifact ảnh thật/kết quả đã có); đầu ra tại `.runtime/font-review-app/`, gồm `review.png`, `export.png`, `design-id.txt` và bản ghi QA.

Kiểm tra bổ sung đã đạt: điều hướng bằng bàn phím, xuất JSON không nhúng ảnh, lỗi localStorage không xác nhận giả, và cửa sổ hẹp 700 px. `scripts/tinix-selftest/font-real-report-ui.cjs` kiểm tra chọn mức gần giống và tải JSON từ trang báo cáo offline, không gọi nhà cung cấp.


### Kết quả bộ ảnh thực tế và xác minh cuối

Đã chạy AI thật cho đủ **22/22 vùng chữ**, không còn ca lỗi. Font gốc đã xác minh: **0**; Top 1/Top 3 để `null`, không đưa ra tỷ lệ đúng font. Đánh giá con người đã nhập: **0**; **22 ca chờ duyệt mức gần giống**. Các lỗi fetch do cổng chính khởi động lại trong lúc chạy đã được chạy lại trên cổng QA riêng; kết quả cuối giữ đủ ca, không loại ca khó khỏi mẫu. Bộ ảnh thật đã cho thấy nhiều lựa chọn đầu khác phong cách mẫu, nên kết quả trên ảnh tổng hợp trước đây không được suy rộng thành độ chính xác ảnh thực tế. Bước cải thiện tách chữ/nền vẫn là công việc tiếp theo, chưa triển khai trong phạm vi này.

Xác minh cuối: build frontend đạt; TypeScript service đạt; **16/16 nhóm kiểm thử offline đạt**. Kiểm thử màn hình duyệt trên app chính đạt (hủy/xác nhận, tải font lỗi, bàn phím, lịch sử JSON, lỗi dung lượng lưu trữ, cửa sổ hẹp, vùng cắt, khóa và giữ font khi lỗi). Trang báo cáo offline cũng chọn/xuất được đánh giá JSON. Kiểm thử thực tế trên cổng 7001 dùng lại kết quả AI của mẫu THURSDAY, chọn Montserrat 500 với giãn chữ 3%, lưu/mở lại thiết kế QA **53**, giữ đúng thông số và xuất PNG thành công; artifact ở `.runtime/font-review-app/review.png`, `reopened.png`, `export.png`. Nhãn đánh giá do automation QA tạo không nhập vào bộ duyệt con người.

Server chính đã khởi động lại và xác minh `/` cùng `/design/list` trả HTTP 200. Cổng QA 7003 đã tắt. Kiểm tra toàn service cũng phát hiện tùy chọn `maxFiles` không được multiparty hỗ trợ trong phần tách nền đang phát triển song song; bỏ tùy chọn đó, giữ kiểm tra đúng một tệp và giới hạn dung lượng vốn có.


## Tách chữ phục vụ đo font (2026-11-16)

`font-extract.ts` trừ nền sáng/tối cục bộ bằng trung bình vùng lân cận, tạo mặt nạ chữ đen trên trắng. Không xóa thành phần nhỏ để giữ dấu và nét rời. Mặt nạ này được đưa trực tiếp vào `fontShape` thay cho ảnh crop gốc; toàn bộ lượt scan và tinh chỉnh ứng viên dùng cùng mô tả tham chiếu đã tách. Ảnh gốc vẫn dùng cho AI đối chiếu; không thay đổi ảnh người dùng.

API trả `processedPreview`, `shapeQuality` và thông tin `extraction` (phương pháp, tỷ lệ mực, biến thiên viền, vùng sử dụng được). Mở phần xem chữ sau xử lý tương phản để kiểm tra mất nét/dấu. Biến thiên nền mạnh, dưới bốn ký tự hoặc mặt nạ gần rỗng làm giảm trọng số hình dáng; khi chất lượng dưới 0.75 luôn yêu cầu duyệt, dù AI tin cậy cao. Đây là heuristic, không xác minh font gốc; nền ảnh có chi tiết vẫn có thể tạo mặt nạ sai.

Kiểm thử có nền gradient mô phỏng, hai cực sáng/tối, vùng trắng, hạ trọng số chất lượng thấp và chặn tự áp dụng. Kết quả bộ 22 ảnh thực tế mới được lưu riêng tại `.runtime/font-extract-results/`, giữ nguyên mốc `.runtime/font-real-results/`. Không có nhãn font gốc hoặc duyệt con người thì không tính độ chính xác Top 1/Top 3.


Lượt đo mới hoàn tất 22/22 ca, không lỗi; 13 vùng có chất lượng dưới 0.75. Không ca nào được tự áp dụng sau các kiểm tra bất đồng/chất lượng. Các ứng viên đầu vẫn có thể khác phong cách, nên chưa chứng minh tăng độ chính xác. Báo cáo đối chiếu `.runtime/font-extract-results/COMPARISON.md` ghi ứng viên trước/sau, chất lượng và trọng số hình dáng. Không có ground truth hoặc đánh giá người dùng thì Top 1/Top 3 vẫn null. Bộ đo không tự sinh nhãn duyệt con người.

Kiểm thử tách nền, hai cực sáng/tối, vùng trắng và giảm trọng số đã đạt; 16/16 nhóm hồi quy, build frontend và TypeScript service đạt. Kiểm thử app dùng kết quả mới của THURSDAY đã xác nhận có preview xử lý, duyệt Montserrat 500/giãn 3%, lưu/mở lại và xuất PNG tại `.runtime/font-extract-app/export.png`. Bố cục một khối dùng fixture để kiểm tra riêng luồng font; dữ liệu so khớp là kết quả API thật đã lưu.

[TINIX] Bé yêu v4: TemplateLibrary sinh cụm tên từng chữ qua shared/scrapbook-name.mjs khi tạo đơn; tự chia hai hàng, giữ trường tên nguồn, cập nhật liên kết khi đổi ID. CLI instantiate dùng cùng hàm. Kiểm thử: scripts/tinix-scrapbook-name-test.mjs; xuất thử đơn 209/210. Chưa kiểm thử toàn bộ thao tác tạo đơn qua giao diện với chủ thể mới.


[TINIX] Bé yêu v4 phiên bản 2 giới hạn vùng tên cách sticker máy ảnh; mặc định viền chủ thể mới 0 mm. Kiểm thử giao diện và xuất đơn 215 qua scripts/tinix-baby-v4-ui-test.cjs và tinix-production-pilot.cjs.


## Dựng mẫu cắt dán từ ảnh tham chiếu (2026-11-16)

Lệnh CLI dựng **bản nháp** mẫu cắt dán từ một ảnh chụp trang scrapbook thật: `reference grid`, `drafts from-reference`, `reference compare`. Không gọi AI trả phí. Cần app đang chạy (tải font, tách nền BiRefNet). Mã ở `scripts/lib/reference-build.mjs` và `scripts/lib/text-measure.mjs`; ví dụ spec ở `scripts/examples/smile-darling.spec.json` (chỉ có toạ độ và chữ, không có ảnh).

### Phân công người/tác tử và máy

Thử nghiệm cho thấy dò tự động "mù" không tách được các khung chồng lớp (thành phần màu trắng dính nhau, tỉ lệ lấp đầy 0,11–0,33). Vì vậy **vị trí, kích thước và góc xoay từng thành phần do người hoặc tác tử đọc từ ảnh** rồi ghi vào spec; máy làm phần đo đếm:

- cắt ảnh trong khung **đã duỗi thẳng** (khung xoay, ảnh bên trong vẫn thẳng);
- tách **sticker thật** bằng BiRefNet (không vẽ lại bằng SVG); nhãn `shape: "cutout"` lấy hình nét cọ từ mặt nạ tách nền rồi điền màu giấy;
- lấy màu nền, màu giấy khung (từ dải viền ngoài), màu nhãn, màu mực; dò các trái tim trắng làm nền;
- **tự khớp cỡ chữ**: đo "mực" chữ trong ảnh mẫu (ngưỡng Otsu), rồi đo font thật bằng Chromium của Puppeteer (cùng engine với bộ render, có kerning) để tìm cỡ chữ cho bề rộng mực bằng nhau; khung chữ luôn rộng hơn dòng dài nhất nên không xuống dòng; chữ nhiều dòng lấy `lineHeight` từ chiều cao mực mẫu; tâm mực trùng tâm mực trong ảnh mẫu.

### Quy trình

```text
node scripts/tinix-cli.mjs reference grid --input ref.png --output ref-grid.png            # lưới toạ độ (px ảnh gốc) để đọc vị trí
# viết spec.json (xem bên dưới), rồi:
node scripts/tinix-cli.mjs drafts from-reference --reference ref.png --spec spec.json --output draft.json
node scripts/tinix-cli.mjs drafts render --input draft.json --output render.png
node scripts/tinix-cli.mjs reference compare --reference ref.png --render render.png --spec spec.json --output cmp.png
node scripts/tinix-cli.mjs templates save-collage --input draft.json --name "Tên mẫu"      # khi đã hài lòng
```

Tài nguyên ghi vào `service/static/collage/<name>/`. Mặc định `--photos placeholder`: khung ảnh dùng ảnh giữ chỗ trung tính, **không nhúng ảnh người của ảnh mẫu vào mẫu**. `--photos reference` chỉ để đo độ khớp (ảnh trong khung lấy từ ảnh mẫu). `reference compare` in MAE (0–255) và SSIM (1 = giống hệt) toàn trang và theo từng phần tử, kèm ảnh cạnh nhau (mẫu | render | bản đồ lệch).

### Spec

`name` (slug), `title`, `canvas.width` (mặc định 2400; chiều cao theo tỉ lệ ảnh mẫu), `background` (`color: "auto"`, `hearts: true`) và `elements` theo thứ tự lớp từ dưới lên:

| `type` | trường chính |
|---|---|
| `frame` | `center [x,y]`, `size [w,h]`, `rotate` (độ, dương = thuận chiều kim đồng hồ), `photos [{name, offset, size}]`, `paper` (`auto` hoặc `#rrggbb`) |
| `photo` | `center`, `size`, `rotate`, `mask` (`cloud`, `circle`, `ellipse`, `rounded`) |
| `label` | `center`, `size`, `rotate`, `shape` (`rect`, `ribbon` + `notch`, `cutout`), `color`, `text`, `font` (tên trong kho font), `textInk [x0,y0,x1,y1]` (vùng chứa chữ để đo mực), `textColor`, `fontSize` (bỏ trống để tự khớp), `letterSpacing`, `lineHeight` |
| `sticker` | `box [x0,y0,x1,y1]`; `keep` (`cutout` = tách nền BiRefNet, mặc định; `box` = giữ nguyên vùng chữ nhật, dùng khi tách nền cắt hụt); `mask` (với `keep: box`) |

`background.pattern: "reference"` lấy hoa văn nền (giấy hoa văn, họa tiết) từ chính ảnh mẫu: xóa vùng các phần tử (nới 10 px) rồi vá lỗ bằng đẩy-kéo (mịn, không tái tạo họa tiết trong lỗ vì chỗ đó bị phần tử che); bỏ qua dò trái tim. Đo trên mẫu Luna (ảnh giữ chỗ): MAE 45,7 → 38,8, SSIM 0,517 → 0,572; mẫu Smile: MAE 58,1 → 54,4, SSIM 0,519 → 0,553. Nền nhúng thành tệp `background.jpg` — chỉ vùng không có phần tử mới giữ nội dung ảnh mẫu; khung xoay có hộp bao rộng hơn khung nên vùng thừa bị vá mịn. Viền ngoài của ảnh mẫu (khung hộp, tường) cũng bị chép vào nền nếu nằm trong ảnh.

Toạ độ trong spec là **pixel của ảnh tham chiếu**. Spec sai hoặc font không có trong kho báo lỗi rõ (kèm gợi ý tên font gần giống) và không ghi tệp đầu ra.

### Kết quả trên trang "Smile, Darling" và các điều đã học

So với bản dựng thủ công bằng script, trên cùng ảnh mẫu (`--photos reference`): MAE 26,5 so với 28,5; sticker SSIM 0,82–0,87; "SAY CHEESE" 0,48 so với 0,39; chữ không còn tràn hay gãy dòng. Điểm yếu còn lại:

- **Toạ độ khung do người ước lượng**: hai khung ảnh lớn còn SSIM 0,52–0,54 (viền lệch vài pixel). Đã thử bước tự tinh chỉnh khung bằng leo đồi trên độ tương phản viền giấy: **làm kết quả tệ hơn** (SSIM toàn trang 0,652 → 0,599) nên đã gỡ bỏ. Dùng `reference compare` và bản đồ lệch để sửa spec bằng tay.
- **Font**: kho chỉ có `Amatic SC` bản mảnh nên "SMILE, DARLING" mảnh và cao hơn mẫu khi khớp theo bề rộng.
- **Nền**: chỉ dò được ~29 trái tim trong ~50 (tim bé hoặc bị khung che); tim bị che được vẽ trọn dưới khung nên không lộ.
- **SSIM phạt nặng chữ lệch vài pixel** (vùng chữ 0,23–0,48 dù nhìn bằng mắt khá gần); xem thêm ảnh cạnh nhau.
- Biểu tượng nhỏ trong nhãn (máy ảnh trên nhãn hồng) không tự giữ (nhãn `cutout` chỉ lấy hình dạng và màu): thêm một phần tử `sticker` với `keep: "box"` bao quanh biểu tượng, đặt SAU nhãn trong `elements`. Trên mẫu Smile: SSIM vùng nhãn 0,306 → 0,492 (biểu tượng 0,995).
- Màu giấy khung (`paper: auto`): giấy trắng/nhạt lấy các điểm sáng ít màu trong dải viền; nếu các điểm đó chiếm < 60% dải (viền kraft/màu) thì lấy trung vị mọi điểm trong dải. Trước đây khung kraft bị ra hồng vì chỉ lấy vài điểm sáng.
- Bóng đổ `effects.shadow` của ứng dụng vẽ theo **hình chữ nhật** của lớp, nên chỉ đặt cho lớp chữ nhật thật (giấy khung, nhãn `rect`); ruy băng đuôi én, nhãn `cutout` và ảnh có mặt nạ không có bóng, nếu không sẽ lộ khối vuông.
- **`textInk` phải sát chữ**: nếu vùng này bao cả viền giấy hoặc nền tối, chiều cao mực bị thổi phồng và chữ nhiều dòng bị giãn dòng quá thưa (nhãn "Lời nhắn": 1,67 → 1,14 sau khi thu hẹp). Công cụ cảnh báo khi `lineHeight` đo được > 1,5.
- **Ảnh mẫu thứ hai ("Luna", khung ảnh bé, `scripts/examples/luna-frame.spec.json`)**: MAE toàn trang 57,2 → 45,7 sau các sửa dưới đây (ảnh giữ chỗ nên MAE cao là bình thường). Phát hiện: (1) nền là giấy hoa văn (dứa trên nền xanh ngọc) nên "auto" từng ra nâu đen vì chỉ lấy điểm tối → nay lấy trung vị khi điểm tối chỉ là viền/bóng (ra xanh xám, gần màu thật); **hoa văn nền vẫn chưa được tái tạo**; (2) BiRefNet cắt hụt sticker mềm/nhiều lớp (số "110", mây chữ bút lông) → thêm `keep: "box"` (+ `mask`); (3) khung viền kraft (nâu) bị lấy màu giấy ra hồng vì dải viền ăn vào ảnh bên trong; (4) chữ trắng trên nhãn màu hoạt động khi đặt `textColor`. Thứ tự lớp trong spec quyết định sticker nào đè nhãn nào.
- **`reference nudge` (tự dịch tâm khung theo gradient) đã thử lần hai và KHÔNG hiệu quả — không đưa vào.** Cách làm: so gradient bản dựng `--photos reference` với ảnh mẫu, tìm (dx, dy) có NCC cao nhất trong vùng phần tử, rồi dựng lại. Kết quả trên mẫu Luna: SSIM toàn trang 0,655 → 0,651, khung "trái dưới" 0,461 → 0,436, "sơ sinh" 0,569 → 0,561 (NCC tăng nhưng chất lượng thật không tăng). Hai nguyên nhân: (1) ở chế độ `--photos reference` ảnh trong khung được cắt từ đúng vị trí khung trong ảnh mẫu, nên nội dung luôn "tự khớp" bất kể khung lệch bao nhiêu; chỉ viền giấy mới mang thông tin; (2) viền giấy bị gradient của ảnh lân cận và khung xoay kéo lệch. Cùng kết luận với thử nghiệm leo đồi theo độ tương phản viền trước đó. Muốn bớt việc đọc toạ độ bằng tay thì hướng còn lại là nhờ AI nhìn ảnh đề xuất spec đầu tiên (tốn phí API), không phải khớp ảnh thuần.
- Đo chữ bằng Chromium cần trang cùng nguồn gốc với máy chủ Tinix (trang `about:blank` bị chặn tải font: `NetworkError`).

Kiểm thử offline `scripts/tinix-reference-build-test.mjs` (trong `npm run tinix:test`) dùng ảnh tổng hợp có đáp án biết trước, bộ tách nền và bộ đo chữ giả: duỗi thẳng khung xoay 10° (đo hướng gradient chủ đạo, có phép đối chứng không duỗi), đếm trái tim, màu giấy/nền/mực, vị trí sticker, cỡ chữ tự khớp và khung chữ không tràn, ảnh giữ chỗ, so sánh, kiểm tra spec. Phần Chromium, BiRefNet và font thật không chạy trong CI.

## Dựng trang scrapbook từ ảnh thật bằng SVG (2026-11-17)

`scripts/tinix-build-moments.mjs` dựng một trang scrapbook 30×20 cm (2400×1600 px, 203,2 DPI) từ 5 ảnh trong thư viện (mã `--photos`), **không dùng pixel nào của ảnh mẫu**: mọi đồ họa vẽ bằng SVG/thuật toán, chữ dùng font thật (Pacifico, Patrick Hand). `--placeholders` dựng bản ảnh giữ chỗ để lưu thành mẫu. Kết quả là bản nháp `{global, layers}`; lưu bằng `designs create` hoặc `templates save-collage`.

Những điều đã học (đừng làm lại):
- **Mask của app kéo giãn theo khung** (`-webkit-mask-size: 100% 100%`), nên tạo SVG mask đúng tỉ lệ từng khung. Khung giấy phía sau (vòm, bo tròn) là ảnh PNG cùng hình dạng + viền trắng (nở ra bằng `stroke-width` nét trắng) + bóng nướng sẵn. `effects.shadow` vẽ theo hình chữ nhật nên không dùng cho hình bất kỳ.
- **Khung răng cưa (tem thư, lượn sóng) đẹp nhưng khó cắt tay** → dùng cạnh thẳng, góc bo.
- **Ảnh chính tách nền + viền trắng ôm dáng người**: tách bằng BiRefNet (`/api/tinix/cutout/birefnet`), kết quả lưu vào `service/static/collage/moments-a/cutout-<id>.png` nên lần dựng sau không gọi lại. Viền = nở alpha bằng blur + threshold, rồi làm mịn; thêm một đường viền xanh khói mảnh ngoài viền trắng vì viền trắng trên nền kem gần như vô hình. Độ dày hiện tại: trắng 20 px (~2,5 mm), xanh +5 px.
- **`sharp` chạy blur/threshold/linear theo thứ tự cố định bên trong**: gọi lặp `blur(...).threshold(...).blur(...).threshold(...)` trong một chuỗi sẽ ghi đè nhau (viền không hề nở ra). Phải tách mỗi phép thành một bước (`toBuffer`) và ép về 1 kênh (`extractChannel(0)`), nếu không buffer bị đọc lệch (hộp mờ, vệt sọc quanh chủ thể).
- Bộ xuất của app báo `TEXT_OVERFLOW` khi chữ xuống dòng ngoài ý muốn: font viết tay rộng (Pacifico) cần khung rộng ~0,55×cỡ chữ×số ký tự.
- **Xếp mảnh cắt tiết kiệm giấy**: bộ xếp (`src/utils/tinix/collage-print.ts`) xếp theo HỘP của từng mảnh. Lớp ảnh có phần đệm trong suốt (chỗ chứa bóng/viền của sticker) làm hộp phình ra (ruy băng nhìn thấy 800×120 nhưng hộp 1204×524). Khai báo `printInset` (số px đệm mỗi cạnh) trên lớp ảnh để hộp cắt chỉ tính phần nhìn thấy; hộp nhóm (cụm khung ảnh) phải sát nội dung thật (khung + băng dính nhô ra), đừng nới tùy ý. Trên trang "Little Moments": 20 mảnh từ 2 tờ (độ phủ 86% và 55%) xuống 1 tờ (~84%). Bộ xếp cũng thử thêm 80 thứ tự xáo trộn (hạt giống cố định, kết quả lặp lại được). Đổi mã bộ xếp thì phải khởi động lại service 7001 (và build lại frontend, dùng chung file) mới có hiệu lực.

## Đường cắt laser (SVG) cho bộ JPG cắt dán (2026-11-18)

Hộp "Xuất bộ JPG cắt dán" có hai tùy chọn mới: **Thêm file SVG đường cắt cho máy laser** và **Dấu căn laser**. Mỗi tờ chi tiết cắt (`02_chi_tiet_cat_NN.jpg`) có thêm `02_duong_cat_NN.svg` trong gói ZIP. API: `GET /api/tinix/collage-print/:id/cut/:index?inset=mm` (mặc định lùi 0,3 mm). Mã: `service/src/tinix/cutPaths.ts` (module thuần), route trong `collagePrint.ts`, dấu căn (`MARK`, `markCorners`) trong `src/utils/tinix/collage-print.ts`, test `scripts/tinix-cut-paths-test.cjs`.

- **File SVG**: đơn vị mm, tỉ lệ 1:1 (`width`/`height` bằng mm + `viewBox` cùng hệ). Lớp `Cat` (đỏ) là đường cắt, lớp `Can` (xanh) là ba dấu chữ L ở góc trên-trái, trên-phải, dưới-trái (cách mép 3 mm, cánh dài 5 mm; đỉnh chữ L là điểm căn). Dấu căn cũng được in lên JPG, nằm trong vùng lề (cần lề >= 4 mm).
- **Cách dò**: dựng tờ cắt (bỏ dấu căn) hai lần trên nền trắng và nền đen → alpha = 255 − trung bình(trắng − đen) (không cần trình duyệt hỗ trợ nền trong suốt) → mặt nạ alpha >= 128 → trường khoảng cách có dấu (Felzenszwalb) làm mịn Gauss σ 1,2 px → marching squares tại mức = khoảng lùi → Douglas–Peucker 0,05 mm. Bóng nướng sẵn trong PNG có alpha thấp nên bị bỏ qua. Vòng nhỏ hơn 1,5 mm² bị coi là nhiễu.
- **"Giữa viền trắng"**: khoảng lùi tính theo từng mảnh bằng thuộc tính `cutInset` (px thiết kế) trên lớp ảnh; mảnh không khai báo dùng mặc định 0,3 mm. Script `tinix-build-moments.mjs` khai báo: ảnh chính tách nền = 5 px viền xanh + 10 px (nửa viền trắng 20 px), sticker = nửa bề dày viền trắng.
- **Quy trình LightBurn (không camera)**: nhập SVG (kích thước đúng 300×200 mm); Start From: User Origin, Job Origin: Top-Left; đưa tia laser (chế độ đỏ/công suất thấp) lên đỉnh chữ L trên-trái đã in, bấm Set Origin; bấm Frame để tia chạy theo khung và kiểm tra hai dấu còn lại; lệch thì xoay/xê dịch giấy. Lớp xanh đặt Output tắt. In JPG ở 100%, không co vừa trang. Chưa thử trên máy laser thật: cắt thử trên giấy rẻ và công suất thấp trước.

## Trang "báo chí cắt dán" và hiệu ứng vân giấy (2026-11-18)

`scripts/tinix-build-newspaper.mjs` dựng trang "The Daily Family" (30×20 cm): nền giấy báo, ảnh trong khung giấy trắng cắt tay (mép lệch, góc vát, băng dính) dùng ảnh GỐC kèm hiệu ứng đen trắng của app (`effects.grayscale`; chọn "Gốc" trong bảng hiệu ứng là về màu), tiêu đề ghép từ chữ cắt rời (mỗi chữ là một lớp chữ có `backgroundColor`), một ảnh chủ đạo tách nền giữ màu (dùng lại kết quả tách nền của `tinix-build-moments.mjs` ở `service/static/collage/moments-a/cutout-1713.png`; chạy script đó trước để có tệp này).

- **Vân giấy / hạt ảnh có sẵn của app**: đặt `layer.effects = { paper: 0–100, grain: 0–100 }` trên lớp ảnh. Lưu ý: `imageLayer()` trong `scripts/lib/reference-build.mjs` **bỏ qua** trường `effects` truyền vào (chỉ nhận `shadow`), phải gán `layer.effects` sau khi tạo lớp. Tương tự `effects.grayscale`/`border`: phải gán `layer.effects` sau khi tạo lớp. Đừng tạo sẵn ảnh đen trắng bằng sharp (bản đầu làm vậy nên chọn "Gốc" không về màu được).
- **Lỗi đã sửa**: lớp phủ vân giấy trong `ImageAppearance.vue` có `z-index:1` nên vẽ đè lên MỌI lớp phía sau (chữ đen (20,20,20) thành xám (~45–50)). Bỏ `z-index` để lớp phủ chỉ nằm trong lớp ảnh của nó. Phải build lại frontend (`npx vite build`, hoặc khởi động lại `tinix:prod`) mới thấy trong bản dựng.
- Khung ảnh cắt tay: `handCut()` sinh đa giác (bốn góc lệch, mỗi cạnh hai điểm gãy, tùy chọn vát một góc) dùng làm mask của ảnh và làm đường viền khung giấy trắng (nét `stroke` trắng + bóng nướng sẵn). Toàn đường thẳng nên dễ cắt tay; băng dính đặt ở chỗ trống, đừng để đè chữ.
- Chữ rộng (Playfair 700 ở cỡ lớn, câu trích dài) dễ báo `TEXT_OVERFLOW` vì khung chữ mặc định cao 1,6 lần cỡ chữ: đặt chiều cao khung đủ cho số dòng.

**Khung ảnh đa dạng (trang báo chí, cập nhật 2026-11-17):** vì dùng máy cắt nên không còn ràng buộc đường thẳng. `shapePath(kind,w,h)` trong `scripts/tinix-build-newspaper.mjs` trả path SVG kín (`ellipse`, `cloud`, `flower`, `heart`), dùng chung cho mask ảnh và khung giấy trắng (stroke dày). Thêm dáng mới: thêm một hàm bán kính theo góc (hoặc đường tham số) vào `shapePath`. Nên luôn đổi dáng khung giữa các ảnh trong một trang.

**Bố cục chồng lấn (trang báo chí, 2026-11-17):** khung ảnh lớn đè lên nhau và lên ảnh tách nền, thêm sticker (sao, tim) và nhãn (HAPPINESS, SMILE) để lấp chỗ trống như trang scrapbook thật. Thứ tự lớp = thứ tự dòng trong script (dòng sau nằm trên); `await slot(...)` đặt khung nằm dưới trước. Mỗi mảnh vẫn là mảnh `raised` riêng nên bộ xếp tờ cắt không bị ảnh hưởng bởi chồng lấn trên trang thành phẩm.

**Ảnh tách nền cỡ lớn (trang báo chí, 2026-11-17):** hàm `hero(name, photo, x, y, targetH)` tách nền (BiRefNet qua service 7001, cache ở `service/static/collage/moments-a/cutout-<mã ảnh>.png`) rồi viền trắng + bóng; ba ảnh chủ đạo cao 760–1000 px đè lên khung và `paperShape` (giấy hình hoa/tim màu). Khung ảnh thường chỉ dùng cho ảnh phụ (đám mây, elip). Cần service 7001 chạy khi dựng lần đầu với ảnh chưa có cache.

**Chữ dán die-cut (trang báo chí, 2026-11-17):** `dieText(...)` dùng hiệu ứng chữ gốc của app (`textEffects`): lớp 1 nét viền trắng dày + bóng tạo viền cắt ôm theo nét chữ, lớp 2 tô màu chữ. Các lớp hiệu ứng vẽ đè lên chữ gốc nên phải có lớp tô màu nằm trên cùng, nếu không viền trắng che mất chữ. Pacifico thiếu dấu nặng (ạ) nên tránh chữ có dấu nặng với font này.

**Xuất cắt trang báo chí (kiểm tra 2026-11-17):** chữ lớn in thẳng lên nền (tên báo, dòng số báo, chân trang…) phải đặt `printRole: 'base'` (tham số `base: true` của `text()`), nếu không bộ xếp coi là mảnh cắt rời và báo "không vừa khổ giấy". Chữ trên ô màu phải dùng `backgroundColor` của chính lớp chữ (một mảnh duy nhất), không vẽ ô riêng rồi đặt chữ lên. Bộ xuất cho 3 tờ cắt 30×20 cm không cảnh báo; SVG laser có đường cắt ôm đúng từng mảnh (đã chồng thử lên tờ cắt).

**Khung + ảnh là một mảnh (trang báo chí):** `slot()` gói khung giấy trắng và ảnh vào cùng một nhóm (`groupLayer`, cùng `printGroup`) nên bộ xếp tờ cắt coi là một mảnh duy nhất, ảnh in sẵn trên viền trắng. Trước đây khung và ảnh là hai lớp rời nên ra một mảnh giấy trắng trống và một mảnh ảnh riêng.

**Quy tắc thiết kế + bộ dựng dùng chung (2026-11-17):** các quy tắc rút ra từ trang báo chí nằm ở `DESIGN-RULES.md`; các hàm dựng (`slot`, `hero`, `dieText`, `paperShape`, `shapePath`, sticker...) được tách khỏi `scripts/tinix-build-newspaper.mjs` sang `scripts/lib/collage-kit.mjs` (`createCollageKit`) để mẫu mới dùng lại. Skill `.claude/skills/tinix-collage-design` chỉ trỏ tới file quy tắc.

**Kit mở rộng + mẫu "Little One" (2026-11-17):** `collage-kit.mjs` thêm khung/ảnh nghiêng (`rot` của `slot`/`hero`), `patternBackground`, `label` (ribbon/tag/torn/stitch), `themeSticker` (cake/camera/arrow), viền mực `edge` cho `dieText`. Mẫu thử `scripts/tinix-build-little-one.mjs` (nền pastel chấm, ảnh màu, 3 ảnh tách nền, chữ ONE ghép + Happy Days, 5 nhãn). Dựng: `node scripts/tinix-build-little-one.mjs --output FILE`. Xuất cắt không cảnh báo.

## Dựng theo ảnh mẫu bằng spec bố cục + ảnh chồng (2026-11-19)

Dùng khi cần trang giống ảnh mẫu (tranh minh họa có nhiều chồng lấn) mà **không** cắt pixel của ảnh mẫu. Ví dụ: `scripts/tinix-build-tet-svg.mjs` + `scripts/specs/tet-yeu-thuong.json`.

1. **Đo một lần thành spec JSON** (`ref`, `items[]`: `id`, `type`, `box:[x,y,w,h]` chưa xoay theo điểm ảnh ảnh mẫu, `rot`, `z`). Dùng `reference grid` để đọc tọa độ; vẽ khung bao của spec đè lên ảnh mẫu để kiểm phép đo **trước** khi dựng. Chiều xoay: dương = thuận chiều kim đồng hồ; đo cạnh trên/dưới của khung, đừng đoán.
2. **Script dựng đọc spec**, xếp lớp đúng `z`, gắn `specId` cho lớp chính của từng mục. Không viết cứng tọa độ trong code; sửa vị trí = sửa spec.
3. **Kiểm bằng máy, không bằng mắt**: `node scripts/tinix-cli.mjs reference check-layout --input DRAFT --spec SPEC` (vị trí, cỡ, góc, thứ tự lớp; mục `specCenterOnly`/`specSkip` chỉ so tâm hoặc bỏ qua) và `reference overlay --reference REF --render PNG --output OUT [--mode blend|diff]` để xem chồng mờ. Chữ: so bằng ảnh chồng vì hộp lớp chữ khác hộp nét chữ.
4. **Hình trang trí tự vẽ SVG** (nguồn không bản quyền): art vẽ theo tọa độ ảnh mẫu, co đều vào hộp spec (`decoBox`), chừa đệm cho viền trắng, **cắt theo mép trang** nếu chạm mép (tránh cảnh báo "vượt mép"). Lớp ảnh phải gán `rotate` dạng chuỗi `"Ndeg"`; truyền qua `place(..., {rotate})` bị bỏ qua.
5. **Nền giấy xé**: các mảng giấy `paper` z thấp vẽ chung một lớp nền in (viền gợn bằng điểm lệch ngẫu nhiên hạt giống cố định, vân giấy bằng `feTurbulence`, loang màu tần số thấp); mảng giấy z cao (đám kem sau chữ) là mảnh dán riêng.
6. Nhãn kiểu `cloud` (siêu elip có múi) trong `collage-kit` cho nhãn dạng mây.

## Thiết kế lưu thành tệp trên máy (.tinix.zip) — không quản lý đơn (2026-11-19)
Người dùng tự lưu mỗi thiết kế theo tên khách trong thư mục máy tính, nên bỏ luồng "Tạo đơn khách" và lưu CSDL.
- **Dùng mẫu**: tab Cắt dán → "Dùng mẫu này" mở thẳng mẫu lên canvas (`openTemplateOnCanvas`), hỏi nếu trang đang mở có thay đổi chưa lưu. Thay ảnh/chữ ngay trên canvas. Mẫu có "chủ thể tách nền" vẫn dùng tab "Cách cũ" (Sửa chủ thể trên trang).
- **Lưu về máy** (nút trên thanh, Ctrl+S, menu Tệp): `src/utils/tinix/design-file.ts` đóng gói `design.json` + mọi ảnh `/static/...` (trừ font) thành ZIP không nén (`zip.ts`). Chrome/Edge dùng File System Access: lần đầu hỏi nơi lưu, lần sau ghi đè đúng tệp; trình duyệt khác tải file xuống. Mở tệp: `unzip.ts` đọc ZIP, `POST /api/tinix/local-assets/missing` + `PUT /api/tinix/local-asset?path=` (`service/src/tinix/localDesign.ts`) ghi lại ảnh còn thiếu **đúng đường dẫn cũ** nên không cần sửa URL. Font không nằm trong tệp: mở xong báo font thiếu.
- "Thay đổi chưa lưu" so theo lịch sử hoàn tác (không so JSON: editor tự chuẩn hóa dữ liệu sau khi nạp). Bản nháp tự động mỗi 30 giây vào IndexedDB (`tinix-drafts`), hỏi khôi phục khi mở app; xóa khi lưu về máy.
- **Xuất ảnh không ghi CSDL**: `POST /api/tinix/export-render` (`collagePrint.ts`) nhận bố cục đang mở, dựng bằng Puppeteer qua job `exportJob` + `relaxed=1` (ảnh gốc, nhưng không chặn khi chữ tràn), trả PNG/JPG kèm DPI. Dùng cho Xuất JPG để in, Tải ảnh xuống (trang có mặt nạ/SVG), Xuất nhiều trang. Riêng "Xuất bộ JPG cắt dán" (PrintBundle) vẫn cần bản lưu CSDL (`saveToDb`).
- Ẩn nút "Đơn cắt dán" và "Bản khách đã duyệt" khỏi thanh trên (mã `CustomerOrders.vue`, `ApprovedPrints.vue` giữ nguyên). **Lưu ý**: "Xóa ảnh chưa dùng" chỉ giữ ảnh của thiết kế/mẫu trong CSDL, nên ảnh chỉ nằm trong tệp .tinix.zip có thể bị xóa; mở lại tệp sẽ ghi ảnh về.
- Sửa file gốc (đánh dấu `[TINIX]`): `HeaderOptions.vue`, `Index.vue`, `Folder.vue`, `service/src/utils/download-single.ts` (`relaxed=1`), `service/src/utils/timeout.ts`, `service/src/main.ts`.

## Phóng to / xoay ảnh trong khung ảnh (2026-11-19)
Khung ảnh `fit: 'cover'` trước chỉ kéo ảnh (cropX/cropY) và có thanh phóng 1–3×. Nay có thêm:
- (Cách lăn chuột ban đầu đã bỏ — xem mục "Chế độ chỉnh ảnh trong khung".)
- Panel "Căn ảnh và khung": thanh phóng tới 5×, thanh **Xoay ảnh** (−180°…180°), nút xoay trái/phải 90°, "Vừa khung" đặt lại cả xoay.
- Dữ liệu: trường `imgRotate` (độ) trên lớp ảnh; xoay quanh **tâm khung**, áp sau phép phóng quanh điểm căn nên `imgRotate = 0` giống hệt cách cũ. Khi xoay, ảnh được vẽ ở cỡ phủ khung (`RotatedCover.vue`) để phần ảnh thừa hiện ra, và mức phóng tự nâng tới mức đủ phủ khung (`coverMinZoom` trong `src/utils/tinix/photo-frame.ts`); căn sát mép ảnh khi đang xoay vẫn có thể lộ nền — dùng "Căn giữa ảnh". Kéo ảnh khi đã xoay đi theo con trỏ (`unrotateDelta`).
- Xuất ảnh (Chromium của service) dùng cùng thành phần nên khớp canvas. Chưa hỗ trợ: ảnh xem trước thẻ mẫu (`CollagePreviewNode`) và xuất PSD bỏ qua xoay/phóng ảnh trong khung (như vốn bỏ qua phóng).
- Sửa file gốc (`[TINIX]`): `wImage.vue`, `ImageSurface.vue`, `wImageSetting.ts`, `store/design/widget/index.ts`.

## Chế độ chỉnh ảnh trong khung (2026-11-19)
Lăn chuột khó dùng nên thay bằng tay nắm riêng của ảnh, tách hẳn khỏi tay nắm của khung:
- **Bình thường**: kéo khung = di chuyển khung (bỏ hai nút "Căn ảnh / Di chuyển khung"; trường `frameDragMode` còn trong dữ liệu cũ nhưng không dùng). Khung trong cụm: nhấp chọn cả cụm như trước.
- **Nhấp đúp** vào khung (hoặc nút "Chỉnh ảnh trong khung" trên panel) → `PhotoEditOverlay.vue` (gắn trong `designBoard/index.vue`, trên mọi lớp): khung đứng yên với viền đứt, cả tấm ảnh hiện mờ 40% kể cả phần ngoài khung, viền + 4 tay nắm **màu cam ở góc tấm ảnh**. Kéo ảnh = di chuyển, kéo góc = phóng/thu (giữ góc đối diện), kéo nút tròn dưới khung = xoay quanh tâm khung (Shift: bước 15°, tự hút về 0/90/180° trong 2°). Mũi tên dịch ảnh 1 px (Shift 10 px). Thanh nhỏ trên khung hiện mức phóng/góc và nút **Xong**.
- Thoát: nhấp trên canvas ngoài ảnh, Enter, Esc, "Xong", hoặc đổi đối tượng/trang. Khung trong cụm: thoát xong chọn lại cả cụm (kéo một khung con đang được chọn làm cụm nhảy sai chỗ — lỗi có sẵn của editor). Panel bên phải vẫn dùng được trong lúc chỉnh. Mỗi lần kéo là một bước hoàn tác.
- Không cho lộ nền khung: không xoay → điểm căn kẹp trong 0–100%; đã xoay → kéo/thu bị chặn ở vị trí cuối còn phủ kín (`coversFrame`), còn xoay/kéo thanh phóng thì phóng thêm **quanh tâm khung** tới mức nhỏ nhất đủ phủ (`liftToCover`, tìm nhị phân). Phóng quanh điểm căn không đủ khi điểm căn ở mép ảnh (0/100%) — trước đó xoay ở trạng thái này nhảy thẳng lên 3–5×.
- Hình học (`photo-frame.ts`): ảnh đã phóng, chưa xoay có góc trên-trái `x = cropX·(w − z·sw)` (`imageRect`), nghịch đảo là `cropForTopLeft`; con trỏ → hệ khung (bỏ xoay khung quanh tâm phần tử trên màn hình) → hệ ảnh (bỏ `imgRotate` quanh tâm khung).
- Sửa file gốc (`[TINIX]`): `Moveable.vue` (dragStart: chỉ chặn kéo khung khi đang chỉnh ảnh), `designBoard/index.vue` (gắn overlay), `wImage.vue` (nhấp đúp; bỏ lăn chuột và kéo-để-căn).
- Chưa làm: khung lật (`flip`) — overlay không lật theo, kéo ảnh sẽ ngược chiều.

## Gọn nút Lưu/Xuất (2026-11-19)
Thanh trên chỉ còn **Lưu** (ra tệp `.tinix.zip`, Ctrl+S; cạnh ô tên có chỉ báo "Đã lưu / ● Chưa lưu" lấy từ `isDirty()` — `savedSignature` nay là `ref`) và **Xuất**. Bỏ các nút Tải ảnh xuống / Xuất JPG để in / Xuất nhiều trang / Xuất PSD / Xuất bộ JPG cắt dán và mục "Thước & đường gióng" trong menu Tệp (thước đã có trên thanh thước của canvas).
- `src/views/components/ExportDialog.vue`: hộp thoại Xuất duy nhất. Định dạng JPG để in (mặc định, nhớ lựa chọn lần trước ở `localStorage['tinix-export-prefs']`) · PNG · PSD · Bộ tờ in cắt dán (chỉ trang cắt dán; đóng hộp thoại rồi mở `PrintBundle` qua `ref.open()`). Trang: đang mở hoặc chọn nhiều (gói ZIP). Chất lượng: đủ độ phân giải / 50%. PNG một trang 100% vẫn dùng đường nhanh `HeaderOptions.download()`. JPG qua `renderPageOnServer(…,'jpg')` (chất lượng 100, 4:4:4) rồi thu nhỏ bằng canvas nếu chọn 50%.
- Sửa file gốc (`[TINIX]`): `views/Index.vue`, `views/components/HeaderOptions.vue`, `views/components/Folder.vue`, `PrintBundle.vue` (bỏ nút riêng, thêm `defineExpose({open})`).

## Dự án = thiết kế + ảnh của khách (2026-11-19)
Menu **Tệp** dùng ngôn ngữ dự án: Dự án mới… · Mở dự án… · Mở gần đây · Lưu dự án · Lưu thành bản khác… · Lưu đè mẫu / Lưu thành mẫu mới · Xuất… (xem "Gom lệnh lưu mẫu vào menu Tệp"). "Dự án mới" vẫn mở tab mới với trang trắng; tên dự án là ô tên ở thanh trên (gợi ý tên khách), cũng là tên tệp `.tinix.zip` khi lưu.
- **Ảnh theo dự án**: `src/utils/tinix/project.ts` (`project.paths` = đường dẫn ảnh gốc `/static/photos/…`; `stripScope`). Dải ảnh có hai chế độ **Ảnh dự án (n)** (mặc định) / **Kho chung (m)**. Ảnh thuộc dự án khi: tải lên lúc dự án đang mở (kể cả ảnh trùng đã có trong kho), đang nằm trên canvas, hoặc "Thêm vào dự án" từ kho chung. Mở dự án/mẫu mới ⇒ `resetProject()` (dải ảnh trống, có nút "Mở kho chung"). Kho ảnh (bảng `user_images`) vẫn dùng chung; ảnh ★ và sticker/chất liệu dùng chung mọi dự án.
- **Tệp .tinix.zip phiên bản 2**: `design.json` có thêm `project.photos` (url/web/thumb/hash/kích thước/tên/ngày chụp) và `assets/static/photos/…` gồm **cả ảnh chưa dùng** (original + web + thumb). Tệp phiên bản 1 vẫn mở được (ảnh trên canvas trở thành ảnh dự án).
- Mở tệp: ghi lại ảnh thiếu (`PUT /api/tinix/local-asset`) rồi `POST /api/tinix/photos/import` (`importPhoto` trong `service/src/tinix/photos/core.ts`: chỉ nhận `/static/photos/<tên>.<đuôi ảnh>`, tệp phải tồn tại, không tạo trùng theo hash/đường dẫn) để ảnh hiện lại trong dải ảnh trên máy khác.
- **Gần đây**: handle tệp (File System Access) lưu ở IndexedDB `tinix-recent` (tối đa 8); mở lại hỏi cấp quyền; tệp đã bị xóa/di chuyển ⇒ báo và gỡ khỏi danh sách. Bản nháp tự động (`tinix-drafts`) lưu thêm `paths`.
- Chưa làm: tùy chọn "bỏ ảnh chưa dùng khi lưu" (tệp dự án chứa mọi ảnh khách đã nhập, có thể nặng); danh sách ảnh dự án không tự đồng bộ giữa hai tab đang mở cùng lúc.

## Gộp tab "Mẫu" và "Cắt dán" (2026-11-18)
- Chỉ gộp ở giao diện; hai bảng DB (`templates`, `collage_templates`) giữ nguyên. Tab "Cắt dán" đã bỏ khỏi `WidgetClassifyList.ts`.
- `TempListWrap.vue` [TINIX]: thanh lọc loại (Tất cả / Cắt dán / Thiết kế thường); mẫu cắt dán (`TemplateLibrary`, tải một lần) xếp trước lưới mẫu thường (phân trang). Mẫu cắt dán không có nhóm/số ảnh nên ẩn khi đang lọc theo nhóm hoặc số ảnh. Ô tìm kiếm của tab Mẫu lọc cả hai (`TemplateLibrary` nhận prop `search`).
- Trên trang cắt dán (`dPage.collage`), đầu tab Mẫu hiện `PrintGroups` (Cụm in và cắt nổi).
- Thẻ mẫu cắt dán có nhãn "Cắt dán"; menu ⋯ thêm **Đổi tên / danh mục** (`PATCH /api/tinix/collage-templates/:id`, không tạo phiên bản) và **Xóa mẫu** (`DELETE …/:id`, xóa cả `collage_template_versions`).

## Nhóm chủ đề dùng chung cho mẫu thường và mẫu cắt dán (2026-11-18)
- **Loại** (Cắt dán / Thường) là thuộc tính cố định, chọn ở thanh lọc loại (nhớ lựa chọn trong `localStorage` `tinix.templateType`). **Nhóm chủ đề** (`template_categories` type 0) dùng chung cho cả hai loại.
- `service/src/tinix/collageGroups.ts` (`ensureCollageSchema`, gọi trong `migrate.ts` và trước mỗi truy vấn): bảng `collage_template_group_links`, cột `collage_templates.photo_slots` (số lớp ảnh `slot`), `used_at` ở cả `templates` và `collage_templates`, `template_categories.hidden`. Lần đầu tạo bảng liên kết: danh mục cũ `collage_templates.category` được chuyển thành nhóm cùng tên (tạo nhóm nếu chưa có, so tên bằng `groupKey`). Cột `category` vẫn giữ; mẫu mới lưu kèm `category` (CLI) tự gắn nhóm cùng tên.
- Số đếm: `design/template/categories` và `design/template/photo-counts` nhận `kind` = all | collage | normal (mặc định `normal`, trang quản trị không đổi). `templateGroups.ts` [TINIX]: cộng số mẫu cắt dán, `groupUsage`/`deleteGroupDetach` tính cả liên kết mẫu cắt dán.
- Nhóm ẩn: menu ⋯ của nhóm → Ẩn nhóm (`POST /api/tinix/template-categories/:id/hidden`). Mẫu chỉ thuộc nhóm ẩn không hiện và không được đếm ở "Tất cả" (`visibleCondition`, thêm vào `baseConditions` của `db/templates.ts` [TINIX]); vẫn xem được khi chọn đúng nhóm. Thanh nhóm có nút "Xem nhóm ẩn (n)".
- Dùng gần đây: `POST /api/tinix/template-used {kind,id}` khi bấm dùng mẫu; danh sách mẫu thường `ORDER BY used_at DESC, id DESC` (`db/templates.ts` [TINIX]), mẫu cắt dán `used_at, updated_at`.
- Thẻ mẫu cắt dán: dòng phụ hiện tên nhóm; menu ⋯ có **Nhóm…** (`PUT …/:id/groups`), **Lịch sử phiên bản…** (`GET …/:id/versions`, mở phiên bản cũ lên trang, không sửa ngược), **Đổi tên…** (chỉ tên).
- (2026-11-18) Thẻ mẫu cắt dán trình bày giống mẫu thường: chỉ ảnh xem trước (xếp cột kiểu masonry), bấm ảnh để dùng, nhãn "Cắt dán" và "n ảnh", menu ⋯ hiện khi rê chuột; bỏ nút "Dùng mẫu này" và dòng tên/phiên bản (xem trong tooltip). `PrintGroups.vue` [TINIX] mặc định thu gọn, bấm tiêu đề (kèm số cụm) để mở; thu gọn lại thì bỏ chọn cụm và tắt "nền sạch".

## Bỏ liên kết "Mã nguồn" ở thanh trái (2026-11-18)
- Gỡ liên kết GitHub "Mã nguồn" dưới thanh trái trong `widgetPanel.vue` [TINIX] và CSS `.github` đi kèm. Các liên kết khác tới repo gốc (trong `Helper.vue`, `Moveable.vue`) giữ nguyên.

## Bỏ tab "Của tôi" (2026-11-18)
- Đã gỡ mục `Của tôi` (`user-wrap`) khỏi `WidgetClassifyList.ts` [TINIX]; thanh trái còn Mẫu, Chất liệu, Chữ, Ảnh, Công cụ. Lý do: tab con "Tài nguyên" chỉ là lời nhắc về dải ảnh; "Thiết kế của tôi" là chỗ lưu thứ ba (DB) trong khi thiết kế lưu bằng tệp `.tinix.zip` + danh sách dự án gần đây.
- Giữ nguyên `UserWrap.vue`, API thiết kế và bảng `designs` (dữ liệu cũ, công cụ dòng lệnh còn dùng). Muốn mở lại: thêm lại mục vào `WidgetClassifyList.ts`.

## Bỏ tab "Công cụ" + chọn model tách nền (2026-11-18)
- Đã gỡ tab `Công cụ` (`tools-list-wrap`) khỏi `WidgetClassifyList.ts` và dòng nhảy tới tab này khi có `?koutu` ở `widgetPanel.vue` [TINIX]. Thanh trái còn Mẫu, Chất liệu, Chữ, Ảnh. Nút tách nền vẫn ở thanh thuộc tính khi chọn ảnh ("Xóa nền"). Mã QR không còn lối vào giao diện (file `ToolsListWrap.vue` và widget `wQrcode` giữ nguyên; muốn mở lại thì thêm mục vào `WidgetClassifyList.ts`).
- Cửa sổ "Xóa nền bằng AI" (`ImageCutout/index.vue`, `method.ts` [TINIX]) có ô **Model tách nền**: *Chất lượng cao · BiRefNet* (mặc định; GPU local qua `POST /api/tinix/cutout/birefnet`) hoặc *Nhanh · U²-Net* (rembg-web trong trình duyệt). Lựa chọn nhớ ở `localStorage` `tinix.cutoutEngine`; đổi model khi đã có ảnh thì tách lại. BiRefNet lỗi (service tắt, chưa cài model, bận) → báo và tự dùng U²-Net. Mã dùng chung: `src/utils/tinix/cutout-engine.ts`.

## Viền trắng hình dán bám theo người (2026-11-18)
- **Vì sao điểm ảnh thật:** `collage-print.ts` bỏ viền giả khi dựng tờ cắt (`effects.border/shadow` về 0, xóa `cutoutBorderUrl`) và đường cắt laser (`cutPaths.ts`) dò từ phần trong suốt của lớp ảnh rồi lùi `cutInset`. Nên viền trắng phải nằm trong chính PNG của lớp ảnh, kèm `cutInset = nửa bề dày viền` (px trang) và `printInset` = đệm trong suốt ngoài viền.
- `src/utils/tinix/sticker-border.ts`: dựng PNG có viền bằng canvas trong trình duyệt — cắt theo khung người (alpha), nở đường bao theo hình tròn (vòng offset), làm mượt (mờ + ngưỡng), lấp lỗ kín nhỏ; dựng mặt nạ ở tối đa ~1500 px rồi phóng lên khổ đầy đủ. Không cần service.
- `src/utils/tinix/sticker-apply.ts`: `applyStickerBorder(image, mm, dpi)` tải ảnh chưa viền (`image.stickerBorder.baseUrl`, giữ lại để đổi bề dày không mất chất lượng), dựng PNG mới, tải lên (`api.material.upload`), đổi `imgUrl` + hộp lớp sao cho người đứng nguyên chỗ (tính cả xoay/đổi cỡ), đặt `cutInset`/`printInset`. `mm = 0` khôi phục ảnh và hộp gốc. Khóa bỏ đi được gán `undefined` (không `delete`: lớp đang chọn là bản sao, khóa xóa không lan về kho dữ liệu). Không dùng cho khung ảnh `fit: 'cover'`.
- UI: `StickerBorderPanel.vue` (thanh "Bề dày viền 0–8 mm" trong bảng thuộc tính ảnh, ghi lịch sử hoàn tác) và ô "Viền trắng hình dán (mm)" trong cửa sổ Xóa nền (nhớ ở `localStorage` `tinix.stickerBorderMm`; áp ngay sau khi bấm Hoàn tất). `photo-source.ts` [TINIX] tính `stickerBorder.baseUrl` là tài nguyên của thiết kế (giữ khi dọn ảnh/sao lưu).
- Lưu ý: mỗi lần đổi bề dày tải lên một PNG mới; ảnh cũ không còn ai dùng dọn bằng "Xóa ảnh chưa dùng". Chưa chạy được bộ xuất cắt dán/laser trọn vẹn trên ảnh có viền (cần thiết kế đã lưu); đã kiểm tra `printUnits` đọc đúng `cutInset`/`printInset` và vị trí điểm ảnh người không đổi khi xoay 30°.

## Gom lệnh lưu mẫu vào menu Tệp (2026-11-18)
- Menu **Tệp** (`Folder.vue` [TINIX]): Dự án mới · Mở dự án · Mở gần đây · Lưu dự án · Lưu thành bản khác · **Lưu đè mẫu “tên”** (chỉ khi trang mở từ một mẫu, hỏi lại trước khi ghi) · **Lưu thành mẫu mới** · Thoát chế độ sửa mẫu (chỉ ở Quản trị → Sửa mẫu) · Xuất.
- `src/utils/tinix/template-save.ts`: `templateSource` nhớ mẫu đang mở (`kind` collage/normal, `id`, tên, `version`). Đặt ở `TemplateLibrary.useTemplate` (qua `openTemplateOnCanvas(…, source)`), `TempListWrap.selectItem` [TINIX] và `HeaderOptions.load` khi có `?tempid=` [TINIX]; `applyLayouts` (mở tệp/dự án) xóa đi. Lưu mới: loại mẫu theo mẫu đang mở, nếu không có thì theo `page.collage`; tên tự đặt "Mẫu <id>" phía service; đánh dấu vừa dùng để nằm đầu thư viện. Ở chế độ sửa mẫu, Lưu đè gọi `saveTemp` gốc (giữ đường lưu mẫu thành phần tempType 1).
- Thanh trên (`Index.vue`, `HeaderOptions.vue` [TINIX]): chỉ còn nút **Xuất**; bỏ nút Lưu (Ctrl+S vẫn lưu dự án) và cặp "Lưu mẫu / Hủy" của chế độ sửa mẫu. Bỏ hàm `saveAsTemplate` cũ trong `HeaderOptions`.
- Thư viện mẫu cắt dán (`TemplateLibrary.vue`): bỏ Làm mới, Lưu trang đang mở thành mẫu, Mở tệp, Lưu về máy, hộp thoại lưu (tên/nhóm/vai trò lớp — `templateRole` không còn nơi nào đọc; số khung ảnh tính từ `slot`), Lưu thành phiên bản mới, Nhân bản từ trang, Lịch sử phiên bản. Menu ⋯ còn Đổi tên, Nhóm, Xóa.
- Service: `POST /api/tinix/collage-templates` không bắt buộc tên (mới → "Mẫu <id>", lưu đè → giữ tên cũ), `version` không bắt buộc khi lưu đè; mỗi lần lưu vẫn ghi `collage_template_versions` nhưng chỉ giữ **1 bản mới nhất** (`KEEP_VERSIONS=1`, xem mục "Mẫu cắt dán chỉ giữ 1 phiên bản"). `service/src/service/admin.ts` [TINIX]: mẫu thường mới không tên → "Mẫu <id>".

## Sửa mẫu cắt dán giống mẫu thường (2026-11-18)
- Thẻ mẫu cắt dán dùng cùng bộ nút với thẻ mẫu thường (hiện khi rê chuột): **Sửa · Nhóm · Xóa**; bỏ menu ⋯ và hộp đổi tên (đổi tên = sửa ô tên ở thanh trên rồi Lưu đè). Nhãn "Cắt dán" ẩn khi rê chuột để khỏi đè lên nút.
- **Sửa** mở tab mới `/home?ctemplate=<id>&edit=1` (chế độ Sửa mẫu: bảng Layer có "Đánh dấu khung ảnh", ô "Vai trò ảnh", trạng thái khung ảnh). `HeaderOptions.load` [TINIX] nạp mẫu bằng `GET /api/tinix/collage-templates/:id` (route mới) rồi `applyLayouts`; `Index.vue` [TINIX] không hỏi khôi phục bản nháp khi có `ctemplate`. Tên mẫu = ô tên thanh trên.
- **Tệp → Lưu đè mẫu** (và Ctrl+S) chỉ có khi đang ở chế độ Sửa mẫu → hết nguy cơ ghi đè mẫu bằng ảnh khách khi chỉ bấm dùng mẫu; không còn hộp xác nhận. Mẫu cắt dán: `overwriteCollageTemplate(name)` (`template-save.ts`); mẫu thường: `saveTemp` gốc. Khi chỉ dùng mẫu, menu chỉ có "Lưu thành mẫu mới".
- Lưu mẫu xong ghi `localStorage['tinix.templatesChangedAt']`; `TemplateLibrary` và `TempListWrap` nghe sự kiện `storage` để tab thư viện tự tải lại (không còn nút Làm mới).
- Số khung ảnh (`photo_slots`) tính từ cờ `slot` của lớp ảnh: chỉ đặt được ở chế độ Sửa mẫu. Mẫu mới tạo từ trang chưa đánh dấu khung sẽ có 0 khung ảnh cho đến khi Sửa.

## Mẫu cắt dán chỉ giữ 1 phiên bản (2026-11-18)
- `KEEP_VERSIONS = 1` (`service/src/tinix/collageTemplates.ts`): mỗi lần lưu mẫu cắt dán vẫn ghi `collage_template_versions` nhưng xóa mọi bản cũ hơn, chỉ còn bản mới nhất (cũng là bản trong `collage_templates`). Bỏ route `GET /api/tinix/collage-templates/:id/versions` (giao diện lịch sử đã bỏ từ trước). Mẫu cũ còn nhiều phiên bản sẽ được dọn ở lần lưu kế tiếp. Bản sao lưu hằng ngày (`tinix:backup`) là chỗ khôi phục duy nhất khi lỡ ghi đè.

## Sửa lỗi: dùng mẫu/mở tệp không thoát chế độ Sửa mẫu (2026-11-18)
- `applyLayouts` (`design-file.ts`) giờ gọi `managerEdit(false)` và bỏ `ctemplate`/`edit` khỏi địa chỉ, trừ khi `keepTemplateEdit` (chỉ `HeaderOptions.load` truyền `true` khi tab Sửa mẫu tự nạp mẫu cần sửa). Lỗi cũ: ở tab đang Sửa mẫu, bấm dùng một mẫu cắt dán khác (hoặc mở tệp/dự án gần đây/khôi phục bản nháp) vẫn giữ chế độ Sửa, nên menu Tệp còn "Lưu đè mẫu" và lưu đè nhầm vào mẫu đã sửa trước đó (mẫu thường đã được `TempListWrap.selectItem` thoát chế độ Sửa từ trước).
- Cũng sửa 2 lỗi lint của `extractAssets.ts` / `ExtractAssetsDialog.vue` (code vừa merge vào main làm `npm run lint` hết sạch lỗi) để giữ 0 lỗi.

## Mẫu chỉ lưu bố cục, bỏ nút Sửa (2026-11-18)
- `src/utils/tinix/template-sanitize.ts`: khi lưu mẫu (Lưu đè / Lưu thành mẫu mới, cả mẫu thường lẫn cắt dán), mỗi lớp ảnh dùng **ảnh tải lên** (`/static/photos`, `/static/user`, `/static/cutouts`, `blob:`; xét cả `origin.original`, `stickerBorder.baseUrl`, `cutoutBorderUrl`) giữ nguyên vị trí/kích thước/góc xoay/khung/hiệu ứng nhưng đổi ảnh thành **ảnh giữ chỗ SVG nhúng** (không tạo tệp), `fit:'cover'`, `slot:true`:
  - ảnh thường → khung ảnh (ô xám, biểu tượng ảnh), `templateRole:'photo'`;
  - ảnh tách nền (có `stickerBorder`/`cutoutEdit`/`cutoutBorderUrl` hoặc nằm ở `/static/cutouts`) → khung tách nền (viền nét đứt, biểu tượng người, chữ "Tách nền · viền n mm"), `templateRole:'subject'`, `templateBorderMm` = bề dày viền cũ. Viền/ảnh tách nền cũ không vào mẫu → "Xóa ảnh chưa dùng" dọn được.
  - Bỏ `origin`, `stickerBorder`, `cutoutEdit`, `cutoutBorderUrl`, `cutInset`, `printInset`, `imgRotate`, `cropEdit`; nền liên kết (`linkedPhotoId`) cũng thành ảnh giữ chỗ nhưng không thành khung riêng; ảnh nền trang tải lên bị bỏ.
  - Giữ nguyên ảnh thư viện: `/static/template`, `/static/collage`, `/static/materials`, `/static/favorites` (★), `/static/ai`, `data:`, URL ngoài.
  - Chỉ đổi bản sao dữ liệu đem lưu; trang trên canvas không đổi. Thông báo sau khi lưu ghi số ảnh đã để trống.
- Bỏ nút **Sửa** trên thẻ mẫu (thường + cắt dán) và tab `?ctemplate=…&edit=1`; thẻ còn Nhóm · Xóa. Trang mở từ một mẫu luôn có **Tệp → Lưu đè mẫu** (tên = ô tên thanh trên), không hỏi lại vì ảnh khách không thể lọt vào mẫu. Ctrl+S vẫn là Lưu dự án.
- Công cụ đánh dấu khung ảnh luôn hiện: `layerList.vue` [TINIX] (ô chọn + "Đánh dấu khung ảnh"), `ImageFramePanel.vue` (Vai trò ảnh); `TemplatePhotoStatus.vue` hiện khi trang mở từ một mẫu.
- Quản trị → Sửa (`Admin.vue`, `?tempid&edit=1`) vẫn giữ: mẫu thành phần (tempType 1) lưu bằng `saveTemp` gốc; mẫu thường lưu qua `overwriteTemplate` (đã làm sạch).
- Mẫu có sẵn đang chứa ảnh `/static/photos` (21 mẫu cắt dán, 3 mẫu thường lúc triển khai) không bị đổi cho tới lần Lưu đè kế tiếp.
- (2026-11-19) Sửa: hình người tách nền do công cụ dòng lệnh dựng (`kit.hero`, tệp `/static/collage/<mẫu>/hero-*.png`, viền trắng gộp sẵn, có `cutInset`) nằm trong thư mục ảnh mẫu nên trước đây bị coi là ảnh thư viện và không thành khung tách nền. Nay `isCliHeroUrl` nhận theo tên tệp `hero-` (không dựa vào `cutInset` vì vài script đặt `cutInset` cho ruy băng/nhãn trang trí); bề dày viền suy từ `cutInset × 2` theo DPI trang. Lúc sửa có 52 lớp như vậy ở 19 mẫu cắt dán; chúng thành khung tách nền ở lần Lưu đè kế tiếp.

## Khung tách nền tự tách nền + thêm viền (2026-11-19)
- `src/utils/tinix/subject-fill.ts`: lớp ảnh có `templateRole:'subject'` (khung tách nền) nhận ảnh → tách nền (model đang chọn ở cửa sổ Xóa nền; BiRefNet lỗi thì U²-Net trong trình duyệt), cắt sát vùng có người (alpha), tải lên, đặt vừa hộp khung trừ phần viền — chân chạm đáy khung, giữa theo chiều ngang, tính cả góc xoay — rồi `applyStickerBorder` với `templateBorderMm`. Hộp khung gốc nhớ ở `subjectFrame` để lần thay ảnh sau đặt đúng chỗ. Lỗi thì giữ ảnh vừa thả và báo.
- Nối vào: thả một ảnh lên khung (`designBoard/index.vue` [TINIX]), **Thay ảnh** (`wImageStyle.vue` [TINIX] `selectDone`), Tự áp dụng mẫu / áp mẫu nhiều ảnh (`photo-place.ts` `applyTemplateToPage`, chạy lần lượt từng khung sau khi dựng trang). Chưa nối: "Đổi bố cục" (`changePagePhotos`) vì đường này lấy khung của mẫu khác.
- Mục **Vai trò ảnh** (`ImageFramePanel.vue`) có thêm "Khung tách nền — tự tách nền + thêm viền" và ô "Viền trắng khi tự tách nền (mm)"; `photoRole` (`template-photo.ts`) trả `'subject'`. Biến ảnh thư viện thành khung tách nền bằng cách này.
- Đo thử (BiRefNet GPU, ảnh 3 người 850×1250): lần đầu ~33 giây (nạp model), lần sau ~4 giây.
- Kèm: sửa 2 lỗi lint `no-void` trong `extractAssets.ts` (code mới vào main).

## Đổi màu chính ảnh PNG + hình phẳng của bộ dựng thành SVG (2026-11-19)
- **Đổi màu chính** (bảng thuộc tính ảnh, `ImageRecolorPanel.vue`; nối ở `wImageStyle.vue` [TINIX]): chọn một màu trong bảng màu của ảnh → màu mới → độ rộng màu (0–100) → Áp dụng; "Khôi phục màu gốc". Chỉ hiện với lớp ảnh trang trí (không phải khung đặt ảnh người dùng `slot`, không phải nền liên kết).
- `src/utils/tinix/image-recolor.ts`: hàm thuần `paletteFromPixels` (bỏ điểm trung tính: viền giấy, bóng) và `recolorPixels` (màu nguồn có sắc → so theo sắc độ; trung tính → theo khoảng cách RGB; giữ sáng tối tương đối; đo "trung tính" bằng chroma, KHÔNG bằng độ bão hòa HSL — điểm trắng ngả vàng có bão hòa HSL ~1 và từng bị đổi màu nhầm). Kiểm thử: `scripts/tinix-recolor-test.cjs` (trong `tinix:test`).
- `src/utils/tinix/recolor-apply.ts`: luôn đổi từ ảnh gốc `image.recolor.originalUrl` (không giảm chất lượng khi đổi nhiều lần); ảnh có viền hình dán thì đổi `stickerBorder.baseUrl` rồi dựng lại viền, nên chỉnh bề dày viền sau đó vẫn giữ màu mới. Mỗi lần áp dụng tải lên một PNG mới (`api.material.upload`); `photo-source.ts` [TINIX] tính `recolor.originalUrl` là tài nguyên đang dùng.
- Ảnh ở máy chủ khác không cho đọc điểm ảnh (CORS) thì bảng màu trống và báo "không có vùng màu rõ để đổi".
- **Xem trước tức thì** (2026-11-19): bỏ nút Áp dụng. Đang kéo trong bảng màu/thanh độ rộng (`input`) → dựng ảnh thu nhỏ ≤ 400 px, gán tạm `imgUrl` = data URL + `updateDWidgets()` (lớp đang chọn là bản sao), không tải lên, không ghi lịch sử; đóng bảng màu/thả thanh trượt (`change`, `blur`) → trả `imgUrl` cũ rồi `applyRecolor` đầy đủ độ phân giải, một lần tải lên, một bước hoàn tác; rời bảng giữa chừng thì trả ảnh cũ. Dùng `toDataURL` (đồng bộ), không dùng `toBlob`: `toBlob` bị trình duyệt xếp lịch nền, đo ~1 giây mỗi khung trong khi tính màu chỉ ~2 ms. Đo: ~40–80 ms mỗi khung xem trước (400 px). Khóa của bảng chỉ theo `uuid` (không theo `imgUrl`, vì data URL tạm sẽ dựng lại bảng giữa chừng); bảng tự đọc lại màu khi ảnh gốc đổi.
- **Bộ dựng cắt dán** (quy tắc 4.12): `scripts/lib/svg-layer.mjs` (`tokenizeColors`, `uniqueIds`, `buildSvgMarkup`, `svgLayer`). `createCollageKit({ vector = true })`: `starSticker`, `heartSticker`, `paperShape`, nền của `label`, `themeSticker` thành lớp `w-svg`; `kit.vectorPlace(...)` cho script tự vẽ. `tinix-build-tet-svg.mjs` [TINIX] `decoBox`: mảnh không chạm mép trang thành SVG (giữ bộ lọc STICK), mảnh chạm mép vẫn PNG cắt theo mép trang. `vector: false` trả về PNG như cũ.
- Đổi id trong `<defs>` thành id riêng theo nội dung (`uniqueIds`): nhiều SVG nội tuyến trên một trang trùng id `sh` thì trình duyệt dùng chung bộ lọc đầu tiên (bóng sai vùng, bị cắt). Kiểm thử: `scripts/tinix-svg-layer-test.mjs`.
- Mẫu đã dựng trước đây vẫn là PNG; chỉ mẫu dựng lại/dựng mới mới có lớp SVG.
- Sửa lỗi gốc `wSvg.vue` / `wSvgStatic.vue` [TINIX] (`deepElement`): chỉ thay chỗ đặt màu ở 2 tầng phần tử đầu, hình lồng nhóm trong nhóm (sticker máy ảnh: `svg > g(scale) > g(bóng) > rect`) hiện màu đen. Nay duyệt hết các tầng. Thử trên app (editor nhánh, service 7001): 5 lớp SVG của bộ dựng hiện đúng màu, đổi màu sao giữ viền trắng; tim PNG đổi màu → khôi phục → hoàn tác/làm lại đúng.

## Tách phần tử: chữ kèm khung thành một mục Chữ (2026-11-19)
- `src/common/methods/extractAssets.ts`: lớp nằm trong **nhóm chữ** (nhóm có chữ, không chứa ảnh người dùng `slot`/`linkedPhotoId`) chỉ đi theo mục Chữ của nhóm, không bị tách riêng sang Hình ảnh/Khung/SVG. Chỉ lấy nhóm chữ ngoài cùng (nhóm con không thành mục lặp). Cụm ảnh người + chú thích giữ cách cũ (khung là chất liệu, ảnh người bỏ).
- Chữ rời nằm trên một hình rời ngay bên dưới (≥ 85% diện tích chữ nằm trong hình, hình ≤ 8 lần tổng diện tích chữ, không phải ảnh người dùng, không phủ kín trang, không phải khung mask) → tự gộp thành một mục Chữ, `source: 'onShape'`, hộp thoại gắn nhãn "Gợi ý · chữ trên khung". Nhiều dòng chữ trên cùng một khung gộp chung.
- Hộp tách: ô xem trước mục Chữ vẽ lại cả nhóm (`src/components/business/extract-assets/TextGroupPreview.vue`: ảnh, SVG đã thay màu, chữ thuần không dùng v-html; hiệu ứng viền chữ die-cut không vẽ).
- Đo trên 6 mẫu cắt dán thật (mẫu "Wander" và "Nhật ký hành trình"): mỗi nhãn còn một mục Chữ, bớt 2–6 khung bị tách thừa mỗi mẫu. Kiểm thử: `scripts/tinix-extract-assets-test.cjs` (7 trường hợp, trong `tinix:test`).

## Thư viện thành phần / chất liệu: sửa, lưu đè, xóa hẳn (2026-11-19)
- API `service/src/tinix/library.ts` (nối ở `main.ts` [TINIX]): thành phần (mẫu type=1) `GET /api/tinix/library/comp/:id`, `POST …/comp/save` (không id = tạo; có id = chỉ đổi trường được gửi: tên, danh mục, dữ liệu), `…/comp/duplicate`, `…/comp/delete` (**xóa hẳn** theo yêu cầu người dùng); chất liệu `…/material/create|update|delete` xác định theo **(danh mục, url)** chứ không theo vị trí (xóa một mục không làm lệch mục sau); `update` nhận `patch` (tên, loại, url, thumb, model) và `toCate` (chuyển danh mục). Xóa chất liệu giữ tệp ảnh.
- Ảnh bìa thành phần chụp lại sau mỗi lần lưu dữ liệu; trả `coverOk` để giao diện báo khi dịch vụ chụp ảnh không chạy (thay cho lỗi im lặng trước đây). `TINIX_LIBRARY_NO_COVER=1` tắt chụp (kiểm thử trên DB tạm không được gọi dịch vụ thật ở 7001 với id của DB khác).
- Nguồn gốc khi chèn: `libraryRef` ({kind:'comp', id} trên nhóm gốc; {kind:'material', cate, url} trên lớp ảnh/SVG) gắn ở `CompListWrap.vue` (bấm + kéo thả), `GraphListWrap.vue` (bấm) và `setWidgetData.ts` (kéo thả chất liệu) [TINIX].
- Lưu ngược (`src/utils/tinix/library-save.ts`, menu chuột phải → **Thư viện**, `RcMenu.vue` / `rcMenuData.ts` [TINIX]): "Lưu đè vào thư viện" (hỏi lại kèm ảnh bìa bản cũ) khi lớp có `libraryRef`; "Lưu thành mục mới" / "Lưu vào thư viện" (hỏi tên; danh mục theo mục gốc hoặc mặc định). Nhóm hoặc lớp có chữ → thành phần tab Chữ; một ảnh/SVG → chất liệu. Lưu xong lớp trỏ sang mục vừa lưu. Không ghi lịch sử hoàn tác (thao tác thư viện).
- Menu "⋯" trên từng ô của tab Chữ / Chất liệu (`src/components/business/library/LibraryItemMenu.vue`, `LibraryInfoDialog.vue`): Sửa thông tin (tên, danh mục, loại chất liệu), Nhân bản (thành phần, ảnh bìa riêng), Xóa hẳn (hỏi lại). Thư viện đổi → sự kiện `tinix:library-changed` → hai tab tải lại (tab Chữ xóa bộ nhớ đệm dữ liệu thành phần).
- Kiểm thử: `scripts/tinix-selftest/library.ts` (trong `tinix:test`). Thử trên editor với service của nhánh ở cổng 7002 (dùng chung dữ liệu thật, chỉ trên mục thử rồi xóa): chèn → sửa màu → lưu thành mục mới → lưu đè (ảnh bìa chụp lại đúng) → đổi tên → xóa hẳn; chất liệu: lưu vào thư viện → chuyển sang danh mục Khung kèm đổi loại → xóa (tệp ảnh còn).
- Khối **Thư viện** ở đầu bảng Thiết lập (`LibraryPanel.vue`, nối ở `stylePanel.vue` [TINIX]): cùng các lệnh của menu chuột phải → Thư viện, kèm tên mục gốc ("Chèn từ thư viện: …") để dễ tìm hơn menu chuột phải (người dùng tìm lệnh lưu trong menu Tệp mà không thấy).
