/**
 * [TINIX] Dịch thông báo lỗi tiếng Trung do service trả về (res.msg) sang tiếng Việt,
 * để không phải sửa code service gốc. Chuỗi không có trong bảng được giữ nguyên.
 */
const SERVER_MESSAGES: Record<string, string> = {
  '账号不能为空，密码至少6位': 'Tài khoản không được để trống, mật khẩu tối thiểu 6 ký tự',
  '账号不能为空，密码至少 6 位': 'Tài khoản không được để trống, mật khẩu tối thiểu 6 ký tự',
  '账号已存在': 'Tài khoản đã tồn tại',
  '账号或密码错误': 'Sai tài khoản hoặc mật khẩu',
  '请先登录': 'Vui lòng đăng nhập trước',
  '无管理员权限': 'Tài khoản không có quyền quản trị',
  '原密码不能为空，新密码至少 6 位': 'Phải nhập mật khẩu hiện tại, mật khẩu mới tối thiểu 6 ký tự',
  '原密码错误': 'Mật khẩu hiện tại không đúng',
  '作品不存在': 'Thiết kế không tồn tại',
  '图片不存在': 'Ảnh không tồn tại',
  '模板不存在': 'Mẫu không tồn tại',
}

export function viServerMsg(msg: unknown): string {
  if (typeof msg !== 'string' || !msg) return ''
  return SERVER_MESSAGES[msg.trim()] ?? msg
}
