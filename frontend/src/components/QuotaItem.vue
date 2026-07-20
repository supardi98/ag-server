<template>
  <div class="quota-item group/quota" :class="itemClass" :style="progressStyle" @click="copyId" :title="`Click to copy ID: ${id || name}`">
    <div class="model-info">
      <component :is="copied ? CheckIcon : icon" class="model-icon" :class="copied ? 'text-green-400' : iconClass" />
      <span class="model-name" :class="{'font-mono': isRawName, 'text-green-400': copied}">{{ copied ? 'Copied ID!' : name }}</span>
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
import { ref, computed } from 'vue';
import { Clock as ClockIcon, Check as CheckIcon } from 'lucide-vue-next';

const props = defineProps<{
  id?: string;
  name: string;
  icon: any;
  timeLeft: string;
  percentage: number;
}>();

const copied = ref(false);

const copyId = () => {
  const textToCopy = props.id || props.name;
  navigator.clipboard.writeText(textToCopy).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  }).catch(console.error);
};

const isRawName = computed(() => props.name.includes('-') || props.name.includes('_'));

const percentageColor = computed(() => {
  if (props.percentage === 0) return 'text-red-500';
  if (props.percentage >= 100) return 'text-green-400';
  return 'text-emerald-400';
});

const itemClass = computed(() => {
  if (props.percentage === 0) return 'border-red text-muted';
  if (props.percentage >= 100) return 'border-green';
  return 'border-dark-green';
});

const progressStyle = computed(() => {
  let activeColor = 'rgba(16, 185, 129, 0.15)'; // Dark green tint for active
  if (props.percentage === 0) activeColor = 'rgba(239, 68, 68, 0.15)';
  else if (props.percentage >= 100) activeColor = 'rgba(16, 185, 129, 0.25)';
  
  const inactiveColor = 'rgba(255, 255, 255, 0.03)';
  return {
    background: `linear-gradient(to right, ${activeColor} ${props.percentage}%, ${inactiveColor} ${props.percentage}%)`
  };
});

const iconClass = computed(() => {
  const n = props.name.toLowerCase();
  if (n.includes('image') || n.includes('high')) return 'text-colorful';
  if (n.includes('agent') || n.includes('oss')) return 'text-gray-400';
  if (n.includes('claude') || n.includes('reasoning')) return 'text-orange-400';
  return 'text-blue-400';
});
</script>

<style scoped>
.quota-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11.5px;
  transition: all 0.2s;
  min-width: 140px;
  border: 1px solid transparent;
  cursor: pointer;
}

/* Dynamic Borders */
.border-red { border-color: rgba(239, 68, 68, 0.2); }
.border-green { border-color: rgba(16, 185, 129, 0.3); }
.border-dark-green { border-color: rgba(16, 185, 129, 0.1); }

.quota-item:hover {
  filter: brightness(1.2);
}

.model-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e2e8f0;
  overflow: hidden;
  min-width: 0;
}

.model-icon {
  width: 13px;
  height: 13px;
}

.text-colorful { color: #38bdf8; }
.text-gray-400 { color: #94a3b8; }
.text-orange-400 { color: #fb923c; }
.text-blue-400 { color: #60a5fa; }

.model-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
}

.quota-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.time-left {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #fbbf24;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
}

.percentage {
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  width: 32px;
  text-align: right;
  font-size: 10.5px;
}

/* Color overrides */
.text-red-500 { color: #ef4444; }
.text-green-400 { color: #34d399; }
.text-emerald-400 { color: #10b981; }
</style>
