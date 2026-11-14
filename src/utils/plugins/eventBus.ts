import mitt from 'mitt';

type Events = {
  refreshUserImages: any;
  'tinix:open-photo-dock': any; // [TINIX] mở dải ảnh phía dưới editor
};

const emitter = mitt<Events>();

export default emitter;