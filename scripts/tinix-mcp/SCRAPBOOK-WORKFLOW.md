# Dựng scrapbook qua MCP với một lần duyệt

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
