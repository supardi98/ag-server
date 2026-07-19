<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

withDefaults(defineProps<Props>(), {
  variant: 'primary',
  disabled: false,
  type: 'button',
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="['ag-btn', `ag-btn--${variant}`]"
  >
    <slot />
  </button>
</template>

<style scoped>
.ag-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-fast);
  outline: none;
}

.ag-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ag-btn--primary {
  background-color: var(--color-primary);
  color: #ffffff;
}

.ag-btn--primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.ag-btn--secondary {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-color);
}

.ag-btn--secondary:hover:not(:disabled) {
  background-color: var(--bg-secondary);
  border-color: var(--border-color-hover);
}

.ag-btn--danger {
  background-color: var(--color-danger);
  color: #ffffff;
}

.ag-btn--danger:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.ag-btn--ghost {
  background-color: transparent;
  color: var(--text-secondary);
}

.ag-btn--ghost:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.ag-btn:active:not(:disabled) {
  transform: translateY(0);
}
</style>
