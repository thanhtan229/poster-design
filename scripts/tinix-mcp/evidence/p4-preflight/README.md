# TinixPoster A–Z — P4 Preflight

Ngày 25/11/2026. Mốc mã `5919869`, MCP 1.3.0, Skill Scrapbook Story Studio v1.2.13. Phạm vi gồm kiểm tra mã, phép thử cục bộ và chuẩn bị sổ đo cho ChatGPT web. Bộ ảnh trong bằng chứng là fixture tổng hợp có sẵn.

## Kết luận

- **Có đường nhận bảy ảnh qua MCP.** Tool công bố `openai/fileParams: ["illustrations"]`. Phép thử qua MCP SDK gọi đúng `orchestrate_scrapbook_workflow`, thay đường tải mạng bằng bytes fixture và chạy bộ render TinixPoster localhost. Việc ChatGPT web tự chuyển bảy ảnh vừa sinh trong chính cuộc trò chuyện thành attachment còn cần xác nhận trực tiếp bằng một lượt `prepare`.
- **Cổng cấu trúc và bàn giao hoạt động cục bộ.** Bốn demo và bốn ZIP có trước duyệt. Chỉ demo B được nhập vào một job sau khi chọn. SHA-256 của ZIP trước duyệt khớp với ZIP do job đọc và ZIP lấy lại qua MCP. Bốn tệp bàn giao đều lấy được và khớp hash, số byte.
- **Mixed Handcut còn một lỗi cấu trúc ở cả bốn demo.** Chưa có đủ hai lòng khung cắt theo silhouette bất đối xứng. Vân giấy, ren và cảm giác độ sâu có mức đáp ứng sơ bộ. Pilot thẩm mỹ và chi phí vẫn chờ bộ bảy ảnh AI thật.

[Bằng chứng kỹ thuật](result.json) · [Bảng demo, bản trống và ô caro](qa-contact.png) · [Mẫu ghi số đo pilot](pilot-metrics.json)

## Hợp đồng nhận ảnh và cách kiểm trên ChatGPT web

Gọi `orchestrate_scrapbook_workflow` với `action: "prepare"`, UUID mới cho `workflow_id` và `operation_id`, `demo_count: 4`, `aspect_ratio: "1:1"`, `brief` và mảng `illustrations` gồm đúng bảy attachment theo thứ tự **F01, F02, F03, F04, F05, F06, SUBJECT**. Tên gợi nhớ vai trò. Thứ tự mảng quyết định ánh xạ; server chưa dùng tên tệp để phát hiện hai ảnh bị tráo.

| Điều kiện | Hành vi hiện tại |
| --- | --- |
| Tham chiếu tệp | Mỗi mục cần `file_id` riêng và `download_url` HTTPS từ cơ chế đính kèm của ChatGPT. `file_name` và `mime_type` tùy chọn. Tệp cần có nội dung phân biệt sau chuẩn hóa. |
| Sáu ảnh đầu | PNG, JPEG hoặc WebP một khung hình, ảnh đục hoàn toàn. Server kiểm định dạng qua nội dung khi giải mã. |
| SUBJECT | PNG có alpha thật gồm pixel trong suốt và pixel hiển thị. PNG với nền caro đã in vào ảnh sẽ bị từ chối nếu alpha đục. Ảnh phải tách nền trước khi gọi `prepare`. Tool này chưa tự chạy BiRefNet. |
| Giới hạn ảnh | Tối đa 16 MiB/tệp và 32 triệu pixel khi giải mã. Hạn tải 60 giây/tệp. Ảnh minh họa trong demo được thu về cạnh dài tối đa 1.440 px, giữ tỷ lệ. Sáu ảnh và SUBJECT minh họa không đi vào ZIP template. |
| Nguồn tải | Chỉ chấp nhận `oaiusercontent.com` và tên miền con, cùng các hostname chính xác đã cấu hình cho ứng dụng. Chuyển hướng bị chặn. |
| Lỗi đã thử | Thiếu URL, liên kết sandbox, CDN ngoài allowlist, HTTP 403 giả lập, quá 16 MiB theo header, SUBJECT đục. Xem thông báo gốc trong JSON. |
| Dùng lại bốn lần | Một lần tải mỗi ảnh, dùng lại bộ bảy ảnh cho A–D. Kết quả có 28 lượt đặt ảnh, gồm 21 lượt dùng lại. `assetCacheHits` trả 59, tổng hợp cả ảnh minh họa và các tài nguyên bố cục. |

