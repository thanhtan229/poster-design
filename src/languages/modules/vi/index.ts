/**
 * [TINIX] Tiếng Việt cho giao diện TinixPoster.
 * Giữ cùng khóa với modules/en & modules/zh (home, tabs, header) + nhóm `tinix` cho phần đã Việt hóa.
 * Việt hóa thêm màn hình nào: thêm khóa vào đây rồi dùng $t('tinix....') trong file .vue.
 */
export default {
  home: {
    welcome: 'Xin chào',
  },
  tabs: {
    refresh: 'Làm mới',
  },
  header: {
    logout: 'Đăng xuất',
    save: 'Lưu',
    download: 'Tải ảnh',
  },
  tinix: {
    menu: {
      file: 'Tệp',
      help: 'Trợ giúp',
      ai: 'Trợ lý AI',
      changePassword: 'Đổi mật khẩu',
      admin: 'Quản trị',
      logout: 'Đăng xuất',
      login: 'Đăng nhập',
      cancel: 'Hủy',
      leaveWarn: 'Hệ thống không tự lưu các thay đổi chưa lưu của bạn',
    },
    folder: {
      newDesign: 'Tạo thiết kế mới',
      save: 'Lưu',
      download: 'Tải ảnh xuống',
      guides: 'Thước & đường gióng',
    },
    helper: {
      shortcuts: 'Phím tắt',
      tour: 'Hướng dẫn nhanh',
      feedback: 'Góp ý / báo lỗi',
    },
    login: {
      title: 'Đăng nhập tài khoản',
      tabLogin: 'Đăng nhập',
      tabRegister: 'Đăng ký',
      account: 'Tài khoản',
      password: 'Mật khẩu (đăng ký: tối thiểu 6 ký tự)',
      submitLogin: 'Đăng nhập',
      submitRegister: 'Đăng ký và đăng nhập',
      missing: 'Vui lòng nhập tài khoản và mật khẩu',
      failed: 'Thao tác không thành công',
    },
    password: {
      title: 'Đổi mật khẩu',
      old: 'Mật khẩu hiện tại',
      new: 'Mật khẩu mới (tối thiểu 6 ký tự)',
      confirm: 'Nhập lại mật khẩu mới',
      submit: 'Xác nhận đổi',
      missing: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới',
      tooShort: 'Mật khẩu mới phải có ít nhất 6 ký tự',
      mismatch: 'Hai lần nhập mật khẩu mới không khớp',
      success: 'Đổi mật khẩu thành công, vui lòng đăng nhập lại',
      failed: 'Đổi mật khẩu không thành công',
    },
    networkError: 'Lỗi kết nối tới máy chủ',
  },
}
