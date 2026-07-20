<template>
  <div class="quota-item group/quota">
    <div class="model-info">
      <component :is="icon" class="model-icon" />
      <span class="model-name">{{ name }}</span>
    </div>
    <div class="quota-stats">
      <span class="time-left">
        <ClockIcon class="clock-icon" size="12" />
        {{ timeLeft }}
      </span>
      <span class="percentage" :class="percentageColor">{{ percentage }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Clock as ClockIcon } from 'lucide-vue-next';

const props = defineProps<{
  name: string;
  icon: any;
  timeLeft: string;
  percentage: number;
}>();

const percentageColor = computed(() => {
  if (props.percentage > 80) return 'text-red-500';
  if (props.percentage > 50) return 'text-orange-500';
  if (props.percentage === 0) return 'text-red-500'; // based on screenshot where 0% is red
  return 'text-green-500';
});
</script>

<style scoped>
.quota-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  font-size: 11px;
  transition: all 0.2s;
  min-width: 140px;
}

.quota-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.model-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
}

.model-icon {
  width: 14px;
  height: 14px;
  opacity: 0.8;
}

.model-name {
  font-weight: 500;
  white-space: nowrap;
}

.quota-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-left {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #fbbf24; /* yellow/amber for time */
  font-family: monospace;
}

.percentage {
  font-weight: 700;
  font-family: monospace;
  width: 28px;
  text-align: right;
}

/* Color overrides */
.text-red-500 { color: #ef4444; }
.text-orange-500 { color: #f97316; }
.text-green-500 { color: #10b981; }
</style>
