import mitt from 'mitt';

type Events = {
  refreshUserImages: any;
  'tinix:open-photo-dock': any; // [TINIX] mở dải ảnh phía dưới editor
  'tinix:photos-library-changed': any; // [TINIX] thư viện "Ảnh" vừa thêm/gỡ ảnh ★ → tab Ảnh tải lại
};

const emitter = mitt<Events>();

export default emitter;