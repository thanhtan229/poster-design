# Dựng scrapbook qua MCP với một lần duyệt

## P3 · Điều phối từ brief đến bàn giao

[TINIX] MCP 1.3.0 thêm `orchestrate_scrapbook_workflow` và giữ schema các tool P1/P2. Mỗi thao tác ghi kết quả theo cặp `workflow_id` và `operation_id` (UUID). Dùng lại cùng ID và đầu vào khi lỗi tạm thời. Thao tác mới dùng ID mới. ID job được lưu khi duyệt. ID thao tác sửa đồng thời là ID revision.

| Action | Cách dùng |
|---|---|
| `prepare` | Gửi `brief`, tùy chọn số demo 2–6 (mặc định 3), tỷ lệ, theme, title và bảy `illustrations` F01–F06, SUBJECT. Tạo N kit và QA nguồn trước khi trả ảnh các demo đạt. |
| `status` | Đọc workflow và biên nhận của operation ID nếu có. Gọi lại `prepare` với đầu vào cũ để nhận preview. |
| `review_sources` | ChatGPT gửi `reviews` với `demo_id`, `status` và `notes` cho cả batch. Soi viền trắng, ren, chữ, bóng đổ, mép SUBJECT và chi tiết che. Cổng tự động chặn ghi pass cho ứng viên lỗi hoặc chưa đủ chứng cứ. |
| `advance` | Gửi `approved_demo_id` sau khi người dùng chọn. Tại `awaiting_layout_qa`, kiểm render và gửi thao tác mới với `layout_review` gồm job_id, status và notes. Nếu đạt, trả manifest bàn giao gồm SHA-256 và kích thước của từng tệp. |
| `repair` | Gửi demo_id, layer, donor_workflow_id, donor_demo_id, donor_layer và reason. Nếu an toàn, tạo revision riêng và kiểm lại. Revision yêu cầu duyệt mới trước khi dựng. |

Gọi `get_scrapbook_workflow` để nhận bytes của `final_render`, `materials_zip`, `comparison` và `qa_report` qua MCP. Lượt nghiệm thu ChatGPT web cần tải thử và đối chiếu hash của cả bốn tệp.

Host đọc và băm ZIP Skill v1.2.13 tại `TINIX_STUDIO_SKILL_ARCHIVE`, mặc định `Downloads/skill (8).zip` của tài khoản chạy server. Gói khác trả `SKILL_SOURCE_MISMATCH`. Bằng chứng này xác nhận nguồn host, còn Skill đang hoạt động trong ChatGPT được ghi `not_verified` cho tới khi kiểm trên web. Tool không nhận chuỗi hash Skill từ client. TinixPoster dùng chung bảy hình cho toàn batch và ghi số lượt AI của mình riêng với số phía ChatGPT.

Hash khóa chứng minh bytes bất biến. Khi dò RGB không đủ mẫu, QA chỉ chấp nhận thêm biên nhận băm từ bộ sinh procedural chạy trên host. Với các workflow procedural cũ chưa có biên nhận, host sinh lại riêng lớp tĩnh trong thư mục QA và đối chiếu hash. Thiếu bằng chứng trả `uncertain`. Bộ dò RGB chính xác có giới hạn khi ảnh đã xoay, cắt, đổi cỡ hay màu.

Chạy integration bằng `node scripts/tinix-mcp/orchestrator.test.mjs .runtime/scrapbook-p3-test .runtime/mcp-material` với app cục bộ, Python và gói Skill host. Tham số cuối là tùy chọn để kiểm fixture P2. `node --test scripts/tinix-mcp/orchestrator-contract.test.mjs` kiểm hợp đồng MCP trên CI. Nếu tiến trình bị tắt cưỡng bức trong khi giữ khóa thư mục, quản trị viên cần xác minh tiến trình đã dừng trước khi xử lý khóa mồ côi.

## P2 · Kiểm nguồn và sửa trên bản sao

