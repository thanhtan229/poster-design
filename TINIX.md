# TINIX — nhật ký sửa file gốc

Mọi chỗ TinixPoster sửa vào file của poster-design gốc (đánh dấu `[TINIX]` trong code).
Dùng khi cập nhật từ repo gốc: `git fetch origin && git merge origin/main` rồi kiểm tra lại các chỗ dưới đây.

## File gốc đã sửa

| File | Thay đổi | Lý do |
|---|---|---|
| `service/src/main.ts` | Import `./tinix/env` đầu tiên, rồi `./tinix/process-guard`; `app.listen(port, listenHost)` | Nạp `service/.env`; không sập khi xuất ảnh quá giờ; chỉ nghe 127.0.0.1 |
| `service/src/db/index.ts` | Import + gọi `migrateTinix(instance)` cuối `initDB()` | Thêm cột font + bảng `ai_jobs` |
| `package.json` | Script `tinix:setup`, `tinix:dev`, `tinix:fonts` | Chạy được trên Windows; nhập font |
| `.gitignore` | Bỏ ignore `CLAUDE.md`; ignore `.runtime/` | Theo dõi hướng dẫn AI trong git; bỏ log chạy thử |
| `src/languages/index.ts` | Thêm locale `vi`, `fallbackLocale: 'vi'`, `getBrowserLang()` luôn trả `'vi'` | Giao diện mặc định tiếng Việt |
| `src/views/Index.vue` | Nhãn header (Tệp, Trợ giúp, Trợ lý AI, Đổi mật khẩu, Quản trị, Đăng xuất, Đăng nhập, Hủy) → `$t('tinix.menu.*')` | Việt hóa |
| `src/views/components/Folder.vue`, `Helper.vue` | Mục menu Tệp / Trợ giúp → `$t('tinix.folder.*' / 'tinix.helper.*')` | Việt hóa |
| `src/components/business/login-dialog/index.vue`, `ChangePassword.vue` | Nhãn, placeholder, thông báo → `t('tinix.login.*' / 'tinix.password.*')`; lỗi server qua `viServerMsg()` | Việt hóa |
| `src/assets/data/WidgetClassifyList.ts`, `panel/widgetPanel.vue`, `panel/wrap/*ListWrap.vue`, `photoList.vue` | Thanh bên trái: Mẫu / Chất liệu / Chữ / Ảnh / Công cụ / Của tôi; "Mẫu thiết kế", "Đã tải hết", hộp xác nhận dùng mẫu | Việt hóa |
| `src/views/Psd.vue` | Thông báo admin → tiếng Việt; đặt khổ trang **trước** khi thêm widget; ánh xạ font PSD → kho (`matchPsdFont`) + báo font bị thay; nới khung point text (`fitPointText`); báo lỗi khi không đọc được PSD | Việt hóa; sửa nhập PSD |
| `src/utils/plugins/psd/index.ts` | Cỡ chữ × hệ số phóng dọc; Tracking → giãn chữ; All Caps; Leading → giãn dòng; tên font đúng style run (bỏ `.slice(1)` cắt mất chữ đầu); paragraph text dùng BoxBounds + ma trận → khung + `rotate`; `transform: ''` (object cũ làm hỏng CSS xoay) | Nhập PSD đúng như Photoshop |
| `src/utils/plugins/worker/loadPSD.worker.ts` | Đọc bằng **ag-psd** trước (`processPsdWithAg`), lỗi thì thử `psd.js`; luôn gửi `{ data }` hoặc `{ error }` về | psd.js không đọc được PSD đời mới; trước đây lỗi làm trang quay vòng mãi |
| `package.json` | Thêm phụ thuộc `ag-psd` (MIT); script `tinix:test-ai` | Bộ đọc PSD mới; tự kiểm tra AI |
| `src/views/components/HeaderOptions.vue`, `Folder.vue`, `src/views/Index.vue` | Mục **Tệp → Lưu thành mẫu (công khai)** (chỉ admin): `saveAsTemplate()` gọi `/api/admin/template/save` với `dLayouts`, mẫu hiện ngay ở thẻ "Mẫu thiết kế" (tải lại trang để thấy) | Lưu thiết kế thành mẫu mà không cần nhập PSD |
| `service/src/service/ai.ts` | Nút **Tạo ảnh** (upstream): thư mục `static/ai` tạo đệ quy (`checkCreateFolder` không tạo được đường dẫn Windows); lỗi nhà cung cấp trả về nguyên nhân thật | Tạo ảnh chạy được trên Windows; dùng `gpt-image-2` của OpenAI |
| `service/src/service/ai.ts` (thêm) | Lần tạo ảnh được ghi vào `ai_jobs` (loại `image`, token từ `usage`) và bị chặn khi chạm giới hạn chi phí tháng; kích thước ảnh nhận tỉ lệ tùy ý `W:H` | Chi phí/lịch sử đủ cả ảnh |
| `src/components/modules/panel/wrap/TempListWrap.vue` | Lắng nghe sự kiện `tinix:templates-changed` để tải lại danh sách mẫu | Lưu thành mẫu xong thấy ngay |
| `src/components/modules/widgets/wSvg/wSvg.vue` | `loadSvg` nhận cả data URL và bỏ qua `svgUrl` không phải mã SVG (không ném lỗi chưa bắt) | Dữ liệu SVG sai định dạng không làm vỡ widget |
| `src/components/modules/widgets/wImage/wImage.vue`, `wImageStatic.vue`, `wImageSetting.ts`, `wImageStyle.vue` | Thuộc tính `fit: 'cover'` cho khung ảnh của Dựng theo mẫu: `object-fit` phủ kín, và nút "Thay ảnh" **giữ kích thước khung** (upstream đổi theo kích thước gốc của ảnh mới) | Thay ảnh thật vào khung không phình/méo |
| `src/views/Admin.vue`, `src/api/tinix-ai.ts`, `service/src/tinix/ai/routes.ts` | Banner cảnh báo ở trang Quản trị khi admin còn dùng mật khẩu mặc định; API `GET /api/tinix/security/status` | Nhắc đổi mật khẩu mặc định |
| `src/languages/modules/vi/tinix-ui.ts` (+ `vi/index.ts`, `languages/index.ts`) | **Mọi chuỗi giao diện của code TinixPoster** (Trợ lý AI, Lưu thành mẫu, Dựng theo mẫu, banner mật khẩu…) nằm ở đây, gọi bằng `$t('tinix.ui.<nhóm>.<khóa>')` (template) hoặc `i18t(...)` (script). Chuỗi có thẻ `<b>`/`<a>` dùng `v-html` với chuỗi tĩnh nên tắt `warnHtmlMessage`. Công cụ trích xuất: `.runtime/i18n_extract.py` (không đưa vào git) | Việt hóa tập trung, dễ sửa |
| `src/views/Admin.vue` (thêm) | Hộp thoại thêm font dịch qua `admin.font.*` (vi + en) | Hết chuỗi tiếng Trung hiển thị |
| `service/src/tinix/ai/vision.ts`, `service/src/service/ai.ts` (thêm), `tasks.ts` | **Độ ổn định AI**: `postWithRetry` tự thử lại tối đa 2 lần (3 s, 8 s, hoặc theo `Retry-After`) với 429 quá tải / 5xx / lỗi mạng — KHÔNG thử lại khi hết hạn mức (quota/billing) hay timeout; áp dụng cả cho chữ, nhìn ảnh và tạo ảnh. `modelErrorHint` báo rõ model bị ngừng/sai tên và chỉ chỗ đổi. Dựng theo mẫu (Giống mẫu) từ chối kết quả tách chữ từng ký tự (gọi lại một lần) và bỏ vùng chữ trùng lặp. Biến môi trường `TINIX_AI_RETRY_DELAYS_MS="20,20"` rút ngắn thời gian chờ khi tự kiểm tra | Ít lỗi vặt hơn, thông báo lỗi dễ hành động |
| `src/views/Admin.vue`, `service/src/db/fonts.ts`, `service/src/service/admin.ts`, `src/api/admin.ts` | Quản lý font: cột **Tiếng Việt** (Có dấu/Chưa có) và ô "Hỗ trợ tiếng Việt" khi thêm/sửa; lưu cờ `fonts.supports_vietnamese`. Trước đây cờ có trong DB nhưng bảng không hiển thị | Thấy rõ font nào AI dùng được ở chế độ tiếng Việt
| `scripts/tinix-fonts.json`, `scripts/tinix-import-fonts.mjs` | Thêm 13 font tiếng Hàn (OFL, từ google/fonts `ofl/`). Danh mục có trường `vietnamese` (mặc định true; font Hàn đặt `false` để không bị gắn cờ tiếng Việt). Font nằm trong `service/static/fonts/` (không đưa vào git) | Có font Hàn trong kho; chạy lại `npm run tinix:fonts` để tải |
| `scripts/tinix-font-previews.mjs` (`npm run tinix:font-previews`) | Sinh ảnh xem trước cho từng font (một dòng chữ mẫu viết bằng chính font đó: tiếng Việt/Hàn/Trung; Puppeteer chụp, 560×72 px) vào `service/static/font-previews/<id>.png` và ghi cột `fonts.preview`. `--force` làm lại tất cả, `--only "Tên"` làm một font. Cần service đang chạy | Chọn font nhìn thấy hình dạng thật |
| `src/components/modules/settings/valueSelect.vue`, `wText/wTextStyle.vue`, `languages/*/editor.ts` | Danh sách chọn font: mục có `preview` hiện tên nhỏ + ảnh chữ mẫu; popover rộng 300px; thêm thẻ "Tiếng Hàn" (`lang = ko`) | Xem trước font ngay trong danh sách |
| `service/src/main.ts` | Mount `tinixAiRouter` (`/api/tinix/ai/*`) sau router gốc | Các tính năng AI của TinixPoster |
| `src/components/business/ai-assistant/AiAssistant.vue` | Thêm 5 tab (Gợi ý chữ, Sửa chữ, Tìm font, Lịch sử, Cài đặt AI), mặc định mở "Gợi ý chữ", Việt hóa 3 tab cũ, rộng 780px | Trợ lý AI |
| `src/store/design/widget/actions/template.ts` | `setTemplate()` không còn `constrainGroupToCanvas` | Mở mẫu nguyên trang từng bị co nhỏ cả mẫu (vd 937px → 204px) khi 1 lớp tràn mép, và co theo khổ trang cũ |
| `src/components/business/create-design/sizeEditor.vue`, `designBoard/comps/resize.vue` | Giới hạn khổ trang 5000 → 10000px | Ô nhập tự cắt chiều cao trang về 5000 |
| `service/src/utils/download-single.ts` | `maximum` 5000 → 10000, `maxPXs` 4,2M → 40M điểm ảnh | Ảnh xuất bị cắt ở 5000px và hạ độ phân giải (3761×5642 → ~750px) |
| `.gitignore` | Ignore `/psd-test/` | File PSD thử nghiệm cục bộ |

