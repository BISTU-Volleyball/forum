/* 排友圈 · 信息科大教职工排协会员交流区 前端（单页，hash 路由） */
(() => {
  'use strict';
  const API = window.PF_API;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $('#view');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkify = s => esc(s).replace(/https?:\/\/[^\s<>"']+/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  function rich(text, mentions) {
    let h = linkify(text);
    for (const m of [...(mentions || [])].sort((a, b) => b.nick.length - a.nick.length)) {
      const t = '@' + esc(m.nick);
      h = h.split(t).join(m.uid === '*' ? `<span class="atall">${t}</span>` : `<span class="ulink at" data-u="${esc(m.uid)}">${t}</span>`);
    }
    return h;
  }
  const WD = '日一二三四五六';
  const pad = n => String(n).padStart(2, '0');
  function rel(t) {
    const d = Date.now() - t;
    if (d < 60e3) return '刚刚';
    if (d < 3600e3) return Math.floor(d / 60e3) + '分钟前';
    const a = new Date(t), b = new Date();
    if (a.toDateString() === b.toDateString()) return `今天 ${pad(a.getHours())}:${pad(a.getMinutes())}`;
    const y = new Date(Date.now() - 86400e3);
    if (a.toDateString() === y.toDateString()) return `昨天 ${pad(a.getHours())}:${pad(a.getMinutes())}`;
    return (a.getFullYear() === b.getFullYear() ? '' : a.getFullYear() + '-') + `${pad(a.getMonth() + 1)}-${pad(a.getDate())}`;
  }
  const evTime = t => { const a = new Date(t); return `${a.getMonth() + 1}月${a.getDate()}日 周${WD[a.getDay()]} ${pad(a.getHours())}:${pad(a.getMinutes())}`; };
  const toLocalInput = t => { const a = new Date(t); return `${a.getFullYear()}-${pad(a.getMonth() + 1)}-${pad(a.getDate())}T${pad(a.getHours())}:${pad(a.getMinutes())}`; };

  // ---------------- 状态 ----------------
  let token = localStorage.getItem('pf_token') || '';
  let me = null, meAt = 0;
  let cfg = JSON.parse(localStorage.getItem('pf_cfg') || 'null');
  const listCache = {};
  let navDepth = 0, curKey = null, pollTimer = 0;

  function toast(msg, ms = 2000) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms);
  }

  async function api(action, data = {}, { silent } = {}) {
    let r, j;
    try {
      r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token, ...data }) });
      j = await r.json().catch(() => ({}));
    } catch (e) {
      if (!silent) toast('网络不太好，请稍后再试');
      throw e;
    }
    if (r.status === 401 && action !== 'login') { logout(true); throw new Error(j.error); }
    if (r.status === 403 && j.mustChange) { location.hash = '#/me/pw'; throw new Error(j.error); }
    if (!r.ok) { const e = new Error(j.error || '出错了'); e.data = j; if (!silent) toast(e.message, 2600); throw e; }
    return j;
  }
  async function loadConfig() {
    if (cfg && cfg.at && Date.now() - cfg.at < 300e3) return cfg;
    try { cfg = { ...(await api('config', {}, { silent: true })), at: Date.now() }; localStorage.setItem('pf_cfg', JSON.stringify(cfg)); }
    catch (e) { if (!cfg) throw e; }
    return cfg;
  }
  async function loadMe(force) {
    if (!token) return null;
    if (!force && me && Date.now() - meAt < 60e3) return me;
    const r = await api('me');
    me = r.me; meAt = Date.now();
    updateDots();
    return me;
  }
  function updateDots() {
    const d = $('#dot'), d2 = $('#dot2');
    const n = me ? (me.unread || 0) + (me.dmUnread || 0) : 0;
    d.hidden = !n; d.textContent = n > 99 ? '99+' : n;
    const a = me ? (me.pending || 0) + (me.reports || 0) : 0;
    d2.hidden = !a; d2.textContent = a;
    document.title = (n ? `(${n > 99 ? '99+' : n}) ` : '') + '排友圈 · 信息科大教职工排协';
    try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } } catch (e) { /* 不支持 */ }
  }
  // 页面开着时每分钟查一次新消息；切到后台不查，回到前台立刻查
  let lastPoll = 0;
  async function pollMe() {
    if (!token || document.visibilityState !== 'visible' || Date.now() - lastPoll < 50e3) return;
    lastPoll = Date.now();
    try {
      const old = me ? (me.unread || 0) + (me.dmUnread || 0) : 0;
      me = { ...(me || {}), ...(await api('me', {}, { silent: true })).me }; meAt = Date.now();
      updateDots();
      const n = (me.unread || 0) + (me.dmUnread || 0);
      if (n > old && /^#\/(msg)?(\?.*)?$/.test(location.hash || '#/')) toast(`你有 ${n} 条新消息`);
    } catch (e) { /* 忽略 */ }
  }
  setInterval(pollMe, 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { lastPoll = 0; pollMe(); } });
  function logout(expired) {
    token = ''; me = null; localStorage.removeItem('pf_token');
    for (const k in listCache) delete listCache[k];
    if (expired) toast('请重新登录');
    location.hash = '#/login';
  }
  const isAdmin = () => me && (me.role === 'admin' || me.role === 'super');
  const boardOf = id => (cfg.boards || []).find(b => b.id === id);
  const isAdminBoard = id => { const b = boardOf(id); return b && b.adminOnly; };

  // ---------------- 渲染小部件 ----------------
  const avatar = (a, cls = '') => a.avUrl
    ? `<img class="av ${cls}" data-id="${esc(a.av)}" data-k="thumb" src="${esc(a.avUrl)}" alt="">`
    : `<span class="av ${cls}" data-c="${esc(a.color || '#888')}">${esc((a.nick || '?').slice(0, 1))}</span>`;
  const ulink = (a, inner) => a.gone || !a.uid ? inner : `<span class="ulink" data-u="${esc(a.uid)}">${inner}</span>`;
  const who = a => `${ulink(a, `${avatar(a)}<span class="nk">${esc(a.nick)}</span>`)}${a.guest ? '<span class="badge gst">亲友</span>' : ''}${a.role ? `<span class="badge">${a.role === 'super' ? '超管' : '管理员'}</span>` : ''}${a.college ? `<span class="col">${esc(a.college)}</span>` : ''}`;
  const btag = id => { const b = boardOf(id); return b ? `<span class="tag ${esc(b.color)}">${esc(b.short)}</span>` : ''; };
  function paint(root = view) {
    $$('[data-c]', root).forEach(el => { el.style.background = el.dataset.c; });
  }
  function evLine(ev) {
    const full = ev.n >= ev.cap, past = ev.time < Date.now();
    return `<b>${esc(evTime(ev.time))}</b>　${esc(ev.place)}　${past ? '已结束' : full ? '<span class="full">已满</span>' : ''} 已报 ${ev.n}/${ev.cap}`;
  }
  function card(p) {
    const flags = (p.pinned ? '<span class="tag pin">置顶</span>' : '') + (p.featured ? '<span class="tag ft">精</span>' : '') + (p.locked ? '<span class="tag lk">锁</span>' : '');
    const th = p.thumbs.length ? `<div class="thumbs">${p.thumbs.map(t => `<span class="tw${/g$/.test(t.id) ? ' gif' : ''}"><img loading="lazy" data-id="${esc(t.id)}" data-k="thumb" src="${esc(t.url)}" alt=""></span>`).join('')}${p.nImages > 3 ? `<span class="more">共${p.nImages}张</span>` : ''}</div>` : '';
    return `<a class="card" href="#/p/${esc(p.id)}">
      <div class="t">${flags}${btag(p.board)}${esc(p.title)}</div>
      ${p.excerpt ? `<div class="x">${esc(p.excerpt)}</div>` : ''}${p.event ? `<div class="evbox">${evLine(p.event)}</div>` : ''}${p.poll ? `<div class="pollmark">📊 投票${p.poll.closed ? '（已结束）' : ''} · ${p.poll.voters} 人参与</div>` : ''}${th}
      <div class="meta">${who(p.author)}<span>· ${rel(p.at)}</span><span class="r">💬 ${p.replies}　👍 ${p.likes}</span></div></a>`;
  }
  function imgGrid(imgs) {
    if (!imgs.length) return '';
    const cls = imgs.length === 1 ? 'one' : imgs.length === 2 || imgs.length === 4 ? 'two' : '';
    // 动图（id 以 g 结尾）在帖子里直接播放原图
    return `<div class="imgs ${cls}">${imgs.map(i => { const g = /g$/.test(i.id), big = imgs.length === 1 || g;
      return `<span class="iw${g ? ' gif' : ''}"><img loading="lazy" data-id="${esc(i.id)}" data-k="${big ? 'full' : 'thumb'}" data-full="${esc(i.full)}" src="${esc(big ? i.full : i.thumb)}" alt=""></span>`; }).join('')}</div>`;
  }

  // 签名图片链接过期后自动换新
  const resign = { ids: new Set(), h: 0, tried: new Set() };
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.id || resign.tried.has(img.dataset.id + img.dataset.k)) return;
    resign.tried.add(img.dataset.id + img.dataset.k);
    resign.ids.add(img.dataset.id);
    clearTimeout(resign.h);
    resign.h = setTimeout(async () => {
      const ids = [...resign.ids]; resign.ids.clear();
      try {
        const { urls } = await api('sign', { ids }, { silent: true });
        for (const el of $$('img[data-id]')) {
          const u = urls[el.dataset.id];
          if (u) { el.src = el.dataset.k === 'full' ? u.full : u.thumb; if (el.dataset.full) el.dataset.full = u.full; }
        }
      } catch (err) { /* 忽略 */ }
    }, 250);
  }, true);

  // 点头像/昵称进会员主页
  document.addEventListener('click', e => {
    const u = e.target.closest('[data-u]');
    if (!u) return;
    e.preventDefault(); e.stopPropagation();
    location.hash = '#/user/' + u.dataset.u;
  }, true);

  // 看大图
  document.addEventListener('click', e => {
    const img = e.target.closest('.imgs img, .pv img');
    if (!img) return;
    const lb = $('#lightbox');
    $('img', lb).src = img.dataset.full || img.src;
    lb.hidden = false;
  });
  $('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });

  // 底部菜单 / 对话框
  function sheet(title, items) {
    const s = $('#sheet');
    s.innerHTML = `<div class="box">${title ? `<div class="st">${esc(title)}</div>` : ''}${items.map((it, i) => `<a data-i="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}</a>`).join('')}<a class="cancel">取消</a></div>`;
    s.hidden = false;
    s.onclick = e => {
      const a = e.target.closest('a');
      if (!a && e.target !== s) return;
      s.hidden = true;
      if (a && a.dataset.i != null) items[a.dataset.i].fn();
    };
  }
  function dialog({ title, text, input, textarea, value = '', placeholder = '', ok = '确定', danger, type = 'text' }) {
    return new Promise(res => {
      const s = $('#sheet');
      const field = textarea ? `<textarea rows="5" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : input ? `<input type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">` : '';
      s.innerHTML = `<div class="dlg"><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${field}<div class="bs"><button class="btn l" data-a="no">取消</button><button class="btn ${danger ? 'd' : ''}" data-a="ok">${esc(ok)}</button></div></div>`;
      s.hidden = false;
      const f = $('input, textarea', s); if (f) setTimeout(() => f.focus(), 50);
      s.onclick = e => {
        const b = e.target.closest('button');
        if (!b && e.target !== s) return;
        s.hidden = true;
        res(b && b.dataset.a === 'ok' ? (f ? f.value : true) : null);
      };
    });
  }

  // ---------------- 图片压缩上传 ----------------
  async function loadImg(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* 退回 Image */ } }
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('无法读取这张图片')); i.src = URL.createObjectURL(file); });
  }
  function draw(img, max) {
    const w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function toB64(c, q) {
    return new Promise((res, rej) => c.toBlob(b => {
      if (!b) return rej(new Error('图片处理失败'));
      const fr = new FileReader(); fr.onload = () => res({ b64: String(fr.result).split(',')[1], size: b.size }); fr.readAsDataURL(b);
    }, 'image/jpeg', q));
  }
  const fileB64 = f => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(new Error('读取图片失败')); fr.readAsDataURL(f); });
  async function compress(file) {
    if (file.type === 'image/gif' || /\.gif$/i.test(file.name || '')) {
      // 动图：原样上传（不压缩，保留动画），缩略图取第一帧
      if (file.size > 900 * 1024) throw new Error(`动图太大（${(file.size / 1024 / 1024).toFixed(1)}MB），请选 900KB 以内的动图`);
      const first = await loadImg(file);
      const t = await toB64(draw(first, 420), 0.72);
      return { data: await fileB64(file), thumb: t.b64, gif: true };
    }
    const img = await loadImg(file);
    let c = draw(img, 1280), q = 0.8, r = await toB64(c, q);
    while (r.size > 400 * 1024 && q > 0.5) { q -= 0.1; r = await toB64(c, q); }
    if (r.size > 400 * 1024) { c = draw(img, 960); r = await toB64(c, 0.65); }
    const tc = draw(img, 420);
    let tq = 0.72, t = await toB64(tc, tq);
    while (t.size > 100 * 1024 && tq > 0.4) { tq -= 0.1; t = await toB64(tc, tq); }
    return { data: r.b64, thumb: t.b64 };
  }
  // 头像裁剪框：拖动移动、双指（或滚轮、滑块）缩放；返回 200×200 画布，取消返回 null
  async function cropAvatar(file) {
    const src = draw(await loadImg(file), 1600);
    const W = src.width, H = src.height;
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.id = 'crop';
      box.innerHTML = `<div class="ctitle">拖动调整位置，双指或拖动滑块缩放</div>
        <div class="cwrap"><canvas></canvas><div class="cring"></div></div>
        <div class="czoom"><span>－</span><input type="range" min="0" max="1000" value="0"><span>＋</span></div>
        <div class="cbtns"><button class="btn l" data-a="no">取消</button><button class="btn o" data-a="ok">使用这张</button></div>`;
      document.body.appendChild(box);
      const cv = $('canvas', box), wrap = $('.cwrap', box), range = $('input', box);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const S = Math.min(window.innerWidth - 32, window.innerHeight - 240, 380);
      wrap.style.width = wrap.style.height = S + 'px';
      cv.style.width = cv.style.height = S + 'px';
      cv.width = cv.height = Math.round(S * dpr);
      const g = cv.getContext('2d');
      const minK = S / Math.min(W, H), maxK = minK * 5;
      let k = minK, x = (S - W * k) / 2, y = (S - H * k) / 2;
      const clamp = () => {
        k = Math.max(minK, Math.min(maxK, k));
        x = Math.min(0, Math.max(S - W * k, x));
        y = Math.min(0, Math.max(S - H * k, y));
      };
      const paintC = () => {
        clamp();
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
        g.drawImage(src, x, y, W * k, H * k);
        range.value = Math.round(Math.log(k / minK) / Math.log(maxK / minK) * 1000);
      };
      const zoomAt = (nk, cx, cy) => {
        nk = Math.max(minK, Math.min(maxK, nk));
        x = cx - (cx - x) * nk / k; y = cy - (cy - y) * nk / k; k = nk;
        paintC();
      };
      paintC();
      const pts = new Map();
      let last = null;
      const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const pinch = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };
      cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); last = pts.size === 2 ? pinch() : null; });
      cv.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId), cur = local(e);
        pts.set(e.pointerId, cur);
        if (pts.size === 1) { x += cur.x - prev.x; y += cur.y - prev.y; paintC(); }
        else if (pts.size === 2) {
          const p = pinch();
          if (last) { x += p.cx - last.cx; y += p.cy - last.cy; zoomAt(k * p.d / last.d, p.cx, p.cy); }
          last = p;
        }
      });
      const up = e => { pts.delete(e.pointerId); last = pts.size === 2 ? pinch() : null; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); zoomAt(k * Math.exp(-e.deltaY / 500), p.x, p.y); }, { passive: false });
      range.oninput = () => zoomAt(minK * Math.pow(maxK / minK, range.value / 1000), S / 2, S / 2);
      $$('.czoom span', box).forEach((s, i) => s.onclick = () => zoomAt(k * (i ? 1.25 : 0.8), S / 2, S / 2));
      box.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        let out = null;
        if (b.dataset.a === 'ok') {
          out = document.createElement('canvas'); out.width = out.height = 200;
          const og = out.getContext('2d'); og.fillStyle = '#fff'; og.fillRect(0, 0, 200, 200);
          og.drawImage(src, -x / k, -y / k, S / k, S / k, 0, 0, 200, 200);
        }
        box.remove(); resolve(out);
      });
    });
  }
  async function encodeAvatar(c) {
    let q = 0.85, r = await toB64(c, q);
    while (r.size > 40 * 1024 && q > 0.4) { q -= 0.1; r = await toB64(c, q); }
    return r.b64;
  }
  // 网关单次请求上限约 100KB：切成小段上传（每段 base64 ≤ 64000 字符），3 段并行
  async function uploadImage(z) {
    const up = [...crypto.getRandomValues(new Uint8Array(12))].map(x => x.toString(16).padStart(2, '0')).join('');
    const split = s => { const a = []; for (let i = 0; i < s.length; i += 64000) a.push(s.slice(i, i + 64000)); return a; };
    const jobs = [...split(z.data).map((data, index) => ({ kind: 'f', index, data })), ...split(z.thumb).map((data, index) => ({ kind: 't', index, data }))];
    const nf = jobs.filter(j => j.kind === 'f').length, nt = jobs.length - nf;
    let k = 0;
    const worker = async () => {
      while (k < jobs.length) {
        const j = jobs[k++];
        for (let tries = 0; ; tries++) {
          try { await api('upPart', { uploadId: up, ...j }, { silent: tries < 2 }); break; } catch (e) { if (tries >= 2 || e.data) throw e; }
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return api('upDone', { uploadId: up, nf, nt, gif: !!z.gif });
  }
  // 图片选择器：items = [{ id, url, busy }]
  function picker(host, max, onChange) {
    const items = [];
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true;
    document.body.appendChild(input);
    function render() {
      host.innerHTML = items.map((it, i) => `<div class="pic"><img src="${esc(it.url)}" alt="">${it.busy ? '<div class="bar"></div>' : ''}<span class="x" data-i="${i}">×</span></div>`).join('')
        + (items.length < max ? '<div class="pic add">＋</div>' : '');
      onChange && onChange();
    }
    host.addEventListener('click', e => {
      const x = e.target.closest('.x');
      if (x) { items.splice(Number(x.dataset.i), 1); render(); return; }
      if (e.target.closest('.add')) input.click();
    });
    input.onchange = async () => {
      const files = [...input.files].slice(0, max - items.length);
      input.value = '';
      for (const f of files) {
        const it = { url: URL.createObjectURL(f), busy: true };
        items.push(it); render();
        try {
          const z = await compress(f);
          const r = await uploadImage(z);
          it.id = r.id; it.busy = false;
        } catch (e) {
          items.splice(items.indexOf(it), 1);
          toast(e.message && e.message !== 'Failed to fetch' ? e.message : '图片上传失败，请检查网络后重试', 2600);
        }
        render();
      }
    };
    render();
    return {
      ids: () => items.filter(i => i.id).map(i => i.id),
      busy: () => items.some(i => i.busy),
      set(list) { items.length = 0; for (const x of list) items.push({ id: x.id, url: x.thumb || x.url }); render(); },
      open: () => input.click(),
      count: () => items.length,
      destroy: () => input.remove(),
    };
  }

  // 选一位会员（用于 @）
  let membersCache = null;
  async function pickMember(cb) {
    if (!membersCache || Date.now() - membersCache.at > 300e3) membersCache = { list: (await api('members')).list, at: Date.now() };
    const s = $('#sheet');
    s.innerHTML = `<div class="box"><div class="st">提到哪位会员？（每次最多 ${isAdmin() ? '50 人，可 @所有人' : me && me.kind === 'guest' ? '5 人' : '10 人'}）</div><div class="search"><input id="pmq" placeholder="搜昵称"></div><div id="pml" class="pml"></div><a class="cancel">取消</a></div>`;
    s.hidden = false;
    const draw = (k = '') => {
      const rows = membersCache.list.filter(u => u.uid !== (me && me.uid) && (!k || u.nick.includes(k))).slice(0, 60);
      $('#pml').innerHTML = (isAdmin() && !k ? '<a data-n="所有人"><span class="av sysav">全</span> <b>所有人</b>（通知全部会员和亲友）</a>' : '')
        + (rows.map(u => `<a data-n="${esc(u.nick)}">${avatar(u)} ${esc(u.nick)}</a>`).join('') || '<div class="empty">没有找到</div>');
      paint($('#pml'));
    };
    draw();
    $('#pmq').oninput = e => draw(e.target.value.trim());
    s.onclick = e => {
      const a = e.target.closest('a');
      if (!a && e.target !== s) return;
      s.hidden = true;
      if (a && a.dataset.n) cb(a.dataset.n);
    };
  }
  function insertAt(ta, text) {
    const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, a) + text + ta.value.slice(b);
    ta.focus(); ta.selectionStart = ta.selectionEnd = a + text.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---------------- 页面框架 ----------------
  function frame({ title, back, nav, right }) {
    $('#top').hidden = false;
    $('#back').hidden = !back;
    $('#brand').hidden = !!title;
    $('#ttl').hidden = !title; $('#ttl').textContent = title || '';
    $('#home-link').outerHTML = right || '<a id="home-link" class="home-link" href="../">官网</a>';
    curKey = null;
    $('#nav').hidden = !nav;
    document.body.classList.toggle('nonav', !nav);
    document.body.classList.remove('hasbar');
    $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.n === nav));
    const rb = $('.rbar'); if (rb) rb.remove();
    clearInterval(pollTimer); pollTimer = 0;
    const fab = $('.fab'); if (fab) fab.remove();
  }
  $('#back').addEventListener('click', () => { if (navDepth > 1) history.back(); else location.hash = '#/'; });

  // ---------------- 登录 / 注册 ----------------
  function pwField(name, ph) { return `<div class="pw-wrap"><input name="${name}" type="password" autocomplete="${name === 'password' ? 'current-password' : 'new-password'}" placeholder="${ph}" required><a data-eye>显示</a></div>`; }
  function bindEyes(root) { $$('[data-eye]', root).forEach(a => a.onclick = () => { const i = a.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; a.textContent = i.type === 'password' ? '显示' : '隐藏'; }); }

  async function pageLogin() {
    frame({ title: '' });
    await loadConfig().catch(() => {});
    view.innerHTML = `<form class="form" id="f">
      <h2>登录排友圈</h2><p class="lead">信息科大教职工排协会员交流区</p>
      <label class="fld"><span>工号（亲友填登录名）</span><input name="workNo" autocomplete="username" inputmode="text" required></label>
      <label class="fld"><span>密码</span>${pwField('password', '')}</label>
      <button class="btn">登录</button>
      <div id="msg"></div>
      <p class="alt">还没有账号？<a href="#/register">会员申请注册</a></p>
      <p class="alt">教职工亲友？请向会员要邀请链接，<a href="#/join">亲友申请</a></p>
      <p class="alt">忘记密码请联系管理员重置</p>
      ${cfg && cfg.needSetup ? '<p class="alt"><a href="#/setup">首次使用：创建超级管理员</a></p>' : ''}
    </form>`;
    bindEyes(view);
    $('#f').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const btn = $('button.btn', e.target); btn.disabled = true;
      try {
        const r = await api('login', fd, { silent: true });
        afterLogin(r);
      } catch (err) {
        const st = err.data && err.data.status;
        $('#msg').innerHTML = `<div class="hint ${st ? '' : 'warn'}">${esc(err.message || '登录失败')}</div>`;
        if (st === 'rejected') $('#msg').innerHTML += '<p class="alt"><a href="#/register">修改信息后重新申请</a></p>';
      } finally { btn.disabled = false; }
    };
  }
  function afterLogin(r) {
    token = r.token; localStorage.setItem('pf_token', token);
    me = r.me; meAt = 0;
    location.hash = me.mustChange ? '#/me/pw' : me.welcomed ? '#/' : '#/welcome';
  }

  function regForm(extra = '') {
    return `${extra}
      <label class="fld"><span>学院 / 部门</span><select name="college" required><option value="">请选择</option>${(cfg.colleges || []).map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="fld"><span>工号</span><input name="workNo" autocomplete="username" required></label>
      <label class="fld"><span>姓名</span><input name="name" autocomplete="name" required></label>
      <label class="fld"><span>昵称</span><input name="nick" maxlength="12" required><small>2～12 个字，大家看到的是昵称；以后可以改</small></label>
      <label class="fld"><span>密码</span>${pwField('password', '至少 6 位')}</label>
      <label class="fld"><span>备注（选填）</span><input name="note" maxlength="100" placeholder="例如：谁介绍来的、所在球队"></label>`;
  }
  const PRIVACY = `<h3>个人信息说明</h3>
    <p>1. 收集：学院/部门、工号、姓名，只用于管理员核实你是协会会员本人。</p>
    <p>2. 谁能看到：姓名和工号只有你自己和论坛管理员能看到；其他会员只看到你的昵称、头像颜色，以及学院（可在"我的"里关闭）。</p>
    <p>3. 存放：腾讯云 CloudBase（上海），密码只存加密后的摘要，任何人都看不到原密码。</p>
    <p>4. 私信：只有对话双方能看到；被举报的那一条私信管理员可以看到，用于处理骚扰。</p>
    <p>5. 亲友账号：教职工亲友凭会员邀请注册，填写真实姓名和与邀请人的关系，这些信息只有管理员和邀请人能看到；仅限年满 18 周岁。</p>
    <p>6. 注销：可随时在"我的 → 注销账号"自助注销，注销后删除姓名、工号、学院和密码，已发内容的作者显示为"已注销用户"。</p>`;

  async function pageRegister() {
    frame({ title: '申请注册', back: true });
    await loadConfig();
    view.innerHTML = `<form class="form" id="f">
      <p class="lead">排友圈仅限信息科大教职工排协会员使用。提交后由管理员人工审核，通过后用工号和密码登录。</p>
      ${regForm()}
      <div class="privacy">${PRIVACY}<p>7. 使用排友圈请遵守 <a href="#/rules">排友圈公约</a>：文明友善、就事论事。</p></div>
      <button class="btn o">我已阅读上述说明和公约，提交申请</button>
      <p class="alt">已有账号？<a href="#/login">去登录</a></p></form>`;
    bindEyes(view);
    $('#f').onsubmit = async e => {
      e.preventDefault();
      const btn = $('button.btn', e.target); btn.disabled = true;
      try {
        await api('register', Object.fromEntries(new FormData(e.target)));
        view.innerHTML = `<div class="form"><div class="empty"><b>✅</b>申请已提交</div><div class="hint">管理员审核通过后，就可以用<b>工号和密码</b>登录了。审核期间登录会提示"审核中"。</div><a class="btn" href="#/login">返回登录</a></div>`;
      } catch (err) { /* 已提示 */ } finally { btn.disabled = false; }
    };
  }

  async function pageJoin(q) {
    frame({ title: '亲友申请', back: true });
    const code = (q.get('c') || '').toUpperCase();
    let sp = null;
    if (code) { try { sp = (await api('inviteInfo', { code }, { silent: true })).sponsor; } catch (e) { /* 下面提示 */ } }
    view.innerHTML = `<form class="form" id="f">
      <p class="lead">欢迎教职工的家人和朋友加入排友圈！亲友账号需要一位会员邀请担保，提交后由管理员审核。</p>
      ${sp ? `<div class="hint">邀请人：<b>${esc(sp.nick)}</b></div><br>` : code ? '<div class="hint warn">这个邀请码无效或已失效，请向邀请你的会员重新索取。</div><br>' : ''}
      <label class="fld"><span>邀请码</span><input name="code" value="${esc(code)}" required placeholder="8 位，向会员索取"></label>
      <label class="fld"><span>真实姓名</span><input name="name" autocomplete="name" required><small>只有管理员和邀请你的会员能看到</small></label>
      <label class="fld"><span>和邀请人的关系</span><select name="relation" required><option value="">请选择</option><option>家属</option><option>朋友</option><option>其他</option></select></label>
      <label class="fld"><span>昵称</span><input name="nick" maxlength="12" required><small>2～12 个字，大家看到的是昵称</small></label>
      <label class="fld"><span>登录名</span><input name="loginName" maxlength="20" autocomplete="username" required><small>以后用它登录：4～20 位，字母开头，只能用字母和数字</small></label>
      <label class="fld"><span>密码</span>${pwField('password', '至少 6 位')}</label>
      <label class="fld"><span>备注（选填）</span><input name="note" maxlength="100" placeholder="例如：经常一起打球"></label>
      <label class="fld chk"><input type="checkbox" name="adult" value="1" required> 我已年满 18 周岁</label>
      <div class="privacy">${PRIVACY}</div>
      <button class="btn o">我已阅读上述说明和公约，提交申请</button></form>`;
    bindEyes(view);
    $('#f').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      if (!fd.adult) return toast('亲友账号仅限年满 18 周岁的成年人');
      const btn = $('button.btn', e.target); btn.disabled = true;
      try {
        await api('registerGuest', { ...fd, adult: true });
        view.innerHTML = `<div class="form"><div class="empty"><b>✅</b>申请已提交</div><div class="hint">管理员审核通过后，就可以用<b>登录名和密码</b>登录了。</div><a class="btn" href="#/login">返回登录</a></div>`;
      } catch (err) { /* 已提示 */ } finally { btn.disabled = false; }
    };
  }

  // ---------------- 新消息通知（网页推送） ----------------
  const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  async function currentSub() {
    if (!pushSupported()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }
  async function pageNotify() {
    frame({ title: '新消息通知', back: true });
    await loadConfig();
    if (!cfg.vapid) { cfg.at = 0; await loadConfig().catch(() => {}); }
    const sub = await currentSub().catch(() => null);
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    let state, tip = '';
    if (isIOS && !standalone) { state = 'needA2HS'; }
    else if (!pushSupported() || !cfg.vapid) { state = 'unsupported'; }
    else if (perm === 'denied') { state = 'denied'; }
    else state = sub ? 'on' : 'off';
    if (state === 'needA2HS') tip = `<div class="hint warn">iPhone 需要先把排友圈<b>添加到主屏幕</b>，再从桌面图标打开排友圈，回到这里开启通知（需要 iOS 16.4 及以上）。</div><p><a href="#/a2hs">怎么添加到主屏幕 ›</a></p>`;
    if (state === 'unsupported') tip = `<div class="hint">这个手机或浏览器不支持后台通知。${isIOS ? '请确认 iOS 版本在 16.4 及以上，并从桌面图标打开排友圈。' : '多数国产安卓手机没有谷歌推送服务，收不到网页通知；打开排友圈时，底部"消息"上的红点会每分钟自动更新。'}</div>`;
    if (state === 'denied') tip = `<div class="hint warn">你之前拒绝了通知权限。请到手机的"设置 → 通知 → 排友圈"（或浏览器的网站设置）里打开，再回到这里。</div>`;
    view.innerHTML = `<div class="doc"><h2>新消息通知</h2>
      <p>开启后，即使没打开排友圈，有人<b>回复你、@你、给你发私信、报名你的约球</b>时，手机会弹出通知，桌面图标上也会显示未读数字。点赞不提醒。</p>
      ${tip}
      ${state === 'on' ? '<div class="hint">✅ 这台设备已开启通知</div><br><button class="btn l" id="ptest">发一条测试通知</button><button class="btn d" id="poff">关闭这台设备的通知</button>' : ''}
      ${state === 'off' ? '<button class="btn o" id="pon">🔔 开启新消息通知</button>' : ''}
      <p class="alt">每台手机要分别开启。换手机或清除浏览器数据后需要重新开启。</p></div>`;
    const on = $('#pon');
    if (on) on.onclick = async () => {
      on.disabled = true;
      try {
        const pm = await Notification.requestPermission();
        if (pm !== 'granted') { toast('没有获得通知权限'); return pageNotify(); }
        const reg = await navigator.serviceWorker.register('sw.js');
        await navigator.serviceWorker.ready;
        const s2 = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(cfg.vapid) });
        await api('pushSubscribe', { sub: s2.toJSON(), ua: navigator.userAgent.slice(0, 120) });
        toast('通知已开启'); pageNotify();
      } catch (e) { toast(e.data ? e.message : '开启失败：' + (e.message || '浏览器不支持')); on.disabled = false; }
    };
    const off = $('#poff');
    if (off) off.onclick = async () => {
      const s2 = await currentSub();
      if (s2) { await api('pushUnsubscribe', { endpoint: s2.endpoint }).catch(() => {}); await s2.unsubscribe().catch(() => {}); }
      toast('已关闭'); pageNotify();
    };
    const tt = $('#ptest');
    if (tt) tt.onclick = async () => { await api('pushTest'); toast('已发送，稍等几秒看看手机通知'); };
  }

  async function pageGuests() {
    frame({ title: '邀请亲友', back: true });
    view.innerHTML = '<div class="loading">加载中…</div>';
    const load = async (reset) => {
      const r = await api('invite', { reset });
      const link = location.href.split('#')[0] + '#/join?c=' + r.code;
      const st = { pending: '审核中', active: '已加入', suspended: '已暂停', banned: '已停用' };
      view.innerHTML = `<div class="doc"><h2>邀请亲友（已担保 ${r.used}/${r.max} 人）</h2>
        <p>把下面的邀请链接发给你的家人或朋友（需年满 18 周岁），对方填写申请、管理员审核后即可加入。你是 TA 的担保人，TA 的内容被管理员处理时你会收到通知。</p>
        <div class="invbox"><div class="ic">邀请码：<b>${esc(r.code)}</b></div><div class="il">${esc(link)}</div>
        <div class="avops"><button class="mini f" id="cp">📋 复制邀请链接</button><button class="mini" id="rs">换一个邀请码</button></div></div>
        ${r.used >= r.max ? '<div class="hint warn">已担保满 3 人，暂时不能再邀请。</div>' : ''}
        <h3>我担保的亲友</h3>
        ${r.guests.length ? r.guests.map(g => `<div class="acard gcard" data-uid="${esc(g.uid)}"><div class="h">${avatar(g)} ${esc(g.nick)}<span class="w">${esc(g.name)} · ${esc(g.relation)} · ${st[g.status] || g.status}</span></div>
          ${['pending', 'active'].includes(g.status) ? `<div class="ops"><a class="mini" href="#/user/${esc(g.uid)}">主页</a><button class="mini r" data-un>${g.status === 'pending' ? '撤回邀请' : '解除担保'}</button></div>`
            : g.status === 'suspended' ? '<div class="ops"><button class="mini f" data-re>恢复担保</button></div>' : ''}</div>`).join('') : '<p>还没有邀请亲友。</p>'}</div>`;
      paint();
      $('#cp').onclick = () => { const t = `邀请你加入排友圈（信息科大教职工排协交流区），打开链接填写申请：${link}`; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('已复制，可以发给亲友')).catch(() => dialog({ title: '邀请链接', textarea: true, value: t, ok: '关闭' })); };
      $('#rs').onclick = async () => { if (await dialog({ title: '换一个邀请码？', text: '旧的邀请链接会失效，已加入的亲友不受影响。' })) load(true); };
      $$('[data-re]').forEach(b => b.onclick = async () => { await api('responsor', { uid: b.closest('.acard').dataset.uid }); toast('已恢复'); load(); });
      $$('[data-un]').forEach(b => b.onclick = async () => {
        const c = b.closest('.acard'), g = r.guests.find(x => x.uid === c.dataset.uid);
        if (!await dialog({ title: g.status === 'pending' ? `撤回对「${g.nick}」的邀请？` : `解除对「${g.nick}」的担保？`, text: g.status === 'pending' ? '' : '解除后 TA 的账号会暂停，不能登录，直到有其他会员担保。', danger: true, ok: '确定' })) return;
        await api('unsponsor', { uid: g.uid }); toast('已处理'); load();
      });
    };
    await load();
  }

  async function pageSetup() {
    frame({ title: '创建超级管理员', back: true });
    await loadConfig();
    view.innerHTML = `<form class="form" id="f"><p class="lead">首次部署时使用，只能创建一次。口令由部署者提供。</p>
      <label class="fld"><span>初始化口令</span><input name="key" required></label>${regForm()}<button class="btn">创建并登录</button></form>`;
    bindEyes(view);
    $('#f').onsubmit = async e => {
      e.preventDefault();
      try { const r = await api('setup', Object.fromEntries(new FormData(e.target))); cfg = null; localStorage.removeItem('pf_cfg'); afterLogin(r); } catch (err) { /* 已提示 */ }
    };
  }

  // ---------------- 首页 ----------------
  async function pageHome(q) {
    frame({ nav: 'home' });
    await loadConfig();
    const board = q.get('b') || '';
    const key = 'b:' + board;
    const chips = `<div class="chips"><span class="chip ${board ? '' : 'on'}" data-b="">全部</span>${cfg.boards.map(b => `<span class="chip ${board === b.id ? 'on' : ''}" data-b="${esc(b.id)}">${esc(b.short)}</span>`).join('')}</div>`;
    const bd = boardOf(board);
    view.innerHTML = chips + (bd ? `<div class="bdesc"><b>${esc(bd.name)}</b>　${esc(bd.desc || '')}</div>` : '')
      + '<a class="rulebar" href="#/rules"><span class="ri">🤝</span><span class="rt">文明交流 · 友善互助 · 就事论事</span><span class="rl">排友圈公约 ›</span></a>'
      + '<div id="list"><div class="loading">加载中…</div></div>';
    $$('.chip', view).forEach(c => c.onclick = () => {
      if (c.dataset.b === board) { delete listCache[key]; route(); return; }
      location.hash = c.dataset.b ? `#/?b=${c.dataset.b}` : '#/';
    });
    const canPost = !bd || !bd.adminOnly || isAdmin();
    if (canPost) document.body.insertAdjacentHTML('beforeend', `<a class="fab" href="#/new${board ? '?b=' + esc(board) : ''}">＋</a>`);
    loadMe().then(m => { if (m && !m.welcomed && !m.mustChange && /^#?\/?(\?.*)?$/.test(location.hash)) location.replace('#/welcome'); }).catch(() => {});
    curKey = key;
    const c = listCache[key];
    if (c && Date.now() - c.at < 90e3) { renderList(c); window.scrollTo(0, c.y || 0); }
    else await fetchList({ key, board, page: 0, list: [], at: Date.now() });
  }
  async function fetchList(c) {
    const r = await api('posts', { board: c.board || undefined, page: c.page });
    c.list = c.list.concat(r.list); c.more = r.more; c.at = Date.now();
    listCache[c.key] = c;
    renderList(c);
  }
  function renderList(c) {
    const el = $('#list'); if (!el) return;
    el.innerHTML = c.list.length ? c.list.map(card).join('') + (c.more ? '<button class="more-btn">加载更多</button>' : '<div class="empty">— 没有更多了 —</div>')
      : `<div class="empty"><b>🏐</b>这里还没有帖子，来发第一帖吧</div>`;
    paint(el);
    const mb = $('.more-btn', el);
    if (mb) mb.onclick = async () => { mb.disabled = true; mb.textContent = '加载中…'; c.page++; await fetchList(c).catch(() => { mb.disabled = false; }); };
  }
  window.addEventListener('scroll', () => { if (curKey && listCache[curKey]) listCache[curKey].y = window.scrollY; }, { passive: true });

  // 指定用户的帖子 / 我的帖子 / 我报名的
  async function pagePostList(title, action, data) {
    frame({ title, back: true });
    view.innerHTML = '<div id="list"><div class="loading">加载中…</div></div>';
    await loadConfig();
    const c = { key: 'x', list: [], page: 0 };
    const load = async () => {
      const r = await api(action, { ...data, page: c.page });
      c.list = c.list.concat(r.list); c.more = r.more;
      const el = $('#list');
      el.innerHTML = c.list.length ? c.list.map(card).join('') + (c.more ? '<button class="more-btn">加载更多</button>' : '') : '<div class="empty"><b>📭</b>暂时没有</div>';
      paint(el);
      const mb = $('.more-btn', el); if (mb) mb.onclick = () => { c.page++; load(); };
    };
    await load();
  }

  // ---------------- 帖子详情 ----------------
  async function pagePost(id, q) {
    frame({ title: '帖子', back: true, right: '<a id="home-link" class="home-link">⋯</a>' });
    view.innerHTML = '<div class="loading">加载中…</div>';
    await loadConfig(); await loadMe().catch(() => {});
    let d;
    try { d = await api('post', { id }); } catch (e) { view.innerHTML = `<div class="empty"><b>😶</b>${esc(e.message)}</div>`; return; }
    const p = d.post;
    const bd = boardOf(p.board);
    $('#ttl').textContent = bd ? bd.name : '帖子';
    let replies = d.list, more = d.more, page = 0;

    function evHtml() {
      if (!p.event) return '';
      const ev = p.event, past = ev.time < Date.now(), full = ev.n >= ev.cap;
      return `<div class="ev"><div class="row1"><b>🏐 ${esc(evTime(ev.time))}</b>　📍${esc(ev.place)}</div>
        <div class="people">已报名 ${ev.n}/${ev.cap} 人${ev.people.length ? '：' + ev.people.map(x => esc(x.nick) + (x.extra ? ` <b>+${x.extra}</b>` : '')).join('、') : ''}</div>
        <div class="jrow">${ev.joined ? `${past ? '' : '<button class="jbtn" data-jedit>修改人数</button><button class="jbtn out" data-jleave>取消报名</button>'}<span class="jme">✅ 已报名${ev.myExtra ? `（带 ${ev.myExtra} 人）` : ''}</span>`
          : past ? '<button class="jbtn" disabled>已结束</button>' : full ? '<button class="jbtn" disabled>人数已满</button>' : '<button class="jbtn" data-join>我要参加</button>'}
          ${ev.people.length ? '<button class="jbtn out" data-copy>📋 复制名单</button>' : ''}</div></div>`;
    }
    function pollHtml() {
      const pl = p.poll; if (!pl) return '';
      const voted = !!pl.mine, show = voted || pl.closed;
      const total = pl.counts.reduce((a, b) => a + b, 0) || 1;
      const canManage = p.mine || isAdmin();
      return `<div class="poll"><div class="ph">📊 ${pl.multi ? '多选' : '单选'}投票${pl.closed ? '（已结束）' : ''}<span>${pl.voters} 人参与</span></div>
        ${pl.options.map((o, i) => show
          ? `<div class="po res ${voted && pl.mine.includes(i) ? 'mine' : ''}"><div class="pbar" data-w="${Math.round(pl.counts[i] / total * 100)}"></div><span class="pt">${voted && pl.mine.includes(i) ? '✔ ' : ''}${esc(o)}</span><span class="pn">${pl.counts[i]} 票</span></div>`
          : `<label class="po"><input type="${pl.multi ? 'checkbox' : 'radio'}" name="pv" value="${i}"> ${esc(o)}</label>`).join('')}
        <div class="pact">${!show ? '<button class="jbtn" data-vote>投票</button>' : !pl.closed ? '<button class="jbtn out" data-revote>改投</button>' : ''}
          ${canManage ? `<button class="jbtn out" data-pclose>${pl.closed ? '重新开放投票' : '结束投票'}</button>` : ''}</div></div>`;
    }
    function postHtml() {
      return `<div class="post">
        <h1>${p.pinned ? '<span class="tag pin">置顶</span>' : ''}${p.featured ? '<span class="tag ft">精</span>' : ''}${p.locked ? '<span class="tag lk">锁</span>' : ''}${btag(p.board)}${esc(p.title)}</h1>
        <div class="meta">${who(p.author)}<span>· ${rel(p.at)}</span></div>
        ${p.deleted ? '<div class="hint warn">该帖已删除（仅管理员可见）</div>' : ''}
        ${p.hidden ? `<div class="hint warn">${p.hiddenForMe ? '该帖被多位会员举报，等待管理员处理' : '该帖被多位会员举报，暂时对其他人隐藏，等待管理员处理'}</div>` : ''}
        ${p.body ? `<div class="body">${rich(p.body, p.mentions)}</div>` : ''}${imgGrid(p.images)}${pollHtml()}${evHtml()}
        ${p.editedAt ? `<div class="edited">编辑于 ${rel(p.editedAt)}</div>` : ''}
        <div class="acts"><button class="act ${p.liked ? 'on' : ''}" data-like>👍 ${p.likes || '赞'}</button><span class="act">💬 ${p.replies}</span></div></div>`;
    }
    function floorHtml(r) {
      const main = r.deleted ? '<div class="gone">该楼已删除</div>'
        : r.hiddenForMe ? '<div class="gone">该楼被多位会员举报，等待管理员处理</div>'
        : `${r.quote ? `<div class="quote">回复 ${r.quote.floor}楼 ${esc(r.quote.nick)}：${esc(r.quote.text)}</div>` : ''}${r.body ? `<div class="body">${rich(r.body, r.mentions)}</div>` : ''}${imgGrid(r.images)}`;
      return `<div class="floor" id="f${r.floor}" data-id="${esc(r.id)}">${ulink(r.author, avatar(r.author, 'm'))}<div class="main">
        <div class="hd">${ulink(r.author, `<span class="nk">${esc(r.author.nick)}</span>`)}${r.author.guest ? '<span class="badge gst">亲友</span>' : ''}${r.author.role ? `<span class="badge">${r.author.role === 'super' ? '超管' : '管理员'}</span>` : ''}${r.author.college ? `<span class="col">${esc(r.author.college)}</span>` : ''}<span>· ${rel(r.at)}${r.editedAt ? ' · 已编辑' : ''}</span><span class="fl">${r.floor}楼</span></div>
        ${main}${r.hidden && !r.hiddenForMe ? '<div class="hint warn">该楼被多人举报，暂时对其他人隐藏</div>' : ''}
        ${r.deleted || r.hiddenForMe ? '' : `<div class="ops"><a data-q>回复</a><a data-l class="${r.liked ? 'on' : ''}">👍 ${r.likes || '赞'}</a><a data-m>⋯</a></div>`}</div></div>`;
    }
    function render() {
      view.innerHTML = postHtml() + (p.hiddenForMe ? '' : `<div class="sec">全部回复 ${p.replies}</div><div id="floors">${replies.map(floorHtml).join('')}</div>
        ${more ? '<button class="more-btn" id="mr">加载更多回复</button>' : replies.length ? '<div class="empty">— 到底了 —</div>' : '<div class="empty">还没有回复，说两句吧</div>'}`);
      paint();
      bind();
    }
    function bind() {
      const lk = $('[data-like]', view);
      if (lk) lk.onclick = async () => { const r = await api('like', { type: 'post', id: p.id }); p.liked = r.liked; p.likes = r.likes; lk.classList.toggle('on', r.liked); lk.textContent = `👍 ${r.likes || '赞'}`; };
      const reloadEv = async () => { invalidate(); const d2 = await api('post', { id }); p.event = d2.post.event; p.poll = d2.post.poll; render(); };
      const askExtra = async (v) => {
        const x = await dialog({ title: v == null ? '报名参加' : '修改人数', text: '默认只算你自己 1 人。如果要带朋友（没有账号也可以），填带几位；不带就留空或填 0。', input: true, type: 'number', value: String(v || ''), placeholder: '带几位朋友（选填）', ok: v == null ? '报名' : '保存' });
        if (x == null) return null;
        const n = parseInt(x, 10) || 0;
        if (n < 0 || n > 10) { toast('最多带 10 位'); return null; }
        return n;
      };
      const jb = $('[data-join]', view);
      if (jb) jb.onclick = async () => { const n = await askExtra(); if (n == null) return; await api('join', { postId: p.id, extra: n }); toast(n ? `报名成功（共 ${n + 1} 人）` : '报名成功'); reloadEv(); };
      const je = $('[data-jedit]', view);
      if (je) je.onclick = async () => { const n = await askExtra(p.event.myExtra || 0); if (n == null) return; await api('join', { postId: p.id, extra: n }); toast('已修改'); reloadEv(); };
      const jl = $('[data-jleave]', view);
      if (jl) jl.onclick = async () => { if (!await dialog({ title: '取消报名？', ok: '取消报名', danger: true })) return; await api('join', { postId: p.id, leave: true }); toast('已取消报名'); reloadEv(); };
      const jc = $('[data-copy]', view);
      if (jc) jc.onclick = () => {
        const ev = p.event;
        const lines = [`【约球】${p.title}`, `时间：${evTime(ev.time)}`, `地点：${ev.place}`, `已报名 ${ev.n} 人（上限 ${ev.cap}）：`,
          ...ev.people.map((x, i) => `${i + 1}. ${x.nick}${x.extra ? ` +${x.extra}` : ''}`)];
        const text = lines.join('\n');
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('名单已复制，可以粘贴到微信群')).catch(() => dialog({ title: '复制名单', textarea: true, value: text, ok: '关闭' }));
      };
      // 投票
      $$('.pbar', view).forEach(b => { b.style.width = b.dataset.w + '%'; });
      const vb = $('[data-vote]', view);
      if (vb) vb.onclick = async () => {
        const ch = $$('input[name=pv]:checked', view).map(x => Number(x.value));
        if (!ch.length) return toast('请先选择');
        const r = await api('vote', { postId: p.id, choices: ch }); p.poll = r.poll; invalidate(); render(); toast('投票成功');
      };
      const rv = $('[data-revote]', view);
      if (rv) rv.onclick = () => { p.poll = { ...p.poll, mine: null, _re: p.poll.mine }; render(); $$('input[name=pv]', view).forEach(x => { x.checked = (p.poll._re || []).includes(Number(x.value)); }); };
      const pc = $('[data-pclose]', view);
      if (pc) pc.onclick = async () => { const r = await api('pollClose', { postId: p.id, reopen: p.poll.closed }); p.poll = { ...r.poll, mine: p.poll.mine || p.poll._re || null }; render(); toast(r.poll.closed ? '投票已结束' : '投票已重新开放'); };
      const mr = $('#mr');
      if (mr) mr.onclick = async () => { mr.disabled = true; page++; const r = await api('replies', { id, page }); replies = replies.concat(r.list); more = r.more; render(); };
      $$('.floor', view).forEach(el => {
        const r = replies.find(x => x.id === el.dataset.id);
        const q = $('[data-q]', el); if (q) q.onclick = () => bar.quote(r);
        const l = $('[data-l]', el); if (l) l.onclick = async () => { const x = await api('like', { type: 'reply', id: r.id }); r.liked = x.liked; r.likes = x.likes; l.classList.toggle('on', x.liked); l.textContent = `👍 ${x.likes || '赞'}`; };
        const m = $('[data-m]', el); if (m) m.onclick = () => floorMenu(r);
      });
    }
    function floorMenu(r) {
      const mine = r.author.uid === me.uid, items = [];
      if (mine) items.push({ label: '编辑', fn: async () => { const v = await dialog({ title: `编辑 ${r.floor}楼`, textarea: true, value: r.body, ok: '保存' }); if (v == null) return; await api('editReply', { id: r.id, body: v }); r.body = v.trim(); r.editedAt = Date.now(); render(); toast('已保存'); } });
      if (mine || isAdmin()) items.push({ label: mine ? '删除' : '删除（管理员）', danger: true, fn: async () => { if (!await dialog({ title: `删除 ${r.floor}楼？`, ok: '删除', danger: true })) return; await api('delReply', { id: r.id }); replies = replies.filter(x => x.id !== r.id); p.replies = Math.max(0, p.replies - 1); invalidate(); render(); toast('已删除'); } });
      if (!mine) items.push({ label: '举报', fn: () => report('reply', r.id) });
      sheet(`${r.floor}楼 ${r.author.nick}`, items);
    }
    async function report(type, tid) {
      const v = await dialog({ title: '举报', text: '请简单说明原因（如广告、人身攻击、与协会无关的不当内容）。同一内容被 3 人举报会先自动隐藏。', input: true, placeholder: '原因', ok: '提交举报' });
      if (v == null) return;
      const r = await api('report', { type, id: tid, reason: v });
      toast(r.hidden ? '已举报，该内容已暂时隐藏' : '已举报，管理员会尽快处理');
    }
    $('#home-link').onclick = () => {
      const items = [], mine = p.mine;
      items.push({ label: '复制链接', fn: () => { const u = location.href; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('链接已复制，可发到微信群（仅会员登录后可看）')).catch(() => dialog({ title: '复制链接', input: true, value: u })); } });
      if (mine || isAdmin()) items.push({ label: '编辑', fn: () => { location.hash = `#/edit/${p.id}`; } });
      if (isAdmin()) {
        items.push({ label: p.pinned ? '取消置顶' : '置顶', fn: () => flag({ pinned: !p.pinned }) });
        items.push({ label: p.featured ? '取消加精' : '加精', fn: () => flag({ featured: !p.featured }) });
        items.push({ label: p.locked ? '解锁（允许回复）' : '锁帖（禁止回复）', fn: () => flag({ locked: !p.locked }) });
      }
      if (mine || isAdmin()) items.push({ label: mine ? '删除帖子' : '删除帖子（管理员）', danger: true, fn: async () => {
        const v = await dialog({ title: '删除这个帖子？', text: mine ? '' : '可填写原因，会通知作者（选填）', input: !mine, ok: '删除', danger: true });
        if (v == null) return;
        await api('delPost', { id: p.id, reason: typeof v === 'string' ? v : '' }); invalidate(); toast('已删除'); history.back();
      } });
      if (!mine) items.push({ label: '举报', fn: () => report('post', p.id) });
      sheet('', items);
    };
    async function flag(f) { await api('admin.flag', { id: p.id, ...f }); Object.assign(p, f); invalidate(); render(); toast('已设置'); }

    // 回复栏
    const bar = replyBar(p, async (floor) => {
      p.replies++;
      invalidate();
      if (more) { render(); toast(`已发送（${floor}楼）`); return; }
      const lp = Math.floor((p.replies - 1) / 30);
      const r = await api('replies', { id, page: lp });
      const ids = new Set(r.list.map(x => x.id));
      replies = replies.filter(x => !ids.has(x.id)).concat(r.list).sort((a, b) => a.floor - b.floor);
      more = r.more; page = Math.max(page, lp);
      render();
      const el = $(`#f${floor}`);
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); }
    });
    render();
    const f = q.get('f');
    if (f) {
      let el = $(`#f${f}`);
      while (!el && more) { page++; const r = await api('replies', { id, page }); replies = replies.concat(r.list); more = r.more; render(); el = $(`#f${f}`); }
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); }
    }
  }

  function replyBar(p, onSent) {
    if (p.hiddenForMe || p.deleted) return { quote() {} };
    if (p.locked && !isAdmin()) {
      document.body.insertAdjacentHTML('beforeend', '<div class="rbar"><div class="in locked">🔒 帖子已锁定，不能回复</div></div>');
      document.body.classList.add('hasbar');
      return { quote() { toast('帖子已锁定'); } };
    }
    document.body.insertAdjacentHTML('beforeend', `<div class="rbar"><div class="in"><div class="qt" hidden><span></span><a>✕</a></div>
      <div class="line"><textarea rows="1" maxlength="3000" placeholder="说点什么…"></textarea><button class="ib" data-at title="提到会员">＠</button><button class="ib" data-img title="图片">📷</button><button class="sb" disabled>发送</button></div><div class="pv"></div></div></div>`);
    document.body.classList.add('hasbar');
    const rb = $('.rbar'), ta = $('textarea', rb), sb = $('.sb', rb), qt = $('.qt', rb);
    let quote = null;
    const draftKey = 'pf_rd_' + p.id;
    ta.value = localStorage.getItem(draftKey) || '';
    let pk = null;
    pk = picker($('.pv', rb), 3, () => pk && upd());
    function upd() {
      sb.disabled = pk.busy() || (!ta.value.trim() && !pk.ids().length);
      ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight + 2) + 'px';
      const addEl = $('.pv .add', rb); if (addEl) addEl.hidden = !pk.count();
    }
    ta.oninput = () => { localStorage.setItem(draftKey, ta.value); upd(); };
    $('[data-img]', rb).onclick = () => pk.open();
    $('[data-at]', rb).onclick = () => pickMember(n => { insertAt(ta, '@' + n + ' '); localStorage.setItem(draftKey, ta.value); upd(); });
    $('a', qt).onclick = () => { quote = null; qt.hidden = true; };
    sb.onclick = async () => {
      sb.disabled = true;
      try {
        const r = await api('reply', { postId: p.id, body: ta.value, images: pk.ids(), quoteId: quote ? quote.id : undefined });
        ta.value = ''; localStorage.removeItem(draftKey); pk.set([]); quote = null; qt.hidden = true; ta.blur();
        await onSent(r.floor);
        if (r.mentionOver) toast(`@ 的人太多，有 ${r.mentionOver} 人没有收到提醒`, 3500);
      } catch (e) { /* 已提示 */ } finally { upd(); }
    };
    upd();
    return { quote(r) { quote = r; qt.hidden = false; $('span', qt).textContent = `回复 ${r.floor}楼 ${r.author.nick}：${r.body || '[图片]'}`; ta.focus(); } };
  }
  function invalidate() { for (const k in listCache) delete listCache[k]; }

  // ---------------- 发帖 / 编辑 ----------------
  async function pageCompose(q, editId) {
    frame({ title: editId ? '编辑帖子' : '发帖', back: true, right: '<button id="home-link" class="tbtn">发布</button>' });
    await loadConfig(); await loadMe();
    let post = null;
    if (editId) { try { post = (await api('post', { id: editId })).post; } catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; } }
    const boards = cfg.boards.filter(b => !b.adminOnly || isAdmin() || (post && post.board === b.id));
    const draftKey = 'pf_draft';
    const draft = !editId ? JSON.parse(localStorage.getItem(draftKey) || '{}') : {};
    const cur = post ? post.board : q.get('b') && boards.some(b => b.id === q.get('b')) ? q.get('b') : draft.board || (boards.find(b => !b.adminOnly) || boards[0]).id;
    const ev = post && post.event ? post.event : draft.event || {};
    view.innerHTML = `<div class="form">
      <label class="fld"><span>板块</span><select id="board" ${post ? 'disabled' : ''}>${boards.map(b => `<option value="${esc(b.id)}" ${b.id === cur ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      <label class="fld"><span>标题</span><input id="title" maxlength="60" value="${esc(post ? post.title : draft.title || '')}" placeholder="一句话说清楚"></label>
      <div class="evf" id="evf"><div class="t">约球信息</div>
        <label class="fld"><span>时间</span><input id="evt" type="datetime-local" value="${ev.time ? toLocalInput(ev.time) : ''}"></label>
        <div class="two"><label class="fld"><span>地点</span><input id="evp" maxlength="40" value="${esc(ev.place || '')}" placeholder="如：沙河体育馆"></label>
        <label class="fld"><span>人数上限</span><input id="evc" type="number" min="2" max="60" value="${esc(ev.cap || 12)}"></label></div>
        ${post ? '' : `<div class="two"><label class="fld chk"><input type="checkbox" id="evme" checked> 我也参加（算 1 人）</label>
        <label class="fld"><span>我带几位朋友（选填）</span><input id="evx" type="number" min="0" max="10" placeholder="0"></label></div>`}</div>
      <label class="fld"><span>正文</span><textarea id="body" maxlength="5000" placeholder="想说的话…（输入 @昵称 可以提醒某位会员）">${esc(post ? post.body : draft.body || '')}</textarea></label>
      <div class="avops"><button class="mini" id="atb">＠ 提到会员</button></div>
      ${post ? '' : `<div class="pollf"><label class="chk"><input type="checkbox" id="pon"> 📊 添加投票</label>
        <div id="pbox" hidden><div id="popts"></div><div class="avops"><button class="mini" id="padd">＋ 加一个选项</button><label class="chk"><input type="checkbox" id="pmulti"> 可以多选</label></div></div></div>`}
      <div class="fld"><span>图片（最多 6 张，上传前自动压缩）</span></div><div class="pics" id="pics"></div>
    </div>`;
    const sel = $('#board'), evf = $('#evf');
    const sync = () => { const b = boardOf(sel.value); evf.hidden = !(b && b.event); };
    sel.onchange = () => { sync(); save(); }; sync();
    const pk = picker($('#pics'), 6);
    if (post) pk.set(post.images);
    $('#atb').onclick = () => pickMember(n => insertAt($('#body'), '@' + n + ' '));
    if ($('#pon')) {
      const addOpt = v => { if ($$('#popts input').length >= 8) return toast('最多 8 个选项'); $('#popts').insertAdjacentHTML('beforeend', `<input class="popt" maxlength="30" placeholder="选项 ${$$('#popts input').length + 1}" value="${esc(v || '')}">`); };
      addOpt(); addOpt();
      $('#pon').onchange = () => { $('#pbox').hidden = !$('#pon').checked; };
      $('#padd').onclick = () => addOpt();
    }
    const save = () => { if (!editId) localStorage.setItem(draftKey, JSON.stringify({ board: sel.value, title: $('#title').value, body: $('#body').value, event: { place: $('#evp').value, cap: $('#evc').value } })); };
    view.addEventListener('input', save);
    $('#home-link').onclick = async () => {
      if (pk.busy()) return toast('图片还在上传，请稍等');
      const b = boardOf(sel.value);
      const data = { board: sel.value, title: $('#title').value, body: $('#body').value, images: pk.ids() };
      if ($('#pon') && $('#pon').checked) {
        const opts = $$('#popts input').map(x => x.value.trim()).filter(Boolean);
        if (opts.length < 2) return toast('投票至少要填 2 个选项');
        data.poll = { options: opts, multi: $('#pmulti').checked };
      }
      if (b && b.event) {
        if (!$('#evt').value) return toast('请填写约球时间');
        data.event = { time: new Date($('#evt').value).toISOString(), place: $('#evp').value, cap: $('#evc').value };
        if ($('#evme')) { data.event.selfJoin = $('#evme').checked; data.event.extra = $('#evx').value; }
      }
      const btn = $('#home-link'); btn.disabled = true;
      try {
        if (editId) { await api('editPost', { id: editId, ...data }); toast('已保存'); invalidate(); history.back(); }
        else { const r = await api('newPost', data); localStorage.removeItem(draftKey); invalidate(); location.replace(`#/p/${r.id}`); if (r.mentionOver) setTimeout(() => toast(`@ 的人太多，有 ${r.mentionOver} 人没有收到提醒`, 3500), 600); }
      } catch (e) { btn.disabled = false; }
    };
  }

  // ---------------- 消息 ----------------
  function msgTabs(t) {
    return `<div class="atabs"><a href="#/msg" class="${t === 'n' ? 'on' : ''}">通知${me && me.unread ? `<b>${me.unread}</b>` : ''}</a><a href="#/msg?t=dm" class="${t === 'dm' ? 'on' : ''}">私信${me && me.dmUnread ? `<b>${me.dmUnread}</b>` : ''}</a></div>`;
  }
  async function pageMsg(q) {
    frame({ nav: 'msg', title: '消息' });
    await loadMe().catch(() => {});
    if (q && q.get('t') === 'dm') return pageDmList();
    view.innerHTML = msgTabs('n') + '<div id="ml"><div class="loading">加载中…</div></div>';
    const host = $('#ml');
    let page = 0, list = [];
    const load = async () => {
      const r = await api('notices', { page });
      list = list.concat(r.list);
      if (page === 0 && me) { me.unread = 0; updateDots(); const tb = $('.atabs a b', view); if (tb && !tb.closest('[href*=dm]')) tb.remove(); }
      const txt = n => {
        const t = esc(n.title || '');
        switch (n.type) {
          case 'reply': return `回复了你的帖子《${t}》<div class="q">${esc(n.text)}</div>`;
          case 'quote': return `在《${t}》中回复了你<div class="q">${esc(n.text)}</div>`;
          case 'like': return `赞了你的${n.replyId ? '回复' : '帖子'}<div class="q">${esc(n.text)}</div>`;
          case 'join': return `报名了你的约球《${esc(n.text)}》`;
          case 'mention': return `在《${t}》中${n.all ? '@了所有人' : '提到了你'}<div class="q">${esc(n.text)}</div>`;
          default: return esc(n.text);
        }
      };
      host.innerHTML = list.length ? list.map(n => `<a class="msg ${n.read ? '' : 'unread'}" ${n.postId ? `href="#/p/${esc(n.postId)}${n.floor ? '?f=' + n.floor : ''}"` : ''}>
          ${n.type === 'system' || !n.from ? '<span class="av m sysav">📢</span>' : avatar(n.from, 'm')}
          <div class="c">${n.type === 'system' ? '<b>系统通知</b>　' : `<b>${esc(n.from.nick)}</b> `}${txt(n)}</div><span class="tm">${rel(n.at)}</span></a>`).join('')
          + (r.more ? '<button class="more-btn">更多</button>' : '')
        : '<div class="empty"><b>🔔</b>暂时没有通知</div>';
      paint();
      const mb = $('.more-btn', host); if (mb) mb.onclick = () => { page++; load(); };
    };
    await load();
  }

  async function pageDmList() {
    view.innerHTML = msgTabs('dm') + '<div id="ml"><div class="loading">加载中…</div></div>';
    const { list } = await api('dmList');
    if (me) { me.dmUnread = list.reduce((s, c) => s + c.unread, 0); updateDots(); }
    $('#ml').innerHTML = list.length ? list.map(c => `<a class="msg ${c.unread ? 'unread' : ''}" href="#/dm/${esc(c.peer.uid)}">${avatar(c.peer, 'm')}
        <div class="c"><b>${esc(c.peer.nick)}</b>${c.unread ? ` <span class="cnt">${c.unread}</span>` : ''}<div class="q">${c.lastMine ? '我：' : ''}${esc(c.lastText)}</div></div><span class="tm">${rel(c.lastAt)}</span></a>`).join('')
      : '<div class="empty"><b>✉️</b>还没有私信<br><br>在 <a href="#/members">会员</a> 里点开某位会员，就可以给 TA 发私信</div>';
    paint();
  }

  // ---------------- 会员名录 / 会员主页 / 私信对话 ----------------
  async function pageMembers() {
    frame({ nav: 'members', title: '会员' });
    view.innerHTML = '<div class="loading">加载中…</div>';
    const { list } = await api('members');
    const render = (qv = '') => {
      const k = qv.trim();
      const rows = k ? list.filter(u => u.nick.includes(k) || (u.college || '').includes(k)) : list;
      const cardOf = u => `<a class="mem" href="#/user/${esc(u.uid)}">${avatar(u, 'm')}<div class="mi"><b>${esc(u.nick)}</b>${u.role ? `<span class="badge">${u.role === 'super' ? '超管' : '管理员'}</span>` : ''}${u.guest ? '<span class="badge gst">亲友</span>' : ''}<small>${esc(u.college || ' ')}</small></div></a>`;
      const ms = rows.filter(u => !u.guest), gs = rows.filter(u => u.guest);
      $('#mlist').innerHTML = rows.length ? `<div class="sec">会员 ${ms.length} 人</div><div class="mems">${ms.map(cardOf).join('')}</div>${gs.length ? `<div class="sec">亲友 ${gs.length} 人</div><div class="mems">${gs.map(cardOf).join('')}</div>` : ''}` : '<div class="empty">没有找到</div>';
      paint($('#mlist'));
    };
    view.innerHTML = `<div class="search"><input id="mq" placeholder="搜昵称 / 学院"></div><div id="mlist"></div>`;
    $('#mq').oninput = e => render(e.target.value);
    render();
  }

  async function pageUser(uid) {
    frame({ title: '会员主页', back: true });
    view.innerHTML = '<div class="loading">加载中…</div>';
    await loadMe().catch(() => {});
    const { user: u } = await api('user', { uid });
    view.innerHTML = `<div class="prof">${avatar(u, 'l')}<div><div class="n">${esc(u.nick)}${u.role ? ` <span class="badge">${u.role === 'super' ? '超管' : '管理员'}</span>` : ''}</div>
        ${u.guest ? `<div class="s"><span class="badge gst">亲友</span> 由 ${u.sponsor ? `<span class="ulink at" data-u="${esc(u.sponsor.uid)}">${esc(u.sponsor.nick)}</span>` : '会员'} 邀请${u.relation ? '（' + esc(u.relation) + '）' : ''}</div>` : ''}
        <div class="s">${u.college ? esc(u.college) + ' · ' : ''}${u.at ? `${new Date(u.at).getFullYear()}年${new Date(u.at).getMonth() + 1}月加入` : ''}</div>
        <div class="s">发帖 ${u.posts || 0} · 回复 ${u.replies || 0}</div></div></div>
      ${u.me ? '' : !u.active ? '<div class="hint">该账号已注销或停用</div>' : u.allowDm || isAdmin() ? `<div class="form"><a class="btn" href="#/dm/${esc(u.uid)}">✉️ 发私信</a></div>` : '<div class="hint">对方设置了不接收私信</div>'}
      <div class="sec">TA 的帖子</div><div id="list"><div class="loading">加载中…</div></div>`;
    paint();
    if (u.gone) { $('#list').innerHTML = ''; return; }
    const r = await api('posts', { uid });
    $('#list').innerHTML = r.list.length ? r.list.map(card).join('') : '<div class="empty">还没有发过帖子</div>';
    paint($('#list'));
  }

  async function pageDm(uid) {
    frame({ title: '私信', back: true });
    view.innerHTML = '<div class="loading">加载中…</div>';
    await loadMe().catch(() => {});
    let d = await api('dmThread', { uid });
    const peer = d.peer;
    $('#ttl').textContent = peer.nick;
    let msgs = d.list, more = d.more;
    const canSend = peer.active && (peer.allowDm || isAdmin()) && uid !== me.uid;
    const bubble = m => `<div class="bub ${m.mine ? 'me' : ''}" data-id="${esc(m.id)}">${m.mine ? '' : avatar(peer, 'm')}<div class="bb">${m.deleted ? '<i>该消息已被管理员删除</i>' : (m.body ? linkify(m.body) : '') + (m.images && m.images.length ? imgGrid(m.images) : '')}</div></div>`;
    function render(keepBottom = true) {
      let lastT = 0;
      view.innerHTML = `<div class="chat"><div class="tip-top">私信只有你们两人能看到。遇到骚扰，点一下对方的消息就能举报。</div>
        ${more ? '<button class="more-btn" id="older">查看更早的消息</button>' : ''}
        ${msgs.map(m => { const t = m.at - lastT > 5 * 60e3 ? `<div class="ctime">${esc(rel(m.at))}</div>` : ''; lastT = m.at; return t + bubble(m); }).join('') || '<div class="empty">打个招呼吧 👋</div>'}</div>`;
      paint();
      if (keepBottom) window.scrollTo(0, document.body.scrollHeight);
      const ob = $('#older');
      if (ob) ob.onclick = async () => { const r = await api('dmThread', { uid, before: msgs[0].at }); msgs = r.list.concat(msgs); more = r.more; render(false); window.scrollTo(0, 0); };
      $$('.bub:not(.me) .bb', view).forEach(el => el.onclick = (ev) => {
        if (ev.target.closest('img, a')) return;
        const id = el.parentElement.dataset.id;
        sheet('', [{ label: '举报这条私信', danger: true, fn: async () => {
          const v = await dialog({ title: '举报私信', text: '管理员只会看到这一条被举报的消息。', input: true, placeholder: '原因（如骚扰、广告）', ok: '提交举报' });
          if (v == null) return; await api('report', { type: 'dm', id, reason: v }); toast('已举报，管理员会尽快处理');
        } }]);
      });
    }
    render();
    if (me) { me.dmUnread = Math.max(0, (me.dmUnread || 0)); meAt = 0; }
    if (canSend) {
      document.body.insertAdjacentHTML('beforeend', `<div class="rbar"><div class="in"><div class="line"><textarea rows="1" maxlength="1000" placeholder="发私信…"></textarea><button class="ib" data-img title="图片">📷</button><button class="sb" disabled>发送</button></div><div class="pv"></div></div></div>`);
      document.body.classList.add('hasbar');
      const rb = $('.rbar'), ta = $('textarea', rb), sb = $('.sb', rb);
      let pk = null;
      const upd = () => { if (!pk) return; sb.disabled = pk.busy() || (!ta.value.trim() && !pk.ids().length); ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight + 2) + 'px'; const ad = $('.pv .add', rb); if (ad) ad.hidden = !pk.count(); };
      pk = picker($('.pv', rb), 3, upd);
      upd();
      ta.oninput = upd;
      $('[data-img]', rb).onclick = () => pk.open();
      sb.onclick = async () => {
        sb.disabled = true;
        try { const r = await api('dmSend', { to: uid, body: ta.value, images: pk.ids() }); msgs.push(r.msg); ta.value = ''; pk.set([]); render(); } catch (e) { /* 已提示 */ } finally { upd(); }
      };
    } else {
      document.body.insertAdjacentHTML('beforeend', `<div class="rbar"><div class="in locked">${uid === me.uid ? '不能给自己发私信' : !peer.active ? '该账号已注销或停用' : '对方设置了不接收私信'}</div></div>`);
      document.body.classList.add('hasbar');
    }
    // 打开对话时每 10 秒查一次新消息（页面在后台时不查，10 分钟后停止）
    const started = Date.now();
    pollTimer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - started > 600e3) { clearInterval(pollTimer); return; }
      const after = msgs.length ? msgs[msgs.length - 1].at : 0;
      try {
        const r = await api('dmThread', { uid, after: after || 1 }, { silent: true });
        const fresh = r.list.filter(m => !msgs.some(x => x.id === m.id));
        if (fresh.length) { const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80; msgs = msgs.concat(fresh); render(atBottom); }
      } catch (e) { /* 忽略 */ }
    }, 10000);
  }

  // ---------------- 我的 ----------------
  async function pageMe() {
    frame({ nav: 'me', title: '我的' });
    await loadMe(true);
    const a = isAdmin();
    const gst = me.kind === 'guest';
    view.innerHTML = `<div class="prof">${avatar(me, 'l')}<div><div class="n">${esc(me.nick)}${gst ? ' <span class="badge gst">亲友</span>' : ''}</div><div class="s">${gst ? `${esc(me.name)} · 登录名 ${esc(me.workNo)}` : `${esc(me.college)}${me.showCollege ? '' : '（不对外显示）'} · ${esc(me.name)} · 工号 ${esc(me.workNo)}`}</div>
      <div class="s">${me.role === 'super' ? '超级管理员 · ' : me.role === 'admin' ? '管理员 · ' : ''}${new Date(me.at).getFullYear()}年${new Date(me.at).getMonth() + 1}月加入</div></div></div>
      ${me.muteUntil > Date.now() ? `<div class="hint warn">你已被禁言，${esc(new Date(me.muteUntil).toLocaleString())} 后恢复</div>` : ''}
      ${a ? `<div class="list"><a class="li" href="#/admin/pending">🛠️ 管理后台<span class="r">${me.pending ? `<span class="cnt">审核 ${me.pending}</span> ` : ''}${me.reports ? `<span class="cnt">举报 ${me.reports}</span>` : ''}${backupDue() ? ' <span class="cnt">该备份了</span>' : ''} ›</span></a></div>` : ''}
      <div class="list">
        <a class="li" href="#/msg">🔔 消息<span class="r">${me.unread ? `<span class="cnt">${me.unread}</span>` : ''} ›</span></a>
        <a class="li" href="#/msg?t=dm">✉️ 私信<span class="r">${me.dmUnread ? `<span class="cnt">${me.dmUnread}</span>` : ''} ›</span></a>
        <a class="li" href="#/user/${esc(me.uid)}">🪪 我的主页<span class="r">›</span></a>
        <a class="li" href="#/me/posts">📝 我的帖子<span class="r">›</span></a>
        <a class="li" href="#/me/joins">🏐 我报名的约球<span class="r">›</span></a>
        ${gst ? '' : '<a class="li" href="#/me/guests">👨‍👩‍👧 邀请亲友<span class="r">›</span></a>'}</div>
      <div class="list">
        <a class="li" href="#/me/profile">✏️ 修改昵称 / 头像<span class="r">›</span></a>
        ${gst ? '<div id="sc" hidden></div>' : `<div class="li" id="sc">🏫 在昵称旁显示学院<span class="sw ${me.showCollege ? 'on' : ''}"></span></div>`}
        <div class="li" id="sd">✉️ 接收私信<span class="sw ${me.allowDm ? 'on' : ''}"></span></div>
        <a class="li" href="#/me/pw">🔑 修改密码<span class="r">›</span></a></div>
      <div class="list">
        <a class="li" href="#/me/notify">🔔 新消息通知<span class="r">›</span></a>
        <a class="li" href="#/a2hs">📱 添加到手机桌面<span class="r">›</span></a>
        <a class="li" href="#/rules">📜 排友圈公约<span class="r">›</span></a>
        <a class="li" href="#/welcome">👋 再看一遍欢迎页<span class="r">›</span></a>
        <a class="li" href="#/privacy">📄 个人信息说明<span class="r">›</span></a>
        <a class="li" href="../">🏠 返回协会官网<span class="r">›</span></a></div>
      <div class="list">
        <a class="li danger" id="lo">退出登录</a>
        <a class="li danger" href="#/me/del">注销账号</a></div>
      <p class="alt">排友圈 · 信息科大教职工排协会员交流区</p>`;
    paint();
    $('#sd').onclick = async () => { const r = await api('profile', { allowDm: !me.allowDm }); me = { ...me, ...r.me }; toast(me.allowDm ? '已开启接收私信' : '已关闭，其他会员不能再给你发私信'); pageMe(); };
    $('#sc').onclick = async () => { const r = await api('profile', { showCollege: !me.showCollege }); me = { ...me, ...r.me }; invalidate(); pageMe(); };
    $('#lo').onclick = async () => { if (await dialog({ title: '退出登录？', ok: '退出' })) logout(); };
  }

  async function pageProfile() {
    frame({ title: '昵称与头像', back: true });
    await loadMe();
    let color = me.color;
    view.innerHTML = `<div class="form"><div class="prof" id="pv"><span id="pva">${avatar(me, 'l')}</span><div class="n">${esc(me.nick)}</div></div><br>
      <div class="fld"><span>头像图片</span></div>
      <div class="avops"><button class="mini f" id="avup">📷 上传头像</button>${me.av ? '<button class="mini" id="avrm">改用颜色头像</button>' : ''}</div>
      <small class="avtip">选好图片后可以拖动、缩放选取头像范围，会自动压缩到很小。请使用合适的图片，不符合公约的头像管理员会清除。</small>
      <label class="fld"><span>昵称</span><input id="nick" maxlength="12" value="${esc(me.nick)}"><small>每月最多改 3 次</small></label>
      <div class="fld"><span>头像颜色${me.av ? '（没有上传头像图片时使用）' : ''}</span></div><div class="colors">${cfg.colors.map(c => `<span data-c="${esc(c)}" class="${c === color ? 'on' : ''}"></span>`).join('')}</div>
      <button class="btn" id="sv">保存</button></div>`;
    paint();
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.hidden = true; view.appendChild(fi);
    $('#avup').onclick = () => fi.click();
    fi.onchange = async () => {
      const f = fi.files[0]; fi.value = '';
      if (!f) return;
      const btn = $('#avup'); btn.disabled = true; btn.textContent = '处理中…';
      try {
        const cc = await cropAvatar(f);
        if (!cc) { btn.disabled = false; btn.textContent = '📷 上传头像'; return; }
        const data = await encodeAvatar(cc);
        const r = await api('avatar', { data });
        me = { ...me, ...r.me }; meAt = 0; invalidate(); toast('头像已更新');
        pageProfile();
      } catch (e) { if (!e.data) toast(e.message || '上传失败'); btn.disabled = false; btn.textContent = '📷 上传头像'; }
    };
    const rm = $('#avrm');
    if (rm) rm.onclick = async () => { const r = await api('avatar', { remove: true }); me = { ...me, ...r.me }; meAt = 0; invalidate(); toast('已改用颜色头像'); pageProfile(); };
    const pvAv = () => $('#pv .av');
    $$('.colors span').forEach(s => s.onclick = () => { color = s.dataset.c; $$('.colors span').forEach(x => x.classList.toggle('on', x === s)); if (pvAv().tagName === 'SPAN') pvAv().style.background = color; });
    $('#nick').oninput = e => { $('#pv .n').textContent = e.target.value; if (pvAv().tagName === 'SPAN') pvAv().textContent = e.target.value.slice(0, 1) || '?'; };
    $('#sv').onclick = async () => {
      const r = await api('profile', { nick: $('#nick').value.trim(), color });
      me = { ...me, ...r.me }; invalidate(); toast('已保存'); history.back();
    };
  }

  async function pagePassword() {
    frame({ title: '修改密码', back: !(me && me.mustChange) });
    await loadMe().catch(() => {});
    const must = me && me.mustChange;
    view.innerHTML = `<form class="form" id="f">${must ? '<div class="hint warn">管理员已为你重置密码，请先设置新密码。</div><br>' : ''}
      <label class="fld"><span>${must ? '管理员给你的临时密码' : '原密码'}</span>${pwField('old', '')}</label>
      <label class="fld"><span>新密码</span>${pwField('password', '至少 6 位')}</label>
      <button class="btn">保存新密码</button></form>`;
    bindEyes(view);
    $('#f').onsubmit = async e => {
      e.preventDefault();
      const r = await api('password', Object.fromEntries(new FormData(e.target)));
      token = r.token; localStorage.setItem('pf_token', token); me = r.me; meAt = 0;
      toast('密码已修改'); location.hash = me.welcomed ? '#/me' : '#/welcome';
    };
  }

  async function pageDeregister() {
    frame({ title: '注销账号', back: true });
    view.innerHTML = `<form class="form" id="f"><div class="hint warn">注销后将删除你的姓名、工号、学院和密码，账号无法恢复。已发的帖子和回复会保留，作者显示为"已注销用户"；如需删除内容，请先自行删除。</div><br>
      <label class="fld"><span>输入密码确认</span>${pwField('password', '')}</label><button class="btn d">确认注销</button></form>`;
    bindEyes(view);
    $('#f').onsubmit = async e => {
      e.preventDefault();
      if (!await dialog({ title: '确定注销账号？', text: '此操作不能撤销。', ok: '注销', danger: true })) return;
      await api('deregister', Object.fromEntries(new FormData(e.target)));
      toast('账号已注销'); logout();
    };
  }

  function pageDoc(kind) {
    frame({ title: kind === 'a2hs' ? '添加到手机桌面' : '个人信息说明', back: true });
    view.innerHTML = kind === 'a2hs' ? `<div class="doc">
      <p>把排友圈放到手机桌面，以后一点就开，和 App 一样全屏显示。</p>
      <h3>在微信里打开的</h3><p>先点右上角 <b>⋯</b> →「在浏览器打开」，再按下面的方法操作。也可以点 <b>⋯</b> →「浮窗」，在微信里随时打开。</p>
      <h3>iPhone（Safari）</h3><ol><li>点底部的分享按钮（方框加向上箭头）</li><li>选「添加到主屏幕」→「添加」</li></ol>
      <h3>安卓手机（自带浏览器 / Chrome / Edge）</h3><ol><li>点浏览器菜单（⋮ 或 ≡）</li><li>选「添加到主屏幕」或「添加到桌面」「安装应用」</li></ol>
      <p>添加后桌面上会出现排协图标「排友圈」。登录一次 90 天内不用再登录。</p>
      <p>iPhone 添加后，从桌面图标打开排友圈，到"我的 → 新消息通知"开启，就能收到回复、@、私信提醒。</p></div>`
      : `<div class="doc">${PRIVACY}</div>`;
  }

  // ---------------- 公约 / 欢迎页 ----------------
  function rulesHtml(text) {
    const lines = String(text || '').split('\n').map(x => x.trim()).filter(Boolean);
    return `<ol class="rules">${lines.map(l => {
      const t = l.replace(/^\d+[.、．)]\s*/, '');
      const k = t.indexOf('。');
      return `<li>${k > 0 && k < t.length - 1 ? `<b>${esc(t.slice(0, k + 1))}</b>${esc(t.slice(k + 1))}` : esc(t)}</li>`;
    }).join('')}</ol>`;
  }
  async function pageRules() {
    frame({ title: '排友圈公约', back: true });
    await loadConfig();
    view.innerHTML = `<div class="doc"><div class="rules-hd"><img src="img/logo.png" alt=""><div><h2>排友圈公约</h2><p>以球会友，文明交流</p></div></div>${rulesHtml(cfg.rules)}
      <p class="rules-ft">排友圈是信息科大教职工排协会员的交流区。愿每一次约球都有人应，每一个问题都有人答。🏐</p></div>`;
  }
  const BOARD_ICON = { notice: '📢', yueqiu: '🏐', tech: '🎯', match: '🏆', chat: '☕' };
  async function pageWelcome() {
    frame({});
    $('#top').hidden = true;
    await loadConfig(); await loadMe(true);
    const first = !me.welcomed;
    view.innerHTML = `<div class="wel">
      <div class="wel-hero"><div class="wel-ball"></div><img class="wel-logo" src="img/logo.png" alt="">
        <h1>欢迎来到排友圈</h1><p class="wel-hi">${esc(me.nick)}，很高兴见到你！</p><p class="wel-sub">信息科大教职工排协会员交流区</p></div>
      <div class="wel-sec"><h2>在这里，你可以</h2><div class="wel-boards">${cfg.boards.map(b => `<div class="wb"><span class="wi">${BOARD_ICON[b.id] || '💬'}</span><b>${esc(b.name)}</b><small>${esc(b.desc || '')}</small></div>`).join('')}</div></div>
      <div class="wel-sec"><h2>排友圈公约</h2>${rulesHtml(cfg.rules)}</div>
      <div class="wel-sec wel-go">
        ${first ? '<label class="agree"><input type="checkbox" id="ag"> 我已阅读，愿意遵守排友圈公约</label>' : ''}
        <button class="btn o" id="go" ${first ? 'disabled' : ''}>进入排友圈 →</button>
        <p class="wel-tip">小提示：可以把排友圈 <a href="#/a2hs">添加到手机桌面</a>，以后一点就开。</p></div></div>`;
    const ag = $('#ag'), go = $('#go');
    if (ag) ag.onchange = () => { go.disabled = !ag.checked; };
    go.onclick = async () => {
      go.disabled = true;
      try { if (first) { await api('welcome'); me.welcomed = true; } location.replace('#/'); } catch (e) { go.disabled = false; }
    };
  }

  // ---------------- 管理后台 ----------------
  async function pageAdmin(tab) {
    frame({ title: '管理后台', back: true });
    await loadMe(true);
    if (!isAdmin()) { view.innerHTML = '<div class="empty">需要管理员权限</div>'; return; }
    const tabs = [['pending', '注册审核', me.pending], ['reports', '举报', me.reports], ['users', '用户'], ['trash', '回收站'], ['settings', '设置'], ['logs', '操作记录']];
    if (me.role === 'super') tabs.push(['backup', '备份', backupDue() ? '!' : 0]);
    view.innerHTML = `<div class="atabs">${tabs.map(([k, n, c]) => `<a href="#/admin/${k}" class="${k === tab ? 'on' : ''}">${n}${c ? `<b>${c}</b>` : ''}</a>`).join('')}</div><div id="ab"><div class="loading">加载中…</div></div>`;
    const ab = $('#ab');
    const fn = { pending: adminPending, reports: adminReports, users: adminUsers, trash: adminTrash, settings: adminSettings, logs: adminLogs, backup: adminBackup }[tab] || adminPending;
    await fn(ab);
    paint(ab);
  }
  const tm = t => new Date(t).toLocaleString('zh-CN', { hour12: false });
  async function adminPending(ab) {
    const { list } = await api('admin.pending');
    ab.innerHTML = list.length ? list.map(u => `<div class="acard" data-uid="${esc(u.uid)}"><div class="h">${u.guest ? '<span class="badge gst">亲友申请</span> ' : ''}${esc(u.name)}<span class="w">${u.guest ? `登录名 ${esc(u.workNo)}` : `工号 ${esc(u.workNo)}　${esc(u.college)}`}</span></div>
      ${u.guest ? `<div class="d">邀请人：<b>${esc(u.sponsor ? u.sponsor.nick : '?')}</b>${u.sponsor && u.sponsor.name ? '（' + esc(u.sponsor.name) + '）' : ''} · 关系：${esc(u.relation || '')}</div>` : ''}
      <div class="d">昵称：${esc(u.nick)}</div><div class="d">备注：${esc(u.note || '（无）')}</div><div class="d">申请时间：${esc(tm(u.at))}</div>
      <div class="ops"><button class="mini f" data-ok>通过</button><button class="mini r" data-no>拒绝</button></div></div>`).join('') : '<div class="empty"><b>✅</b>没有待审核的申请</div>';
    $$('.acard', ab).forEach(c => {
      const uid = c.dataset.uid;
      $('[data-ok]', c).onclick = async () => { await api('admin.review', { uid, ok: true }); toast('已通过'); c.remove(); meAt = 0; };
      $('[data-no]', c).onclick = async () => {
        const v = await dialog({ title: '拒绝申请', text: '可填写原因，申请人登录时能看到（选填）', input: true, ok: '拒绝', danger: true });
        if (v == null) return;
        await api('admin.review', { uid, ok: false, reason: v }); toast('已拒绝'); c.remove(); meAt = 0;
      };
    });
  }
  async function adminReports(ab) {
    const { list } = await api('admin.reports');
    ab.innerHTML = list.length ? list.map((r, i) => `<div class="acard" data-i="${i}"><div class="h">${r.type === 'dm' ? '私信' : r.type === 'reply' ? '回复' : '帖子'}被举报 ${r.n} 次${r.hidden ? '（已自动隐藏）' : ''}${r.deleted ? '（已删除）' : ''}</div>
      <div class="d">作者：${esc(r.author.nick)}</div><div class="d">内容：${esc(r.text)}</div><div class="d">理由：${r.reasons.map(esc).join('；')}</div>
      <div class="ops">${r.type === 'dm' ? '' : `<a class="mini" href="#/p/${esc(r.postId)}">查看</a>`}<button class="mini r" data-del>删除内容</button><button class="mini" data-ign>忽略（恢复显示）</button></div></div>`).join('') : '<div class="empty"><b>✅</b>没有待处理的举报</div>';
    $$('.acard', ab).forEach(c => {
      const r = list[c.dataset.i];
      $('[data-del]', c).onclick = async () => { await api('admin.resolve', { type: r.type, target: r.target, do: 'delete' }); toast('已删除'); c.remove(); invalidate(); meAt = 0; };
      $('[data-ign]', c).onclick = async () => { await api('admin.resolve', { type: r.type, target: r.target, do: 'ignore' }); toast('已忽略'); c.remove(); invalidate(); meAt = 0; };
    });
  }
  async function adminUsers(ab, qv = '') {
    const { list } = await api('admin.users', { q: qv });
    ab.innerHTML = `<div class="search"><input id="q" placeholder="搜姓名 / 昵称 / 工号 / 学院" value="${esc(qv)}"><button class="mini f" id="go">搜索</button></div>
      <div class="sec">共 ${list.length} 人</div>` + list.map(u => `<div class="acard" data-uid="${esc(u.uid)}"><div class="h">${avatar(u)} ${esc(u.nick)}${u.guest ? ' <span class="badge gst">亲友</span>' : ''}<span class="w">${esc(u.name)}　${u.guest ? `登录名 ${esc(u.workNo)}　${esc(u.relation || '')} · 邀请人 ${esc(u.sponsor ? u.sponsor.nick : '?')}` : `工号 ${esc(u.workNo)}　${esc(u.college)}`}</span></div>
      <div class="d">${u.role === 'super' ? '超级管理员' : u.role === 'admin' ? '管理员' : '会员'}${u.status === 'banned' ? ' · <b>已停用</b>' : ''}${u.status === 'suspended' ? ` · <b>已暂停</b>（${esc(u.suspendReason || '')}）` : ''}${u.muteUntil > Date.now() ? ` · 禁言至 ${esc(tm(u.muteUntil))}` : ''} · ${esc(tm(u.at).slice(0, 10))} 注册</div>
      ${u.role === 'super' || u.uid === me.uid ? '' : `<div class="ops">
        ${me.role === 'super' ? `<button class="mini o" data-role>${u.role === 'admin' ? '撤销管理员' : '设为管理员'}</button>` : ''}
        ${u.role === 'admin' && me.role !== 'super' ? '' : `${u.muteUntil > Date.now() ? '<button class="mini" data-unmute>解除禁言</button>' : '<button class="mini" data-mute>禁言</button>'}
        <button class="mini" data-reset>重置密码</button>${u.av ? '<button class="mini" data-clav>清除头像</button>' : ''}${u.status === 'suspended' ? '' : `<button class="mini r" data-ban>${u.status === 'banned' ? '恢复账号' : '停用账号'}</button>`}${u.guest ? '<button class="mini o" data-rsp>换担保人</button>' : ''}`}
        <a class="mini" href="#/user/${esc(u.uid)}">主页</a></div>`}</div>`).join('');
    paint(ab);
    $('#go').onclick = () => adminUsers(ab, $('#q').value.trim());
    $('#q').onkeydown = e => { if (e.key === 'Enter') $('#go').click(); };
    $$('.acard', ab).forEach(c => {
      const u = list.find(x => x.uid === c.dataset.uid);
      const on = (s, f) => { const b = $(s, c); if (b) b.onclick = f; };
      const again = () => adminUsers(ab, $('#q').value.trim());
      on('[data-role]', async () => { if (!await dialog({ title: u.role === 'admin' ? `撤销「${u.nick}」的管理员？` : `把「${u.nick}」设为管理员？`, text: u.role === 'admin' ? '' : '管理员可以审核注册、处理举报、删帖、禁言，但不能任免管理员。' })) return; await api('admin.setRole', { uid: u.uid, role: u.role === 'admin' ? 'user' : 'admin' }); toast('已设置'); again(); });
      on('[data-mute]', async () => { const v = await dialog({ title: `禁言「${u.nick}」`, text: '禁言期间只能看帖，不能发帖、回复、报名。填写天数：', input: true, type: 'number', value: '7', ok: '禁言' }); if (v == null) return; await api('admin.mute', { uid: u.uid, days: v }); toast('已禁言'); again(); });
      on('[data-rsp]', async () => { const v = await dialog({ title: `给「${u.nick}」换担保人`, text: '填写新担保会员的昵称。暂停的亲友账号会随之恢复。', input: true, placeholder: '会员昵称', ok: '确定' }); if (!v) return; await api('admin.reassign', { uid: u.uid, nick: v.trim() }); toast('已换担保人'); again(); });
      on('[data-clav]', async () => { if (!await dialog({ title: `清除「${u.nick}」的头像？`, text: '会改回颜色头像，并通知对方。', danger: true, ok: '清除' })) return; await api('admin.clearAvatar', { uid: u.uid }); toast('已清除'); again(); });
      on('[data-unmute]', async () => { await api('admin.mute', { uid: u.uid, days: 0 }); toast('已解除'); again(); });
      on('[data-reset]', async () => { if (!await dialog({ title: `重置「${u.nick}」的密码？`, text: '会生成 8 位临时密码，对方登录后必须改密码。' })) return; const r = await api('admin.resetPassword', { uid: u.uid }); await dialog({ title: '临时密码', text: `请私下告诉 ${esc(u.name)}：<b>${esc(r.temp)}</b><br>（关闭后不再显示）`, ok: '知道了' }); });
      on('[data-ban]', async () => { const ban = u.status !== 'banned'; if (!await dialog({ title: ban ? `停用「${u.nick}」的账号？` : `恢复「${u.nick}」的账号？`, text: ban ? '停用后无法登录，已发内容保留。' : '', danger: ban })) return; await api('admin.ban', { uid: u.uid, on: ban }); toast('已设置'); again(); });
    });
  }
  async function adminTrash(ab) {
    const { list } = await api('admin.trash');
    ab.innerHTML = '<div class="sec">最近 30 天删除的内容</div>' + (list.length ? list.map((t, i) => `<div class="acard" data-i="${i}"><div class="h">${t.type === 'reply' ? '回复' : '帖子'}<span class="w">作者 ${esc(t.author)} · ${esc(t.by)} 删除于 ${esc(tm(t.at))}</span></div>
      <div class="d">${esc(t.text)}</div><div class="ops"><a class="mini" href="#/p/${esc(t.postId)}">查看</a><button class="mini f" data-rs>恢复</button></div></div>`).join('') : '<div class="empty">回收站是空的</div>');
    $$('.acard', ab).forEach(c => { const t = list[c.dataset.i]; $('[data-rs]', c).onclick = async () => { await api('admin.restore', { type: t.type, id: t.id }); toast('已恢复'); c.remove(); invalidate(); }; });
  }
  async function adminSettings(ab) {
    const s = await api('admin.getSettings');
    let boards = s.boards.map(b => ({ ...b }));
    const colorSel = v => `<select data-k="color">${[['b', '蓝'], ['o', '橙'], ['r', '红'], ['g', '绿']].map(([k, n]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    function render() {
      ab.innerHTML = `<div class="sec">板块（用 ↑↓ 调整顺序）</div>${boards.map((b, i) => `<div class="acard" data-i="${i}">
        <div class="brow"><input data-k="name" value="${esc(b.name)}" placeholder="名称，如 约球组队" maxlength="10"><input data-k="short" value="${esc(b.short)}" placeholder="简称" maxlength="4"></div>
        <div class="brow"><input data-k="desc" value="${esc(b.desc || '')}" placeholder="一句话说明" maxlength="40">${colorSel(b.color)}</div>
        <div class="bopts"><label><input type="checkbox" data-k="adminOnly" ${b.adminOnly ? 'checked' : ''}>仅管理员发帖</label><label><input type="checkbox" data-k="event" ${b.event ? 'checked' : ''}>带约球报名</label>
        <span class="mv"><button class="mini" data-up>↑</button><button class="mini" data-dn>↓</button><button class="mini r" data-rm>删</button></span></div></div>`).join('')}
        <div class="acard"><button class="mini" id="add">＋ 新增板块</button></div>
        <div class="sec">学院 / 部门（每行一个，注册时下拉选择）</div><div class="acard"><textarea class="big" id="cols">${esc(s.colleges.join('\n'))}</textarea></div>
        <div class="sec">排友圈公约（每行一条，首页和欢迎页会显示；每条第一个句号前的部分会加粗）</div><div class="acard"><textarea class="big" id="rules">${esc(s.rules || '')}</textarea></div>
        <div class="sec">敏感词（每行一个，发帖、回复、昵称中出现会被拦截）</div><div class="acard"><textarea class="big" id="words">${esc(s.words.join('\n'))}</textarea></div>
        <div class="form"><button class="btn" id="save">保存设置</button></div>`;
      $$('[data-i]', ab).forEach(c => {
        const i = Number(c.dataset.i);
        $$('[data-k]', c).forEach(inp => inp.onchange = inp.oninput = () => { boards[i][inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value; });
        $('[data-up]', c).onclick = () => { if (i > 0) { [boards[i - 1], boards[i]] = [boards[i], boards[i - 1]]; render(); } };
        $('[data-dn]', c).onclick = () => { if (i < boards.length - 1) { [boards[i + 1], boards[i]] = [boards[i], boards[i + 1]]; render(); } };
        $('[data-rm]', c).onclick = async () => { if (await dialog({ title: `删除板块「${boards[i].name}」？`, text: '该板块已有的帖子仍保留在"全部"里，但不能再按板块筛选。', danger: true, ok: '删除' })) { boards.splice(i, 1); render(); } };
      });
      $('#add').onclick = () => { boards.push({ id: '', name: '', short: '', color: 'b', desc: '' }); render(); };
      $('#save').onclick = async () => {
        const r = await api('admin.saveSettings', { boards, colleges: $('#cols').value.split('\n'), words: $('#words').value.split('\n'), rules: $('#rules').value });
        s.colleges = r.colleges; s.words = r.words; s.rules = r.rules; boards = r.boards.map(b => ({ ...b }));
        cfg = null; localStorage.removeItem('pf_cfg'); await loadConfig(); invalidate();
        toast('已保存'); render();
      };
    }
    render();
  }
  const backupDue = () => me && me.role === 'super' && Date.now() - (me.lastBackupAt || 0) > 7 * 86400e3;
  async function adminBackup(ab) {
    const last = me.lastBackupAt;
    ab.innerHTML = `<div class="doc"><h2>数据备份</h2>
      <p>上次备份：<b>${last ? esc(tm(last)) : '从未备份'}</b>${backupDue() ? '　<span class="warnt">建议现在备份一次</span>' : ''}</p>
      <p>建议<b>每周备份一次</b>。备份文件包含帖子、回复、报名、投票、通知和会员资料（含姓名、工号、加密后的密码），<b>请妥善保存，不要外传</b>。</p>
      <p>不包含：私信（只有对话双方能看，管理员也不导出）和图片文件（图片仍在腾讯云存储里，备份中保留了图片编号）。</p>
      <p>请在<b>电脑浏览器</b>里操作，微信里可能无法下载文件。</p>
      <button class="btn" id="bk">⬇️ 导出备份</button><p id="bkp"></p></div>`;
    $('#bk').onclick = async () => {
      const btn = $('#bk'); btn.disabled = true;
      const colls = ['pf_settings', 'pf_users', 'pf_works', 'pf_nicks', 'pf_posts', 'pf_replies', 'pf_likes', 'pf_joins', 'pf_votes', 'pf_notices', 'pf_reports', 'pf_logs', 'pf_invites'];
      const out = { app: '排友圈', version: 1, exportedAt: new Date().toISOString(), collections: {} };
      let n = 0;
      try {
        for (const c of colls) {
          out.collections[c] = [];
          for (let page = 0; ; page++) {
            $('#bkp').textContent = `正在导出 ${c}（已 ${n} 条）…`;
            const r = await api('admin.backup', { coll: c, page });
            out.collections[c].push(...r.rows); n += r.rows.length;
            if (!r.more) break;
          }
        }
        const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `排友圈备份-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        const r = await api('admin.backupDone', { n });
        me.lastBackupAt = r.at;
        $('#bkp').textContent = `✅ 已导出 ${n} 条记录（${(blob.size / 1024).toFixed(0)} KB），请到"下载"文件夹查看。`;
      } catch (e) { $('#bkp').textContent = '导出失败：' + (e.message || '网络问题'); }
      btn.disabled = false;
    };
  }
  async function adminLogs(ab) {
    const { list } = await api('admin.logs');
    ab.innerHTML = list.length ? list.map(l => `<div class="logrow">${esc(tm(l.at))}　<b>${esc(l.by)}</b> ${esc(l.action)}　${esc(l.detail)}</div>`).join('') : '<div class="empty">暂无记录</div>';
  }

  // ---------------- 路由 ----------------
  const PUBLIC = new Set(['login', 'register', 'setup', 'privacy', 'a2hs', 'rules', 'join']);
  async function route() {
    const h = (location.hash || '#/').slice(1);
    const [pathPart, qs] = h.split('?');
    const q = new URLSearchParams(qs || '');
    const seg = pathPart.split('/').filter(Boolean);
    const head = seg[0] || '';
    $('#sheet').hidden = true; $('#lightbox').hidden = true;
    if (!token && !PUBLIC.has(head)) { location.replace('#/login'); return; }
    if (token && (head === 'login' || head === 'register' || head === 'join')) { location.replace('#/'); return; }
    try {
      if (!head) return await pageHome(q);
      if (head === 'p') return await pagePost(seg[1], q);
      if (head === 'new') return await pageCompose(q);
      if (head === 'edit') return await pageCompose(q, seg[1]);
      if (head === 'msg') return await pageMsg(q);
      if (head === 'members') return await pageMembers();
      if (head === 'user') return await pageUser(seg[1]);
      if (head === 'dm') return await pageDm(seg[1]);
      if (head === 'me') {
        if (!seg[1]) return await pageMe();
        if (seg[1] === 'posts') return await pagePostList('我的帖子', 'posts', { mine: true });
        if (seg[1] === 'joins') return await pagePostList('我报名的约球', 'joined', {});
        if (seg[1] === 'profile') return await pageProfile();
        if (seg[1] === 'pw') return await pagePassword();
        if (seg[1] === 'del') return await pageDeregister();
        if (seg[1] === 'guests') return await pageGuests();
        if (seg[1] === 'notify') return await pageNotify();
      }
      if (head === 'u') return await pagePostList(`${q.get('n') || '会员'}的帖子`, 'posts', { uid: seg[1] });
      if (head === 'admin') return await pageAdmin(seg[1] || 'pending');
      if (head === 'login') return await pageLogin();
      if (head === 'register') return await pageRegister();
      if (head === 'join') return await pageJoin(q);
      if (head === 'setup') return await pageSetup();
      if (head === 'privacy' || head === 'a2hs') return pageDoc(head);
      if (head === 'rules') return await pageRules();
      if (head === 'welcome') return await pageWelcome();
      location.replace('#/');
    } catch (e) {
      if (!view.querySelector('.form, .post, .card, .acard, .msg, .prof')) view.innerHTML = `<div class="empty"><b>📶</b>${esc(e.message || '加载失败')}<br><br><button class="more-btn" id="retry">重试</button></div>`;
      const r = $('#retry'); if (r) r.onclick = route;
    }
  }
  window.addEventListener('hashchange', () => { navDepth++; route(); });
  navDepth = 1;
  route();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  // 从通知点进来：Service Worker 发来要打开的页面
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) location.hash = e.data.open; });
})();
