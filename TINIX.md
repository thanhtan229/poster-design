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