## File mới (không đụng file gốc)

| File | Mục đích |
|---|---|
| `service/src/tinix/env.ts` | Nạp `service/.env` (Node `process.loadEnvFile`), cảnh báo nếu thiếu `AUTH_SECRET`, cấu hình `HOST` |
| `service/src/tinix/process-guard.ts` | Ghi log thay vì tắt service khi có unhandled rejection |
| `service/src/tinix/db/migrate.ts` | Cột `fonts.category/tags/supports_vietnamese/license`; bảng `ai_jobs` (idempotent) |
| `service/.env.example` | Mẫu biến môi trường (AUTH_SECRET, HOST, PORT, DEFAULT_ADMIN_*) |
| `scripts/tinix-shortcut.ps1` (`npm run tinix:shortcut`) | Tạo shortcut "TinixPoster" ngoài Desktop trỏ vào `Mo-TinixPoster.cmd` (script chỉ dùng ASCII vì PowerShell 5 đọc file không BOM theo ANSI) |
| `Mo-TinixPoster.cmd` | Nhấp đúp để mở app: kiểm tra Node + thư viện, đã chạy thì chỉ mở trình duyệt, chưa chạy thì `npm run tinix:dev` và tự mở trình duyệt khi sẵn sàng. `--check` = chỉ báo trạng thái |
| `.gitattributes` | Giữ CRLF cho `*.cmd`/`*.bat` |
| `scripts/tinix-dev.mjs` | Chạy editor + service cùng lúc, Ctrl+C dừng cả hai |
| `scripts/tinix-fonts.json` | 46 font Google Fonts có chữ Việt, giấy phép OFL, kèm nhóm + tag |
| `scripts/tinix-import-fonts.mjs` | Tải font về `service/static/fonts/` (+ `licenses/`) và ghi bảng `fonts` |
| `src/languages/modules/vi/index.ts` | Toàn bộ chuỗi tiếng Việt (`header.*`, `tinix.*`) — Việt hóa thêm thì thêm khóa ở đây |
| `src/utils/tinix/server-msg.ts` | `viServerMsg()`: dịch thông báo lỗi tiếng Trung của service sang tiếng Việt |
| `src/utils/tinix/psd-text.ts` | Tính cỡ chữ, giãn chữ, giãn dòng, All Caps, hình học khung + góc xoay từ dữ liệu PSD (chạy trong worker) |
| `src/utils/tinix/psd-font-map.ts` | Ánh xạ tên font Photoshop → font trong kho: trùng tên → tiền tố → đoán nhóm (script/rounded/display/serif/sans) → Montserrat; đọc độ đậm/nghiêng từ tên |
| `src/utils/tinix/psd-fit.ts` | Đo chữ bằng font thay thế, nới khung point text để không bị xuống dòng sai |
| `src/utils/tinix/psd-ag.ts` | Bộ chuyển PSD → trang dựa trên ag-psd (chữ + ảnh từng lớp + nền), cùng định dạng đầu ra với bộ cũ; khởi tạo canvas cho worker (`OffscreenCanvas`/`ImageData`) |
| `service/src/tinix/ai/` | **AI**: `vision.ts` (mọi lời gọi AI: thu ảnh 1024px, gọi /chat/completions có ảnh, bóc JSON, thử lại 1 lần, ghi `ai_jobs`), `tasks.ts` (gợi ý chữ, sửa chữ, tìm font, **dựng theo mẫu**, gắn tag font), `prompts.ts` (sửa prompt ở đây), `validate.ts` (kiểm tra JSON — thay zod vì TS 3.9), `fonts.ts` (danh sách font cho prompt + chấm điểm), `cost-log.ts`, `settings.ts` (khóa `tinix_*` trong `ai_settings`), `routes.ts` |
| `src/api/tinix-ai.ts` | Client gọi `/api/tinix/ai/*` |
| `src/components/business/ai-assistant/Tinix*.vue`, `tinix-tab.less` | Các tab Trợ lý AI |
| `src/utils/tinix/capture.ts` | Chụp trang (html2canvas, bỏ `transform: scale`) gửi AI |
| `src/utils/tinix/rebuild.ts` | Dựng theo mẫu (2 chế độ: **Giống mẫu** — chép đúng chữ/ngôn ngữ/font gần nhất/nét trang trí SVG, mặc định; **Viết nội dung mới** — học bố cục rồi viết lại; vùng `svg` do AI vẽ được lọc bởi `service/src/tinix/ai/svg.ts`; chữ Hán/Nhật/Hàn tự chọn font CJK trong kho, chữ Latin/Việt loại font CJK): vùng AI → lớp chữ / khung ảnh giữ chỗ (SVG xám) / khối màu (`wSvg`). Hộp chữ tự nới rộng để không xuống dòng; các chữ chồng nhau được đẩy xuống (`separateTexts`). Tùy chọn **Tự tạo ảnh nền tương tự bằng AI (không chữ)** (đặt trước nút Phân tích, nhớ trong `localStorage`): phân tích xong là tạo ảnh ở nền từ `photoPrompt` (sửa được, có nút Tạo lại ảnh, xem trước), tỉ lệ đúng vùng ảnh, chừa khoảng trống có tông tương phản với màu chữ; Dựng vào trang dùng ảnh có sẵn hoặc chờ; phân tích lại thì bỏ ảnh cũ. Tab dựng: tự đặt khổ trang theo tỉ lệ ảnh mẫu (cạnh dài 1920px) khi trang còn trống hoặc đã chọn xoá lớp; chỉ gửi ảnh trang hiện tại cho AI khi trang có lớp |
| `src/utils/tinix/place-text.ts` | Xếp chữ AI vào vùng trống (0–1 → px, co chữ cho vừa, chỉnh màu dễ đọc) |
| `scripts/tinix-ai-selftest/` | `npm run tinix:test-ai`: thử toàn bộ đường AI với nhà cung cấp giả, DB tạm |
| `scripts/tinix-psd-dump.cjs` | In thông tin lớp chữ của file PSD để gỡ lỗi: `node scripts/tinix-psd-dump.cjs "psd-test/x.psd"` |
| `CLAUDE.md`, `MVP-SPEC.md`, `TINIX.md` | Tài liệu |

