<template>
  <!-- [TINIX] Nút "⋯" trên một mục của tab Chữ / Chất liệu: Sửa thông tin, Nhân bản (thành phần), Xóa hẳn -->
  <div class="lib-menu" @mousedown.stop @click.stop>
    <el-dropdown trigger="click" placement="bottom-end" :show-arrow="false" @command="onCommand">
      <button type="button" class="lib-menu__btn" :aria-label="$t('tinix.ui.library.itemMenu')" :title="$t('tinix.ui.library.itemMenu')">⋯</button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="edit">{{ $t('tinix.ui.library.editInfo') }}</el-dropdown-item>
          <el-dropdown-item v-if="kind === 'comp'" command="duplicate">{{ $t('tinix.ui.library.duplicate') }}</el-dropdown-item>
          <el-dropdown-item command="delete" divided><span class="danger">{{ $t('tinix.ui.library.delete') }}</span></el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script lang="ts" setup>
import { ElDropdown, ElDropdownItem, ElDropdownMenu, ElMessage, ElMessageBox } from 'element-plus'
import i18n from '@/languages'
import { deleteComp, deleteMaterial, duplicateComp, notifyLibraryChanged } from '@/utils/tinix/library-api'

const props = defineProps<{ kind: 'comp' | 'material'; item: any }>()
const emit = defineEmits<{ edit: [item: any] }>()
const t = (k: string, p?: Record<string, any>) => i18n.global.t(k, p || {}) as string

async function onCommand(cmd: string) {
  if (cmd === 'edit') return emit('edit', props.item)
  try {
    if (cmd === 'duplicate') {
      const r = await duplicateComp(Number(props.item.id))
      notifyLibraryChanged('comp')
      if (r.coverOk) ElMessage.success(t('tinix.ui.library.duplicated'))
      else ElMessage.warning(t('tinix.ui.library.coverFailed'))
      return
    }
    if (cmd === 'delete') {
      const name = props.item.title || t(props.kind === 'comp' ? 'tinix.ui.library.defaultComp' : 'tinix.ui.library.defaultMaterial')
      try {
        await ElMessageBox.confirm(t(props.kind === 'comp' ? 'tinix.ui.library.confirmDeleteComp' : 'tinix.ui.library.confirmDeleteMaterial', { name }), t('tinix.ui.library.deleteTitle'), { type: 'warning', confirmButtonText: t('tinix.ui.library.delete'), cancelButtonText: t('tinix.ui.library.cancel'), confirmButtonClass: 'el-button--danger' })
      } catch {
        return
      }
      if (props.kind === 'comp') await deleteComp(Number(props.item.id))
      else await deleteMaterial(props.item._libraryRef.cate, props.item._libraryRef.url)
      notifyLibraryChanged(props.kind)
      ElMessage.success(t('tinix.ui.library.deleted', { name }))
    }
  } catch (e: any) {
    ElMessage.error(e?.message || t('tinix.ui.library.failed'))
  }
}
</script>

<style lang="less" scoped>
.lib-menu {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.15s;
}
.lib-menu__btn {
  width: 24px;
  height: 20px;
  line-height: 16px;
  padding: 0;
  border: 1px solid #d0d4db;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.92);
  font-size: 15px;
  color: #333;
  cursor: pointer;
}
.danger {
  color: #c0392b;
}
</style>

<style lang="less">
/* hiện nút khi rê chuột vào ô (ô cha đặt class tinix-lib-cell) hoặc khi đang mở menu */
.tinix-lib-cell {
  position: relative;
}
.tinix-lib-cell:hover > .lib-menu,
.tinix-lib-cell .lib-menu:focus-within {
  opacity: 1;
}
</style>
