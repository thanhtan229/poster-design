// [TINIX] Gợi ý nhóm cho mẫu theo TÊN mẫu (không gọi AI, miễn phí, kết quả xác định). Một mẫu có thể khớp nhiều nhóm.
export type GroupRule = { group: string; any: string[] }

/** Từ khóa đã bỏ dấu, viết thường; cụm nhiều từ khớp theo ranh giới từ */
export const GROUP_RULES: GroupRule[] = [
  { group: 'Em bé & trẻ em', any: ['baby', 'kid', 'kids', 'tre em', 'em be', 'children'] },
  { group: 'Tạp chí', any: ['tap chi', 'magazine'] },
  { group: 'Truyền thông', any: ['truyen thong', 'media', 'quang cao'] },
  { group: 'Nền', any: ['background', 'nen'] },
  { group: 'Wedding', any: ['wedding', 'cuoi', 'bride', 'groom', 'co dau', 'chu re'] },
  { group: 'Chân dung', any: ['chan dung', 'portrait'] },
]

/** Bỏ dấu tiếng Việt, về chữ thường, chỉ giữ chữ-số, nhiều khoảng trắng gộp một */
export function normalizeText(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Tên nhóm để so trùng: không phân biệt hoa thường/dấu thanh, gộp khoảng trắng */
export function groupKey(name: string): string {
  return normalizeText(name)
}

export function suggestGroupsForTitle(title: string): string[] {
  const text = ' ' + normalizeText(title) + ' '
  const out: string[] = []
  for (const rule of GROUP_RULES) {
    if (rule.any.some((kw) => text.indexOf(' ' + kw + ' ') >= 0)) out.push(rule.group)
  }
  return out
}