[TINIX] Server MCP 1.2.0 thêm hai công cụ, giữ schema của 15 công cụ trước.

- `audit_scrapbook_source({workflow_id, demo_id})` trả kết luận từng lớp, hash, bản trống, ô caro khi có, sentinel bảy vùng và ảnh đánh dấu chỗ tìm thấy mẫu RGB. Sentinel tính trên alpha thật, biến đổi, mép trang và lớp chồng. Nhận dạng ảnh cũ chỉ dùng mảnh RGB đủ đặc trưng làm bằng chứng dương tính. Lớp tĩnh thiếu nguồn sạch đã xác minh trả `uncertain` khi không tìm được mảnh trùng. Không dùng kết quả không khớp để kết luận sạch.
- `repair_scrapbook_source_asset({workflow_id, demo_id, layer, donor_workflow_id, donor_demo_id, donor_layer, reason})` thay một lớp `BACKGROUND`, F01–F06 hoặc Dxx bằng lớp donor cùng nhóm từ workflow sạch đã kiểm. Thay cả sprite khung để khôi phục lòng alpha, viền và bóng nếu sprite donor đã có. Giữ đích, góc và z. Nền donor cần đúng kích thước trang. Không có nguồn donor hợp lệ thì dừng. Tool giữ hash trước/sau và QA, trả workflow revision chưa duyệt. Kiểm lại thẩm mỹ và chọn demo revision trước khi gọi advance.

P1 generated template cần QA nguồn tự động `pass` để dựng. Template nhập kiểu cũ vẫn có thể dựng bản nháp chẩn đoán và so bố cục. Khi thiếu bằng chứng nguồn, workflow chặn bàn giao render và kit. Luồng customer và thao tác dựng ZIP thô vẫn phục vụ chẩn đoán và thử nghiệm, chưa chứng nhận template sạch. Giữ thẩm định hình ảnh ở bước layout review, gồm chất giấy, viền trắng, ren, chữ, bóng và SUBJECT. Nếu sai khác tổng thể vượt ngưỡng sàng lọc, workflow báo ngoại lệ. Độ khác biệt nhỏ không thay cho thẩm định hình ảnh.

[TINIX] Ghi nhận nguồn đã xác minh bằng `provenanceVerified` và phạm vi dò bằng `referenceScan` trên từng lớp. Kết quả khớp ảnh luôn trả `fail`, kể cả khi SHA-256 nằm trong danh sách tin cậy. Với nền, dò RGB sau khi bỏ alpha theo đúng exporter. Lớp vượt giới hạn dò trả `uncertain`. Revision chỉ kế thừa hash các lớp cha đã xác minh và đạt audit. Bộ dò exact RGB không chứng minh đã loại mọi dấu vết sau khi đổi cỡ hoặc đổi màu.

Lệnh thử cục bộ với server ở localhost:7001, chạy trong checkout riêng và dùng tên thư mục đích mới.

```sh
python -B scripts/tinix-mcp/source_qa_test.py
node scripts/tinix-mcp/source-qa-workflow.test.mjs .runtime/scrapbook-p2-test .runtime/mcp-material
node scripts/tinix-mcp/generated-workflow.test.mjs .runtime/scrapbook-p2-p1-test
npm run tinix:test
```

Tham số MCP root thứ hai chỉ cần khi kiểm Demo D cục bộ. Test đọc nguồn khóa và ghi bằng chứng QA ở thư mục riêng.

## P1 · Tạo demo và kit cùng lúc từ brief

[TINIX] Server `tinixposter-material` 1.1.0 bổ sung `prepare_generated_scrapbook_workflow`. Luồng cũ tiếp tục nhận ZIP composition và có lịch xuất như trước. Đường mới tạo mặc định ba demo, chấp nhận 2–6 demo và tỷ lệ 1:3 đến 3:1.

