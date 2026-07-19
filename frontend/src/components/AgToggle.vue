<script setup lang="ts">
defineProps<{ 
  modelValue: boolean; 
  disabled?: boolean;
  size?: 'sm' | 'md';
}>();
defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <button
    class="toggle"
    :class="[
      { 'toggle--on': modelValue, 'toggle--disabled': disabled },
      size === 'sm' ? 'toggle--sm' : 'toggle--md'
    ]"
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
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border-color);
  position: relative;
  transition: background 0.2s ease, border-color 0.2s ease;
  display: block;
}

/* Medium size (default) */
.toggle--md .toggle__track {
  width: 44px;
  height: 24px;
}
.toggle--md .toggle__thumb {
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
}
.toggle--md.toggle--on .toggle__thumb {
  transform: translateX(20px);
}

/* Small size (ideal for compact toolbars/headers) */
.toggle--sm .toggle__track {
  width: 32px;
  height: 18px;
}
.toggle--sm .toggle__thumb {
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
}
.toggle--sm.toggle--on .toggle__thumb {
  transform: translateX(14px);
}

.toggle--on .toggle__track {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.toggle__thumb {
  position: absolute;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
</style>
