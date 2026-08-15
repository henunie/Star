/* checkin.js — 签到签退组件 */
(function () {
  window.Components = window.Components || {};

  window.Components.Checkin = {
    name: 'Checkin',
    setup() {
      const state = Store.state;
      const today = new Date();
      const viewYear = Vue.ref(today.getFullYear());
      const viewMonth = Vue.ref(today.getMonth());

      const todayKey = Vue.computed(() => Store.dateKey());

      const todayRecord = Vue.computed(() => state.checkin.records[todayKey.value] || null);
      const hasCheckin = Vue.computed(() => !!(todayRecord.value && todayRecord.value.checkinAt));
      const hasCheckout = Vue.computed(() => !!(todayRecord.value && todayRecord.value.checkoutAt));

      const streak = Vue.computed(() => state.checkin.streak || 0);

      // 状态显示
      const statusInfo = Vue.computed(() => {
        if (!hasCheckin.value) {
          const beforeTier1 = Store.isOnTime(state.settings.checkinTier1);
          const beforeTier2 = Store.isOnTime(state.settings.checkinTier2);
          let sub;
          if (beforeTier1) {
            sub = `${state.settings.checkinTier1} 前签到 +${state.settings.rewards.checkinTier1} ⭐`;
          } else if (beforeTier2) {
            sub = `${state.settings.checkinTier2} 前签到 +${state.settings.rewards.checkinTier2} ⭐`;
          } else {
            sub = '已过签到时间，签到无奖励';
          }
          return {
            emoji: '🌅',
            text: '今天还没签到',
            sub: sub
          };
        }
        if (!hasCheckout.value) {
          const checkoutOnTime = Store.isOnTime(state.settings.checkoutDeadline);
          return {
            emoji: '☀️',
            text: '已签到，记得签退哦',
            sub: checkoutOnTime
              ? `${state.settings.checkoutDeadline} 前签退 +${state.settings.rewards.checkoutOnTime} ⭐`
              : '已过签退时间，签退无奖励'
          };
        }
        return {
          emoji: '✨',
          text: '今日已完成',
          sub: `签到 +${todayRecord.value.earned} · 签退 +${todayRecord.value.checkoutEarned || 0} ⭐`
        };
      });

      // 月历数据
      const monthLabel = Vue.computed(() => `${viewYear.value}年${viewMonth.value + 1}月`);
      const calendarCells = Vue.computed(() => {
        const cells = Utils.monthGrid(viewYear.value, viewMonth.value);
        return cells.map(d => {
          if (!d) return { empty: true };
          const key = Utils.dateKey(d);
          const rec = state.checkin.records[key];
          const isToday = key === todayKey.value;
          let cls = '';
          if (rec && rec.checkinAt) cls = rec.onTime ? 'checked' : 'late';
          if (isToday && !cls) cls = 'today';
          if (isToday && cls) cls = 'today ' + cls;
          return { day: d.getDate(), cls, isToday };
        });
      });

      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

      // 本周进度（周一到周日）
      const weekDays = Vue.computed(() => {
        const now = new Date();
        const day = now.getDay(); // 0=周日
        const monday = new Date(now);
        monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        const labels = ['一', '二', '三', '四', '五', '六', '日'];
        const arr = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          const key = Utils.dateKey(d);
          const rec = state.checkin.records[key];
          arr.push({
            label: labels[i],
            isToday: key === todayKey.value,
            done: !!(rec && rec.checkinAt),
            late: !!(rec && rec.checkinAt && !rec.onTime)
          });
        }
        return arr;
      });

      const weekDoneCount = Vue.computed(() => weekDays.value.filter(d => d.done).length);

      function prevMonth() {
        if (viewMonth.value === 0) {
          viewMonth.value = 11;
          viewYear.value -= 1;
        } else {
          viewMonth.value -= 1;
        }
      }
      function nextMonth() {
        if (viewMonth.value === 11) {
          viewMonth.value = 0;
          viewYear.value += 1;
        } else {
          viewMonth.value += 1;
        }
      }
      function goToday() {
        viewYear.value = today.getFullYear();
        viewMonth.value = today.getMonth();
      }

      async function doCheckin(e) {
        const r = Store.checkin();
        if (!r.ok) {
          Utils.toast(r.reason);
          return;
        }
        if (r.reward > 0) {
          Utils.flyStarFromElement(r.reward, 'earn', e && e.currentTarget);
        }
        let msg;
        if (r.reward > 0) {
          msg = r.tier === 'early' ? `早起签到 +${r.reward} ⭐` : (r.tier === 'mid' ? `按时签到 +${r.reward} ⭐` : `签到成功 +${r.reward} ⭐`);
        } else {
          msg = '签到成功（已超时，无奖励）';
        }
        if (r.bonus) {
          setTimeout(() => {
            Utils.flyStar(r.bonus, 'earn');
            Utils.toast(`🎉 连续签到 ${r.streak} 天，额外 +${r.bonus} ⭐`);
          }, 400);
        } else if (r.streak > 1) {
          msg += ` · 已连续 ${r.streak} 天`;
        }
        Utils.toast(msg);
      }

      async function doCheckout(e) {
        const r = Store.checkout();
        if (!r.ok) {
          Utils.toast(r.reason);
          return;
        }
        if (r.reward > 0) {
          Utils.flyStarFromElement(r.reward, 'earn', e && e.currentTarget);
          Utils.toast(`签退成功 +${r.reward} ⭐`);
        } else {
          Utils.toast('签退成功（已超时，无奖励）');
        }
      }

      return {
        state,
        todayKey,
        todayRecord,
        hasCheckin,
        hasCheckout,
        streak,
        statusInfo,
        monthLabel,
        calendarCells,
        weekdays,
        weekDays,
        weekDoneCount,
        prevMonth,
        nextMonth,
        goToday,
        doCheckin,
        doCheckout
      };
    },
    template: `
      <div class="tab-content">
        <div class="checkin-hero">
          <span class="checkin-status-emoji">{{ statusInfo.emoji }}</span>
          <div class="checkin-status-text">{{ statusInfo.text }}</div>
          <div class="checkin-status-sub">{{ statusInfo.sub }}</div>
          <div class="streak-badge" v-if="streak > 0">🔥 连续签到 {{ streak }} 天</div>
          <button v-if="!hasCheckin" class="checkin-btn-big" @click="doCheckin">🌅 签 到</button>
          <button v-else-if="!hasCheckout" class="checkin-btn-big" @click="doCheckout">🌙 签 退</button>
          <button v-else class="checkin-btn-big" disabled>✨ 今日已完成</button>
        </div>

        <div class="card">
          <div class="card-title">📈 本周进度（{{ weekDoneCount }}/7）</div>
          <div class="week-progress">
            <div v-for="(d, i) in weekDays" :key="i">
              <div class="week-dot" :class="{ done: d.done, today: d.isToday }">
                <span v-if="d.done">{{ d.late ? '🌙' : '⭐' }}</span>
                <span v-else-if="d.isToday">·</span>
              </div>
              <div class="week-day">{{ d.label }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">
            <span>📅 {{ monthLabel }}</span>
            <span style="margin-left:auto;display:flex;gap:6px">
              <button class="btn btn-sm btn-ghost" @click="prevMonth">‹</button>
              <button class="btn btn-sm btn-ghost" @click="goToday">今</button>
              <button class="btn btn-sm btn-ghost" @click="nextMonth">›</button>
            </span>
          </div>
          <div class="calendar">
            <div class="calendar-weekday" v-for="w in weekdays" :key="w">{{ w }}</div>
            <template v-for="(c, i) in calendarCells" :key="i">
              <div v-if="c.empty" class="calendar-day empty"></div>
              <div v-else class="calendar-day" :class="c.cls">{{ c.day }}</div>
            </template>
          </div>
          <div style="margin-top:12px;font-size:12px;color:var(--text-soft);display:flex;gap:14px;flex-wrap:wrap">
            <span>⭐ 按时签到</span>
            <span>🌙 迟到签到</span>
            <span>🟧 今天</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">💡 小贴士</div>
          <div style="font-size:13px;line-height:1.7;color:var(--text-soft)">
            · 每天 0:00 后可重新签到<br>
            · {{ state.settings.checkinTier1 }} 前签到 +{{ state.settings.rewards.checkinTier1 }} ⭐，{{ state.settings.checkinTier2 }} 前签到 +{{ state.settings.rewards.checkinTier2 }} ⭐，之后无奖励<br>
            · {{ state.settings.checkoutDeadline }} 前签退 +{{ state.settings.rewards.checkoutOnTime }} ⭐，之后无奖励<br>
            · 连续签到每满 7 天额外 +{{ state.settings.rewards.streak7Bonus }} ⭐
          </div>
        </div>
      </div>
    `
  };
})();