```json
{
  "request_id": "<UUID>",
  "brief": "Tạo scrapbook sinh nhật bé gái, giấy pastel Mixed Handcut",
  "skill_version": "1.2.13",
  "skill_source_sha256": "be9d6da6777fd4789319abe351d1213ee560ebba2c1c27f24a376516e4f0a0fc",
  "demo_count": 4,
  "aspect_ratio": "1:1"
}
```

Có thể gửi thêm `theme` (pastel, vintage, coastal), `title` hoặc bảy `illustrations` (attachment F01–F06, sau đó SUBJECT PNG có alpha). Chỉ gửi ảnh minh họa có quyền sử dụng. ChatGPT phải kiểm phiên bản Skill đang dùng trước khi khai báo `skill_version` và fingerprint nguồn. Server từ chối cặp khác. Cặp khai báo đúng không chứng minh Skill đã được cài đúng trong ChatGPT. Khi thiếu ảnh minh họa, tool tạo bộ hình vector đơn giản để thử bố cục và khai báo 0 lượt gọi AI. Khi có ảnh đính kèm, TinixPoster vẫn gọi 0 lượt AI và báo số lượt phía tạo ảnh là unknown.

Catalog phạm vi batch cấp `assetId`, hash, provenance, alpha, viền trắng, cache key và vai trò preview cho từng ảnh. Nền, khung, giấy, ren, tiêu đề và sticker đến từ hàm tạo mảnh bằng code. Các hình preview có đường dẫn và hash riêng, dùng chung cho toàn batch. Chưa hỗ trợ áp giấy bóng đổ động lên toàn bộ các khung trong kit.

Manifest nguồn version 1 trong thư mục batch giữ khung, vị trí, góc, lớp tĩnh và vùng SUBJECT. Exporter dùng cùng atlas và placement để tạo ảnh minh họa, bản trống, bản ô caro và kit `layout.json` v1 gồm đúng năm tệp. Ảnh mẫu bên trong kit dùng chỗ giữ ảnh trung tính. Alpha và ZIP được kiểm trước khi trả preview. Mỗi demo mang hash của preview, manifest và ZIP. Số asset sinh mới, cache hit, thời gian chuẩn bị, thời gian render/xuất và bytes của kit nằm trong `batch`.

Gọi `review_scrapbook_template_sources` rồi `advance_scrapbook_workflow` theo thứ tự. Advance dùng ZIP đã tạo, so SHA-256 với khóa nguồn trước khi nhập và trả `sourceKitSha256` trong báo cáo job. Nhập chỉ một demo. Đường P1 từ chối sửa vị trí sau duyệt để bảo toàn kit; tạo workflow mới nếu muốn đổi. Chưa có phát hiện ảnh dính ở mức pixel ngoài kiểm provenance và quan sát bản trống/ô caro.

MCP đăng ký qua `tools/list` trong `server.mjs`. Sau khi chạy bản server mới, đối chiếu phiên bản 1.1.0 và đủ 15 tên, gồm tool tạo demo và tool kiểm nguồn. Nếu connector chưa hiện đủ thì làm mới schema theo cơ chế quản trị connector và xác minh lại từ ChatGPT web. Bài test MCP SDK cục bộ không chứng minh connector đã đồng bộ. Schema cũ, kết quả CI và mốc QA đã lọc dữ liệu nằm trong `evidence/p0/`.

Lệnh thử: `node scripts/tinix-mcp/generated-workflow.test.mjs .runtime/scrapbook-p1-test` với thư mục đích mới, app test ở localhost:7001 và Python 3.11+ có Pillow, NumPy, SciPy, OpenCV. Test dùng ảnh minh họa tổng hợp.

## Audit và thứ tự triển khai