## Cách dùng nhanh

- **Chạy app:** nhấp đúp **`Mo-TinixPoster.cmd`** (hoặc `npm run tinix:dev`) → http://127.0.0.1:5173
- **Nhập / cập nhật font:** sửa `scripts/tinix-fonts.json` rồi `npm run tinix:fonts` (chạy lại an toàn). Thêm `-- --dry` để chỉ xem danh sách.
- **Nhập mẫu PSD** (cần đăng nhập tài khoản admin):
  1. Đăng nhập ở góc trên bên phải editor (nút **Đăng nhập**).
  2. Mở http://127.0.0.1:5173/psd (hoặc trang admin → nút nhập PSD).
  3. Chọn file `.psd` → chờ phân tích → chỉnh nếu cần → lưu thành mẫu (上传模板).
  4. Lớp chữ thành widget chữ chỉnh được. Font không có trong kho được thay bằng font gần giống — app hiện thông báo "PSD font → font thay thế". Muốn đúng font gốc: thêm font đó (có giấy phép) vào kho rồi nhập lại.
  5. Giới hạn: hiệu ứng chữ phức tạp (warp, chữ theo đường cong), mask và smart object không được giữ nguyên; layer style (đổ màu, viền, bóng, nổi 3D) không được giữ.
- **Trang admin:** http://127.0.0.1:5173/admin (quản lý font, mẫu, cấu hình AI).
- **Bảng Quản lý font** (sửa file gốc, đều có comment `[TINIX]`: `src/views/Admin.vue`, `src/api/admin.ts`, `service/src/service/admin.ts`, `service/src/db/fonts.ts`): cột Xem trước (ảnh chữ mẫu do `npm run tinix:font-previews` tạo), Nhóm, Tag, cờ Tiếng Việt; bộ lọc ngôn ngữ / tiếng Việt / nhóm; hộp thoại sửa có Nhóm + Tag. Font thêm tay trong admin chưa có ảnh cho đến khi chạy lại script.
- **Gắn tag font theo ảnh** (Trợ lý AI → Cài đặt → "AI gắn tag theo ảnh xem trước"): `POST /api/tinix/ai/tag-fonts` với `{mode:'vision', limit?, ids?}` → `tagFontsFromPreview` (`service/src/tinix/ai/tasks.ts`): gửi ảnh `static/font-previews/<id>.png` (lô 8 ảnh/lượt, qua `callVisionJSON`) để AI nhìn nét chữ rồi gán nhóm + tag. Cột mới `fonts.tag_source`: `''` | `name` (AI đoán theo tên) | `vision` | `manual` (sửa tay trong admin, AI không bao giờ ghi đè). Giá trị cũ của từng font ghi trong `ai_jobs.input_summary.previous` để khôi phục. Sửa file gốc: `service/src/db/fonts.ts` (`updateFont` đánh dấu manual).
- **Nhập nhiều PSD thành mẫu** (`/psd`, chỉ admin): chọn nhiều file `.psd` cùng lúc → `Psd.vue` gom file (Uploader phát `load` từng file), nhập tuần tự: `loadPSD` → `UploadTemplate.vue` `saveAsTemplate(title, cate)` (tải ảnh nền/ảnh lớp lên server rồi `saveTemplate`; server tự tạo ảnh bìa) → dọn trang → file kế. Bỏ qua file trùng tiêu đề mẫu đã có; chọn danh mục (tùy chọn) ở thanh trên; hộp thoại hiện tiến độ và lỗi từng file. Chọn 1 file thì giữ luồng cũ (mở trong editor). Đã nhập thử 9 PSD trong `psd-test/` (kể cả file 8268×11220, 35 MB): 9/9 thành công.
- **Đối chiếu với Tizino Design 1.2** (video review, kiểm tra 2026-11-13):
  | Tính năng (Tizino) | TinixPoster | Ghi chú |
  |---|---|---|
  | Trợ lý AI: sửa chữ, gợi ý chữ, dựng theo mẫu, tìm font, lịch sử | ✅ | đủ 5 chức năng |
  | Gợi ý chữ: 3 phong cách, tiêu đề/phụ đề/nội dung/hashtag/chữ ký | ✅ | chữ ký lấy từ tên studio trong Cài đặt AI |
  | Dựng theo mẫu thành lớp chỉnh sửa được | ✅ | 2 chế độ; ảnh nền tương tự bằng AI |
  | Tìm font bằng AI | ✅ | |
  | Bảng lớp: danh sách, kéo đổi thứ tự, khóa | ✅ | ⚠ chưa có nút ẩn/hiện và đổi tên lớp; chuột phải: sao chép/dán/lên/xuống/xóa |
  | Logo | ⚠ | thêm như ảnh thường (Ảnh/Của tôi); chưa có "logo mặc định" tự chèn |
  | Thư viện mẫu | ⚠ | đã nhập 9 PSD vào thư viện; còn ít so với 100+ tài nguyên của Tizino |
  Việc thiếu (backlog, chưa làm): nút ẩn/hiện + đổi tên lớp; logo mặc định theo studio.
