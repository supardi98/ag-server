<script setup lang="ts">
interface Props {
  size?: 'sm' | 'md' | 'lg';
}

withDefaults(defineProps<Props>(), {
  size: 'md',
});
</script>

<template>
  <div :class="['spinner', `spinner--${size}`]"></div>
</template>

<style scoped>
.spinner {
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  border-top: 3px solid var(--color-primary);
  width: 28px;
  height: 28px;
  animation: spin 1s linear infinite;
  display: inline-block;
}

.spinner--sm {
  width: 18px;
  height: 18px;
  border-width: 2px;
}

.spinner--md {
  width: 28px;
  height: 28px;
  border-width: 3px;
}

.spinner--lg {
  width: 48px;
  height: 48px;
  border-width: 4px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
