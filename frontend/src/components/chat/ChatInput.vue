<script setup lang="ts">
import { ref } from 'vue';
const prompt = ref('');
</script>
<template>
  <div class="chat-input-container">
    <textarea v-model="prompt" placeholder="Type a message..."></textarea>
  </div>
</template>
