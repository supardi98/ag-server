<script setup lang="ts">
interface Props {
  hoverable?: boolean;
}

withDefaults(defineProps<Props>(), {
  hoverable: false,
});
</script>

<template>
  <div :class="['ag-card', { 'ag-card--hoverable': hoverable }]">
    <div v-if="$slots.header" class="ag-card__header">
      <slot name="header" />
    </div>
    <div class="ag-card__body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="ag-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.ag-card {
  background: var(--bg-card);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  transition: border-color var(--transition-normal), transform var(--transition-normal), box-shadow var(--transition-normal);
}

.ag-card--hoverable:hover {
  border-color: rgba(99, 102, 241, 0.25);
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.4);
}

.ag-card__header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  font-weight: 600;
  font-size: 16px;
}

.ag-card__body {
  padding: 20px;
}

.ag-card__footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  background-color: rgba(0, 0, 0, 0.05);
}
</style>