Trong pilot, ChatGPT tạo một bộ bảy ảnh và thử chuyển chúng dưới dạng attachment thật trong một lần gọi. Nếu runtime chỉ trả đường dẫn sandbox hoặc mã tệp mà không chuyển URL, đính kèm lại bảy tệp từ Library hoặc tải lên chat rồi thử lại. Nếu bị chặn CDN, lưu mã lỗi và hostname đã được lược bỏ URL có chữ ký. Duy trì allowlist theo hostname đã xác minh. Với lỗi tải tạm thời trên cùng yêu cầu, dùng lại `operation_id` và cùng file ID nếu vẫn truy cập được; khi đổi bộ file ID, tạo yêu cầu mới và lưu mối liên hệ trong sổ pilot.

## Mixed Handcut v1.2.13

| Quy tắc | Kết quả preflight |
| --- | --- |
| Hai silhouette bất đối xứng khác nhau trên mỗi demo | **Chưa đạt ở 4/4.** A lặp cùng một sprite `torn` hai lần, B–D mỗi demo có một sprite `torn`. Bản thân `torn` vẫn lấy `torn_rect` làm lòng ảnh, chỉ xô nhẹ mép. Quan sát cả bản trống và ô caro cho thấy các lòng đều gần chữ nhật. |
| Có Polaroid và tem/ticket | Có ở 4/4, kể cả khi kiểu được luân phiên giữa các mã F. Có băng dính gần ảnh. |
| SUBJECT theo đường bao và thay riêng | Cả 4 nguồn tham chiếu PNG alpha độc lập. Demo hiển thị theo alpha và đường viền 0,9 mm khai báo. Ô caro chủ động dùng vùng thay SUBJECT để kiểm thay thế. Job B có sáu slot và `subjectIndependent: true`. Chất lượng mép tóc, tay và đạo cụ cần được chấm trên hình thật. |
| White Cutline, bóng đổ, ren và lớp giấy | Có viền trắng, vân và bóng lệch nhẹ trên nền giấy, giấy xé chồng lớp, họa tiết ren bên dưới và nơ. Chưa có lớp bóng đổ riêng cho từng khung và SUBJECT. Chưa đo tự động bề dày viền của từng sprite sau scale. Ren và độ sâu còn đơn giản ở cả bốn preview. |
| Bốn bố cục khác nhau | Có bốn tập tâm, kích thước và góc khung khác nhau; B chuyển SUBJECT rõ sang trái, C dùng bố cục lệch và A/D tạo nhịp khác nhau quanh tâm. Vị trí tiêu đề, cụm ren/nơ và một phần trang trí vẫn lặp. Cần đánh giá bằng bộ ảnh thật xem các lựa chọn đủ khác biệt về cảm giác thiết kế hay chưa. |

Nguồn kiểm thiết kế là `references/mixed-handcut-frames.md` trong Skill đã cung cấp và mã [generate_compositions.py](../../generate_compositions.py), [handcut_assets.py](../../handcut_assets.py).

## Cổng chuẩn bị, duyệt và bàn giao

