# [TINIX] PR #83: nghiệm thu xuất bộ vật liệu từ job đã thay ảnh

## Điều kiện

Nhánh thử: codex/material-export-from-job (stacked on P3). Không merge/deploy production khi chưa vượt các bước bên dưới. Không đưa ảnh khách, source ZIP, render, hay log chứa base64 lên GitHub.

Job thử nghiệm: 396f7bed-a31a-4946-a323-989308755262
ZIP nguồn: Sweet_Memories_Mau_2_TinixPoster_v1_DRAFT.zip
Canvas nguồn 1500 x 1500, render job 1504 x 1504. Giữ nguyên F01/F05 và SUBJECT đã sửa.

## A. Trên host đang chạy TinixPoster

1. Sao lưu .runtime/mcp-material và xác nhận renderer tại http://127.0.0.1:7001.
2. Checkout nhánh PR #83 trong working tree riêng; chưa restart production. Cài:
   - npm ci --prefix service
   - npm ci --prefix scripts/tinix-mcp
   - python3 -m pip install pillow numpy scipy opencv-python-headless
3. Xác nhận trong RUNTIME_ROOT/JOB/result có draft.json, render.png, report.json và có ZIP nguồn thật (không dùng screenshot).
4. Chạy lệnh sau với đúng đường dẫn của host:

    node scripts/tinix-mcp/material-export-live-smoke.mjs 396f7bed-a31a-4946-a323-989308755262 "/path/to/Sweet_Memories_Mau_2_TinixPoster_v1_DRAFT.zip" "/path/to/.runtime/mcp-material"

   Trên Windows, cấu hình TINIX_STUDIO_PYTHON đến Python có Pillow/NumPy/SciPy, và dùng đường dẫn Windows thực.
5. Harness sẽ: kiểm source ZIP qua importer; xuất 4 PNG + layout.json từ render đã lưu; nhập thử ZIP qua importer; chạy QA dựng ngược vùng tĩnh; dựng lại từ sáu ảnh đã gắn và SUBJECT alpha đang lưu trong job; gửi bản nháp kiểm lại đến renderer 127.0.0.1:7001; so với render job cũ. Chặn nếu MAE > 5/255 hay tỷ lệ sai lệch >30 vượt 5%.
6. Xem các tệp riêng cục bộ:
   - RUNTIME_ROOT/JOB/material-export/material.zip
   - RUNTIME_ROOT/JOB/material-export/qa.json
   - RUNTIME_ROOT/JOB/material-export/static-qa/reconstruction_qa.json
   - RUNTIME_ROOT/JOB/material-export/static-qa/static_diff.png
   - RUNTIME_ROOT/JOB/material-export/host-live-qa.json
7. Kiểm GUI TinixPoster độc lập: nhập material.zip vào giao diện thử nghiệm, xác nhận F01/F05 và SUBJECT không lệch; thay từng F01–F06 và SUBJECT; zoom mép giày/chân và kiểm thanh ghế; không lưu mẫu ảnh khách vào thư viện. Bằng chứng QA chứa ảnh người chỉ giữ cục bộ.

## B. Kiểm CI

- export_filled_material_test.py: ZIP đủ 5 file, đổi canvas, checksum, fail-fast, idempotent.
- qa_reconstruction_test.py: compositing tĩnh pixel-identical và phát hiện đổi nền sai.
- orchestrator-contract.test.mjs: MCP schema, giữ các công cụ cũ, phát hiện công cụ mới.

CI không tương đương kiểm máy host hoặc GUI TinixPoster.

## C. Release gate

Chỉ merge/deploy sau khi host-live test + GUI đạt, cả sáu khung và SUBJECT thay riêng, không đổi F01/F05, tờ 04 alpha và mã z/gap đúng, checksum đúng, kiểm trực quan mép chân. Sau deploy phải refresh tool list MCP ở ChatGPT.

Giới hạn: 01 là render thực; 02/03 tái tỉ lệ từ bộ nguồn; QA tĩnh chỉ xem vùng không bị ảnh khách/subject che. Đây là compatibility export, chưa phải tái tạo pixel-identical toàn bộ các lớp nguồn.
