/* tasks.js — 任务组件（支持布置未来一周的任务） */
(function () {
  window.Components = window.Components || {};

  const CATS = [
    { key: 'study', label: '📚 学习' },
    { key: 'health', label: '💪 健康' }
  ];

  // 生成未来 N 天（含今天）的日期选项
  function generateDateOptions(days) {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const key = Utils.dateKey(d);
      const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      let label;
      if (i === 0) label = '今天';
      else if (i === 1) label = '明天';
      else if (i === 2) label = '后天';
      else label = `周${weekday}`;
      opts.push({
        key: key,
        label: label,
        mdLabel: `${d.getMonth() + 1}/${d.getDate()}`,
        weekday: weekday
      });
    }
    return opts;
  }

  function dayGroupLabel(key, todayKey, yKey, tmrKey) {
    if (key === todayKey) return '📌 今天';
    if (key === yKey) return '⏰ 明天';
    const d = new Date(key);
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `📆 ${d.getMonth() + 1}月${d.getDate()}日 周${weekday}`;
  }

  window.Components.Tasks = {
    name: 'Tasks',
    setup() {
      const state = Store.state;
      const filter = Vue.ref('all'); // all | study | health
      const tab = Vue.ref('today'); // today | future | done
      const showModal = Vue.ref(false);
      const editingId = Vue.ref(null);

      // 顶部主分区：tasks 布置任务 | stars 难度星星设置
      const section = Vue.ref('tasks');
      const authed = Vue.ref(false); // 难度设置是否已验证
      const rewardForm = Vue.reactive({
        r1: 0, r2: 0, r3: 0, r4: 0
      });

      const dateOptions = Vue.computed(() => generateDateOptions(7));
      const todayKey = Vue.computed(() => Store.dateKey());
      const yKey = Vue.computed(() => {
        const d = new Date(); d.setDate(d.getDate() + 1); return Utils.dateKey(d);
      });
      const tmrKey = Vue.computed(() => {
        const d = new Date(); d.setDate(d.getDate() + 2); return Utils.dateKey(d);
      });

      const form = Vue.reactive({
        title: '',
        category: 'study',
        difficulty: 1,
        dueDate: todayKey.value // 默认今天
      });

      const pendingTasks = Vue.computed(() => state.tasks.filter(t => t.status === 'pending'));

      const todayTasks = Vue.computed(() => {
        const tk = todayKey.value;
        return pendingTasks.value
          .filter(t => t.dueDate <= tk)
          .filter(t => filter.value === 'all' || t.category === filter.value);
      });

      const futureTasksGrouped = Vue.computed(() => {
        const tk = todayKey.value;
        const list = pendingTasks.value
          .filter(t => t.dueDate > tk)
          .filter(t => filter.value === 'all' || t.category === filter.value)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        // 按 dueDate 分组
        const groups = {};
        list.forEach(t => {
          if (!groups[t.dueDate]) groups[t.dueDate] = [];
          groups[t.dueDate].push(t);
        });
        return Object.keys(groups).sort().map(k => ({
          key: k,
          label: dayGroupLabel(k, tk, yKey.value, tmrKey.value),
          tasks: groups[k]
        }));
      });

      const doneTasks = Vue.computed(() => state.tasks
        .filter(t => t.status === 'done')
        .filter(t => filter.value === 'all' || t.category === filter.value)
        .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
      );

      const todayCount = Vue.computed(() => todayTasks.value.length);
      const futureCount = Vue.computed(() => futureTasksGrouped.value.reduce((s, g) => s + g.tasks.length, 0));
      const doneCount = Vue.computed(() => doneTasks.value.length);

      function openCreate() {
        editingId.value = null;
        form.title = '';
        form.category = 'study';
        form.difficulty = 1;
        form.dueDate = todayKey.value;
        showModal.value = true;
      }

      function openEdit(task) {
        editingId.value = task.id;
        form.title = task.title;
        form.category = task.category;
        form.difficulty = task.difficulty;
        form.dueDate = task.dueDate || todayKey.value;
        showModal.value = true;
      }

      function closeModal() {
        showModal.value = false;
        editingId.value = null;
      }

      function dateInOptions(dateKey) {
        return dateOptions.value.some(o => o.key === dateKey);
      }

      function saveTask() {
        const title = (form.title || '').trim();
        if (!title) { Utils.toast('请输入任务标题'); return; }
        if (!dateInOptions(form.dueDate)) { Utils.toast('只能布置未来 7 天内的任务'); return; }
        if (editingId.value) {
          Store.updateTask(editingId.value, {
            title: title,
            category: form.category,
            difficulty: form.difficulty,
            dueDate: form.dueDate
          });
          Utils.toast('已更新');
        } else {
          Store.addTask({
            title: title,
            category: form.category,
            difficulty: form.difficulty,
            dueDate: form.dueDate
          });
          Utils.toast(form.dueDate === todayKey.value ? '任务已发布' : `已布置到 ${Store.state.tasks[0].dueDate.slice(5)}`);
        }
        closeModal();
      }

      function completeTask(task, e) {
        const r = Store.completeTask(task.id);
        if (!r.ok) {
          Utils.toast(r.reason || '完成失败');
          return;
        }
        Utils.flyStarFromElement(r.reward, 'earn', e && e.currentTarget);
        Utils.toast(`完成 +${r.reward} ⭐`);
      }

      async function removeTask(task) {
        const ok = await Utils.confirm(`删除任务「${task.title}」？`, { okText: '删除' });
        if (!ok) return;
        Store.removeTask(task.id);
        Utils.toast('已删除');
      }

      // 切换到「难度设置」分区，需要密码
      async function switchSection(target) {
        if (target === section.value) return;
        if (target === 'stars' && !authed.value) {
          const ok = await Utils.requireAuth('难度星星设置 · 管理员验证');
          if (!ok) {
            Utils.toast('已取消');
            return;
          }
          authed.value = true;
          // 进入时同步当前奖励值到表单
          const m = state.settings.rewards.taskRewardMap;
          rewardForm.r1 = m['1'] || 0;
          rewardForm.r2 = m['2'] || 0;
          rewardForm.r3 = m['3'] || 0;
          rewardForm.r4 = m['4'] || 0;
        }
        section.value = target;
      }

      // 退出难度设置（清除验证状态，下次进入需重新输密码）
      function exitStars() {
        authed.value = false;
        section.value = 'tasks';
      }

      // 保存难度奖励设置
      function saveRewards() {
        const vals = [rewardForm.r1, rewardForm.r2, rewardForm.r3, rewardForm.r4].map(v => {
          const n = parseInt(v);
          return isNaN(n) || n < 0 ? 0 : n;
        });
        Store.updateRewards({
          taskRewardMap: { '1': vals[0], '2': vals[1], '3': vals[2], '4': vals[3] }
        });
        Utils.toast('难度奖励已保存');
      }

      const rewardMap = Vue.computed(() => state.settings.rewards.taskRewardMap);

      // 待分配难度的任务（所有 pending 任务，按日期排序）
      const pendingForAssign = Vue.computed(() => {
        const tk = todayKey.value;
        return pendingTasks.value.slice().sort((a, b) => {
          if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
          return a.createdAt.localeCompare(b.createdAt);
        });
      });

      // 给任务分配难度
      function assignDifficulty(task, n) {
        const reward = rewardMap.value[String(n)] || 0;
        Store.updateTask(task.id, { difficulty: n, reward: reward });
        Utils.toast('难度 ' + n + ' 已分配');
      }

      function catInfo(key) {
        return Utils.categories[key] || Utils.categories.life;
      }

      return {
        state,
        filter,
        tab,
        showModal,
        editingId,
        form,
        CATS,
        dateOptions,
        todayKey,
        todayTasks,
        futureTasksGrouped,
        doneTasks,
        todayCount,
        futureCount,
        doneCount,
        rewardMap,
        openCreate,
        openEdit,
        closeModal,
        saveTask,
        completeTask,
        removeTask,
        catInfo,
        isFuture: (task) => task.dueDate > todayKey.value,
        dateLabel: (key) => dayGroupLabel(key, todayKey.value, yKey.value, tmrKey.value),
        shortDate: (key) => {
          const d = new Date(key);
          const td = new Date(todayKey.value);
          const diff = Math.round((d - td) / 86400000);
          if (diff === 1) return '明天';
          if (diff === 2) return '后天';
          return `${d.getMonth() + 1}/${d.getDate()}`;
        },
        // 难度设置相关
        section,
        authed,
        rewardForm,
        switchSection,
        exitStars,
        saveRewards,
        pendingForAssign,
        assignDifficulty,
        Utils
      };
    },
    template: `
      <div class="tab-content">
        <!-- 顶部主分区切换 -->
        <div class="task-filter" style="margin-bottom:14px">
          <button class="filter-chip" :class="{ active: section === 'tasks' }" @click="switchSection('tasks')">📋 布置任务</button>
          <button class="filter-chip" :class="{ active: section === 'stars' }" @click="switchSection('stars')">⭐ 星星设置</button>
        </div>

        <!-- 布置任务分区 -->
        <template v-if="section === 'tasks'">
          <div class="task-filter">
            <button class="filter-chip" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
            <button v-for="c in CATS" :key="c.key" class="filter-chip" :class="{ active: filter === c.key }" @click="filter = c.key">{{ c.label }}</button>
          </div>

          <div class="task-filter" style="margin-bottom:14px">
            <button class="filter-chip" :class="{ active: tab === 'today' }" @click="tab = 'today'">📋 今日待办 ({{ todayCount }})</button>
            <button class="filter-chip" :class="{ active: tab === 'future' }" @click="tab = 'future'">📆 未来任务 ({{ futureCount }})</button>
            <button class="filter-chip" :class="{ active: tab === 'done' }" @click="tab = 'done'">✅ 已完成 ({{ doneCount }})</button>
          </div>

          <!-- 今日待办 -->
          <template v-if="tab === 'today'">
            <div v-if="todayTasks.length === 0" class="empty-state">
              <span class="emoji">🗒️</span>
              <div class="text">今天暂无待办，点 + 布置一个吧</div>
            </div>
            <div v-for="t in todayTasks" :key="t.id" class="task-card" @click="openEdit(t)">
              <div class="task-cat" :class="catInfo(t.category).cls">{{ catInfo(t.category).emoji }}</div>
              <div class="task-main">
                <div class="task-title" :class="{ done: t.status === 'done' }">{{ t.title }}</div>
                <div class="task-meta">
                  <span class="task-diff">{{ '⭐'.repeat(t.difficulty) }}</span>
                  <span class="task-reward">+{{ t.reward }} ⭐</span>
                  <span v-if="t.dueDate < todayKey" style="color:var(--danger)">· 已逾期</span>
                </div>
              </div>
              <div class="task-actions" @click.stop>
                <button v-if="t.status === 'pending'" class="btn btn-sm btn-green" @click="completeTask(t, $event)">✅</button>
                <button class="btn btn-sm btn-danger" @click="removeTask(t)">🗑️</button>
              </div>
            </div>
          </template>

          <!-- 未来任务（按日期分组） -->
          <template v-if="tab === 'future'">
            <div v-if="futureTasksGrouped.length === 0" class="empty-state">
              <span class="emoji">📅</span>
              <div class="text">还没有布置未来任务，点 + 安排吧</div>
            </div>
            <div v-for="group in futureTasksGrouped" :key="group.key" style="margin-bottom:18px">
              <div class="section-title" style="margin:0 4px 10px">
                <span>{{ group.label }}（{{ group.tasks.length }}）</span>
              </div>
              <div v-for="t in group.tasks" :key="t.id" class="task-card" @click="openEdit(t)">
                <div class="task-cat" :class="catInfo(t.category).cls">{{ catInfo(t.category).emoji }}</div>
                <div class="task-main">
                  <div class="task-title">{{ t.title }}</div>
                  <div class="task-meta">
                    <span class="task-diff">{{ '⭐'.repeat(t.difficulty) }}</span>
                    <span class="task-reward">+{{ t.reward }} ⭐</span>
                    <span style="color:var(--blue)">· {{ shortDate(t.dueDate) }}</span>
                  </div>
                </div>
                <div class="task-actions" @click.stop>
                  <button class="btn btn-sm btn-ghost" disabled title="未到任务日期">⏳</button>
                  <button class="btn btn-sm btn-danger" @click="removeTask(t)">🗑️</button>
                </div>
              </div>
            </div>
          </template>

          <!-- 已完成 -->
          <template v-if="tab === 'done'">
            <div v-if="doneTasks.length === 0" class="empty-state">
              <span class="emoji">🎉</span>
              <div class="text">还没有完成的任务</div>
            </div>
            <div v-for="t in doneTasks" :key="t.id" class="task-card" @click="openEdit(t)">
              <div class="task-cat" :class="catInfo(t.category).cls">{{ catInfo(t.category).emoji }}</div>
              <div class="task-main">
                <div class="task-title done">{{ t.title }}</div>
                <div class="task-meta">
                  <span class="task-diff">{{ '⭐'.repeat(t.difficulty) }}</span>
                  <span class="task-reward">+{{ t.reward }} ⭐</span>
                  <span style="color:var(--text-mute)">· {{ Utils.formatTime(t.completedAt) }}</span>
                </div>
              </div>
              <div class="task-actions" @click.stop>
                <button class="btn btn-sm btn-danger" @click="removeTask(t)">🗑️</button>
              </div>
            </div>
          </template>

          <button class="fab" @click="openCreate">+</button>
        </template>

        <!-- 星星设置分区 -->
        <template v-if="section === 'stars'">
          <div class="card" style="background:linear-gradient(135deg,#FFE3B3,#FFD56B);text-align:center">
            <div style="font-size:13px;color:var(--text-soft);margin-bottom:4px">🔐 管理员 · 任务难度星星设置</div>
            <div style="font-size:13px;color:var(--text-soft)">设置每个难度完成后的星星奖励</div>
          </div>

          <div class="card">
            <div class="card-title">📊 难度奖励配置</div>
            <div class="form-group">
              <label class="form-label">难度 1 {{ '⭐'.repeat(1) }}</label>
              <div style="display:flex;align-items:center;gap:8px">
                <input class="form-input" type="number" v-model.number="rewardForm.r1" min="0" style="width:120px">
                <span style="color:var(--text-mute);font-size:13px">完成奖励 ⭐</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">难度 2 {{ '⭐'.repeat(2) }}</label>
              <div style="display:flex;align-items:center;gap:8px">
                <input class="form-input" type="number" v-model.number="rewardForm.r2" min="0" style="width:120px">
                <span style="color:var(--text-mute);font-size:13px">完成奖励 ⭐</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">难度 3 {{ '⭐'.repeat(3) }}</label>
              <div style="display:flex;align-items:center;gap:8px">
                <input class="form-input" type="number" v-model.number="rewardForm.r3" min="0" style="width:120px">
                <span style="color:var(--text-mute);font-size:13px">完成奖励 ⭐</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">难度 4 {{ '⭐'.repeat(4) }}</label>
              <div style="display:flex;align-items:center;gap:8px">
                <input class="form-input" type="number" v-model.number="rewardForm.r4" min="0" style="width:120px">
                <span style="color:var(--text-mute);font-size:13px">完成奖励 ⭐</span>
              </div>
            </div>
            <button class="btn btn-primary btn-block" @click="saveRewards">保存设置</button>
            <button class="btn btn-ghost btn-block" style="margin-top:8px" @click="exitStars">退出难度设置</button>
          </div>

          <div class="card">
            <div class="card-title">🎯 任务难度分配</div>
            <div style="font-size:12px;color:var(--text-mute);margin-bottom:12px">为每个待办任务分配难度（决定完成后的星星奖励）</div>
            <div v-if="pendingForAssign.length === 0" class="empty-state" style="padding:20px">
              <span class="emoji">📭</span>
              <div class="text">暂无待分配任务</div>
            </div>
            <div v-for="t in pendingForAssign" :key="t.id" style="padding:10px 0;border-bottom:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="font-size:14px;font-weight:600">{{ t.title }}</span>
                <span style="font-size:12px;color:var(--text-mute)">{{ shortDate(t.dueDate) }}</span>
              </div>
              <div class="difficulty-picker" style="display:grid;grid-template-columns:repeat(4,1fr)">
                <button v-for="n in 4" :key="n" class="diff-option" :class="{ selected: t.difficulty === n }" style="flex-direction:column;gap:2px" @click="assignDifficulty(t, n)">
                  <span>{{ n }}{{ '⭐'.repeat(n) }}</span>
                  <span class="stars" style="color:var(--primary-dark)">+{{ rewardMap[String(n)] }}</span>
                </button>
              </div>
            </div>
          </div>
        </template>

        <div v-if="showModal" class="modal-mask" @click.self="closeModal">
          <div class="modal">
            <div class="modal-title">{{ editingId ? '编辑任务' : '发布新任务' }}</div>
            <div class="form-group">
              <label class="form-label">任务标题</label>
              <input class="form-input" v-model="form.title" placeholder="例如：写周报、跑步 30 分钟" maxlength="50">
            </div>
            <div class="form-group">
              <label class="form-label">日期（可布置未来 7 天内）</label>
              <div class="difficulty-picker" style="display:grid;grid-template-columns:repeat(4,1fr)">
                <button
                  v-for="o in dateOptions"
                  :key="o.key"
                  class="diff-option"
                  :class="{ selected: form.dueDate === o.key }"
                  style="flex-direction:column;gap:2px"
                  @click="form.dueDate = o.key"
                >
                  <span>{{ o.label }}</span>
                  <span class="stars" style="color:var(--text-mute)">{{ o.mdLabel }}</span>
                </button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">分类</label>
              <div class="difficulty-picker">
                <button v-for="c in CATS" :key="c.key" class="diff-option" :class="{ selected: form.category === c.key }" @click="form.category = c.key">{{ c.label }}</button>
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-ghost" @click="closeModal">取消</button>
              <button class="btn btn-primary" @click="saveTask">{{ editingId ? '保存' : '发布' }}</button>
            </div>
          </div>
        </div>
      </div>
    `
  };
})();
