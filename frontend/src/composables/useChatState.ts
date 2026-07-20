import { ref, computed } from 'vue';

export interface StepGroup {
  type: 'user' | 'response';
  step?: any; // primary step representation for metadata (like time)
  responseSteps: any[]; // all assistant steps in this turn
  processingSteps: any[]; // all tool calls / command runs in this turn
}

export function useChatState() {
  const activeConvSteps = ref<any[]>([]);
  const activeConvLoading = ref(false);
  const chatMessagesContainer = ref<HTMLElement | null>(null);
  const loadedStart = ref(0);
  const totalSteps = ref(0);
  const loadingOlder = ref(false);

  const agentTyping = ref(false);
  const rawHtml = ref('');
  const rawCss = ref('');

  // Expandable Review Steps Track
  const expandedReviewSteps = ref<Set<number>>(new Set());

  const toggleReviewStep = (stepIndex: number) => {
    if (expandedReviewSteps.value.has(stepIndex)) {
      expandedReviewSteps.value.delete(stepIndex);
    } else {
      expandedReviewSteps.value.add(stepIndex);
    }
    expandedReviewSteps.value = new Set(expandedReviewSteps.value);
  };

  const loadCacheFromStorage = (): Record<string, any[]> => {
    try {
      const cached = localStorage.getItem('ag_conv_steps_cache');
      if (!cached) return {};
      const parsed = JSON.parse(cached);
      // Purge large historic datasets from cache to prevent rendering lag
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key]) && parsed[key].length > 30) {
          delete parsed[key];
        }
      }
      return parsed;
    } catch {
      return {};
    }
  };
  
  const conversationStepsCache = ref<Record<string, any[]>>(loadCacheFromStorage());

  const isUserInput = (step: any): boolean => {
    return step.type === 'CORTEX_STEP_TYPE_USER_INPUT';
  };

  const isAgentResponse = (step: any): boolean => {
    if (step.type === 'CORTEX_STEP_TYPE_NOTIFY_USER') return true;
    if (step.type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
      return true; // treat any planner step as part of the agent response cycle
    }
    return false;
  };

  const groupSteps = (steps: any[]): StepGroup[] => {
    const groups: StepGroup[] = [];
    let currentGroup: StepGroup | null = null;

    steps.forEach((step) => {
      if (isUserInput(step)) {
        // Start a new user turn
        groups.push({
          type: 'user',
          step,
          responseSteps: [],
          processingSteps: []
        });
        currentGroup = null; // reset agent group
      } else if (isAgentResponse(step)) {
        if (!currentGroup) {
          currentGroup = {
            type: 'response',
            step,
            responseSteps: [],
            processingSteps: []
          };
          groups.push(currentGroup);
        }
        currentGroup.responseSteps.push(step);
      } else {
        if (!currentGroup) {
          currentGroup = {
            type: 'response',
            step,
            responseSteps: [],
            processingSteps: []
          };
          groups.push(currentGroup);
        }
        currentGroup.processingSteps.push(step);
      }
    });

    return groups;
  };

  const groupedSteps = computed(() => {
    return groupSteps(activeConvSteps.value);
  });

  const expandedProcessingGroups = ref<Set<number>>(new Set());

  const toggleProcessingGroup = (gIdx: number) => {
    if (expandedProcessingGroups.value.has(gIdx)) {
      expandedProcessingGroups.value.delete(gIdx);
    } else {
      expandedProcessingGroups.value.add(gIdx);
    }
    expandedProcessingGroups.value = new Set(expandedProcessingGroups.value);
  };

  // Nested Sub-Step expansion
  const expandedSubSteps = ref<Set<string>>(new Set());

  const getSubStepKey = (gIdx: number, lidx: number): string => {
    return `${gIdx}-${lidx}`;
  };

  const toggleSubStep = (key: string) => {
    if (expandedSubSteps.value.has(key)) {
      expandedSubSteps.value.delete(key);
    } else {
      expandedSubSteps.value.add(key);
    }
    expandedSubSteps.value = new Set(expandedSubSteps.value);
  };

  return {
    activeConvSteps,
    activeConvLoading,
    chatMessagesContainer,
    loadedStart,
    totalSteps,
    loadingOlder,
    agentTyping,
    rawHtml,
    rawCss,
    expandedReviewSteps,
    toggleReviewStep,
    conversationStepsCache,
    groupedSteps,
    expandedProcessingGroups,
    toggleProcessingGroup,
    expandedSubSteps,
    getSubStepKey,
    toggleSubStep
  };
}