| Công cụ hiện có | Phạm vi và giới hạn |
| --- | --- |
| `build_material_draft` | Kiểm gói lắp ráp, mã mảnh và render placeholder. Không biết demo nào đã được người dùng chọn. |
| `compare_material_draft_to_approved_demo` | Đối chiếu render đã lưu với một ảnh đính kèm riêng. Loại lòng ảnh và SUBJECT theo mặt nạ phía TinixPoster. MAE/SSIM chỉ hỗ trợ chẩn đoán; vùng ảnh trên demo nằm ngoài mặt nạ bản dựng vẫn ảnh hưởng điểm. |
| `fill_material_draft_photos`, `preview_material_subject_cutout` | Gắn sáu ảnh gốc theo mã, gọi BiRefNet với `subject_mode: "birefnet"`, lưu nguồn để sửa alpha. Công cụ xem trước riêng không sửa bản nháp. |
| `review_material_photo_crops`, `apply_material_photo_crops` | Kiểm mặt và lớp che, có thể hiển thị crop đề xuất. Áp dụng tạo bản sao và chỉ nhận khung đã kiểm. Nội dung chính ngoài khuôn mặt vẫn cần đọc trên ảnh. |
| `get_material_draft_render`, `edit_material_subject_mask` | Đọc render thực tế, ảnh nguồn và alpha. Khôi phục/xóa vùng đa giác từ nguồn rồi tạo bản sao. Không suy ra vùng ghế từ tên ảnh. |
| `submit_material_feedback`, `get_material_feedback_result` | Trao đổi kết quả theo mã job và mã phản hồi. Không điều phối các bước sản xuất. |

**P0** dùng nguồn có lớp và khóa demo bằng SHA-256, dùng exporter sản xuất lại từ chính nguồn đó. **P1** điều phối các bước, kiểm kỹ thuật, ghi QA và áp dụng sửa có giới hạn. **P2** kiểm end-to-end, lỗi kết nối, đảo ảnh trên bản sao và bàn giao tệp.

Đã đối chiếu `references/tinixposter-v1.md`, `references/mixed-handcut-frames.md` và exporter từ Scrapbook Story Studio v1.2.13 (`skill (8).zip`). Bản upstream có SHA-256 `05f9156e1e87c0ae6009bb33c123c0c3f77e8dee31e4859edf889fb2b8921458`. Bản đi kèm bổ sung render demo không ghi ZIP và chế độ kết thúc bằng placeholder. Cần Python có Pillow, NumPy, SciPy, OpenCV; đặt `TINIX_STUDIO_PYTHON` để chọn interpreter khác. Giữ TinixPoster ở cổng 7001 và làm mới danh sách công cụ sau khi khởi động lại tunnel.

## Tạo mẫu chưa có ảnh khách

ChatGPT nhận brief và chuẩn bị 2–6 composition, mặc định 3. ZIP nguồn có `A.json`, `B.json` và các manifest tiếp theo theo số demo. Mỗi manifest trỏ tới nền thật, tài nguyên thiết kế, sáu ảnh minh họa qua `frames[].photo` và một ảnh chủ đạo minh họa đã tách nền qua `subject.asset`. Tất cả tệp phải có trong ZIP nguồn, cùng cấu trúc phân lớp chuẩn Studio. TinixPoster kết xuất hình từ các lớp được nộp. ChatGPT chịu trách nhiệm tạo bố cục và tài nguyên từ brief.

```json
{"request_id":"<UUID>","mode":"template","demo_count":4,"aspect_ratio":"1:1","brief":"Sinh nhật, giấy pastel","compositions":{"file_id":"<file>","download_url":"<attachment URL>"}}
```

Gọi `prepare_scrapbook_workflow` với dữ liệu trên, giữ `photos` và `subject` ở ngoài yêu cầu. Bước này trả demo, bản tắt cả bảy ảnh minh họa và bản thay bằng ô caro từ cùng lớp nền, khung và trang trí. Chưa tạo ZIP nguyên liệu. Khi `awaiting_source_qa`, agent xem hai bản kiểm của từng demo và gửi `review_scrapbook_template_sources` với `workflow_id` và `reviews: [{demo_id, status, notes}]` cho đủ số demo. Chọn `fail` nếu vẫn thấy pixel ảnh cũ trong lớp tĩnh, `uncertain` nếu chưa xác minh được. Chỉ đưa các demo `pass` cho người dùng chọn. Phép kiểm dựa trên quan sát ảnh, không tự nhận diện hoàn toàn pixel minh họa.

