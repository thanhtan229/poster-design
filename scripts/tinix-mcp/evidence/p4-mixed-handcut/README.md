# P4 Mixed Handcut — bằng chứng fixture

Lượt thử tạo bốn demo từ một bộ bảy ảnh tổng hợp. SUBJECT dùng mask alpha riêng trong demo và bản ô caro. Bản trống tắt cả bảy, còn ZIP vật liệu giữ sáu khung thay ảnh và vùng SUBJECT độc lập. Không chạy bước nhập ZIP thành job.

[A–D, lần lượt demo, bản trống và ô caro](qa-contact.png) · [QA và SHA-256](result.json)

| Demo | Silhouette bất đối xứng | Polaroid | Tem và ticket | Notebook |
| --- | --- | --- | --- | --- |
| A | F01 và F03 | F02 | F04 và F05 | F06 |
| B | F02 và F06 | F01 | F03 và F04 | F05 |
| C | F01 và F05 | F06 | F02 và F03 | F04 |
| D | F04 và F06 | F05 | F01 và F02 | F03 |

- Mỗi demo có sáu lỗ alpha=0 kín theo liên thông tám hướng. Hai lòng silhouette có tỷ lệ lấp hộp khoảng 75% và 69%, và mức sai khác trên vùng hợp khoảng 16,6% sau khi thử căn xoay, lật và chuẩn hóa cỡ. Giá trị này phục vụ kiểm hình học, không dùng để chấm bố cục.
- Cả bốn tờ có 17 mảnh tại các ngưỡng alpha 1/8/16/24, khoảng hở hộp nguồn tối thiểu 22 px và ảnh dựng ngược từ JSON khớp pixel. Cả 28 sentinel đều thay được ảnh và có 0 pixel vượt mặt nạ.
- Dịch F03 của demo C để phần lòng còn thấy tăng từ 62,0% lên 80,1% với SUBJECT của fixture. Cả 28 vùng thay ảnh giữ ít nhất 75% mặt nạ trong bố cục fixture.
- Bộ kiểm hồi quy từ chối sprite duplicate đã xoay và đổi tỷ lệ, chữ nhật chỉ rung mép, lỗ alpha phụ và bộ thiếu Polaroid hoặc tem/ticket. Kiểm hợp đồng MCP từ chối visual pass khi source QA pass mà hình học fail.
- Pilot cũ `51d29bc5-6d52-4734-a22a-3a4e9961e027` vẫn ở `awaiting_demo`, chưa có job. SHA-256 của bốn ZIP cũ vẫn khớp với khóa đã lưu. Ảnh F06 trong bộ pilot có bóng số 3 cần đổi sang ảnh trung tính nếu tuổi chưa được xác nhận.

Chạy bộ kiểm và xuất đủ ảnh gốc, bản trống, ô caro, tờ RGBA, layout JSON, ZIP, QA và hash vào thư mục mới bằng `TINIX_MIXED_HANDCUT_EVIDENCE=<thư mục mới>` cùng lệnh `python -B scripts/tinix-mcp/mixed_handcut_test.py`. CI ghi bộ này trong artifact `mixed-handcut-fixture`.

Fixture chứng minh hình học và xuất ZIP. Lượt xem trực quan với bảy ảnh AI thật vẫn cần kiểm crop, viền SUBJECT, chi tiết sát mép và chỗ chồng giữa khung, băng dính, ren và nơ.