1. `prepare` sinh A–D. Mỗi ứng viên có demo minh họa, bản trống đã tắt bảy ảnh, bản ô caro bật bảy vùng thay thế và ZIP năm thành phần gồm bốn PNG và `layout.json`. PNG `01_anh_mau.png` của ZIP template dùng placeholder. Mỗi demo, manifest và ZIP có SHA-256 được chốt trước duyệt.
2. Đối chiếu demo, bản trống, ô caro và kết quả sentinel. Phiên fixture có 4 pass, 0 fail, 0 uncertain về **QA nguồn tự động**. Ảnh trống không thấy minh họa rơi lại trong nền. Chất lượng Mixed Handcut là cổng đánh giá thị giác riêng. Dùng `uncertain` cho trường hợp chứng cứ thiếu, và loại demo còn ảnh dính hoặc lỗi bố cục rõ.
3. Ghi `review_sources` cho cả lô rồi trình các ứng viên đạt để người dùng chọn một. Phép thử trước `review_sources` từ chối chọn B và vẫn có 0 job. Chọn B hợp lệ tạo 1 job cục bộ. Gọi lại đúng thao tác trả cùng job ID.
4. Đối chiếu bản render đã lưu, gửi `layout_review` chỉ khi đạt, rồi dùng `get_scrapbook_workflow` để lấy `final_render`, `materials_zip`, `comparison`, `qa_report`. Phiên cục bộ xác minh bytes của cả bốn tài nguyên qua MCP SDK; việc hiển thị nút tải trên ChatGPT web cần được kiểm trong pilot.

## Ghi thời gian và chi phí

TinixPoster cung cấp `batchMs`, thời gian dựng và xuất theo demo, `assetCacheHits`, hash của bảy ảnh và `aiCallsByTinixPoster`. Với ảnh đính kèm, `upstreamAiCalls` là `null`. ChatGPT ghi riêng mỗi lời gọi sinh ảnh AI và số ảnh trả về, cả lần thử không đạt nếu quan sát được. Một lời gọi có thể trả nhiều ảnh. Nếu không đọc được chi phí thực hoặc model, dùng `null`; ghi rõ nguồn nếu có số liệu. Tính riêng thời gian tạo ảnh, thời gian xử lý, thời gian QA và thời gian chờ người dùng chọn. Sổ pilot đếm `fail` và `uncertain` theo từng vòng và loại QA. Ghi riêng số lần thử sửa và số revision tạo được, theo `operation_id`; retry cùng mã chỉ tính một thao tác.

Fixture có `prepareWallMs: 36890` và `batchMs: 21121`. Số đo gồm ảnh thử và đường tải giả lập. Chưa có số đo chi phí hoặc thời gian ảnh AI thật.

- Mỗi mục `imageGeneration.calls` ghi `callId`, `model`, `requestedOutputs`, `returnedOutputs`, `usedCodes`, `status`, `elapsedMs`, `cost` và nguồn chi phí nếu có.
- Mỗi mục `qa.events` ghi `operationId`, `demoId`, `revisionId`, `gate`, `status`, `elapsedMs` và `evidence`. Tổng hợp riêng `sourceAutomatic`, `sourceVisual` và `importLayout`.
- Mỗi mục `repair.events` ghi `operationId`, `demoId`, `layer`, `fromRevisionId`, `toRevisionId` và kết quả.

## Bản sửa tối thiểu đề xuất

1. Thêm hai sprite lòng cắt bất đối xứng khác nhau, có nền trong suốt kín và viền dùng chung, rồi phân bổ cố định hai vai trò này vào mỗi A–D. Giữ Polaroid và tem/ticket. Thêm một kiểm tra catalog và soi blank/checker bốn demo để xác nhận 4/4 đạt. Đây là thiếu hụt đã thấy, nên ưu tiên trước khi chấm thẩm mỹ pilot.
2. Xác minh ngay một lượt ChatGPT web chuyển bảy file ID thực. Chỉ bổ sung bản sửa tại đường nhận attachment nếu thực tế tái hiện lỗi. Trường hợp cần dùng BiRefNet trước `prepare` và preview không đưa lại file đính kèm dùng được, xem xét trả thêm tài nguyên PNG tham chiếu được, giữ schema hiện tại cho sáu ảnh còn lại.
3. Dùng sổ đo pilot trước khi thêm telemetry vào app. Chỉ tăng chiều sâu bóng và ren sau khi chấm thử bốn bản; nếu cần bóng riêng, ưu tiên bóng hiển thị không tham gia đường cắt, tránh tạo mảnh alpha rời trên tấm RGBA. Giữ nguyên định dạng ZIP v1 cho lượt kiểm trước.

PR #72–#74 giữ draft. Preflight không thay đổi Skill, code production, dữ liệu gốc hay thư viện mẫu. Việc chọn B ở đây chỉ là thao tác trên fixture cục bộ để kiểm chứng số job.
