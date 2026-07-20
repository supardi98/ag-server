import { ref } from 'vue';

export function useChatInteraction() {
  const proceedAvailable = ref(false);
  const proceedLoading = ref(false);
  const permissionBanner = ref<any>(null);
  const permissionLoading = ref(false);

  const handleSendChat = async (prompt: string, step?: any) => {
    console.log('Send chat:', prompt);
  };

  const handleProceedClick = async (step: any) => {
    console.log('Proceed clicked', step);
  };

  return {
    proceedAvailable,
    proceedLoading,
    permissionBanner,
    permissionLoading,
    handleSendChat,
    handleProceedClick,
  };
}