Sau khi người dùng chọn một demo, gọi `advance_scrapbook_workflow` với `workflow_id` và `approved_demo_id`. Chỉ demo đã qua QA nguồn được duyệt và xuất ZIP. Bước duyệt khóa ảnh, manifest và tài nguyên. `01_anh_mau.png` trong ZIP dùng nền lót trung tính cho sáu lòng khung và chừa vùng chủ đạo. Render TinixPoster hiển thị bảy vị trí thay ảnh.

Thư viện khởi đầu có năm khung không chứa ảnh minh họa từ `handcut_assets.py` của Studio v1.2.13. Chạy `python -B scripts/tinix-mcp/seed_handcut_catalog.py <folder>` để tạo PNG và `catalog.json` có nguồn, checksum và kết quả kiểm alpha. Tham chiếu cùng PNG khi tạo manifest cho nhiều demo. Nền, ren và sticker lấy từ demo phẳng phải xem riêng trên bản trống trước khi đưa vào thư viện dùng chung.

Khi `awaiting_layout_qa`, agent tự xem render và bản đối chiếu, kiểm khung, nền, chữ, ren và lớp chồng rồi gửi `layout_review` theo đúng `job_id`. Chỉ đóng trạng thái bàn giao khi QA đạt. Nếu được cấp quyền `layer_position` ở lần duyệt, agent có thể sửa vị trí lớp trên bản sao rồi kiểm lại với cùng ảnh demo khóa. Bỏ bước gắn ảnh, crop và sửa alpha SUBJECT khách. Dùng `get_scrapbook_workflow` để lấy render, ZIP, ảnh đối chiếu và QA JSON. Mẫu vẫn ở trạng thái bản nháp.

Kiểm thử cục bộ: `node scripts/tinix-mcp/template-workflow.test.mjs <fixture-directory>` với `source.zip` gồm bốn composition vuông A–D và tài nguyên minh họa.

## Đầu vào và các lượt gọi

1. ChatGPT tạo ba composition phân lớp khác nhau và đóng gói `A.json`, `B.json`, `C.json` cùng tài nguyên ảnh. Manifest dùng định dạng đầu vào của exporter Studio (`page`, `print`, `background`, `frames`, `decorations`, `subject`, tùy chọn `guide`, `sheet`, `design`). Nên ghi `design` với palette và mô tả typography, dùng PNG riêng hoặc crop từ atlas. Tài nguyên phải nằm trong ZIP. Sáu mục `frames` theo thứ tự F01–F06. Công cụ tự gán ảnh F01–F06 và alpha SUBJECT từ đúng bảy ảnh khách. Nó kết xuất ba demo để chọn. Nó không sinh phương án mỹ thuật bằng model.
2. Gọi `prepare_scrapbook_workflow` với UUID `request_id`, `compositions`, `photos` và `subject`. Chỉ hỏi người dùng chọn A, B hoặc C và xác nhận phạm vi sửa được giao trong cùng lượt.
3. Gọi `advance_scrapbook_workflow` lần đầu với `workflow_id`, `approved_demo_id` và `policy`. Workflow khóa ảnh demo, manifest, ZIP, tất cả tài nguyên ảnh đã dùng và ảnh SUBJECT gốc. Các quyền `layer_position`, `subject_mask` và `crop` mặc định tắt. Ví dụ:

   ```json
   {"workflow_id":"<workflowId>","approved_demo_id":"B","policy":{"layer_position":true,"subject_mask":true,"crop":false}}
   ```

