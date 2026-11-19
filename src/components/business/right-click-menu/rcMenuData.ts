import i18n from '@/languages'
import type { TDistributeAxis, TUpdateAlignData } from '@/store/design/widget/actions/align'
/*
 * @Author: ShawnPhang
 * @Date: 2021-07-30 17:38:50
 * @Description:
 * @LastEditors: ShawnPhang, Jeremy Yu <https://github.com/JeremyYu-cn>
 * @Date: 2024-03-04 18:50:00
 */

export type TMenuItemData = {
  left: number
  top: number
  list: TWidgetItemData[]
}

export const menuList: TMenuItemData = {
  left: 0,
  top: 0,
  list: [],
}

export type TWidgetItemData = {
  type: 'copy' | 'paste' | 'duplicate' | 'index-up' | 'index-down' | 'index-front' | 'index-back' | 'del' | 'delete-all' | 'group' | 'ungroup' | 'lock' | 'lock-all' | 'unlock' | 'unlock-all' | 'hide' | 'hide-all' | 'show' | 'show-all' | 'select-all' | 'deselect-all' | 'invert-selection' | 'selection-menu' | 'arrange-menu' | 'visibility-menu' | 'locking-menu' | 'align' | `align-${TUpdateAlignData['align']}` | 'distribute' | `distribute-${TDistributeAxis}` | 'library-menu' | 'lib-save-over' | 'lib-save-new' /* [TINIX] thư viện */
  text: string
  children?: TWidgetItemData[]
  disabled?: boolean
  hint?: string
  danger?: boolean
  separatorBefore?: boolean
  shortcut?: string
}

export function organizeMenu(items: TWidgetItemData[]): TWidgetItemData[] {
  const find = (type: TWidgetItemData['type']) => items.find(item => item.type === type)
  const result: TWidgetItemData[] = []
  const add = (type: TWidgetItemData['type']) => { const item = find(type); if (item) result.push(item) }
  const category = (type: TWidgetItemData['type'], label: string, types: TWidgetItemData['type'][]) => {
    const children = types.map(find).filter((item): item is TWidgetItemData => !!item)
    if (children.length) result.push({ type, text: i18n.global.t(label), children })
  }
  ;(['copy', 'paste', 'duplicate', 'group', 'ungroup'] as const).forEach(add)
  category('selection-menu', 'business.menu.selectionMenu', ['select-all', 'deselect-all', 'invert-selection'])
  category('arrange-menu', 'business.menu.arrangeMenu', ['index-up', 'index-down', 'index-front', 'index-back', 'align', 'distribute'])
  category('visibility-menu', 'business.menu.visibilityMenu', ['hide', 'show', 'show-all', 'hide-all'])
  category('locking-menu', 'business.menu.lock', ['lock', 'unlock', 'lock-all', 'unlock-all'])
  category('library-menu', 'tinix.ui.library.menu', ['lib-save-over', 'lib-save-new']) // [TINIX] lưu ngược về thư viện
  for (const type of ['del', 'delete-all'] as const) {
    const item = find(type)
    if (item) result.push({ ...item, danger: true, separatorBefore: type === 'del' || !find('del') })
  }
  return result
}

export const widgetMenu: TWidgetItemData[] = [
  {
    type: 'copy',
    text: i18n.global.t('business.menu.copy'),
  },
  {
    type: 'paste',
    text: i18n.global.t('business.menu.paste'),
  },
  {
    type: 'duplicate',
    text: i18n.global.t('business.menu.duplicate'),
  },
  {
    type: 'index-up',
    text: i18n.global.t('business.menu.up'),
  },
  {
    type: 'index-down',
    text: i18n.global.t('business.menu.down'),
  },
  {
    type: 'index-front',
    text: i18n.global.t('business.menu.front'),
  },
  {
    type: 'index-back',
    text: i18n.global.t('business.menu.back'),
  },
  {
    type: 'align',
    text: i18n.global.t('business.menu.align'),
    children: [
      { type: 'align-left', text: i18n.global.t('editor.tip.alignLeft') },
      { type: 'align-right', text: i18n.global.t('editor.tip.alignRight') },
      { type: 'align-top', text: i18n.global.t('editor.tip.alignTop') },
      { type: 'align-bottom', text: i18n.global.t('editor.tip.alignBottom') },
      { type: 'align-ch', text: i18n.global.t('editor.tip.alignHCenter') },
      { type: 'align-cv', text: i18n.global.t('editor.tip.alignVCenter') },
    ],
  },
  {
    type: 'distribute',
    text: i18n.global.t('business.menu.distribute'),
    children: [
      { type: 'distribute-horizontal', text: i18n.global.t('business.menu.horizontal') },
      { type: 'distribute-vertical', text: i18n.global.t('business.menu.vertical') },
    ],
  },
  {
    type: 'lock',
    text: i18n.global.t('business.menu.lock'),
  },
  {
    type: 'hide',
    text: i18n.global.t('business.menu.hide'),
  },
  {
    type: 'del',
    text: i18n.global.t('business.menu.delete'),
  },
]

export const pageMenu: TWidgetItemData[] = [
  {
    type: 'paste',
    text: i18n.global.t('business.menu.paste'),
  },
]
