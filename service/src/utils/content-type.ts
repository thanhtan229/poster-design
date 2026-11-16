/**
 * [TINIX] Content-Type cho tệp phục vụ dưới /static.
 *
 * Middleware gốc ở main.ts (`app.all('*')`) gắn `Content-Type: application/json` cho MỌI phản hồi, nên mọi đuôi tệp tĩnh phải được
 * liệt kê ở đây để ghi đè bằng loại đúng. Đuôi không có trong bảng vẫn nhận "application/json" (hành vi cũ).
 * Trước đây thiếu font (ttf/otf/woff/woff2) và webp: font bị trả "application/json" (trình duyệt vẫn tải được vì bỏ qua MIME của
 * font, nhưng `drafts inspect-assets` coi JSON là trang lỗi và báo sai RESOURCE_UNAVAILABLE cho mọi font).
 * Service biên dịch bằng TypeScript 3.9: giữ cú pháp đơn giản.
 */
const TYPES: { [extension: string]: string } = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

/** Loại nội dung theo đuôi tệp, hoặc null nếu không có trong bảng. */
export function getContentType(filePath: any): string | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(filePath || ''))
  if (!match) return null
  const extension = match[1].toLowerCase()
  // hasOwnProperty: tránh các khóa kế thừa như "constructor" / "toString" trong đường dẫn do người dùng gửi
  return Object.prototype.hasOwnProperty.call(TYPES, extension) ? TYPES[extension] : null
}

/** Middleware cho /static: đặt Content-Type đúng theo đuôi tệp (chạy trước express.static). */
export function setUploadContentType(req: any, res: any, next: any) {
  const contentType = getContentType(req.path)
  if (contentType) {
    res.setHeader('Content-Type', contentType)
  }
  next()
}
