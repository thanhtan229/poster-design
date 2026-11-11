# Bản thiết kế MVP — App thiết kế ảnh cưới có Trợ lý AI (bản dùng cá nhân)

> Tên tạm: **TinixPoster** (đổi tên tùy ý — không dùng tên/giao diện/tài nguyên của Tizino).
> Ngày: 2026-11-11 · Phiên bản tài liệu: **0.3.1 — xây trên nền repo [palxiao/poster-design](https://github.com/palxiao/poster-design)**
> Thư mục dự án: `D:\___TOOLS\__TINIX\TinixPoster` · nhánh git `tinix` · đánh dấu chỗ sửa file gốc bằng `[TINIX]`
> Chỉ 1 người dùng (bạn), chạy trên máy của bạn.

---

## 0. Thay đổi so với bản 0.2

| Bản 0.2 (tự viết từ đầu) | Bản 0.3 (fork poster-design) |
|---|---|
| Next.js + react-konva tự làm editor | **Dùng editor có sẵn** của poster-design (Vue 3 + Vite, canvas DOM) |
| Lưu file JSON trong `data/` | **Dùng SQLite có sẵn** (`service/data/poster.db`) + thư mục `service/static/` |
| Tự làm thư viện font/element/template | **Dùng trang admin có sẵn** để quản lý font, chất liệu, mẫu |
| Tọa độ layer 0–1 | Giữ định dạng **px** của poster-design; AI trả 0–1 rồi đổi sang px |
| Lộ trình 5 tuần | **Khoảng 3 tuần** cho MVP |

Mượn thêm từ **[mir-ashiq/canvix](https://github.com/mir-ashiq/canvix)** (MIT): prompt & logic **Magic Layers** cho tính năng *Dựng theo mẫu* (giai đoạn 2). Khi chép code phải giữ thông báo bản quyền MIT của Canvix trong file `THIRD_PARTY.md`.

---

## 1. Mục tiêu & phạm vi

Công cụ riêng giúp bạn tạo **ảnh truyền thông** và **trang album cưới** nhanh hơn: thả ảnh → AI đề xuất chữ, font, bố cục hợp concept → chỉnh → xuất file.

### Đã có sẵn trong poster-design (không phải làm)
- Editor: chữ (font, cỡ, màu, giãn dòng, giãn chữ, viền, tô gradient), ảnh, SVG, nhóm, QR code, layer, căn chỉnh, đường gióng, undo/redo, **nhiều trang (multi-artboard)**.
- **Nhập file PSD thành mẫu** (`src/views/Psd.vue`, thư viện `psd.js`).
- Xóa nền ảnh chạy trong trình duyệt (`@bunnio/rembg-web`).
- Xuất ảnh bằng Puppeteer ở server, **tối đa ×4 độ phân giải**.
- Trang admin: quản lý font (ttf/woff), chất liệu, mẫu, danh mục, **cấu hình AI** (base URL, API key, model).
- AI có sẵn: viết chữ, tạo ảnh, gợi ý màu (`service/src/service/ai.ts`), qua endpoint tương thích OpenAI.
- Giao diện có tiếng Anh (`src/languages/modules/en`).

### Phải làm thêm cho MVP

| Có trong MVP | Để sau |
|---|---|
| Đơn giản hóa: tự đăng nhập 1 tài khoản, chỉ chạy localhost | Dịch giao diện sang tiếng Việt |
| Bổ sung **AI nhìn ảnh (vision)** vào service AI | **Dựng theo mẫu** (mượn Magic Layers của Canvix) |
| **Gợi ý chữ** từ ảnh | Xuất PSD |
| **Sửa chữ** cho mẫu có sẵn | Nâng cấp Puppeteer / Vite |
| **Tìm font** từ ảnh có chữ | Đóng gói app desktop |
| Nhật ký chi phí AI + giới hạn tháng | |
| Kho font có tiếng Việt + mẫu cưới của bạn | |

**Tiêu chí MVP thành công:** thả ảnh → bấm "Gợi ý chữ" → có thiết kế đẹp với font tiếng Việt hiển thị đúng → xuất JPG trong **dưới 3 phút**.

---

## 2. Luồng sử dụng

### Luồng A — Gợi ý chữ (cốt lõi)
1. Tạo thiết kế mới (chọn khổ: 1080×1350, 1080×1080, khổ album…).
2. Kéo ảnh vào trang, phóng full trang.
3. Mở **Trợ lý AI → Gợi ý chữ** → *Gợi ý*.
4. AI trả về **3 phương án phong cách** (VD: Tạp chí điện ảnh / Lãng mạn tinh tế / Hiện đại phá cách), mỗi phương án: tiêu đề, tiêu đề phụ, nội dung, hashtag, chữ ký studio, font, màu, vùng đặt chữ, căn lề, **nghĩa tiếng Việt**.
5. Tick các phần muốn dùng → *Thêm* → mỗi phần thành 1 widget chữ `wText` chỉnh được, đặt vào vùng trống AI phát hiện.
6. Chỉnh tay → Xuất JPG.

### Luồng B — Sửa chữ
1. Mở 1 mẫu có sẵn (có thể là mẫu nhập từ PSD), thay ảnh của mình vào.
2. **Trợ lý AI → Sửa chữ** → 3 phương án nội dung mới **giữ nguyên số dòng, độ dài, font, vị trí**.
3. *Áp dụng* → chỉ thay thuộc tính `text` của các widget chữ; ảnh, SVG, element giữ nguyên.

### Luồng C — Tìm font
1. **Trợ lý AI → Tìm font** → thả ảnh có chữ đẹp.
2. AI nhận diện từng đoạn chữ → đề xuất 3–5 font tương tự **trong bảng `fonts`**, kèm tên font nghi ngờ để bạn tự tìm tải nếu kho chưa có.
3. *Dùng font này* → áp vào widget chữ đang chọn.

### Luồng D — Mang mẫu PSD vào
Mở trang nhập PSD → chọn file PSD album/ảnh cưới bạn có → lưu thành mẫu → dùng ở Luồng B.

---

## 3. Kiến trúc

```
┌────────────── Trình duyệt (http://127.0.0.1:5173) ──────────────┐
│ Vue 3 + Vite + Pinia + Element Plus (có sẵn)                     │
│  ├─ Editor, widget wText / wImage / wSvg / wGroup (có sẵn)       │
│  └─ components/business/ai-assistant/  ← MỞ RỘNG: 3 tab AI mới  │
└───────────────┬──────────────────────────────────────────────────┘
                │ /api/...
┌───────────────▼──────────────────────────────────────────────────┐
│ service/ — Node.js + Express (cổng 7001, có sẵn)                 │
│  ├─ SQLite: service/data/poster.db (có sẵn)                      │
│  ├─ Puppeteer xuất ảnh (có sẵn)                                  │
│  └─ service/ai.ts  ← MỞ RỘNG: hàm chatVision + 3 route mới       │
│     service/ai/    ← MỚI: prompts, schema (zod), cost-log         │
└───────────────┬──────────────────────────────────────────────────┘
                │ endpoint tương thích OpenAI (/chat/completions)
        ┌───────▼──────────────────────────┐
        │ Model AI có thị giác             │
        │ (Gemini / Claude / GPT / GLM…)   │
        └──────────────────────────────────┘
```

**Nguyên tắc sửa code:** thêm file mới nhiều nhất có thể, sửa file gốc ít nhất có thể → dễ cập nhật khi repo gốc ra bản mới. Mỗi chỗ sửa file gốc đánh dấu bằng comment `// [TINIX]`.

---

## 4. Dữ liệu

### 4.1. Dùng lại của poster-design
| Bảng / thư mục | Dùng cho |
|---|---|
| `designs` (cột `data` là JSON thiết kế, `width`, `height`, `cover`) | Thiết kế của bạn |
| `templates`, `template_categories` | Mẫu (gồm mẫu nhập từ PSD) |
| `fonts` (alias, font_family, woff, ttf, lang…) | Kho font |
| `materials`, `asset_categories`, `photos`, `user_images` | Chất liệu, ảnh |
| `ai_settings` | Base URL, API key, model |
| `service/static/` | File ảnh, font, ảnh xuất |

### 4.2. Thêm mới
**Cột thêm vào bảng `fonts`** (migration trong `service/src/db/index.ts`):
- `category` TEXT — `serif | sans | script | display | handwriting`
- `tags` TEXT (JSON) — VD `["sang trọng","lãng mạn","cổ điển"]`
- `supports_vietnamese` INTEGER (0/1)
- `license` TEXT — VD `OFL`, `Free commercial`

**Bảng mới `ai_jobs`** (lịch sử + chi phí):
```sql
CREATE TABLE IF NOT EXISTS ai_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,            -- suggest_text | rewrite_text | find_font | rebuild
  input_summary TEXT,            -- JSON tóm tắt (không lưu ảnh gốc)
  output TEXT,                   -- JSON kết quả
  model TEXT,
  tokens_in INTEGER, tokens_out INTEGER,
  cost_vnd REAL,                 -- ước tính theo đơn giá trong ai_settings
  status TEXT,                   -- ok | error
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

**Thêm vào `ai_settings`:** `vision_model`, `studio_name`, `price_in_per_1m`, `price_out_per_1m` (VNĐ / 1 triệu token), `monthly_limit_vnd`.

### 4.3. Đổi tọa độ
Widget của poster-design dùng **px tuyệt đối** (`left`, `top`, `width`, `height`, `fontSize`). AI luôn trả **tỉ lệ 0–1** theo kích thước trang; frontend đổi:
`left = x × pageWidth`, `top = y × pageHeight`, `fontSize = sizeRatio × pageHeight`.

---

## 5. Giao diện

Giữ nguyên bố cục editor của poster-design. Chỉ mở rộng **Trợ lý AI** (`src/components/business/ai-assistant/`) thành các tab:

```
✨ Trợ lý AI
 ├ Gợi ý chữ   ← mới
 ├ Sửa chữ     ← mới
 ├ Tìm font    ← mới
 ├ Viết chữ / Tạo ảnh / Gợi ý màu   ← có sẵn
 └ Lịch sử     ← mới (đọc ai_jobs) + "Tháng này: ~xx.000đ"
```

**Thẻ phương án (dùng chung cho Gợi ý chữ & Sửa chữ):** 3 thẻ; mỗi thẻ có checkbox từng phần (tiêu đề, phụ đề, nội dung, hashtag, chữ ký), dropdown đổi font, nút căn lề, phần "Nghĩa tiếng Việt" thu gọn được, nút **Thêm** / **Áp dụng**, nút **Gợi ý lại**.

**Trang admin:** thêm ô nhập `vision_model`, `studio_name`, đơn giá token, giới hạn tháng vào trang cấu hình AI sẵn có; thêm cột category/tags/tiếng Việt/license vào trang quản lý font, và nút **"AI gắn tag font"**.

---

## 6. Tính năng AI

### 6.0. Nền chung (làm trước)
Trong `service/src/service/ai.ts` đã có `chatCompletion(apiKey, baseUrl, model, system, user)` chỉ gửi chữ. Thêm:
- `chatVision({ system, text, images: base64[], model, jsonSchema? })` — gửi `content` dạng mảng `[{type:'text'}, {type:'image_url', image_url:{url:'data:image/jpeg;base64,…'}}]` (chuẩn OpenAI, hầu hết nhà cung cấp tương thích đều nhận).
- Yêu cầu `response_format: { type: 'json_object' }` (hoặc json_schema nếu model hỗ trợ) + **validate bằng zod** (cần cài thêm `zod` vào service); sai → thử lại 1 lần → vẫn sai thì báo lỗi rõ.
- Server **resize ảnh** (dùng `sharp` — đã có sẵn trong `service/package.json`) về cạnh dài ~1024px, JPEG 80.
- Mỗi lần gọi: kiểm tra `monthly_limit_vnd` → gọi → ghi `ai_jobs` (token từ trường `usage` của response).
- Model **chỉ được chọn font trong danh sách** gửi kèm (rút gọn: `font_family`, `category`, `tags`, chỉ font `supports_vietnamese=1` khi ngôn ngữ là VI).
- Prompt để riêng trong `service/src/tinix/ai/prompts/*.ts` để dễ chỉnh.

**Route mới** (thêm vào `service/src/control/api.ts` + `router.ts`):

| Route | Mô tả |
|---|---|
| `POST /api/ai/suggest-text` | Gợi ý chữ |
| `POST /api/ai/rewrite-text` | Sửa chữ |
| `POST /api/ai/find-font` | Tìm font |
| `POST /api/ai/tag-fonts` | AI gắn tag cho font chưa có tag |
| `GET /api/ai/jobs`, `GET /api/ai/usage?month=` | Lịch sử & chi phí |

*(Tiền tố `/api` lấy từ biến `path` trong `service/src/control/api.ts`.)*

### 6.1. Gợi ý chữ
**Input:** ảnh nền (frontend cắt từ widget ảnh lớn nhất hoặc chụp trang thu nhỏ), kích thước trang, `studio_name`, ngôn ngữ (EN/VI), danh sách font rút gọn.

**Output schema:**
```ts
{
  scene: string;                                   // mô tả bối cảnh (tiếng Việt)
  emptyRegions: { x, y, w, h, tone: 'dark'|'light' }[];   // 0..1
  options: Array<{                                 // đúng 3, phong cách khác nhau rõ
    styleName: string;
    regionIndex: number;
    align: 'left'|'center'|'right';
    palette: { primary: string; secondary: string };
    parts: {
      title:      { text, fontFamily, weight, italic, uppercase },
      subtitle?:  { ... }, body?: { ... }, hashtag?: { ... }, signature?: { ... }
    };
    translationVi: string;
  }>
}
```

**Prompt khung (system):**
> Bạn là art director chuyên thiết kế ảnh cưới & ảnh truyền thông cho studio. Phân tích ảnh: bối cảnh, cảm xúc, ánh sáng, màu chủ đạo, vùng trống. Đề xuất 3 phương án typography theo 3 phong cách khác nhau. Chữ ngắn, giàu cảm xúc, tránh sáo rỗng. Chỉ dùng font trong danh sách. Màu chữ phải đọc rõ trên vùng nền đã chọn. Chữ ký = tên studio. Trả về đúng JSON schema.

**Frontend dựng widget:** từ vùng + căn lề → xếp các phần theo cột dọc (title lớn nhất, subtitle ~40%, body ~25%, hashtag/signature nhỏ nhất) → đổi sang px → tạo widget `wText` (tham khảo cách widget chữ được thêm từ panel chữ có sẵn) → nếu chữ tràn vùng thì giảm `fontSize` dần. Kiểm tra tương phản màu chữ/nền; thấp thì đổi trắng/đen.

### 6.2. Sửa chữ
**Input:** ảnh chụp trang hiện tại (thu nhỏ) + danh sách widget chữ `{uuid, text, số ký tự, số dòng, fontSize}`.
**Output:** 3 phương án `{ styleName, replacements: { uuid, text }[], translationVi }`.
**Ràng buộc:** giữ số dòng; độ dài mỗi dòng ±20%; giữ ngôn ngữ gốc từng widget; khớp ảnh.

### 6.3. Tìm font
1. Model thị giác đọc ảnh → mỗi đoạn chữ: `text`, `bbox`, đặc trưng (category, có chân/không, tương phản nét, nghiêng, nối nét, độ đậm, độ rộng, cảm giác), *tên font nghi ngờ*.
2. Server so khớp với bảng `fonts`: lọc category → chấm điểm theo tags → ưu tiên tên trùng/na ná → trả top 5 + danh sách tên nghi ngờ chưa có trong kho.

### 6.4. Dựng theo mẫu (giai đoạn 2 — mượn Canvix)
- Chép & chỉnh từ Canvix: prompt trong `src/app/api/ai/magic-layers/route.ts`, logic `src/lib/magic-layers/{types,validate,normalize,reconstruct}.ts` (~550 dòng).
- Viết bộ chuyển `regions → widget poster-design`: text → `wText` (fontClass → chọn font trong kho theo category), photo → `wImage` ô trống để thả ảnh, shape/decoration → `wSvg` hoặc ảnh cắt.
- Bước thêm so với Canvix: **viết lại nội dung** theo ảnh của bạn (giữ độ dài từng khối).
- Chỉ học **bố cục & phong cách**, luôn thay nội dung — không sao chép nguyên mẫu.

---

## 7. Đơn giản hóa cho 1 người dùng

- Không gỡ hệ thống đăng nhập (gỡ dễ gây lỗi); thay vào đó: tạo **1 tài khoản admin**, bật "ghi nhớ đăng nhập" dài hạn.
- ✅ `AUTH_SECRET` chuyển sang `service/.env` (nạp bởi `service/src/tinix/env.ts`; mẫu ở `service/.env.example`).
- ✅ Cho Vite và Express **chỉ nghe 127.0.0.1** để máy khác trong mạng không truy cập được.
- ✅ Chạy trên Windows: `npm run tinix:dev` (script `scripts/tinix-dev.mjs`, không cần Git Bash). Cài lại phụ thuộc: `npm run tinix:setup`.

---

## 8. Cấu trúc thư mục thêm mới

```
TinixPoster/                             ← D:\___TOOLS\__TINIX\TinixPoster (nhánh git: tinix)
  CLAUDE.md                              ← hướng dẫn cho AI khi vibe coding
  TINIX.md                               ← ghi lại mọi chỗ đã sửa file gốc
  THIRD_PARTY.md                         ← ghi công Canvix (MIT) khi chép code
  scripts/tinix-dev.mjs                  ← chạy editor + service cùng lúc (Windows OK)
  service/.env                           ← AUTH_SECRET, HOST, PORT (không commit)
  service/src/
    tinix/env.ts                         ← nạp service/.env trước mọi module
    tinix/ai/
      vision.ts                          ← chatVision, resize ảnh, parse JSON
      cost-log.ts                        ← ghi ai_jobs, tính chi phí, giới hạn tháng
      prompts/suggest-text.ts  rewrite-text.ts  find-font.ts  tag-fonts.ts
      schemas/*.ts                       ← zod
      font-matcher.ts
      magic-layers/                      ← (giai đoạn 2, từ Canvix)
    service/ai.ts                        ← [TINIX] thêm handler route mới
  src/
    api/ai.ts                            ← [TINIX] thêm hàm gọi route mới
    components/business/ai-assistant/
      AiAssistant.vue                    ← [TINIX] thêm tab
      SuggestTextTab.vue  RewriteTextTab.vue  FindFontTab.vue  HistoryTab.vue
      OptionCard.vue
    utils/tinix/
      place-text.ts                      ← đổi 0–1 → px, xếp chữ vào vùng, co chữ
      contrast.ts
```

---

## 9. Lộ trình & tiêu chí hoàn thành

| Tuần | Việc | Xong khi |
|---|---|---|
| 0 (1–2 ngày) | Chạy ổn định trên Windows, tạo tài khoản admin, đổi AUTH_SECRET, chỉ nghe localhost, commit git nhánh `tinix` | Mở editor, tạo & lưu 1 thiết kế, xuất JPG |
| 1 | Nạp **30–50 font có tiếng Việt** (Google Fonts/OFL) qua admin; kiểm tra hiển thị & xuất ảnh dấu tiếng Việt; nhập 5–10 mẫu PSD của bạn; migration cột font + bảng `ai_jobs` | Font Việt hiển thị đúng cả trong editor lẫn ảnh xuất |
| 2 | `chatVision` + cost-log + **Gợi ý chữ** end-to-end + tab Lịch sử | Luồng A chạy trọn |
| 3 | **Sửa chữ** + **Tìm font** + AI gắn tag font | Luồng B, C chạy trọn; dùng thật cho công việc |
| 4+ | Giai đoạn 2: Dựng theo mẫu (Canvix Magic Layers); dịch giao diện tiếng Việt | — |

**Kiểm tra quan trọng ở tuần 1:** xuất ảnh dùng Puppeteer (Chromium) ở server → font phải được Chromium tải được; nếu ảnh xuất mất dấu tiếng Việt thì kiểm tra file woff có đủ ký tự Việt (nhiều font Trung Quốc trong kho mẫu không có).

---

## 10. Chi phí

| Hạng mục | Chi phí |
|---|---|
| Hosting, database | **0đ** (chạy trên máy) |
| AI | Theo lượt dùng — xem tab Lịch sử; đặt `monthly_limit_vnd` |

---

## 11. Rủi ro & cách xử lý

| Rủi ro | Cách xử lý |
|---|---|
| Repo không có test tự động | Sau mỗi bước, chạy thử tay theo danh sách kiểm tra (tạo, lưu, mở, thêm chữ, xuất); commit git nhỏ để dễ quay lại |
| Ghi chú code tiếng Trung | Để Claude đọc & giải thích; ghi chú phần mới bằng tiếng Việt/Anh |
| Puppeteer 10, Vite 5 đã cũ | Giữ nguyên cho MVP; chỉ nâng cấp khi gặp lỗi |
| Giấy phép AGPL | Dùng cá nhân không sao. Nếu sau này mở cho người khác dùng qua mạng → phải công khai mã nguồn bản sửa |
| Font trong kho mẫu thiếu chữ Việt / bản quyền không rõ | Ẩn/xóa font không hỗ trợ tiếng Việt; ưu tiên Google Fonts/OFL; ghi `license` |
| AI đặt chữ sai vùng / màu khó đọc | Kiểm tra tương phản; luôn chỉnh tay được |
| AI bịa tên font | Chỉ cho chọn trong danh sách gửi kèm; validate zod |
| Lộ API key | Key chỉ lưu ở server (bảng `ai_settings`); server chỉ nghe localhost |
| Riêng tư ảnh cưới | Chọn gói API không dùng dữ liệu để train; ảnh gửi đi đã thu nhỏ |
| Repo gốc ra bản mới | Làm trên nhánh `tinix`, đánh dấu `[TINIX]`; cập nhật bằng `git merge` khi cần |

---

## 12. Cách vibe coding theo bản thiết kế này

1. ✅ File này và `CLAUDE.md` đã nằm ở thư mục gốc `TinixPoster/`; `CLAUDE.md` tóm tắt: stack (Vue 3 + Vite + Pinia + Element Plus / Express + SQLite + Puppeteer), quy ước (`[TINIX]`, file mới đặt trong `service/src/tinix/` và `src/utils/tinix/`, ghi chú tiếng Việt/Anh, mọi lời gọi AI qua `service/src/tinix/ai/vision.ts`).
2. Làm **theo từng dòng của bảng Lộ trình (mục 9)**, mỗi lần 1 việc nhỏ, ví dụ:
   - *"Đọc MVP-SPEC.md mục 7. Cho Vite và Express chỉ nghe 127.0.0.1, chuyển AUTH_SECRET sang .env, thêm script chạy được trên Windows."*
   - *"Theo mục 4.2, thêm migration cột category/tags/supports_vietnamese/license cho bảng fonts và bảng ai_jobs."*
   - *"Theo mục 6.0, viết service/src/tinix/ai/vision.ts và cost-log.ts."*
   - *"Theo mục 6.1, làm route suggest-text và tab SuggestTextTab.vue."*
3. Sau mỗi bước: chạy thử trên trình duyệt, commit git, rồi mới sang bước tiếp.
4. Chuẩn bị **10 ảnh cưới thử nghiệm** đa dạng (ngoài trời, trong nhà, tối, sáng, nhiều/ít khoảng trống) để đánh giá prompt AI mỗi lần sửa.
