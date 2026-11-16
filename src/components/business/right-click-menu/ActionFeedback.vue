<template>
  <Teleport to="body">
    <div ref="element" class="action-feedback" data-action-feedback data-photo-history role="status" aria-live="polite" aria-atomic="true"
      @mouseenter="pause" @mouseleave="resume" @focusin="pause" @focusout="resume">
      <span data-feedback-message>{{ text }}</span>
      <button v-if="canUndo" type="button" data-feedback-undo @click="emit('undo')">{{ $t('editor.shortcut.undo') }}</button>
      <button type="button" class="feedback-close" data-feedback-close :aria-label="$t('business.feedback.dismiss')" @click="emit('close')">×</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
const props = defineProps<{ text: string; canUndo: boolean }>()
const emit = defineEmits<{ undo: []; close: [] }>()
let timer: ReturnType<typeof setTimeout> | undefined
const element = ref<HTMLElement | null>(null)
const pause = () => clearTimeout(timer)
const resume = () => {
  pause()
  if (element.value?.matches(':hover') || element.value?.contains(document.activeElement)) return
  timer = setTimeout(() => emit('close'), props.canUndo ? 8000 : 3000)
}
onMounted(resume)
onBeforeUnmount(pause)
</script>

<style lang="less" scoped>
.action-feedback {
  position: fixed;
  z-index: 100000;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: calc(100vw - 32px);
  padding: 12px 16px;
  border-radius: 8px;
  background: #202734;
  color: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, .2);
  font-size: 14px;
  button {
    flex: none;
    border: 0;
    background: transparent;
    color: #a9c5ff;
    padding: 4px;
    font: inherit;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    &:focus-visible { outline: 2px solid #a9c5ff; outline-offset: 2px; }
  }
  .feedback-close { color: #ddd; font-size: 20px; line-height: 20px; }
}
</style>
