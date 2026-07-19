<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean }>();
defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <button
    class="toggle"
    :class="{ 'toggle--on': modelValue, 'toggle--disabled': disabled }"
    :disabled="disabled"
    role="switch"
    :aria-checked="modelValue"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="toggle__track">
      <span class="toggle__thumb"></span>
    </span>
  </button>
</template>

<style scoped>
.toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
}

.toggle--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toggle__track {
  width: 52px;
  height: 28px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border-color);
  position: relative;
  transition: background var(--transition-base), border-color var(--transition-base);
  display: block;
}

.toggle--on .toggle__track {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.toggle__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  transition: transform var(--transition-base);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.toggle--on .toggle__thumb {
  transform: translateX(24px);
}
</style>
