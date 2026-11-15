export const primaryModifierLabel = /Macintosh|Mac OS X/.test(navigator.userAgent) ? '⌘' : 'Ctrl'

export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!target.closest('input, textarea, select, [role="textbox"], [role="combobox"]') ||
    (target instanceof HTMLElement && target.isContentEditable)
}

/** Leave text editing, IME, and active dialogs/dropdowns to their own controls. */
export function selectionShortcut(event: KeyboardEvent): 'select-all' | 'deselect-all' | null {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey) return null
  const command = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' ? 'select-all'
    : event.key === 'Escape' && !event.ctrlKey && !event.metaKey ? 'deselect-all' : null
  if (!command || event.composedPath().some(isTextInput) || isTextInput(document.activeElement)) return null
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"], .el-dialog, .el-drawer, [role="listbox"]')
  if (Array.from(dialogs).some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')) return null
  return command
}
