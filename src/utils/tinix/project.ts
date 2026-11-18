// [TINIX] Dự án = thiết kế + các ảnh khách đã nhập vào dự án (kể cả ảnh chưa dùng). Lưu trong tệp .tinix.zip cùng design.json.
// Ảnh vẫn nằm trong kho ảnh chung của app (bảng user_images); dự án chỉ ghi nhớ ảnh nào thuộc về nó để dải ảnh hiện đúng ảnh của khách đang làm.
import { reactive } from 'vue'
import { photoState, type TPhoto } from './photo-strip'

export const project = reactive({
  /** Đường dẫn ảnh gốc (/static/photos/…) của các ảnh thuộc dự án này */
  paths: [] as string[],
})

/** 'project' = chỉ ảnh của dự án đang mở; 'library' = toàn bộ ảnh đã tải */
export const stripScope = reactive({ value: 'project' as 'project' | 'library' })

export function staticOf(url: string): string {
  return '/static/' + String(url || '').replace(/\?.*$/, '').replace(/^.*\/static\//, '')
}

export function addToProject(urls: string[]) {
  const have = new Set(project.paths)
  for (const url of urls) {
    const path = staticOf(url)
    if (url && !have.has(path)) { have.add(path); project.paths.push(path) }
  }
}

export function setProjectPaths(urls: string[]) {
  project.paths = Array.from(new Set(urls.map(staticOf)))
}

export function resetProject() {
  project.paths = []
  stripScope.value = 'project'
}

/** Các ảnh trong kho chung thuộc dự án (theo đường dẫn ảnh gốc). */
export function projectPhotos(): TPhoto[] {
  const set = new Set(project.paths)
  return photoState.photos.filter((p) => set.has(staticOf(p.url)))
}

/** Ảnh nằm trên canvas thì mặc nhiên thuộc dự án. Trả về các đường dẫn ảnh gốc/ảnh nhẹ tìm thấy trong chuỗi JSON của thiết kế. */
export function adoptUsedPhotos(designJson: string) {
  const urls: string[] = []
  for (const p of photoState.photos) {
    const keys = [p.url, p.web_url].filter(Boolean).map(staticOf)
    if (keys.some((k) => designJson.indexOf(k) >= 0)) urls.push(p.url)
  }
  if (urls.length) addToProject(urls)
}
