/* store.js — 响应式状态 + localStorage 持久化 + 钱包方法 + JSONBin 云同步 */
(function () {
  const STORAGE_KEY = 'leer_star_app_v1';
  const CLOUD_KEY = 'leer_star_cloud_v1';
  const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';

  // 云同步内存缓存与串行化标志
  let cloudConfig = null;
  let pushInFlight = false;
  let pushPending = false;

  // 响应式同步状态（profile.js 直接绑定）
  const syncStatus = (window.Vue && Vue.reactive)
    ? Vue.reactive({ phase: 'idle', msg: '' })
    : { phase: 'idle', msg: '' };

  // 默认奖励规则
  const DEFAULT_REWARDS = {
    checkinTier1: 2,      // 7点前签到
    checkinTier2: 1,      // 8点前签到
    checkinAfter: 0,      // 8点后签到
    checkoutOnTime: 2,    // 23点前签退
    checkoutLate: 0,      // 23点后签退
    streak7Bonus: 10,
    taskRewardMap: { '1': 1, '2': 2, '3': 3, '4': 5 }
  };

  // 预置商品
  const DEFAULT_PRODUCTS = [
    { id: 'prod_1', name: '看一集剧', emoji: '📺', price: 20, stock: -1, enabled: true },
    { id: 'prod_2', name: '喝一杯奶茶', emoji: '🧋', price: 30, stock: -1, enabled: true },
    { id: 'prod_3', name: '玩游戏 30 分钟', emoji: '🎮', price: 25, stock: -1, enabled: true },
    { id: 'prod_4', name: '买小零食', emoji: '🍫', price: 15, stock: -1, enabled: true },
    { id: 'prod_5', name: '睡个懒觉', emoji: '😴', price: 50, stock: -1, enabled: true },
    { id: 'prod_6', name: '看一场电影', emoji: '🎬', price: 80, stock: -1, enabled: true }
  ];

  // 默认状态
  function defaultState() {
    return {
      version: 1,
      user: {
        name: '我',
        avatar: '🦊',
        createdAt: new Date().toISOString()
      },
      wallet: {
        balance: 0,
        transactions: []
      },
      checkin: {
        records: {},
        streak: 0,
        lastCheckinDate: null
      },
      tasks: [],
      shop: {
        products: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)),
        redemptions: []
      },
      settings: {
        checkinTier1: '07:00',
        checkinTier2: '08:00',
        checkoutDeadline: '23:00',
        rewards: JSON.parse(JSON.stringify(DEFAULT_REWARDS))
      }
    };
  }

  // 深合并：用默认值补全缺失字段（兼容旧数据）
  function mergeState(saved) {
    const def = defaultState();
    if (!saved || typeof saved !== 'object') return def;
    saved.version = def.version;
    saved.user = Object.assign({}, def.user, saved.user || {});
    saved.wallet = Object.assign({}, def.wallet, saved.wallet || {});
    saved.wallet.transactions = saved.wallet.transactions || [];
    saved.checkin = Object.assign({}, def.checkin, saved.checkin || {});
    saved.checkin.records = saved.checkin.records || {};
    saved.tasks = saved.tasks || [];
    // 给旧任务补 dueDate 字段（默认为今天日期，避免跨天比较出错）
    // 同时迁移已废弃的分类（work→study, life→health）和难度（>4 降级到 4）
    if (saved.tasks.length) {
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const rewardMap = (saved.settings && saved.settings.rewards && saved.settings.rewards.taskRewardMap) || DEFAULT_REWARDS.taskRewardMap;
      saved.tasks.forEach(t => {
        if (!t.dueDate) t.dueDate = todayKey;
        if (t.category === 'work') t.category = 'study';
        else if (t.category === 'life') t.category = 'health';
        if (t.difficulty && t.difficulty > 4) {
          t.difficulty = 4;
          t.reward = rewardMap['4'] || 5;
        }
      });
    }
    saved.shop = Object.assign({}, def.shop, saved.shop || {});
    saved.shop.products = saved.shop.products && saved.shop.products.length ? saved.shop.products : def.shop.products;
    saved.shop.redemptions = saved.shop.redemptions || [];
    saved.settings = Object.assign({}, def.settings, saved.settings || {});
    saved.settings.rewards = Object.assign({}, def.settings.rewards, (saved.settings && saved.settings.rewards) || {});
    saved.settings.rewards.taskRewardMap = Object.assign({}, def.settings.rewards.taskRewardMap, ((saved.settings && saved.settings.rewards) || {}).taskRewardMap || {});
    // 迁移旧版奖励字段到新结构
    const r = saved.settings.rewards;
    if (r && ('checkinOnTime' in r) && !('checkinTier1' in r)) {
      delete r.checkinOnTime;
      delete r.checkinLate;
      delete r.checkout;
    }
    if ('checkinDeadline' in saved.settings) delete saved.settings.checkinDeadline;
    return saved;
  }

  // ---------- 云同步配置读写 ----------
  function loadCloudConfig() {
    try {
      const raw = localStorage.getItem(CLOUD_KEY);
      cloudConfig = raw ? JSON.parse(raw) : { binId: '', apiKey: '', enabled: false, lastSyncedAt: null, baseUpdatedAt: null };
    } catch (e) {
      cloudConfig = { binId: '', apiKey: '', enabled: false, lastSyncedAt: null, baseUpdatedAt: null };
    }
    return cloudConfig;
  }

  function saveCloudConfig() {
    try { localStorage.setItem(CLOUD_KEY, JSON.stringify(cloudConfig)); } catch (e) {}
  }

  function isCloudReady() {
    return !!(cloudConfig && cloudConfig.enabled && cloudConfig.binId && cloudConfig.apiKey);
  }

  // 响应式覆盖 state（复用 resetAll 手法，绝不能替换 state 引用）
  function applyState(incoming) {
    const merged = mergeState(JSON.parse(JSON.stringify(incoming)));
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, merged);
  }

  let state = null;
  let saveTimer = null;

  const Store = {
    load() {
      let raw = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (e) {
        console.warn('localStorage 读取失败', e);
      }
      if (raw) {
        try {
          state = JSON.parse(raw);
          state = mergeState(state);
        } catch (e) {
          console.warn('数据解析失败，重置', e);
          state = defaultState();
        }
      } else {
        state = defaultState();
      }
      // 用 Vue.reactive 包裹
      if (window.Vue && Vue.reactive) {
        state = Vue.reactive(state);
      }
      // 异步从云端拉取最新数据（不阻塞渲染）
      loadCloudConfig();
      if (isCloudReady()) {
        setTimeout(() => { this.cloudPull().catch(e => console.warn('云拉取失败', e)); }, 0);
      }
      return state;
    },

    save() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
          console.warn('localStorage 写入失败', e);
        }
        if (isCloudReady()) {
          this.cloudPush().catch(e => console.warn('云推送失败', e));
        }
      }, 200);
    },

    get state() { return state; },
    get syncStatus() { return syncStatus; },

    getCloudConfig() {
      if (!cloudConfig) loadCloudConfig();
      return cloudConfig;
    },

    setCloudConfig(patch) {
      if (!cloudConfig) loadCloudConfig();
      Object.assign(cloudConfig, patch);
      saveCloudConfig();
    },

    // 日期键 YYYY-MM-DD（本地）
    dateKey(date) {
      const d = date || new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    },

    // 昨天日期键
    yesterdayKey() {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return this.dateKey(d);
    },

    // 判断当前时间是否按时（≤ 今日 deadline）
    isOnTime(deadlineStr) {
      const d = new Date();
      const [h, m] = (deadlineStr || '09:00').split(':').map(Number);
      const deadline = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0);
      return d <= deadline;
    },

    // 赚取星星
    earn(amount, source, desc, refId) {
      if (!amount || amount <= 0) return;
      state.wallet.balance += amount;
      state.wallet.transactions.unshift({
        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        type: 'earn',
        source: source,
        amount: amount,
        desc: desc || '获得星星',
        refId: refId || null,
        time: new Date().toISOString()
      });
      this.save();
    },

    // 消费星星（余额不足返回 false）
    spend(amount, source, desc, refId) {
      if (!amount || amount <= 0) return false;
      if (state.wallet.balance < amount) return false;
      state.wallet.balance -= amount;
      state.wallet.transactions.unshift({
        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        type: 'spend',
        source: source,
        amount: amount,
        desc: desc || '消费星星',
        refId: refId || null,
        time: new Date().toISOString()
      });
      this.save();
      return true;
    },

    // 管理员调整星星余额（amount 正数为增加，负数为减少）
    adjustBalance(amount, desc) {
      const n = parseInt(amount);
      if (!n || n === 0) return { ok: false, reason: '数量无效' };
      if (n < 0 && state.wallet.balance + n < 0) {
        return { ok: false, reason: '余额不足，无法扣除' };
      }
      if (n > 0) {
        state.wallet.balance += n;
        state.wallet.transactions.unshift({
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          type: 'earn',
          source: 'admin',
          amount: n,
          desc: desc || '管理员调整',
          refId: null,
          time: new Date().toISOString()
        });
      } else {
        const abs = -n;
        state.wallet.balance -= abs;
        state.wallet.transactions.unshift({
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          type: 'spend',
          source: 'admin',
          amount: abs,
          desc: desc || '管理员调整',
          refId: null,
          time: new Date().toISOString()
        });
      }
      this.save();
      return { ok: true, newBalance: state.wallet.balance };
    },

    // 签到
    checkin() {
      const today = this.dateKey();
      if (state.checkin.records[today] && state.checkin.records[today].checkinAt) {
        return { ok: false, reason: '今日已签到' };
      }
      // 三档判断：7点前 / 8点前 / 8点后
      const beforeTier1 = this.isOnTime(state.settings.checkinTier1);
      const beforeTier2 = this.isOnTime(state.settings.checkinTier2);
      let tier, reward, desc;
      if (beforeTier1) {
        tier = 'early';
        reward = state.settings.rewards.checkinTier1;
        desc = '早起签到奖励';
      } else if (beforeTier2) {
        tier = 'mid';
        reward = state.settings.rewards.checkinTier2;
        desc = '按时签到奖励';
      } else {
        tier = 'late';
        reward = state.settings.rewards.checkinAfter;
        desc = '迟到签到';
      }
      const onTime = reward > 0;

      // streak 计算
      const yKey = this.yesterdayKey();
      if (state.checkin.lastCheckinDate === yKey) {
        state.checkin.streak += 1;
      } else if (state.checkin.lastCheckinDate === today) {
        // 不变
      } else {
        state.checkin.streak = 1;
      }
      state.checkin.lastCheckinDate = today;

      // 写记录
      if (!state.checkin.records[today]) state.checkin.records[today] = {};
      state.checkin.records[today].checkinAt = new Date().toISOString();
      state.checkin.records[today].onTime = onTime;
      state.checkin.records[today].tier = tier;
      state.checkin.records[today].earned = reward;

      if (reward > 0) {
        this.earn(reward, 'checkin', desc, today);
      }

      // 连续 7 天奖励
      let bonus = 0;
      if (state.checkin.streak > 0 && state.checkin.streak % 7 === 0) {
        bonus = state.settings.rewards.streak7Bonus;
        this.earn(bonus, 'bonus', `连续签到 ${state.checkin.streak} 天奖励`, today);
      }

      this.save();
      return { ok: true, reward, onTime, tier, streak: state.checkin.streak, bonus };
    },

    // 签退
    checkout() {
      const today = this.dateKey();
      const rec = state.checkin.records[today];
      if (!rec || !rec.checkinAt) {
        return { ok: false, reason: '请先签到' };
      }
      if (rec.checkoutAt) {
        return { ok: false, reason: '今日已签退' };
      }
      rec.checkoutAt = new Date().toISOString();
      // 两档判断：截止时间前 / 后
      const onTime = this.isOnTime(state.settings.checkoutDeadline);
      const reward = onTime ? state.settings.rewards.checkoutOnTime : state.settings.rewards.checkoutLate;
      rec.checkoutOnTime = onTime;
      rec.checkoutEarned = reward;
      if (reward > 0) {
        this.earn(reward, 'checkout', onTime ? '签退奖励' : '签退（超时）', today);
      }
      this.save();
      return { ok: true, reward, onTime };
    },

    // 添加任务
    addTask(task) {
      const reward = state.settings.rewards.taskRewardMap[String(task.difficulty)] || 1;
      const todayKey = this.dateKey();
      const dueDate = task.dueDate || todayKey;
      const t = {
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title: task.title,
        category: task.category || 'study',
        difficulty: task.difficulty,
        reward: reward,
        dueDate: dueDate,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null
      };
      state.tasks.unshift(t);
      this.save();
      return t;
    },

    // 完成任务
    completeTask(taskId) {
      const t = state.tasks.find(x => x.id === taskId);
      if (!t || t.status === 'done') return { ok: false, reason: '任务不存在或已完成' };
      // 只有今天或更早到期的任务才能完成（不允许提前完成未来任务）
      const todayKey = this.dateKey();
      if (t.dueDate > todayKey) {
        return { ok: false, reason: '还没到任务日期哦' };
      }
      t.status = 'done';
      t.completedAt = new Date().toISOString();
      this.earn(t.reward, 'task', `完成任务：${t.title}`, t.id);
      this.save();
      return { ok: true, reward: t.reward };
    },

    // 删除任务
    removeTask(taskId) {
      const idx = state.tasks.findIndex(x => x.id === taskId);
      if (idx === -1) return false;
      state.tasks.splice(idx, 1);
      this.save();
      return true;
    },

    // 编辑任务
    updateTask(taskId, patch) {
      const t = state.tasks.find(x => x.id === taskId);
      if (!t) return false;
      Object.assign(t, patch);
      if (patch.difficulty !== undefined) {
        t.reward = state.settings.rewards.taskRewardMap[String(t.difficulty)] || 1;
      }
      this.save();
      return true;
    },

    // 添加商品
    addProduct(p) {
      const prod = {
        id: 'prod_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: p.name,
        emoji: p.emoji || '🎁',
        price: Math.max(1, parseInt(p.price) || 1),
        stock: p.stock === undefined ? -1 : parseInt(p.stock),
        enabled: true
      };
      state.shop.products.push(prod);
      this.save();
      return prod;
    },

    // 更新商品（后台改价/改名等）
    updateProduct(productId, patch) {
      const p = state.shop.products.find(x => x.id === productId);
      if (!p) return false;
      if (patch.price !== undefined) patch.price = Math.max(1, parseInt(patch.price) || 1);
      if (patch.stock !== undefined) patch.stock = parseInt(patch.stock);
      Object.assign(p, patch);
      this.save();
      return true;
    },

    // 删除商品
    removeProduct(productId) {
      const idx = state.shop.products.findIndex(x => x.id === productId);
      if (idx === -1) return false;
      state.shop.products.splice(idx, 1);
      this.save();
      return true;
    },

    // 兑换商品
    redeem(productId) {
      const p = state.shop.products.find(x => x.id === productId);
      if (!p || !p.enabled) return { ok: false, reason: '商品不可用' };
      if (p.stock !== -1 && p.stock <= 0) return { ok: false, reason: '库存不足' };
      if (!this.spend(p.price, 'shop', `兑换：${p.name}`, p.id)) {
        return { ok: false, reason: '星星不够哦' };
      }
      if (p.stock !== -1) {
        p.stock -= 1;
        if (p.stock <= 0) p.enabled = false;
      }
      state.shop.redemptions.unshift({
        id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        productId: p.id,
        name: p.name,
        emoji: p.emoji,
        cost: p.price,
        time: new Date().toISOString()
      });
      this.save();
      return { ok: true, product: p };
    },

    // 统计
    stats() {
      const txs = state.wallet.transactions;
      const totalEarn = txs.filter(t => t.type === 'earn').reduce((s, t) => s + t.amount, 0);
      const totalSpend = txs.filter(t => t.type === 'spend').reduce((s, t) => s + t.amount, 0);
      const taskDone = state.tasks.filter(t => t.status === 'done').length;
      const checkinDays = Object.keys(state.checkin.records).filter(k => state.checkin.records[k].checkinAt).length;
      return {
        balance: state.wallet.balance,
        totalEarn,
        totalSpend,
        taskDone,
        checkinDays,
        streak: state.checkin.streak,
        redemptionCount: state.shop.redemptions.length
      };
    },

    // 更新设置
    updateSettings(patch) {
      Object.assign(state.settings, patch);
      this.save();
    },

    updateRewards(patch) {
      Object.assign(state.settings.rewards, patch);
      this.save();
    },

    // 重置所有数据（不替换 state 引用，保持 Vue computed/watch 绑定）
    resetAll() {
      const fresh = defaultState();
      // 清空原对象
      Object.keys(state).forEach(k => delete state[k]);
      // 写入默认值（保持原响应式引用）
      Object.assign(state, fresh);
      this.save();
    },

    // ---------- 云同步 ----------
    // 推送本地 state 到云端（串行化，LWW）
    async cloudPush() {
      if (!isCloudReady()) return;
      if (pushInFlight) { pushPending = true; return; }
      pushInFlight = true;
      syncStatus.phase = 'syncing'; syncStatus.msg = '同步中…';
      const updatedAt = new Date().toISOString();
      const body = {
        data: JSON.parse(JSON.stringify(state)),
        updatedAt: updatedAt,
        updatedBy: (state.user && state.user.name) || 'unknown'
      };
      try {
        const resp = await fetch(`${JSONBIN_BASE}/${cloudConfig.binId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': cloudConfig.apiKey
          },
          body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        cloudConfig.baseUpdatedAt = updatedAt;
        cloudConfig.lastSyncedAt = updatedAt;
        saveCloudConfig();
        syncStatus.phase = 'synced'; syncStatus.msg = '已同步';
      } catch (e) {
        const isOffline = e.message && /Failed to fetch|NetworkError/i.test(e.message);
        syncStatus.phase = isOffline ? 'offline' : 'error';
        syncStatus.msg = isOffline ? '离线' : '推送失败';
        throw e;
      } finally {
        pushInFlight = false;
        if (pushPending) { pushPending = false; this.cloudPush().catch(() => {}); }
      }
    },

    // 从云端拉取最新数据（LWW：云端比本地新才覆盖）
    async cloudPull() {
      if (!isCloudReady()) return;
      syncStatus.phase = 'syncing'; syncStatus.msg = '拉取中…';
      try {
        const resp = await fetch(`${JSONBIN_BASE}/${cloudConfig.binId}/latest`, {
          method: 'GET',
          headers: { 'X-Master-Key': cloudConfig.apiKey }
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const json = await resp.json();
        const record = json.record;
        if (!record || !record.data) throw new Error('云端数据为空');

        const cloudUpdated = record.updatedAt || null;
        const base = cloudConfig.baseUpdatedAt || null;
        const cloudNewer = !base || !cloudUpdated || new Date(cloudUpdated) > new Date(base);

        if (cloudNewer) {
          applyState(record.data);
          cloudConfig.baseUpdatedAt = cloudUpdated;
          cloudConfig.lastSyncedAt = new Date().toISOString();
          saveCloudConfig();
          // 回写本地，避免下次启动用旧本地覆盖
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
        } else {
          // 本地更新 → 主动推一次
          this.cloudPush().catch(() => {});
        }
        syncStatus.phase = 'synced'; syncStatus.msg = '已同步';
      } catch (e) {
        const isOffline = e.message && /Failed to fetch|NetworkError/i.test(e.message);
        syncStatus.phase = isOffline ? 'offline' : 'error';
        syncStatus.msg = isOffline ? '离线' : '拉取失败';
        throw e;
      }
    },

    // 首次启用云同步：404/空 → 推本地；有数据 → 拉云端
    async enableCloud() {
      if (!isCloudReady()) return;
      syncStatus.phase = 'syncing'; syncStatus.msg = '初始化…';
      try {
        const resp = await fetch(`${JSONBIN_BASE}/${cloudConfig.binId}/latest`, {
          headers: { 'X-Master-Key': cloudConfig.apiKey }
        });
        if (resp.status === 404) {
          await this.cloudPush();
        } else if (resp.ok) {
          const json = await resp.json();
          if (json.record && json.record.data) {
            applyState(json.record.data);
            cloudConfig.baseUpdatedAt = json.record.updatedAt || null;
            cloudConfig.lastSyncedAt = new Date().toISOString();
            saveCloudConfig();
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
            syncStatus.phase = 'synced'; syncStatus.msg = '已从云端同步';
          } else {
            await this.cloudPush();
          }
        } else {
          throw new Error('HTTP ' + resp.status);
        }
      } catch (e) {
        syncStatus.phase = 'error'; syncStatus.msg = '连接失败';
        throw e;
      }
    },

    // 手动同步（按钮触发）
    async syncNow() {
      if (!isCloudReady()) {
        Utils.toast('请先填写并启用云同步');
        return;
      }
      await this.cloudPull().catch(() => {});
    }
  };

  window.Store = Store;
})();
