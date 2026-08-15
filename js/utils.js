/* utils.js — ID/日期/Toast/星星飞行动画 */
(function () {
  const Utils = {
    // 生成唯一 ID
    uid(prefix) {
      return (prefix || 'id_') + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    },

    // 补零
    pad(n) { return String(n).padStart(2, '0'); },

    // 日期键 YYYY-MM-DD
    dateKey(date) {
      const d = date || new Date();
      return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
    },

    // 格式化时间（显示用）
    formatTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      const time = `${this.pad(d.getHours())}:${this.pad(d.getMinutes())}`;
      if (sameDay) return time;
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday = d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate();
      if (isYesterday) return '昨天 ' + time;
      return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
    },

    // 格式化日期
    formatDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
    },

    // 今天是否是本月第一天
    monthLabel(date) {
      const d = date || new Date();
      return `${d.getFullYear()}年${d.getMonth() + 1}月`;
    },

    // 获取月份网格（含前后空位）
    monthGrid(year, month) {
      // month: 0-11
      const first = new Date(year, month, 1);
      const startWeekday = first.getDay(); // 0=周日
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < startWeekday; i++) cells.push(null);
      for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
      return cells;
    },

    // Toast 提示
    toast(msg, duration) {
      const old = document.querySelector('.toast');
      if (old) old.remove();
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), duration || 2000);
    },

    // 星星飞行动画
    flyStar(amount, type, x, y) {
      const el = document.createElement('div');
      el.className = 'star-fly ' + (type || 'earn');
      el.textContent = (type === 'spend' ? '-' : '+') + amount + ' ⭐';
      // 默认从屏幕中上方
      if (x === undefined) {
        const w = window.innerWidth;
        x = Math.min(w / 2, 240);
      }
      if (y === undefined) {
        y = window.innerHeight * 0.35;
      }
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.transform = 'translate(-50%, -50%)';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1200);
    },

    // 从元素位置触发星星飞行
    flyStarFromElement(amount, type, el) {
      if (!el) return this.flyStar(amount, type);
      const rect = el.getBoundingClientRect();
      this.flyStar(amount, type, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },

    // 余额脉冲（由 app.js watch 触发）
    bumpBalance() {
      const pill = document.querySelector('.balance-pill');
      if (!pill) return;
      pill.classList.remove('bump');
      void pill.offsetWidth; // 触发重绘
      pill.classList.add('bump');
    },

    // 确认对话框（返回 Promise<boolean>）
    confirm(message, options) {
      return new Promise((resolve) => {
        const mask = document.createElement('div');
        mask.className = 'modal-mask';
        mask.style.alignItems = 'center';
        mask.innerHTML = `
          <div class="modal" style="border-radius:24px;width:300px;max-width:85%;padding:24px 20px;">
            <div style="font-size:15px;line-height:1.5;text-align:center;margin-bottom:18px;color:var(--text)">${message}</div>
            <div class="modal-actions" style="margin-top:0">
              <button class="btn btn-ghost" data-act="cancel">${(options && options.cancelText) || '取消'}</button>
              <button class="btn btn-primary" data-act="ok">${(options && options.okText) || '确定'}</button>
            </div>
          </div>
        `;
        document.body.appendChild(mask);
        const cleanup = (val) => { mask.remove(); resolve(val); };
        mask.addEventListener('click', (e) => {
          if (e.target === mask) cleanup(false);
          const act = e.target.getAttribute && e.target.getAttribute('data-act');
          if (act === 'ok') cleanup(true);
          if (act === 'cancel') cleanup(false);
        });
      });
    },

    // 管理员账号密码验证（账号 admin / 密码 leer，密码框不显示字符）
    // 返回 Promise<boolean>，验证通过为 true
    requireAuth(title) {
      return new Promise((resolve) => {
        const mask = document.createElement('div');
        mask.className = 'modal-mask';
        mask.style.alignItems = 'center';
        mask.innerHTML = `
          <div class="modal" style="border-radius:24px;width:300px;max-width:85%;padding:24px 20px;">
            <div style="font-size:15px;font-weight:600;text-align:center;margin-bottom:16px;color:var(--text)">${title || '需要管理员验证'}</div>
            <div class="form-group" style="margin-bottom:12px">
              <input class="form-input" data-field="account" placeholder="账号" autocomplete="off" style="width:100%">
            </div>
            <div class="form-group" style="margin-bottom:18px">
              <input class="form-input" data-field="password" type="password" placeholder="密码" autocomplete="off" style="width:100%">
            </div>
            <div class="modal-actions" style="margin-top:0">
              <button class="btn btn-ghost" data-act="cancel">取消</button>
              <button class="btn btn-primary" data-act="ok">验证</button>
            </div>
          </div>
        `;
        document.body.appendChild(mask);
        const accountInput = mask.querySelector('[data-field="account"]');
        const passwordInput = mask.querySelector('[data-field="password"]');
        setTimeout(() => accountInput && accountInput.focus(), 50);

        const cleanup = (val) => { mask.remove(); resolve(val); };
        const submit = () => {
          const acc = (accountInput.value || '').trim();
          const pwd = (passwordInput.value || '').trim();
          if (acc === 'admin' && pwd === 'leer') {
            cleanup(true);
          } else {
            Utils.toast('账号或密码错误');
            passwordInput.value = '';
            passwordInput.focus();
          }
        };
        mask.addEventListener('click', (e) => {
          if (e.target === mask) cleanup(false);
          const act = e.target.getAttribute && e.target.getAttribute('data-act');
          if (act === 'ok') submit();
          if (act === 'cancel') cleanup(false);
        });
        mask.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') cleanup(false);
        });
      });
    },

    // 分类配置
    categories: {
      work: { label: '工作', emoji: '💼', cls: 'work' },
      study: { label: '学习', emoji: '📚', cls: 'study' },
      life: { label: '生活', emoji: '🌸', cls: 'life' },
      health: { label: '健康', emoji: '💪', cls: 'health' }
    },

    // 流水来源图标
    sourceIcon(source) {
      const map = {
        checkin: '🌅',
        checkout: '🌙',
        task: '✅',
        bonus: '🎁',
        shop: '🛍️',
        admin: '🔐'
      };
      return map[source] || '⭐';
    },

    // 难度星星显示
    diffStars(level) {
      return '⭐'.repeat(level);
    }
  };

  window.Utils = Utils;
})();
