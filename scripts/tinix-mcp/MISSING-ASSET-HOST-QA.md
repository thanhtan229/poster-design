# [TINIX] E2E khôi phục đúng một asset thiếu rồi dọn cache — PR #83

Mục đích: xác nhận cơ chế `Tệp → Mở dự án` của TinixPoster khôi phục một ảnh PNG trong tệp `.tinix.zip` khi backend chưa có ảnh, và `finally` xóa đúng tệp QA vừa khôi phục. Đây là bài **E2E trên Windows host**, không phải mô phỏng API. Không sửa job thật.

## Chuẩn bị

- Đảm bảo branch PR #83 đã được cập nhật đến commit mới nhất. Nếu Codex có sửa đổi local, **backup worktree trước khi fetch/rebase**.
- Giao diện TinixPoster thử nghiệm tại `http://127.0.0.1:7183`; backend tại `http://127.0.0.1:7001`. Không chạy test trên endpoint internet/production.
- Dùng job đã nghiệm thu: `ed81fcca-579e-4a41-9bb0-e8b39759ab31`. Script chỉ **đọc** `result/draft.json`, `result/render.png` và `result/report.json` để đối chiếu SHA-256.
- Xác định đúng thư mục `static` thực của **backend đang chạy** (thường service process working directory + `/static`; không đoán theo đường dẫn của worktree).
- Cài `npm ci --prefix service` và `npm ci --prefix scripts/tinix-mcp` nếu host chưa có dependencies.

Windows PowerShell:

```powershell
$env:TINIX_APP_URL = "http://127.0.0.1:7183"
$env:TINIX_API_URL = "http://127.0.0.1:7001"
$env:TINIX_QA_CAPTURE = "1"
$env:TINIX_QA_STATIC_ROOT = "<ABSOLUTE_BACKEND_STATIC_ROOT>"
$runtimeRoot = "<DIRECTORY_HOLDING_ed81fcca_JOB_FOLDER>"
node scripts/tinix-mcp/material-missing-asset-live-qa.mjs ed81fcca-579e-4a41-9bb0-e8b39759ab31 $runtimeRoot
```

Điều chỉnh hai giá trị trong dấu `<...>` thành đường dẫn thật trên máy Windows. `$runtimeRoot` là **thư mục cha** của folder job, không phải folder job.

## Các điểm kiểm tự động

1. Tạo ảnh tổng hợp PNG với tên ngẫu nhiên `qa-missing-<nonce>.png` và xác nhận đường dẫn chưa tồn tại. Tạo một ảnh tổng hợp ngẫu nhiên thứ hai `qa-existing-<nonce>.png` trong thư mục ảnh để làm đối chứng *đã tồn tại*.
2. Tạo ZIP local-project chuẩn `design.json` + hai ảnh trong `assets/static/photos/`. **Chỉ đúng một ảnh bị thiếu** trên backend; cả hai ảnh đều là synthetic. ZIP không đưa ảnh khách vào kiểm thử.
3. Tạo một design QA tạm với nguồn ảnh data URL synthetic để backend tạo cover/screenshot. Bấm **Tệp → Mở dự án** trong Puppeteer, chọn ZIP qua file chooser của trình duyệt.
4. Quan sát phản hồi thật từ `POST /api/tinix/local-assets/missing`: `missing` phải **chính xác một** đường dẫn mới; `invalid=[]`. Quan sát `PUT /api/tinix/local-asset` **chỉ đúng một lần** cho đường dẫn thiếu, backend phải trả `written: true`.
5. Kiểm byte SHA-256 PNG trong cache khớp PNG tổng hợp, ảnh render thực trên canvas đã tải với kích thước tự nhiên 360 px. Xác nhận ảnh đối chứng đã tồn tại vẫn nguyên byte.
6. Chờ backend báo hoàn thành cover/screenshot; xóa design QA qua API và xác minh không còn mở được. Chỉ xóa `<QA_ID>-cover.jpg`, `<QA_ID>-screenshot.png` khi dấu vân tay tệp trùng và chúng không tồn tại trước lượt chạy. Chỉ xóa ảnh mới khôi phục khi backend đã xác nhận ghi và bytes không đổi. Tệp đối chứng tự tạo được dọn theo checksum của chính nó.
7. Xác minh sau cleanup cả hai ảnh synthetic đều không tồn tại, job gốc có SHA-256 không đổi, lưu report cục bộ.

**Không xóa bất kỳ ảnh khách hoặc tệp đã tồn tại trước QA.** Nếu một ảnh bị thay đổi trong khi kiểm thử, để nguyên tệp và báo `blocked` thay vì xóa cưỡng bức. Nếu chưa có bằng chứng từ API hoặc không chờ được cover, cũng báo `blocked`.

## Release gate

Báo cáo tại:

`<RUNTIME_ROOT>/<JOB_ID>/material-export/missing-asset-qa/report.json`

Chỉ chấp nhận:

- `status: "pass"`
- `restoredAsset.written: true`
- `restoredAsset.byteIdentical: true`
- `existingAssetPreserved: true`
- `renderedImage: true`
- `testDesignDeleted: true`
- `artifactCleanup.status: "pass"`
- `syntheticSentinelDeleted: true`
- `restoredAssetAbsentAfterCleanup: true`
- `syntheticSentinelAbsentAfterCleanup: true`
- `sourceJobUnchanged: true`

Nếu bật `TINIX_QA_CAPTURE=1`, ảnh `synthetic-opened.png` chứng minh canvas đã hiển thị **ảnh tổng hợp**. Không đưa ảnh khách hoặc runtime vào GitHub.

Chạy CI `Material export QA` trên đúng commit sau khi tích hợp sửa lỗi (nếu có). Chỉ đưa mã và báo cáo tóm tắt không chứa ảnh khách lên PR. **Không merge/deploy hoặc lưu mẫu**, trừ khi người dùng cho phép ở bước riêng.
