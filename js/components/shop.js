/* shop.js — 商店组件（含商品/价格管理） */
(function () {
  window.Components = window.Components || {};

  const EMOJI_LIST = ['🎁', '📺', '🧋', '🎮', '🍫', '😴', '🎬', '🍕', '☕', '🍰', '🛍️', '🎈', '🎨', '🎵', '📱', '🎮', '🍔', '🍩', '🧁', '🍵'];

  window.Components.Shop = {
    name: 'Shop',
    setup() {
      const state = Store.state;
      const showRedemptions = Vue.ref(false);
      const showModal = Vue.ref(false);
      const editingId = Vue.ref(null);
      const authed = Vue.ref(false); // 商品管理是否已验证
      const form = Vue.reactive({
        name: '',
        emoji: '🎁',
        price: 20,
        stock: -1
      });
      const stockInput = Vue.ref('unlimited'); // unlimited | limited

      const enabledProducts = Vue.computed(() => state.shop.products.filter(p => p.enabled));
      const recentRedemptions = Vue.computed(() => state.shop.redemptions.slice(0, 20));

      const balance = Vue.computed(() => state.wallet.balance);

      // 管理操作前验证（本次会话内有效）
      async function ensureAuthed() {
        if (authed.value) return true;
        const ok = await Utils.requireAuth('商品管理 · 管理员验证');
        if (ok) authed.value = true;
        return ok;
      }

      async function openCreate() {
        if (!(await ensureAuthed())) { Utils.toast('已取消'); return; }
        editingId.value = null;
        form.name = '';
        form.emoji = '🎁';
        form.price = 20;
        form.stock = -1;
        stockInput.value = 'unlimited';
        showModal.value = true;
      }

      async function openEdit(p) {
        if (!(await ensureAuthed())) { Utils.toast('已取消'); return; }
        editingId.value = p.id;
        form.name = p.name;
        form.emoji = p.emoji;
        form.price = p.price;
        form.stock = p.stock;
        stockInput.value = p.stock === -1 ? 'unlimited' : 'limited';
        showModal.value = true;
      }

      function closeModal() {
        showModal.value = false;
        editingId.value = null;
      }

      function saveProduct() {
        const name = (form.name || '').trim();
        if (!name) {
          Utils.toast('请输入商品名称');
          return;
        }
        const stock = stockInput.value === 'unlimited' ? -1 : Math.max(0, parseInt(form.stock) || 0);
        if (editingId.value) {
          Store.updateProduct(editingId.value, {
            name: name,
            emoji: form.emoji,
            price: form.price,
            stock: stock
          });
          Utils.toast('已更新商品');
        } else {
          Store.addProduct({
            name: name,
            emoji: form.emoji,
            price: form.price,
            stock: stock
          });
          Utils.toast('商品已上架');
        }
        closeModal();
      }

      async function removeProduct(p) {
        if (!(await ensureAuthed())) { Utils.toast('已取消'); return; }
        const ok = await Utils.confirm(`删除商品「${p.name}」？`, { okText: '删除' });
        if (!ok) return;
        Store.removeProduct(p.id);
        Utils.toast('已删除');
      }

      function redeem(p, e) {
        const r = Store.redeem(p.id);
        if (!r.ok) {
          Utils.toast(r.reason);
          return;
        }
        Utils.flyStarFromElement(p.price, 'spend', e && e.currentTarget);
        Utils.toast(`兑换成功：${p.name} 🎉`);
      }

      return {
        state,
        showRedemptions,
        showModal,
        editingId,
        form,
        stockInput,
        EMOJI_LIST,
        enabledProducts,
        recentRedemptions,
        balance,
        openCreate,
        openEdit,
        closeModal,
        saveProduct,
        removeProduct,
        redeem,
        Utils
      };
    },
    template: `
      <div class="tab-content">
        <div class="card" style="background:linear-gradient(135deg,#FFE3B3,#FFD56B);text-align:center">
          <div style="font-size:14px;color:var(--text-soft);margin-bottom:4px">🛍️ 我的星星商店</div>
          <div style="font-size:13px;color:var(--text-soft)">用赚到的星星兑换奖励，犒劳自己吧</div>
        </div>

        <div class="shop-grid">
          <div v-for="p in enabledProducts" :key="p.id" class="shop-card" :class="{ disabled: balance < p.price || (p.stock !== -1 && p.stock <= 0) }">
            <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px">
              <button class="btn btn-sm btn-ghost" style="padding:4px 8px;min-height:auto;font-size:12px" @click="openEdit(p)">✏️</button>
              <button class="btn btn-sm btn-danger" style="padding:4px 8px;min-height:auto;font-size:12px" @click="removeProduct(p)">🗑️</button>
            </div>
            <div class="shop-emoji">{{ p.emoji }}</div>
            <div class="shop-name">{{ p.name }}</div>
            <div class="shop-price">⭐ {{ p.price }}</div>
            <div class="shop-stock" :class="{ out: p.stock !== -1 && p.stock <= 0 }">
              {{ p.stock === -1 ? '无限库存' : (p.stock > 0 ? '剩 ' + p.stock + ' 件' : '已售罄') }}
            </div>
            <button class="btn btn-primary btn-sm" :disabled="balance < p.price || (p.stock !== -1 && p.stock <= 0)" @click="redeem(p, $event)">兑换</button>
          </div>
        </div>

        <div v-if="enabledProducts.length === 0" class="empty-state">
          <span class="emoji">🛒</span>
          <div class="text">商店空空如也，点 + 添加商品</div>
        </div>

        <div v-if="state.shop.redemptions.length > 0" style="margin-top:18px">
          <div class="collapse-trigger" :class="{ open: showRedemptions }" @click="showRedemptions = !showRedemptions">
            <span>📜 兑换记录 ({{ state.shop.redemptions.length }})</span>
            <span class="arrow">⌄</span>
          </div>
          <div v-if="showRedemptions" class="tx-list">
            <div v-for="r in recentRedemptions" :key="r.id" class="tx-item">
              <div class="tx-icon spend">{{ r.emoji || '🎁' }}</div>
              <div class="tx-main">
                <div class="tx-desc">{{ r.name }}</div>
                <div class="tx-time">{{ Utils.formatTime(r.time) }}</div>
              </div>
              <div class="tx-amount spend">-{{ r.cost }} ⭐</div>
            </div>
          </div>
        </div>

        <button class="fab" @click="openCreate">+</button>

        <div v-if="showModal" class="modal-mask" @click.self="closeModal">
          <div class="modal">
            <div class="modal-title">{{ editingId ? '编辑商品' : '添加新商品' }}</div>
            <div class="form-group">
              <label class="form-label">商品名称</label>
              <input class="form-input" v-model="form.name" placeholder="例如：看一集剧" maxlength="20">
            </div>
            <div class="form-group">
              <label class="form-label">图标</label>
              <div class="emoji-picker">
                <button v-for="e in EMOJI_LIST" :key="e" class="emoji-option" :class="{ selected: form.emoji === e }" @click="form.emoji = e">{{ e }}</button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">价格（星星）</label>
              <input class="form-input" type="number" v-model.number="form.price" min="1" style="width:120px">
            </div>
            <div class="form-group">
              <label class="form-label">库存</label>
              <div class="difficulty-picker">
                <button class="diff-option" :class="{ selected: stockInput === 'unlimited' }" @click="stockInput = 'unlimited'; form.stock = -1">无限</button>
                <button class="diff-option" :class="{ selected: stockInput === 'limited' }" @click="stockInput = 'limited'; form.stock = (form.stock === -1 ? 5 : form.stock)">限量</button>
              </div>
              <div v-if="stockInput === 'limited'" style="margin-top:8px">
                <input class="form-input" type="number" v-model.number="form.stock" min="0" placeholder="库存数量" style="width:140px">
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-ghost" @click="closeModal">取消</button>
              <button class="btn btn-primary" @click="saveProduct">{{ editingId ? '保存' : '上架' }}</button>
            </div>
          </div>
        </div>
      </div>
    `
  };
})();