4. Khi trả `awaiting_layout_qa`, **ChatGPT tự xem** đối chiếu đúng demo đã khóa và render nhập ZIP. Gửi `layout_review` gồm `job_id` hiện tại, `status` và `notes` nêu căn cứ về hình học, chữ, màu và thứ tự lớp. Khi lỗi rõ và đã được cấp quyền, có thể gửi `layer_repairs` cùng nhận xét `fail`, ví dụ `[{"code":"D07","dx":-2,"dy":1}]`. Công cụ tạo nguồn mới, xuất và so lại với demo khóa. Tối đa 4 lớp mỗi lượt, dịch tối đa 12 px mỗi trục và tối đa 3 lượt sửa cho workflow. Nền, kiểu chữ và tài nguyên mỹ thuật mới cần được chuẩn bị ở phía ChatGPT hoặc xử lý như ngoại lệ; công cụ chỉ sửa vị trí trong phạm vi đã cấp.
5. Khi trả `awaiting_visual_qa`, **ChatGPT tự xem** render đã lưu, nguồn và alpha SUBJECT cùng kết quả crop. Gửi `visual_review` gồm `job_id`, `design`, `subject`, `crop` (mỗi giá trị là `pass`, `fail` hoặc `uncertain`) và `notes`. Kiểm tóc, bàn tay, chân/giày, ghế hoặc đạo cụ đỡ và White Cutline. Sửa rõ ràng bằng `subject_operations` với vùng `restore`/`erase` theo pixel ảnh gốc. Với crop được ủy quyền, chỉ gửi `crop_frame_codes` sau khi đã đối chiếu ảnh gốc và lớp che, đồng thời gợi ý TinixPoster phải có `safe` và nền lộ tối đa 5%. Giữ crop mặc định khi chưa chắc. Sau mỗi sửa xem lại bản render mới trước khi gửi kết luận.
6. Khi `passed`, lấy `final_render`, `materials_zip`, `comparison` và `qa_report` qua `get_scrapbook_workflow` với `artifact` tương ứng. Render tải theo byte gốc, ZIP chỉ gồm 4 PNG + layout.json; báo cáo QA ở tệp riêng. Kênh MCP trả embedded resource có tên, SHA-256 và MIME. Cần kiểm khả năng tải tệp từ giao diện ChatGPT web của workspace. Dữ liệu nằm dưới `.runtime/mcp-material/.workflows` và các job bản sao nằm dưới `.runtime/mcp-material`. Workflow không gọi lưu mẫu.

Các lượt QA sau khi chọn demo là lượt gọi giữa agent với công cụ. Nếu gặp `exception` với chi tiết chưa rõ thì mới chuyển quyết định cho người dùng. `retryable_error` trả bước lỗi và mã workflow; gửi lại `workflow_id` sau khi dịch vụ sẵn sàng để tiếp tục. Tool đọc chỉ cần mã workflow. ID job được đặt trước khi dựng. Mỗi job build/fill xuất bản từ thư mục tạm sau khi có render và báo cáo. Một khóa thư mục ngăn hai lượt advance cùng workflow. Nếu tiến trình bị tắt cưỡng bức, quản trị viên có thể dọn riêng khóa mồ côi `<workflowId>.lock` sau khi xác nhận không còn lượt chạy.

## Kiểm thử

`node scripts/tinix-mcp/scrapbook-workflow.test.mjs <fixture-dir>` chạy qua MCP client cục bộ, renderer và BiRefNet thật. Thư mục fixture cần `compositions.zip`, `F01.png` đến `F06.png`, `SUBJECT.png` còn nền và `chairs-operations.json` chứa các đa giác phục hồi ghế của đúng ảnh. Kịch bản chọn demo B, gây lỗi ở bước đối chiếu, resume, gắn ảnh, sửa ghế, kiểm crop và đảo thứ tự ảnh trên một bản sao độc lập.

Xem render trong fixture rồi thêm `visual-review.json` với `design`, `subject`, `crop` và `notes` theo chính ảnh đã xem. Chạy lại cùng lệnh với `--finish` để xác nhận kết luận QA, bốn tệp bàn giao, mã băm và tính idempotent. Tệp ảnh thử của người dùng để trong runtime, không đưa vào repository.
