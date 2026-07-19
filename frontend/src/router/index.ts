import { createRouter, createWebHistory } from 'vue-router';
import { authService } from '../services/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
    },
  ],
});

// Navigation guard — check auth before each route
router.beforeEach(async (to) => {
  if (to.meta.public) return true;

  const { authenticated } = await authService.me();
  if (!authenticated) {
    return { name: 'login' };
  }
  return true;
});

export default router;