- **Kiểm thử:** `npm run tinix:test` chạy 3 nhóm (AI nhà cung cấp giả, font, khóa i18n) trên DB tạm trong `.runtime/`; mã thoát khác 0 nếu lỗi. File: `scripts/tinix-test.cjs`, `scripts/tinix-selftest/fonts.ts`, `scripts/tinix-selftest/run-ts.cjs`. Checklist thử tay sau khi sửa giao diện: tạo thiết kế → thêm chữ → lưu → mở lại → xuất ảnh; trang admin → Quản lý font (lọc, sửa nhóm/tag, nút tạo ảnh xem trước).
- **Sao lưu:** `npm run tinix:backup` → `backups/<ngày-giờ>/poster.db` (SQLite backup API) + `static.tar.gz` (không gồm `fonts/`, `font-previews/`), giữ 10 bản mới nhất (`-- --keep N`). `backups/` nằm trong .gitignore.
- **Nút tạo ảnh xem trước còn thiếu** (trang admin → Quản lý font): gọi `POST /api/admin/fonts/previews` → `service/src/tinix/fontPreviews.ts` chạy `scripts/tinix-font-previews.mjs` (chỉ font chưa có ảnh). Sửa file gốc: `service/src/control/api.ts`, `service/src/control/router.ts` (route + import), `src/api/admin.ts`, `src/views/Admin.vue`, `src/languages/modules/vi/tinix-ui.ts`.
- **Nhập font:** `scripts/tinix-fonts.json` hỗ trợ `vietnamese:false`, `lang:'ko'|'zh'` và `source` (nhánh khác của google/fonts, vd apache/). Font từ `C:\Windows\Fonts` (14 OFL + 181 font chưa rõ giấy phép, đủ dấu tiếng Việt, không gồm font Microsoft) được quản lý bằng manifest `scripts/tinix-winfonts.json` + `npm run tinix:winfonts` (chép file từ thư mục Fonts của Windows, thêm/cập nhật DB; `-- --export` ghi lại manifest từ DB; `-- --dry` chỉ liệt kê); cột `license` ghi 'Không rõ…' để kiểm tra trước khi dùng thương mại. `service/static/` nằm trong .gitignore nên file font không lên git.

