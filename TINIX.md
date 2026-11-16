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

Lệnh CLI/MCP dựng **bản nháp** mẫu cắt dán từ một ảnh chụp trang scrapbook thật: `reference grid`, `drafts from-reference`, `reference compare` (MCP: `reference_grid`, `draft_from_reference`, `reference_compare`). Không gọi AI trả phí. Cần app đang chạy (tải font, tách nền BiRefNet). Mã ở `scripts/lib/reference-build.mjs` và `scripts/lib/text-measure.mjs`; ví dụ spec ở `scripts/examples/smile-darling.spec.json` (chỉ có toạ độ và chữ, không có ảnh).

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

Toạ độ trong spec là **pixel của ảnh tham chiếu**. Spec sai hoặc font không có trong kho báo lỗi rõ (kèm gợi ý tên font gần giống) và không ghi tệp đầu ra.

### Kết quả trên trang "Smile, Darling" và các điều đã học

So với bản dựng thủ công bằng script, trên cùng ảnh mẫu (`--photos reference`): MAE 26,5 so với 28,5; sticker SSIM 0,82–0,87; "SAY CHEESE" 0,48 so với 0,39; chữ không còn tràn hay gãy dòng. Điểm yếu còn lại:

- **Toạ độ khung do người ước lượng**: hai khung ảnh lớn còn SSIM 0,52–0,54 (viền lệch vài pixel). Đã thử bước tự tinh chỉnh khung bằng leo đồi trên độ tương phản viền giấy: **làm kết quả tệ hơn** (SSIM toàn trang 0,652 → 0,599) nên đã gỡ bỏ. Dùng `reference compare` và bản đồ lệch để sửa spec bằng tay.
- **Font**: kho chỉ có `Amatic SC` bản mảnh nên "SMILE, DARLING" mảnh và cao hơn mẫu khi khớp theo bề rộng.
- **Nền**: chỉ dò được ~29 trái tim trong ~50 (tim bé hoặc bị khung che); tim bị che được vẽ trọn dưới khung nên không lộ.
- **SSIM phạt nặng chữ lệch vài pixel** (vùng chữ 0,23–0,48 dù nhìn bằng mắt khá gần); xem thêm ảnh cạnh nhau.
- Biểu tượng nhỏ trong nhãn (máy ảnh trên nhãn hồng) không được giữ: nhãn `cutout` chỉ lấy hình dạng và màu.
- Bóng đổ `effects.shadow` của ứng dụng vẽ theo **hình chữ nhật** của lớp, nên chỉ đặt cho lớp chữ nhật thật (giấy khung, nhãn `rect`); ruy băng đuôi én, nhãn `cutout` và ảnh có mặt nạ không có bóng, nếu không sẽ lộ khối vuông.
- **`textInk` phải sát chữ**: nếu vùng này bao cả viền giấy hoặc nền tối, chiều cao mực bị thổi phồng và chữ nhiều dòng bị giãn dòng quá thưa (nhãn "Lời nhắn": 1,67 → 1,14 sau khi thu hẹp). Công cụ cảnh báo khi `lineHeight` đo được > 1,5.
- **Ảnh mẫu thứ hai ("Luna", khung ảnh bé, `scripts/examples/luna-frame.spec.json`)**: MAE toàn trang 57,2 → 45,7 sau các sửa dưới đây (ảnh giữ chỗ nên MAE cao là bình thường). Phát hiện: (1) nền là giấy hoa văn (dứa trên nền xanh ngọc) nên "auto" từng ra nâu đen vì chỉ lấy điểm tối → nay lấy trung vị khi điểm tối chỉ là viền/bóng (ra xanh xám, gần màu thật); **hoa văn nền vẫn chưa được tái tạo**; (2) BiRefNet cắt hụt sticker mềm/nhiều lớp (số "110", mây chữ bút lông) → thêm `keep: "box"` (+ `mask`); (3) khung viền kraft (nâu) bị lấy màu giấy ra hồng vì dải viền ăn vào ảnh bên trong; (4) chữ trắng trên nhãn màu hoạt động khi đặt `textColor`. Thứ tự lớp trong spec quyết định sticker nào đè nhãn nào.
- Đo chữ bằng Chromium cần trang cùng nguồn gốc với máy chủ Tinix (trang `about:blank` bị chặn tải font: `NetworkError`).

Kiểm thử offline `scripts/tinix-reference-build-test.mjs` (trong `npm run tinix:test`) dùng ảnh tổng hợp có đáp án biết trước, bộ tách nền và bộ đo chữ giả: duỗi thẳng khung xoay 10° (đo hướng gradient chủ đạo, có phép đối chứng không duỗi), đếm trái tim, màu giấy/nền/mực, vị trí sticker, cỡ chữ tự khớp và khung chữ không tràn, ảnh giữ chỗ, so sánh, kiểm tra spec. Phần Chromium, BiRefNet và font thật không chạy trong CI.
