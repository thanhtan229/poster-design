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
