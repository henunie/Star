/* app.js — 根应用：Tab 路由、组件注册、SW 注册 */
(function () {
  // 先加载状态
  const state = Store.load();

  const app = Vue.createApp({
    setup() {
      const tabs = [
        { key: 'checkin', label: '签到', icon: '🏠', comp: 'Checkin' },
        { key: 'tasks', label: '任务', icon: '✅', comp: 'Tasks' },
        { key: 'shop', label: '商店', icon: '🎁', comp: 'Shop' },
        { key: 'profile', label: '我的', icon: '👤', comp: 'Profile' }
      ];

      const currentTab = Vue.ref(getTabFromHash() || 'checkin');

      function getTabFromHash() {
        const h = location.hash.replace('#', '');
        return tabs.some(t => t.key === h) ? h : null;
      }

      function switchTab(key) {
        currentTab.value = key;
        location.hash = key;
        window.scrollTo(0, 0);
      }

      window.addEventListener('hashchange', () => {
        const h = getTabFromHash();
        if (h && h !== currentTab.value) currentTab.value = h;
      });

      const currentComp = Vue.computed(() => {
        const t = tabs.find(t => t.key === currentTab.value);
        return t ? t.comp : 'Checkin';
      });

      const balance = Vue.computed(() => state.wallet.balance);

      // 余额变化时脉冲动画
      let lastBalance = state.wallet.balance;
      Vue.watch(balance, (nv) => {
        if (nv !== lastBalance) {
          Utils.bumpBalance();
          lastBalance = nv;
        }
      });

      return { tabs, currentTab, currentComp, switchTab, balance };
    },
    template: `
      <div>
        <header class="app-header">
          <div class="app-title">⭐ 星迹</div>
          <div class="balance-pill">
            <span class="star-emoji">⭐</span>
            <span>{{ balance }}</span>
          </div>
        </header>
        <main class="app-main">
          <component :is="currentComp" :key="currentTab"></component>
        </main>
        <nav class="tab-bar">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="tab-item"
            :class="{ active: currentTab === t.key }"
            @click="switchTab(t.key)"
          >
            <span class="tab-icon">{{ t.icon }}</span>
            <span>{{ t.label }}</span>
          </button>
        </nav>
      </div>
    `
  });

  // 注册组件
  app.component('Checkin', window.Components.Checkin);
  app.component('Tasks', window.Components.Tasks);
  app.component('Shop', window.Components.Shop);
  app.component('Profile', window.Components.Profile);

  app.mount('#app');

  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(e => {
        console.warn('SW 注册失败', e);
      });
    });
  }
})();
