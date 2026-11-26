# [TINIX] QA thao tác Thay ảnh qua GUI — 7/7 lớp (PR #83)

**Không phải kiểm thử BiRefNet thật.** Bài này mở trình chỉnh sửa TinixPoster thật, nhấn nút **Thay ảnh**, chọn ảnh từ hộp chọn ảnh thật, nhưng dữ liệu ảnh thử, API list, API tải lên và phản hồi BiRefNet được mô phỏng trong Chromium. Điều này cho phép kiểm tác động lên lớp mà không upload/lưu ảnh khách hoặc ảnh thử vào thư viện. Phần kiểm BiRefNet thật, alpha SUBJECT của job cuối, xuất–nhập ZIP và GUI canvas đã được nghiệm thu riêng trên host.

## Điều kiện

- Checkout branch PR #83 trong **worktree kiểm thử**, không restart hoặc deploy production.
- TinixPoster GUI phiên test tại http://127.0.0.1:7183, backend tại http://127.0.0.1:7001 (có thể override qua biến môi trường).
- Trên host có runtime job: ed81fcca-579e-4a41-9bb0-e8b39759ab31 và ZIP **của chính job này** trong thư mục material-export/material.zip.
- Cài dependencies: npm ci --prefix service; npm ci --prefix scripts/tinix-mcp.
- **Bắt buộc** xác định chính xác `TINIX_QA_STATIC_ROOT` đang được backend sử dụng: trong chế độ dev thường là `<SERVICE_PROCESS_CWD>/static`; production có thể là `/cache`. Đây phải là đường dẫn tuyệt đối và tên thư mục cuối cùng là `static` hoặc `cache`. Script không đoán bằng đường dẫn worktree khác, không chạy nếu chưa xác nhận.
- Giữ các sửa đổi smoke test local đã qua 9 test và QA nền PNG bán trong suốt. Commit/cherry-pick chúng **sau khi đối chiếu**, không ghi file runtime hoặc ảnh người vào repository.

## Chạy đúng job

Windows PowerShell, đứng tại worktree của PR #83:

    $env:TINIX_APP_URL = "http://127.0.0.1:7183"
    $env:TINIX_API_URL = "http://127.0.0.1:7001"
    $env:TINIX_QA_CAPTURE = "1"
    # Thay bằng đúng thư mục static mà backend :7001 đang sử dụng:
    $env:TINIX_QA_STATIC_ROOT = "D:\___TOOLS\__TINIX\TinixPoster\service\static"
    node scripts/tinix-mcp/material-gui-replace-seven.mjs ed81fcca-579e-4a41-9bb0-e8b39759ab31 "D:\___TOOLS\__TINIX\TinixPoster\.runtime\mcp-material"

Điều chỉnh RUNTIME_ROOT theo đường dẫn **thật** của job, không dùng đường dẫn mẫu. Nếu job chỉ tồn tại trong runtime-snapshot của phiên QA, trỏ RUNTIME_ROOT tới thư mục chứa job đó. Chương trình sẽ chỉ chạy API tại loopback; nếu GUI hoặc API bị thiếu, trả blocked.

## Tự động kiểm

1. Dùng ZIP của job cuối, mở qua đúng importer như TinixPoster và gắn sáu ảnh + SUBJECT mask mới từ dữ liệu **đang lưu trên host**, giữ chính xác crop F01/F05.
2. Tạo **một design QA tạm** qua /design/save với nhãn QA ONLY. Không tạo bản mẫu và không lưu ảnh lên thư viện.
3. Qua Puppeteer, mở /home?id=<QA_ID>, chọn từng slot theo ID trên canvas, bấm **Thay ảnh** thật và chọn ảnh thử nhận diện F01...F06, SUBJECT trong hộp ảnh. Test không gọi thao tác upload ảnh thử thật: danh sách picker được intercept.
4. Sau mỗi lần thay: chỉ một layer được đổi; kiểm đủ UUID/thứ tự layer, page metadata, các ảnh khác và 21 lớp D không đổi; khung F01–F06 không đổi fit, zoom, cropX/Y, rotate, transform, mask, position, print metadata.
5. SUBJECT phải đi qua cutout request 1 lần; thay ảnh SUBJECT không làm đổi sáu ảnh. BiRefNet trả **mask synthetic có alpha** để kiểm cơ chế xử lý GUI, còn sticker border dùng upload giả lập (1–2 requests). Trạng thái cutout cũ phải bị xóa để tránh giữ nhầm mask người trước.
6. Bấm **Lưu** từ GUI, mở lại design ID tạm, so hash toàn bộ layer. Nếu có sai khác, chặn, không nhận pass.
7. Trong `finally`: chờ backend sinh xong **cả** `<DESIGN_ID>-cover.jpg` và `<DESIGN_ID>-screenshot.png`, xóa design QA tạm qua API, dọn **đúng** tệp đã phát sinh ở static root theo ID tạm và tệp cache được chứng minh tạo mới trong chính lần test (backend trả `written:true`, hash file không đổi). Không xóa file đã tồn tại trước lượt QA hoặc file đã bị sửa sau khi sinh; mọi trường hợp đó đều blocked. Kiểm thêm SHA-256 của report.json, render.png và draft.json của **job thật** trước/sau không đổi. Nếu xóa design không thành công, QA bị blocked và cần xử lý thủ công ID được ghi trong report.
8. Giữ `report.json` và screenshot bằng chứng trong `material-export/gui-seven-qa/`; đây là bằng chứng QA, không phải cache bị dọn.

Lưu report tại:

    <RUNTIME_ROOT>/<JOB_ID>/material-export/gui-seven-qa/report.json

Nếu TINIX_QA_CAPTURE=1, lưu thêm các ảnh bằng chứng (có thể chứa người từ bản nháp khởi đầu), **chỉ giữ trên host**, không đưa ảnh đó lên GitHub.

## Release gate

Chỉ chấp nhận **guiClicks=7**, đủ 7 cases PASS, persisted changed=0, testDesignDeleted=true, **artifactCleanup.status=pass**, sourceJobUnchanged=true, không browser error. Nếu backend chưa trả đủ cặp cover+screenshot trước thời hạn, **blocked** (không giả vờ đã dọn xong), kiểm lại screenshot queue tại host trước khi retry. Nếu fail: sửa luồng GUI, chạy lại smoke test xuất–nhập, CI và GUI. Không merge PR #83 hoặc deploy cho tới khi các gates này đạt. Sau cùng đối chiếu thêm sai lệch mép SUBJECT ~1,9 px từ lần import trước nếu có thay đổi trong renderer.

## Kiểm thử CI

CI chạy node --check của harness, các unit tests isolation và suite export/MCP hiện có; **CI không thể giả vờ đã điều khiển GUI 7183 trên máy người dùng**.
