<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

interface Props {
  show: boolean;
  title?: string;
}

const emit = defineEmits(['close']);
const props = defineProps<Props>();

const close = () => {
  emit('close');
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.show) {
    close();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="ag-modal-backdrop" @click.self="close">
        <div class="ag-modal-container">
          <div class="ag-modal-header">
            <h3>{{ title || 'Notification' }}</h3>
            <button class="close-btn" @click="close">&times;</button>
          </div>
          <div class="ag-modal-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="ag-modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ag-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(3, 7, 18, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.ag-modal-container {
  background: var(--bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 500px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ag-modal-header {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
}

.ag-modal-header h3 {
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
  transition: color var(--transition-fast);
}

.close-btn:hover {
  color: var(--text-primary);
}

.ag-modal-body {
  padding: 20px;
  overflow-y: auto;
  max-height: 70vh;
}

.ag-modal-footer {
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-color);
  background-color: rgba(0, 0, 0, 0.15);
}

/* Animations */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-normal);
}

.fade-enter-active .ag-modal-container,
.fade-leave-active .ag-modal-container {
  transition: transform var(--transition-normal), opacity var(--transition-normal);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-from .ag-modal-container {
  transform: scale(0.95);
  opacity: 0;
}

.fade-leave-to .ag-modal-container {
  transform: scale(0.95);
  opacity: 0;
}
</style>