## Lỗi đã biết của repo gốc

- Mẫu chỉ hiện/xuất được khi `templates.state = 1`.
- `psd.js` 3.9 ném lỗi `throw "e"` với dữ liệu chữ của một số file Photoshop mới → đã chuyển sang **ag-psd** (psd.js chỉ còn làm dự phòng).
- Layer style (Color Overlay, Stroke, Bevel, Drop Shadow…) **không được vẽ lại**: ảnh/chữ dùng màu gốc của lớp (vd. mũi tên xám trong PSD có thể hiện màu khác).
- Xuất ảnh quá giờ (`截图超时`): service không còn bị tắt (nhờ `process-guard`), nhưng request đó không nhận được phản hồi lỗi — hàng đợi `queueRun` gốc không chuyển lỗi về. Xử lý sau nếu gặp thường xuyên.
- Service biên dịch bằng **TypeScript 3.9** → không dùng cú pháp mới (labeled tuple, `satisfies`, …) trong `service/`.
- File tĩnh trong `/static` bị gắn `Content-Type: application/json` (middleware gốc) — trình duyệt vẫn nạp font/ảnh bình thường.

## Ghi chú
- Vite đã sẵn `host: '127.0.0.1'` trong `vite.config.ts` → không cần sửa.
- Đổi `AUTH_SECRET` làm mất phiên đăng nhập cũ → đăng nhập lại.
- Font tải về (`service/static/`) và database (`service/data/`) không nằm trong git → sao lưu riêng hai thư mục này.
