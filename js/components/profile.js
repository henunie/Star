/* profile.js — 我的（流水/兑换记录/设置） */
(function () {
  window.Components = window.Components || {};

  window.Components.Profile = {
    name: 'Profile',
    setup() {
      const state = Store.state;
      const showSettings = Vue.ref(false);
      const authedSettings = Vue.ref(false);
      const showAllTx = Vue.ref(false);

      // 展开奖励规则设置（需管理员验证）
      async function toggleSettings() {
        if (showSettings.value) {
          // 已展开 → 直接收起
          showSettings.value = false;
          authedSettings.value = false;
          return;
        }
        const ok = await Utils.requireAuth('奖励规则设置 · 管理员验证');
        if (!ok) { Utils.toast('已取消'); return; }
        authedSettings.value = true;
        showSettings.value = true;
      }
      const showAdjustModal = Vue.ref(false);
      const adjustForm = Vue.reactive({
        amount: 1,
        op: 'add', // add | subtract
        desc: ''
      });

      // 打开调整余额（需管理员验证）
      async function openAdjust() {
        const ok = await Utils.requireAuth('调整余额 · 管理员验证');
        if (!ok) { Utils.toast('已取消'); return; }
        adjustForm.amount = 1;
        adjustForm.op = 'add';
        adjustForm.desc = '';
        showAdjustModal.value = true;
      }

      function closeAdjust() {
        showAdjustModal.value = false;
      }

      function submitAdjust() {
        const amt = parseInt(adjustForm.amount);
        if (!amt || amt <= 0) {
          Utils.toast('请输入大于 0 的数量');
          return;
        }
        const signed = adjustForm.op === 'subtract' ? -amt : amt;
        const desc = (adjustForm.desc || '').trim() || (adjustForm.op === 'add' ? '管理员增加星星' : '管理员扣除星星');
        const r = Store.adjustBalance(signed, desc);
        if (!r.ok) {
          Utils.toast(r.reason || '操作失败');
          return;
        }
        Utils.toast(adjustForm.op === 'add' ? `已增加 ${amt} ⭐` : `已扣除 ${amt} ⭐`);
        adjustForm.amount = 1;
        adjustForm.desc = '';
      }

      const stats = Vue.computed(() => Store.stats());

      const recentTx = Vue.computed(() => {
        return showAllTx.value ? state.wallet.transactions : state.wallet.transactions.slice(0, 15);
      });

      // 设置项本地副本（编辑时用）
      const settings = Vue.reactive({
        checkinTier1: state.settings.checkinTier1,
        checkinTier2: state.settings.checkinTier2,
        checkoutDeadline: state.settings.checkoutDeadline,
        checkinTier1Reward: state.settings.rewards.checkinTier1,
        checkinTier2Reward: state.settings.rewards.checkinTier2,
        checkinAfterReward: state.settings.rewards.checkinAfter,
        checkoutOnTime: state.settings.rewards.checkoutOnTime,
        checkoutLate: state.settings.rewards.checkoutLate,
        streak7Bonus: state.settings.rewards.streak7Bonus
      });

      async function saveSettings() {
        // 双重校验：防止绕过展开直接调用保存
        if (!authedSettings.value) {
          const ok = await Utils.requireAuth('奖励规则设置 · 管理员验证');
          if (!ok) { Utils.toast('已取消'); return; }
          authedSettings.value = true;
        }
        Store.updateSettings({
          checkinTier1: settings.checkinTier1,
          checkinTier2: settings.checkinTier2,
          checkoutDeadline: settings.checkoutDeadline
        });
        Store.updateRewards({
          checkinTier1: parseInt(settings.checkinTier1Reward) || 0,
          checkinTier2: parseInt(settings.checkinTier2Reward) || 0,
          checkinAfter: parseInt(settings.checkinAfterReward) || 0,
          checkoutOnTime: parseInt(settings.checkoutOnTime) || 0,
          checkoutLate: parseInt(settings.checkoutLate) || 0,
          streak7Bonus: parseInt(settings.streak7Bonus) || 0
        });
        Utils.toast('设置已保存');
      }

      async function resetAll() {
        // 先验证管理员身份
        const authOk = await Utils.requireAuth('重置数据 · 管理员验证');
        if (!authOk) { Utils.toast('已取消'); return; }
        const ok = await Utils.confirm('确定要重置所有数据吗？此操作不可恢复！', { okText: '重置', cancelText: '取消' });
        if (!ok) return;
        const ok2 = await Utils.confirm('再次确认：所有星星、任务、记录都会清空！', { okText: '确认重置', cancelText: '取消' });
        if (!ok2) return;
        Store.resetAll();
        Utils.toast('已重置');
      }

      // ---------- 云同步设置 ----------
      const showCloud = Vue.ref(false);
      const authedCloud = Vue.ref(false);
      const cloudForm = Vue.reactive({
        binId: Store.getCloudConfig().binId,
        apiKey: Store.getCloudConfig().apiKey,
        enabled: Store.getCloudConfig().enabled
      });
      const syncStatus = Store.syncStatus;

      const syncStatusPhaseText = Vue.computed(() => {
        const map = { idle: '未同步', syncing: '同步中', synced: '已同步', error: '同步失败', offline: '离线' };
        return map[syncStatus.phase] || '未同步';
      });

      async function toggleCloud() {
        if (showCloud.value) {
          showCloud.value = false;
          authedCloud.value = false;
          return;
        }
        const ok = await Utils.requireAuth('云同步设置 · 管理员验证');
        if (!ok) { Utils.toast('已取消'); return; }
        authedCloud.value = true;
        showCloud.value = true;
      }

      async function saveCloud() {
        if (!authedCloud.value) {
          const ok = await Utils.requireAuth('云同步设置 · 管理员验证');
          if (!ok) { Utils.toast('已取消'); return; }
          authedCloud.value = true;
        }
        const wasEnabled = Store.getCloudConfig().enabled;
        Store.setCloudConfig({
          binId: cloudForm.binId.trim(),
          apiKey: cloudForm.apiKey.trim(),
          enabled: cloudForm.enabled
        });
        Utils.toast('云同步配置已保存');
        // 从关 → 开，且配置齐全 → 触发首次同步
        if (!wasEnabled && cloudForm.enabled && cloudForm.binId.trim() && cloudForm.apiKey.trim()) {
          Store.enableCloud()
            .then(() => Utils.toast('云同步已启用'))
            .catch(() => Utils.toast('启用失败，请检查 Bin ID / API Key'));
        }
      }

      async function syncNow() {
        await Store.syncNow();
        Utils.toast(syncStatus.phase === 'synced' ? '同步完成' : '同步失败，请检查配置');
      }

      const txIcon = (tx) => Utils.sourceIcon(tx.source);

      return {
        state,
        stats,
        recentTx,
        showSettings,
        authedSettings,
        toggleSettings,
        showAllTx,
        showAdjustModal,
        adjustForm,
        openAdjust,
        closeAdjust,
        submitAdjust,
        settings,
        saveSettings,
        resetAll,
        txIcon,
        Utils,
        showCloud,
        authedCloud,
        cloudForm,
        syncStatus,
        syncStatusPhaseText,
        toggleCloud,
        saveCloud,
        syncNow
      };
    },
    template: `
      <div class="tab-content">
        <div class="profile-header" style="position:relative">
          <button class="btn btn-sm btn-ghost" style="position:absolute;top:12px;right:12px;padding:6px 10px;min-height:auto;font-size:13px" @click="openAdjust">🔐 调整余额</button>
          <span class="profile-avatar">{{ state.user.avatar }}</span>
          <div class="profile-name">{{ state.user.name }}</div>
          <div class="profile-stat">
            <div class="profile-stat-item">
              <div class="profile-stat-num">{{ stats.balance }}</div>
              <div class="profile-stat-label">星星余额</div>
            </div>
            <div class="profile-stat-item">
              <div class="profile-stat-num">{{ stats.streak }}</div>
              <div class="profile-stat-label">连续签到</div>
            </div>
            <div class="profile-stat-item">
              <div class="profile-stat-num">{{ stats.checkinDays }}</div>
              <div class="profile-stat-label">累计签到</div>
            </div>
          </div>
          <div class="profile-stat" style="margin-top:12px">
            <div class="profile-stat-item">
              <div class="profile-stat-num">{{ stats.taskDone }}</div>
              <div class="profile-stat-label">完成任务</div>
            </div>
            <div class="profile-stat-item">
              <div class="profile-stat-num">{{ stats.totalEarn }}</div>
              <div class="profile-stat-label">累计获得</div>
            </div>
            <div class="profile-stat-item">
              <div class="profile-stat-num">{{ stats.redemptionCount }}</div>
              <div class="profile-stat-label">兑换次数</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">💸 星星流水</div>
          <div v-if="state.wallet.transactions.length === 0" class="empty-state" style="padding:20px">
            <span class="emoji">📭</span>
            <div class="text">还没有交易记录</div>
          </div>
          <div v-else class="tx-list">
            <div v-for="tx in recentTx" :key="tx.id" class="tx-item">
              <div class="tx-icon" :class="tx.type">{{ txIcon(tx) }}</div>
              <div class="tx-main">
                <div class="tx-desc">{{ tx.desc }}</div>
                <div class="tx-time">{{ Utils.formatTime(tx.time) }}</div>
              </div>
              <div class="tx-amount" :class="tx.type">{{ tx.type === 'earn' ? '+' : '-' }}{{ tx.amount }} ⭐</div>
            </div>
          </div>
          <button v-if="state.wallet.transactions.length > 15" class="btn btn-ghost btn-block" style="margin-top:10px" @click="showAllTx = !showAllTx">
            {{ showAllTx ? '收起' : '查看全部 ' + state.wallet.transactions.length + ' 条' }}
          </button>
        </div>

        <div class="card">
          <div class="collapse-trigger" :class="{ open: showSettings }" @click="toggleSettings">
            <span>🔐 ⚙️ 奖励规则设置</span>
            <span class="arrow">⌄</span>
          </div>
          <div v-if="showSettings" style="margin-top:14px">
            <div class="setting-row">
              <span class="setting-label">7点前签到奖励</span>
              <input class="setting-input" type="number" v-model.number="settings.checkinTier1Reward" min="0">
            </div>
            <div class="setting-row">
              <span class="setting-label">8点前签到奖励</span>
              <input class="setting-input" type="number" v-model.number="settings.checkinTier2Reward" min="0">
            </div>
            <div class="setting-row">
              <span class="setting-label">8点后签到奖励</span>
              <input class="setting-input" type="number" v-model.number="settings.checkinAfterReward" min="0">
            </div>
            <div class="setting-row">
              <span class="setting-label">按时签退奖励</span>
              <input class="setting-input" type="number" v-model.number="settings.checkoutOnTime" min="0">
            </div>
            <div class="setting-row">
              <span class="setting-label">超时签退奖励</span>
              <input class="setting-input" type="number" v-model.number="settings.checkoutLate" min="0">
            </div>
            <div class="setting-row">
              <span class="setting-label">连续 7 天奖励</span>
              <input class="setting-input" type="number" v-model.number="settings.streak7Bonus" min="0">
            </div>
            <div class="setting-row">
              <span class="setting-label">签到第一档截止</span>
              <input class="setting-input" type="time" v-model="settings.checkinTier1" style="width:110px">
            </div>
            <div class="setting-row">
              <span class="setting-label">签到第二档截止</span>
              <input class="setting-input" type="time" v-model="settings.checkinTier2" style="width:110px">
            </div>
            <div class="setting-row">
              <span class="setting-label">签退截止时间</span>
              <input class="setting-input" type="time" v-model="settings.checkoutDeadline" style="width:110px">
            </div>
            <button class="btn btn-primary btn-block" style="margin-top:14px" @click="saveSettings">保存设置</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">📊 任务难度奖励</div>
          <div style="display:flex;gap:8px">
            <div v-for="n in 4" :key="n" style="flex:1;text-align:center;background:var(--bg-soft);padding:10px 4px;border-radius:10px">
              <div style="font-size:11px;color:var(--text-mute)">{{ '⭐'.repeat(n) }}</div>
              <div style="font-weight:700;color:var(--primary-dark);margin-top:4px">+{{ state.settings.rewards.taskRewardMap[String(n)] }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="collapse-trigger" :class="{ open: showCloud }" @click="toggleCloud">
            <span>☁️ 云同步设置<span v-if="cloudForm.enabled" style="font-size:12px;margin-left:6px;color:var(--text-mute)">· {{ syncStatusPhaseText }}</span></span>
            <span class="arrow">⌄</span>
          </div>
          <div v-if="showCloud" style="margin-top:14px">
            <div class="setting-row">
              <span class="setting-label">Bin ID</span>
              <input class="setting-input" v-model="cloudForm.binId" placeholder="粘贴 JSONBin Bin ID" style="flex:1">
            </div>
            <div class="setting-row">
              <span class="setting-label">API Key</span>
              <input class="setting-input" type="password" v-model="cloudForm.apiKey" placeholder="X-Master-Key" style="flex:1">
            </div>
            <div class="setting-row">
              <span class="setting-label">启用云同步</span>
              <input type="checkbox" v-model="cloudForm.enabled">
            </div>
            <div v-if="cloudForm.enabled" style="font-size:12px;color:var(--text-mute);margin:8px 0">
              状态：{{ syncStatusPhaseText }}
            </div>
            <div v-if="cloudForm.enabled" style="font-size:11px;color:var(--text-mute);margin-bottom:10px">
              所有登录者共享同一份数据，刷新即可看到他人改动。
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" style="flex:1" @click="saveCloud">保存配置</button>
              <button class="btn btn-ghost" @click="syncNow" :disabled="syncStatus.phase==='syncing'">立即同步</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">⚠️ 危险操作</div>
          <button class="btn btn-danger btn-block" @click="resetAll">重置所有数据</button>
          <div style="font-size:12px;color:var(--text-mute);margin-top:8px;text-align:center">将清空所有星星、任务、记录，不可恢复</div>
        </div>

        <div style="text-align:center;color:var(--text-mute);font-size:12px;padding:10px 0 20px">
          ⭐ 星迹 v1.0 · {{ cloudForm.enabled ? '云端同步' : '本地存储' }}
        </div>

        <div v-if="showAdjustModal" class="modal-mask" @click.self="closeAdjust">
          <div class="modal">
            <div class="modal-title">🔐 调整星星余额</div>
            <div style="text-align:center;font-size:13px;color:var(--text-mute);margin-bottom:14px">当前余额：⭐ {{ state.wallet.balance }}</div>
            <div class="form-group">
              <label class="form-label">操作类型</label>
              <div class="difficulty-picker">
                <button class="diff-option" :class="{ selected: adjustForm.op === 'add' }" @click="adjustForm.op = 'add'">➕ 增加星星</button>
                <button class="diff-option" :class="{ selected: adjustForm.op === 'subtract' }" @click="adjustForm.op = 'subtract'">➖ 扣除星星</button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">数量</label>
              <input class="form-input" type="number" v-model.number="adjustForm.amount" min="1" style="width:140px">
            </div>
            <div class="form-group">
              <label class="form-label">备注（可选）</label>
              <input class="form-input" v-model="adjustForm.desc" placeholder="例如：手动奖励/纠正" maxlength="30">
            </div>
            <div class="modal-actions">
              <button class="btn btn-ghost" @click="closeAdjust">取消</button>
              <button class="btn btn-primary" @click="submitAdjust">{{ adjustForm.op === 'add' ? '确认增加' : '确认扣除' }}</button>
            </div>
          </div>
        </div>
      </div>
    `
  };
})();
