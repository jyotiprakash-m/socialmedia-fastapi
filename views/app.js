/**
 * Sociva — frontend application
 *
 * Views (hash router):
 *   #/               Home: stories tray, composer, friends timeline
 *   #/explore        Find people (search) and send friend requests
 *   #/friends        Requests / Friends / Sent
 *   #/profile[/:id]  Profile with post grid (+ Scheduled tab on your own profile)
 *   #/post/:id       Single post permalink
 *
 * Backend APIs used: /users, /users/search, /users/{id}/friends[/pending],
 * friend send/accept/reject/remove, /posts, /posts/schedule, /posts/timeline,
 * /posts/user, /posts/{id}/comments, /posts/comments/{id}[/replies], /stories.
 *
 * Note: the backend has no likes/bookmarks API, so those are kept locally
 * per user in localStorage.
 */
(() => {
  'use strict';

  const API = window.location.origin;
  const POLL_MS = 45000;
  const STORY_MS = 5000;

  // ------------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------------
  const state = {
    me: null,
    users: [],
    usersById: new Map(),
    friends: [],
    incoming: [],
    stories: [],
    posts: [],
    postCache: new Map(),
    comments: {},          // postId -> Comment[]
    openComments: new Set(),
    replyTo: {},           // postId -> { id, name }
    route: { page: 'home', arg: null },
    exploreQuery: '',
    friendsTab: 'requests',
    profileTab: 'posts',
    accountMode: 'create',
    pendingComposerFocus: false,
  };

  // ------------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const store = {
    get(key, fallback) {
      try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
  };
  const userKey = (name) => `sociva:${name}:${state.me ? state.me.id : 0}`;
  const getSet = (name) => new Set(store.get(userKey(name), []));
  const saveSet = (name, set) => store.set(userKey(name), Array.from(set));

  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Network error — is the server running?');
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      if (data && data.detail) {
        msg = typeof data.detail === 'string'
          ? data.detail
          : (Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join(', ') : JSON.stringify(data.detail));
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const isHttpUrl = (s) => {
    try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
  };

  function timeAgo(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = Math.round((Date.now() - d.getTime()) / 1000);
    const abs = Math.abs(diff);
    const fmt = (n, unit) => (diff >= 0 ? `${n}${unit} ago` : `in ${n}${unit}`);
    if (abs < 45) return diff >= 0 ? 'just now' : 'in a moment';
    if (abs < 3600) return fmt(Math.round(abs / 60), 'm');
    if (abs < 86400) return fmt(Math.round(abs / 3600), 'h');
    if (abs < 604800) return fmt(Math.round(abs / 86400), 'd');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const formatDateTime = (d) => new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const joinedText = (iso) => (iso ? `Joined ${new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : '');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function toLocalInput(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  const linkify = (escaped) => escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="link">$1</a>',
  );

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function toast(message, type = 'info') {
    const icon = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' }[type] || 'fa-circle-info';
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${esc(message)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3800);
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span>';
      btn.disabled = true;
    } else if (btn.dataset.label) {
      btn.innerHTML = btn.dataset.label;
      delete btn.dataset.label;
      btn.disabled = false;
    }
  }

  // ------------------------------------------------------------------------
  // Users & avatars
  // ------------------------------------------------------------------------
  const GRADIENTS = [
    'linear-gradient(135deg,#7C3AED,#C026D3)',
    'linear-gradient(135deg,#C026D3,#EC4899)',
    'linear-gradient(135deg,#EC4899,#FF7043)',
    'linear-gradient(135deg,#FF7043,#C026D3)',
    'linear-gradient(135deg,#6D28D9,#EC4899)',
    'linear-gradient(135deg,#7C3AED,#FF7043)',
  ];

  function setUsers(list) {
    state.users = list;
    state.usersById = new Map(list.map((u) => [u.id, u]));
  }
  const userOf = (id) => state.usersById.get(Number(id));
  const nameOf = (id) => (userOf(id) ? userOf(id).name : `User ${id}`);
  const handleOf = (u) => (u ? `@${u.clerk_user_id}` : '');
  const initials = (name) => String(name || '?').trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  function avatar(userOrId, size = '') {
    const u = typeof userOrId === 'object' ? userOrId : userOf(userOrId);
    const id = u ? u.id : Number(userOrId) || 0;
    const name = u ? u.name : `User ${id}`;
    return `<span class="avatar ${size}" style="background:${GRADIENTS[id % GRADIENTS.length]}" aria-hidden="true">${esc(initials(name))}</span>`;
  }

  function relationship(uid) {
    uid = Number(uid);
    if (!state.me) return 'none';
    if (uid === state.me.id) return 'self';
    if (state.friends.some((f) => f.id === uid)) return 'friend';
    if (state.incoming.some((f) => f.id === uid)) return 'incoming';
    if (getSet('sent').has(uid)) return 'sent';
    return 'none';
  }

  function relationButtons(uid, { small = true } = {}) {
    const sm = small ? 'btn-sm' : '';
    switch (relationship(uid)) {
      case 'self':
        return '';
      case 'friend':
        return `<button class="btn btn-secondary ${sm}" data-action="friend-remove" data-id="${uid}" title="Unfriend"><i class="fa-solid fa-user-check"></i> Friends</button>`;
      case 'incoming':
        return `<button class="btn btn-primary ${sm}" data-action="friend-accept" data-id="${uid}"><i class="fa-solid fa-check"></i> Accept</button>
                <button class="btn btn-ghost ${sm}" data-action="friend-reject" data-id="${uid}">Decline</button>`;
      case 'sent':
        return `<button class="btn btn-secondary ${sm}" disabled><i class="fa-regular fa-clock"></i> Requested</button>`;
      default:
        return `<button class="btn btn-primary ${sm}" data-action="friend-add" data-id="${uid}"><i class="fa-solid fa-user-plus"></i> Add friend</button>`;
    }
  }

  // ------------------------------------------------------------------------
  // Modals
  // ------------------------------------------------------------------------
  function openModal(id) {
    $(`#${id}`).classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(modal) {
    if (!modal) return;
    if (modal.id === 'storyViewer') { closeViewer(); return; }
    modal.classList.remove('open');
    if (modal.id === 'postModal') $('#postModalBody').innerHTML = '';
    if (!$('.modal.open')) document.body.style.overflow = '';
  }

  // ------------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------------
  async function boot() {
    bindEvents();
    try {
      setUsers(await api('/users/?limit=500'));
    } catch (err) {
      $('#view').innerHTML = emptyState('fa-plug-circle-xmark', 'Cannot reach Sociva', err.message,
        '<button class="btn btn-primary" onclick="location.reload()">Retry</button>');
      return;
    }

    if (state.users.length === 0) {
      renderAccountUI();
      $('#view').innerHTML = emptyState('fa-user-plus', 'Welcome to Sociva', 'Create the first account to get started.',
        '<button class="btn btn-primary" data-action="open-create-account">Create account</button>');
      return;
    }

    const saved = Number(localStorage.getItem('sociva:activeUser'));
    state.me = userOf(saved) || state.users[0];
    renderAccountUI();
    await refreshSocial();
    route();
    setInterval(poll, POLL_MS);
  }

  async function switchUser(id) {
    const u = userOf(id);
    if (!u || (state.me && u.id === state.me.id)) return;
    state.me = u;
    localStorage.setItem('sociva:activeUser', String(u.id));
    state.replyTo = {};
    state.openComments.clear();
    state.profileTab = 'posts';
    renderAccountUI();
    await refreshSocial();
    toast(`Signed in as ${u.name}`, 'success');
    route();
  }

  function renderAccountUI() {
    const options = state.users.map((u) =>
      `<option value="${u.id}" ${state.me && u.id === state.me.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
    $('#accountSelect').innerHTML = options;
    $('#accountSelectMobile').innerHTML = options;

    const me = state.me;
    $('#accountSummary').innerHTML = me ? `
      ${avatar(me, 'sm')}
      <div class="account-meta"><strong>${esc(me.name)}</strong><small>${esc(handleOf(me))}</small></div>
      <button class="icon-btn" data-action="open-edit-account" title="Edit profile"><i class="fa-solid fa-pen"></i></button>` : '';

    $('#railMe').innerHTML = me ? `
      <div class="suggest-row">
        ${avatar(me, 'lg')}
        <div class="meta"><strong>${esc(me.name)}</strong><small>${esc(handleOf(me))}</small></div>
        <a class="link" href="#/profile">Profile</a>
      </div>` : '';
  }

  async function refreshSocial() {
    if (!state.me) return;
    try {
      const [friends, incoming] = await Promise.all([
        api(`/users/${state.me.id}/friends`),
        api(`/users/${state.me.id}/friends/pending`),
      ]);
      state.friends = friends;
      state.incoming = incoming;
    } catch (err) {
      toast(`Could not load friends: ${err.message}`, 'error');
    }
    // A sent request that became a friendship no longer needs tracking.
    const sent = getSet('sent');
    let changed = false;
    state.friends.forEach((f) => { if (sent.delete(f.id)) changed = true; });
    if (changed) saveSet('sent', sent);

    $$('[data-pending-badge]').forEach((b) => {
      b.textContent = state.incoming.length;
      b.classList.toggle('hidden', state.incoming.length === 0);
    });
    renderSuggestions();
  }

  function renderSuggestions() {
    const list = state.users.filter((u) => relationship(u.id) === 'none' || relationship(u.id) === 'incoming').slice(0, 5);
    $('#railSuggestions').innerHTML = list.length ? list.map((u) => `
      <div class="suggest-row">
        <a href="#/profile/${u.id}">${avatar(u, 'sm')}</a>
        <div class="meta"><a href="#/profile/${u.id}"><strong>${esc(u.name)}</strong></a>
          <small>${relationship(u.id) === 'incoming' ? 'Wants to be friends' : esc(handleOf(u))}</small></div>
        ${relationship(u.id) === 'incoming'
          ? `<button class="btn btn-primary btn-sm" data-action="friend-accept" data-id="${u.id}">Accept</button>`
          : `<button class="btn btn-secondary btn-sm" data-action="friend-add" data-id="${u.id}">Add</button>`}
      </div>`).join('')
      : '<p style="color:var(--text-3);font-size:.85rem;">You\'re connected with everyone. 🎉</p>';
  }

  // ------------------------------------------------------------------------
  // Router
  // ------------------------------------------------------------------------
  function parseRoute() {
    const [page, arg] = location.hash.replace(/^#\/?/, '').split('/');
    return { page: page || 'home', arg: arg ? Number(arg) : null };
  }

  function route() {
    if (!state.me) return;
    state.route = parseRoute();
    const { page, arg } = state.route;
    const navKey = page === 'profile' && arg && arg !== state.me.id ? '' : page;
    $$('[data-nav]').forEach((el) => el.classList.toggle('active', el.dataset.nav === navKey));

    switch (page) {
      case 'explore': renderExplore(); break;
      case 'friends': renderFriends(); break;
      case 'profile': renderProfile(arg || state.me.id); break;
      case 'post': renderPostPage(arg); break;
      default: renderHome();
    }
    window.scrollTo({ top: 0 });
  }

  function emptyState(icon, title, text, action = '') {
    return `<div class="empty"><div class="empty-icon"><i class="fa-solid ${icon}"></i></div>
      <h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
  }

  // ------------------------------------------------------------------------
  // Home
  // ------------------------------------------------------------------------
  function renderHome() {
    $('#view').className = 'view';
    $('#view').innerHTML = `
      <section class="card stories" aria-label="Stories"><div class="stories-track" data-role="stories">${storiesSkeleton()}</div></section>
      ${composerHtml()}
      <button class="btn btn-primary btn-block hidden" data-action="load-new-posts" data-role="new-posts" style="margin-bottom:18px;">
        <i class="fa-solid fa-arrow-up"></i> New posts
      </button>
      <section data-role="feed" aria-label="Feed">${feedSkeleton()}</section>`;
    loadStories();
    loadFeed();
    if (state.pendingComposerFocus) {
      state.pendingComposerFocus = false;
      $('#view [data-composer] textarea').focus();
    }
  }

  const storiesSkeleton = () => Array.from({ length: 6 }, () =>
    '<div class="story"><div class="skeleton" style="width:68px;height:68px;border-radius:50%"></div><div class="skeleton" style="width:50px;height:10px"></div></div>').join('');

  const feedSkeleton = () => Array.from({ length: 2 }, () => `
    <div class="card post" style="padding:16px">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
        <div class="skeleton" style="width:40px;height:40px;border-radius:50%"></div>
        <div style="flex:1"><div class="skeleton" style="width:40%;height:12px;margin-bottom:6px"></div><div class="skeleton" style="width:20%;height:10px"></div></div>
      </div>
      <div class="skeleton" style="width:100%;height:12px;margin-bottom:8px"></div>
      <div class="skeleton" style="width:70%;height:12px;margin-bottom:14px"></div>
      <div class="skeleton" style="width:100%;height:260px"></div>
    </div>`).join('');

  async function loadFeed() {
    const feed = $('[data-role="feed"]');
    if (!feed) return;
    try {
      state.posts = await api(`/posts/timeline/${state.me.id}`);
    } catch (err) {
      feed.innerHTML = emptyState('fa-triangle-exclamation', 'Feed unavailable', err.message,
        '<button class="btn btn-secondary" data-action="reload-feed">Try again</button>');
      return;
    }
    $('[data-role="new-posts"]')?.classList.add('hidden');
    state.posts.forEach((p) => state.postCache.set(p.id, p));
    if (state.posts.length === 0) {
      feed.innerHTML = emptyState('fa-seedling', 'Your feed is quiet',
        'Share your first post or add friends to see what they\'re up to.',
        '<a class="btn btn-primary" href="#/explore"><i class="fa-solid fa-user-plus"></i> Find friends</a>');
      return;
    }
    feed.innerHTML = state.posts.map((p) => postCard(p)).join('');
    state.posts.forEach((p) => loadComments(p.id));
  }

  async function poll() {
    if (document.hidden || !state.me || state.route.page !== 'home') return;
    try {
      const latest = await api(`/posts/timeline/${state.me.id}`);
      const known = new Set(state.posts.map((p) => p.id));
      if (latest.some((p) => !known.has(p.id))) $('[data-role="new-posts"]')?.classList.remove('hidden');
      loadStories();
    } catch { /* silent background refresh */ }
  }

  // ------------------------------------------------------------------------
  // Composer
  // ------------------------------------------------------------------------
  function composerHtml() {
    return `
      <section class="card composer" data-composer aria-label="Create post">
        <div class="composer-top">
          ${avatar(state.me)}
          <textarea data-role="text" rows="2" maxlength="2200" placeholder="What's on your mind, ${esc(state.me.name.split(' ')[0])}?"></textarea>
        </div>
        <div class="composer-extra hidden" data-role="media">
          <div class="row">
            <input class="input" type="url" data-role="media-url" placeholder="Paste an image or video URL">
            <select class="select" data-role="media-type"><option value="image">Image</option><option value="video">Video</option></select>
          </div>
          <div class="composer-preview hidden" data-role="preview"></div>
        </div>
        <div class="composer-extra hidden" data-role="schedule">
          <span class="schedule-label"><i class="fa-regular fa-calendar"></i> Publish automatically at</span>
          <input class="input" type="datetime-local" data-role="schedule-at">
        </div>
        <div class="composer-bottom">
          <div class="composer-tools">
            <button type="button" class="icon-btn" data-action="composer-toggle" data-target="media" title="Add photo or video"><i class="fa-regular fa-image"></i></button>
            <button type="button" class="icon-btn" data-action="composer-toggle" data-target="schedule" title="Schedule for later"><i class="fa-regular fa-calendar"></i></button>
            <span class="char-count" data-role="count"></span>
          </div>
          <button type="button" class="btn btn-primary" data-action="composer-submit" disabled><i class="fa-solid fa-paper-plane"></i> Post</button>
        </div>
      </section>`;
  }

  function mediaPreviewHtml(url, type) {
    return type === 'video'
      ? `<video src="${esc(url)}" muted playsinline controls preload="metadata"></video>`
      : `<img src="${esc(url)}" alt="Preview" onerror="this.parentElement.classList.add('hidden')">`;
  }

  function updateComposer(c) {
    const text = $('[data-role="text"]', c).value;
    const count = $('[data-role="count"]', c);
    count.textContent = text.length ? `${text.length}/2200` : '';
    count.classList.toggle('warn', text.length > 2000);

    const mediaOpen = !$('[data-role="media"]', c).classList.contains('hidden');
    const url = $('[data-role="media-url"]', c).value.trim();
    const type = $('[data-role="media-type"]', c).value;
    const preview = $('[data-role="preview"]', c);
    const key = mediaOpen && isHttpUrl(url) ? `${type}|${url}` : '';
    if (preview.dataset.key !== key) {
      preview.dataset.key = key;
      preview.innerHTML = key ? mediaPreviewHtml(url, type) : '';
      preview.classList.toggle('hidden', !key);
    }

    const scheduling = !$('[data-role="schedule"]', c).classList.contains('hidden');
    const btn = $('[data-action="composer-submit"]', c);
    if (!btn.dataset.label) {
      btn.disabled = text.trim().length === 0;
      btn.className = `btn ${scheduling ? 'btn-coral' : 'btn-primary'}`;
      btn.innerHTML = scheduling
        ? '<i class="fa-regular fa-calendar-check"></i> Schedule'
        : '<i class="fa-solid fa-paper-plane"></i> Post';
    }
  }

  function toggleComposerSection(btn) {
    const c = btn.closest('[data-composer]');
    const box = $(`[data-role="${btn.dataset.target}"]`, c);
    const nowHidden = box.classList.toggle('hidden');
    btn.classList.toggle('active', !nowHidden);
    if (!nowHidden) {
      if (btn.dataset.target === 'schedule') {
        const input = $('[data-role="schedule-at"]', c);
        input.min = toLocalInput(new Date(Date.now() + 60000));
        if (!input.value) input.value = toLocalInput(new Date(Date.now() + 3600000));
      } else {
        $('[data-role="media-url"]', c).focus();
      }
    }
    updateComposer(c);
  }

  function resetComposer(c) {
    $('[data-role="text"]', c).value = '';
    $('[data-role="media-url"]', c).value = '';
    $('[data-role="schedule-at"]', c).value = '';
    $$('.composer-extra', c).forEach((el) => el.classList.add('hidden'));
    $$('[data-action="composer-toggle"]', c).forEach((el) => el.classList.remove('active'));
    updateComposer(c);
  }

  async function submitComposer(btn) {
    const c = btn.closest('[data-composer]');
    const content = $('[data-role="text"]', c).value.trim();
    if (!content) return;

    const mediaOpen = !$('[data-role="media"]', c).classList.contains('hidden');
    const rawUrl = mediaOpen ? $('[data-role="media-url"]', c).value.trim() : '';
    if (rawUrl && !isHttpUrl(rawUrl)) { toast('Please enter a valid http(s) media URL', 'error'); return; }
    const media_url = rawUrl || null;
    const media_type = rawUrl ? $('[data-role="media-type"]', c).value : null;
    const scheduling = !$('[data-role="schedule"]', c).classList.contains('hidden');

    let when = null;
    if (scheduling) {
      const val = $('[data-role="schedule-at"]', c).value;
      when = val ? new Date(val) : null;
      if (!when || Number.isNaN(when.getTime())) { toast('Pick a date and time to schedule', 'error'); return; }
      if (when.getTime() < Date.now() + 30000) { toast('Choose a time at least a minute from now', 'error'); return; }
    }

    setBusy(btn, true);
    try {
      if (scheduling) {
        const res = await api('/posts/schedule', {
          method: 'POST',
          body: { user_id: state.me.id, content, schedule_at: when.toISOString(), media_url, media_type },
        });
        const list = store.get(userKey('scheduled'), []);
        list.push({ event_id: res.event_id, content, media_url, media_type, schedule_at: res.schedule_at || when.toISOString() });
        store.set(userKey('scheduled'), list);
        toast(`Scheduled for ${formatDateTime(when)}`, 'success');
      } else {
        const post = await api('/posts/', { method: 'POST', body: { user_id: state.me.id, content, media_url, media_type } });
        toast('Your post is live', 'success');
        onPostCreated(post);
      }
      setBusy(btn, false);
      resetComposer(c);
      if (c.closest('.modal')) closeModal(c.closest('.modal'));
      if (scheduling && state.route.page === 'profile' && state.route.arg === null) renderProfile(state.me.id);
    } catch (err) {
      setBusy(btn, false);
      updateComposer(c);
      toast(err.message, 'error');
    }
  }

  function onPostCreated(post) {
    state.postCache.set(post.id, post);
    if (state.route.page === 'home') {
      const feed = $('[data-role="feed"]');
      if (!feed) return;
      if (!state.posts.length) feed.innerHTML = '';
      state.posts.unshift(post);
      state.comments[post.id] = [];
      feed.insertAdjacentHTML('afterbegin', postCard(post));
      updatePostComments(post.id);
    } else if (state.route.page === 'profile' && (!state.route.arg || state.route.arg === state.me.id)) {
      renderProfile(state.me.id);
    }
  }

  function openComposerModal() {
    $('#composerModalBody').innerHTML = composerHtml();
    const card = $('#composerModalBody [data-composer]');
    card.style.margin = '0';
    card.style.border = 'none';
    card.style.padding = '0';
    card.style.background = 'transparent';
    openModal('composerModal');
    setTimeout(() => $('textarea', card).focus(), 50);
  }

  // ------------------------------------------------------------------------
  // Posts
  // ------------------------------------------------------------------------
  function mediaHtml(post) {
    if (!post.media_url) return '';
    const inner = post.media_type === 'video'
      ? `<video src="${esc(post.media_url)}" controls playsinline preload="metadata"></video>`
      : `<img src="${esc(post.media_url)}" alt="Photo by ${esc(nameOf(post.user_id))}" loading="lazy"
             onerror="this.parentElement.innerHTML='<div class=&quot;empty&quot; style=&quot;padding:40px&quot;><i class=&quot;fa-regular fa-image&quot;></i> Media unavailable</div>'">`;
    return `<div class="post-media" data-action="media-like" data-id="${post.id}">${inner}<i class="fa-solid fa-heart heart-burst"></i></div>`;
  }

  function postCard(post, { expanded = false } = {}) {
    const own = post.user_id === state.me.id;
    const liked = getSet('likes').has(post.id);
    const saved = getSet('saved').has(post.id);
    if (expanded) state.openComments.add(post.id);
    const open = state.openComments.has(post.id);
    return `
      <article class="card post" data-post-id="${post.id}">
        <header class="post-head">
          <div class="post-author">
            <a href="#/profile/${post.user_id}">${avatar(post.user_id)}</a>
            <div><a href="#/profile/${post.user_id}"><strong>${esc(nameOf(post.user_id))}</strong></a>
              <small><a href="#/post/${post.id}" title="${esc(new Date(post.created_at).toLocaleString())}">${timeAgo(post.created_at)}</a></small></div>
          </div>
          ${own ? `<button class="icon-btn" data-action="delete-post" data-id="${post.id}" title="Delete post"><i class="fa-regular fa-trash-can"></i></button>` : ''}
        </header>
        ${post.content ? `<div class="post-text">${linkify(esc(post.content))}</div>` : ''}
        ${mediaHtml(post)}
        <div class="post-actions">
          <div class="group">
            <button class="icon-btn like-btn ${liked ? 'liked' : ''}" data-action="like" data-id="${post.id}" aria-label="Like" aria-pressed="${liked}">
              <i class="fa-${liked ? 'solid' : 'regular'} fa-heart"></i></button>
            <button class="icon-btn" data-action="toggle-comments" data-id="${post.id}" aria-label="Comments"><i class="fa-regular fa-comment"></i></button>
            <button class="icon-btn" data-action="share" data-id="${post.id}" aria-label="Copy link"><i class="fa-regular fa-paper-plane"></i></button>
          </div>
          <button class="icon-btn save-btn" data-action="save" data-id="${post.id}" aria-label="Save" aria-pressed="${saved}">
            <i class="fa-${saved ? 'solid' : 'regular'} fa-bookmark"></i></button>
        </div>
        <div class="post-stats" data-role="likes">${liked ? 'You liked this' : ''}</div>
        <div class="post-stats"><button data-action="toggle-comments" data-id="${post.id}" data-role="comments-toggle">Loading comments…</button></div>
        <div class="comments ${open ? '' : 'hidden'}" data-role="comments"><div class="comment-list" data-role="comment-list"></div></div>
        <form class="comment-form" data-form="comment" data-id="${post.id}">
          <div data-role="reply-chip"></div>
          <div class="comment-input-row">
            ${avatar(state.me, 'xs')}
            <input name="comment" placeholder="Add a comment…" maxlength="1000" autocomplete="off" aria-label="Add a comment">
            <button type="submit" disabled>Post</button>
          </div>
        </form>
      </article>`;
  }

  function toggleLike(postId, { forceOn = false } = {}) {
    const likes = getSet('likes');
    const on = forceOn ? true : !likes.has(postId);
    if (on) likes.add(postId); else likes.delete(postId);
    saveSet('likes', likes);
    $$(`[data-post-id="${postId}"]`).forEach((card) => {
      const btn = $('.like-btn', card);
      btn.classList.toggle('liked', on);
      btn.setAttribute('aria-pressed', on);
      btn.innerHTML = `<i class="fa-${on ? 'solid' : 'regular'} fa-heart"></i>`;
      $('[data-role="likes"]', card).textContent = on ? 'You liked this' : '';
    });
  }

  function toggleSave(postId) {
    const saved = getSet('saved');
    const on = !saved.has(postId);
    if (on) saved.add(postId); else saved.delete(postId);
    saveSet('saved', saved);
    $$(`[data-post-id="${postId}"] .save-btn`).forEach((btn) => {
      btn.setAttribute('aria-pressed', on);
      btn.innerHTML = `<i class="fa-${on ? 'solid' : 'regular'} fa-bookmark"></i>`;
    });
    toast(on ? 'Saved to your collection' : 'Removed from saved');
  }

  async function sharePost(postId) {
    const url = `${API}/#/post/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied to clipboard', 'success');
    } catch {
      toast(url);
    }
  }

  async function deletePost(postId, btn) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    setBusy(btn, true);
    try {
      await api(`/posts/${postId}`, { method: 'DELETE' });
      state.posts = state.posts.filter((p) => p.id !== postId);
      state.postCache.delete(postId);
      $$(`[data-post-id="${postId}"]`).forEach((el) => el.remove());
      if ($('#postModal').classList.contains('open')) closeModal($('#postModal'));
      toast('Post deleted', 'success');
      if (state.route.page === 'profile') renderProfile(state.route.arg || state.me.id);
      else if (state.route.page === 'post') location.hash = '#/';
      else if (state.route.page === 'home' && !state.posts.length) loadFeed();
    } catch (err) {
      setBusy(btn, false);
      toast(err.message, 'error');
    }
  }

  function burstHeart(mediaEl) {
    const heart = $('.heart-burst', mediaEl);
    if (!heart) return;
    heart.classList.remove('show');
    void heart.offsetWidth; // restart animation
    heart.classList.add('show');
  }

  async function openPostModal(postId) {
    let post = state.postCache.get(postId);
    if (!post) {
      try { post = await api(`/posts/${postId}`); state.postCache.set(post.id, post); } catch (err) { toast(err.message, 'error'); return; }
    }
    $('#postModalBody').innerHTML = postCard(post, { expanded: true });
    openModal('postModal');
    updatePostComments(postId);
    loadComments(postId);
  }

  async function renderPostPage(postId) {
    $('#view').className = 'view';
    $('#view').innerHTML = `<div class="page-header"><a class="btn btn-ghost" href="#/"><i class="fa-solid fa-arrow-left"></i> Back to feed</a></div>
      <div class="card skeleton" style="height:420px"></div>`;
    try {
      const post = await api(`/posts/${postId}`);
      state.postCache.set(post.id, post);
      $('#view').innerHTML = `<div class="page-header"><a class="btn btn-ghost" href="#/"><i class="fa-solid fa-arrow-left"></i> Back to feed</a></div>${postCard(post, { expanded: true })}`;
      loadComments(post.id);
    } catch (err) {
      $('#view').innerHTML = emptyState('fa-ghost', 'Post not found', err.status === 404 ? 'It may have been deleted.' : err.message,
        '<a class="btn btn-primary" href="#/">Go home</a>');
    }
  }

  // ------------------------------------------------------------------------
  // Comments & replies
  // ------------------------------------------------------------------------
  async function loadComments(postId) {
    try {
      state.comments[postId] = await api(`/posts/${postId}/comments`);
    } catch {
      state.comments[postId] = state.comments[postId] || [];
    }
    updatePostComments(postId);
  }

  function commentThreadHtml(postId) {
    const list = state.comments[postId] || [];
    if (!list.length) return '<p style="color:var(--text-3);font-size:.85rem;">No comments yet — start the conversation.</p>';
    const ids = new Set(list.map((c) => c.id));
    const byParent = new Map();
    list.forEach((c) => {
      const key = c.parent_comment_id && ids.has(c.parent_comment_id) ? c.parent_comment_id : 0;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    });
    const render = (parentId) => (byParent.get(parentId) || []).map((c) => {
      const children = render(c.id);
      const own = c.user_id === state.me.id;
      return `
        <div class="comment">
          <a href="#/profile/${c.user_id}">${avatar(c.user_id, 'xs')}</a>
          <div class="comment-body">
            <div class="comment-bubble">
              <a href="#/profile/${c.user_id}"><strong>${esc(nameOf(c.user_id))}</strong></a>
              <p>${linkify(esc(c.content))}</p>
            </div>
            <div class="comment-meta">
              <span>${timeAgo(c.created_at)}</span>
              <button data-action="reply" data-post="${postId}" data-id="${c.id}" data-name="${esc(nameOf(c.user_id))}">Reply</button>
              ${own ? `<button class="del" data-action="delete-comment" data-post="${postId}" data-id="${c.id}">Delete</button>` : ''}
            </div>
            ${children ? `<div class="replies">${children}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    return render(0);
  }

  function updatePostComments(postId) {
    const list = state.comments[postId];
    const n = list ? list.length : 0;
    const open = state.openComments.has(postId);
    const reply = state.replyTo[postId];
    $$(`[data-post-id="${postId}"]`).forEach((card) => {
      const toggle = $('[data-role="comments-toggle"]', card);
      if (list) toggle.textContent = n === 0 ? 'No comments yet' : (open ? 'Hide comments' : `View ${n === 1 ? '1 comment' : `all ${n} comments`}`);
      $('[data-role="comments"]', card).classList.toggle('hidden', !open);
      if (open && list) $('[data-role="comment-list"]', card).innerHTML = commentThreadHtml(postId);
      $('[data-role="reply-chip"]', card).innerHTML = reply
        ? `<span class="reply-chip">Replying to ${esc(reply.name)}<button type="button" data-action="cancel-reply" data-post="${postId}" aria-label="Cancel reply"><i class="fa-solid fa-xmark"></i></button></span>`
        : '';
    });
  }

  function toggleComments(postId) {
    if (state.openComments.has(postId)) state.openComments.delete(postId);
    else state.openComments.add(postId);
    updatePostComments(postId);
  }

  function startReply(btn) {
    const postId = Number(btn.dataset.post);
    state.replyTo[postId] = { id: Number(btn.dataset.id), name: btn.dataset.name };
    state.openComments.add(postId);
    updatePostComments(postId);
    const input = $('input', btn.closest('[data-post-id]').querySelector('.comment-form'));
    input.focus();
  }

  async function submitComment(form) {
    const postId = Number(form.dataset.id);
    const input = form.elements.comment;
    const submit = $('button[type="submit"]', form);
    const content = input.value.trim();
    if (!content) return;
    const reply = state.replyTo[postId];
    setBusy(submit, true);
    try {
      if (reply) {
        await api(`/posts/comments/${reply.id}/replies`, {
          method: 'POST', body: { user_id: state.me.id, content, post_id: postId },
        });
      } else {
        await api(`/posts/${postId}/comments`, { method: 'POST', body: { user_id: state.me.id, content } });
      }
      delete state.replyTo[postId];
      input.value = '';
      state.openComments.add(postId);
      await loadComments(postId);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(submit, false);
      submit.disabled = !input.value.trim();
    }
  }

  async function deleteComment(btn) {
    const postId = Number(btn.dataset.post);
    const commentId = Number(btn.dataset.id);
    const hasReplies = (state.comments[postId] || []).some((c) => c.parent_comment_id === commentId);
    if (!confirm(hasReplies ? 'Delete this comment and its replies?' : 'Delete this comment?')) return;
    try {
      // Remove replies first so the parent delete is not blocked by a foreign key.
      const collect = (id) => (state.comments[postId] || [])
        .filter((c) => c.parent_comment_id === id)
        .flatMap((c) => [...collect(c.id), c.id]);
      for (const id of collect(commentId)) await api(`/posts/comments/${id}`, { method: 'DELETE' });
      await api(`/posts/comments/${commentId}`, { method: 'DELETE' });
      if (state.replyTo[postId] && state.replyTo[postId].id === commentId) delete state.replyTo[postId];
      await loadComments(postId);
    } catch (err) {
      toast(err.message, 'error');
      loadComments(postId);
    }
  }

  // ------------------------------------------------------------------------
  // Stories
  // ------------------------------------------------------------------------
  function storyGroups() {
    const groups = new Map();
    state.stories.forEach((s) => {
      if (!groups.has(s.user_id)) groups.set(s.user_id, []);
      groups.get(s.user_id).push(s);
    });
    const seen = getSet('seenStories');
    const list = Array.from(groups, ([userId, stories]) => {
      stories.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return {
        userId,
        stories,
        allSeen: stories.every((s) => seen.has(s.id)),
        latest: stories[stories.length - 1].created_at,
      };
    });
    const mine = list.filter((g) => g.userId === state.me.id);
    const others = list.filter((g) => g.userId !== state.me.id)
      .sort((a, b) => (a.allSeen - b.allSeen) || (new Date(b.latest) - new Date(a.latest)));
    return [...mine, ...others];
  }

  async function loadStories() {
    const track = $('[data-role="stories"]');
    if (!track) return;
    try {
      state.stories = await api(`/stories/user/${state.me.id}`);
    } catch {
      state.stories = [];
    }
    renderStoriesTray();
  }

  function renderStoriesTray() {
    const track = $('[data-role="stories"]');
    if (!track) return;
    const groups = storyGroups();
    const mine = groups.find((g) => g.userId === state.me.id);
    const ownItem = mine
      ? `<button class="story" data-action="open-story" data-user="${state.me.id}">
           <span class="story-ring ${mine.allSeen ? 'seen' : ''}">${avatar(state.me)}
             <span class="story-plus" data-action="open-add-story" title="Add another"><i class="fa-solid fa-plus"></i></span></span>
           <span class="story-name">Your story</span></button>`
      : `<button class="story" data-action="open-add-story">
           <span class="story-ring none">${avatar(state.me)}<span class="story-plus"><i class="fa-solid fa-plus"></i></span></span>
           <span class="story-name">Add story</span></button>`;
    const others = groups.filter((g) => g.userId !== state.me.id).map((g) => `
      <button class="story" data-action="open-story" data-user="${g.userId}" title="${esc(nameOf(g.userId))}">
        <span class="story-ring ${g.allSeen ? 'seen' : ''}">${avatar(g.userId)}</span>
        <span class="story-name">${esc(nameOf(g.userId).split(' ')[0])}</span>
      </button>`).join('');
    track.innerHTML = ownItem + (others || `<div style="display:flex;align-items:center;color:var(--text-3);font-size:.84rem;padding:0 8px;">
      Stories from friends appear here for 24 hours.</div>`);
  }

  const viewer = { groups: [], g: 0, i: 0, start: 0, elapsed: 0, duration: STORY_MS, paused: false, raf: 0 };

  function openViewer(userId) {
    viewer.groups = storyGroups();
    viewer.g = Math.max(0, viewer.groups.findIndex((g) => g.userId === Number(userId)));
    const seen = getSet('seenStories');
    const firstUnseen = viewer.groups[viewer.g].stories.findIndex((s) => !seen.has(s.id));
    viewer.i = firstUnseen === -1 ? 0 : firstUnseen;
    openModal('storyViewer');
    showStory();
  }

  function showStory() {
    cancelAnimationFrame(viewer.raf);
    const group = viewer.groups[viewer.g];
    const story = group && group.stories[viewer.i];
    if (!story) { closeViewer(); return; }

    $('#storyBars').innerHTML = group.stories.map((_, idx) =>
      `<div class="story-bar"><span style="width:${idx < viewer.i ? 100 : 0}%"></span></div>`).join('');
    $('#storyAvatar').innerHTML = avatar(group.userId, 'sm');
    $('#storyWho').textContent = nameOf(group.userId);
    $('#storyWhen').textContent = `${timeAgo(story.created_at)} · expires ${timeAgo(story.expires_at)}`;
    $('#storyDelete').classList.toggle('hidden', group.userId !== state.me.id);
    $('#storyPause').innerHTML = '<i class="fa-solid fa-pause"></i>';

    viewer.duration = STORY_MS;
    viewer.elapsed = 0;
    viewer.paused = false;
    const media = $('#storyMedia');
    if (story.media_type === 'video') {
      media.innerHTML = `<video src="${esc(story.media_url)}" autoplay muted playsinline></video>`;
      const video = $('video', media);
      video.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(video.duration)) viewer.duration = Math.min(Math.max(video.duration * 1000, 3000), 30000);
      });
    } else {
      media.innerHTML = `<img src="${esc(story.media_url)}" alt="Story by ${esc(nameOf(group.userId))}"
        onerror="this.outerHTML='<div class=&quot;empty&quot; style=&quot;padding-top:45%&quot;>Media unavailable</div>'">`;
    }

    const seen = getSet('seenStories');
    seen.add(story.id);
    saveSet('seenStories', seen);

    viewer.start = performance.now();
    viewer.raf = requestAnimationFrame(tickStory);
  }

  function tickStory(now) {
    if (!viewer.paused) {
      const progress = Math.min(1, (viewer.elapsed + now - viewer.start) / viewer.duration);
      const bar = $$('#storyBars .story-bar span')[viewer.i];
      if (bar) bar.style.width = `${progress * 100}%`;
      if (progress >= 1) { nextStory(); return; }
    }
    viewer.raf = requestAnimationFrame(tickStory);
  }

  function nextStory() {
    const group = viewer.groups[viewer.g];
    if (group && viewer.i < group.stories.length - 1) viewer.i += 1;
    else if (viewer.g < viewer.groups.length - 1) { viewer.g += 1; viewer.i = 0; }
    else { closeViewer(); return; }
    showStory();
  }

  function prevStory() {
    if (viewer.i > 0) viewer.i -= 1;
    else if (viewer.g > 0) { viewer.g -= 1; viewer.i = viewer.groups[viewer.g].stories.length - 1; }
    showStory();
  }

  function togglePauseStory() {
    const video = $('#storyMedia video');
    if (viewer.paused) {
      viewer.start = performance.now();
      viewer.paused = false;
      if (video) video.play().catch(() => {});
    } else {
      viewer.elapsed += performance.now() - viewer.start;
      viewer.paused = true;
      if (video) video.pause();
    }
    $('#storyPause').innerHTML = `<i class="fa-solid fa-${viewer.paused ? 'play' : 'pause'}"></i>`;
  }

  function closeViewer() {
    cancelAnimationFrame(viewer.raf);
    $('#storyViewer').classList.remove('open');
    $('#storyMedia').innerHTML = '';
    if (!$('.modal.open')) document.body.style.overflow = '';
    renderStoriesTray();
  }

  async function deleteCurrentStory() {
    const group = viewer.groups[viewer.g];
    const story = group && group.stories[viewer.i];
    if (!story) return;
    const wasPaused = viewer.paused;
    if (!wasPaused) togglePauseStory();
    if (!confirm('Delete this story?')) { if (!wasPaused) togglePauseStory(); return; }
    try {
      await api(`/stories/${story.id}`, { method: 'DELETE' });
      state.stories = state.stories.filter((s) => s.id !== story.id);
      group.stories.splice(viewer.i, 1);
      toast('Story deleted', 'success');
      if (!group.stories.length) {
        viewer.groups.splice(viewer.g, 1);
        viewer.i = 0;
        if (viewer.g >= viewer.groups.length) { closeViewer(); return; }
      } else if (viewer.i >= group.stories.length) {
        viewer.i = group.stories.length - 1;
      }
      showStory();
    } catch (err) {
      toast(err.message, 'error');
      if (!wasPaused) togglePauseStory();
    }
  }

  function openAddStory() {
    $('#storyForm').reset();
    updateStoryPreview();
    openModal('storyModal');
    setTimeout(() => $('#storyUrl').focus(), 50);
  }

  function updateStoryPreview() {
    const url = $('#storyUrl').value.trim();
    const box = $('#storyPreview');
    const ok = isHttpUrl(url);
    box.classList.toggle('hidden', !ok);
    box.innerHTML = ok ? mediaPreviewHtml(url, $('#storyType').value) : '';
  }

  async function submitStory(e) {
    e.preventDefault();
    const url = $('#storyUrl').value.trim();
    if (!isHttpUrl(url)) { toast('Please enter a valid http(s) URL', 'error'); return; }
    const btn = $('#storySubmit');
    setBusy(btn, true);
    try {
      await api('/stories/', { method: 'POST', body: { user_id: state.me.id, media_url: url, media_type: $('#storyType').value } });
      toast('Story shared for 24 hours', 'success');
      closeModal($('#storyModal'));
      if (state.route.page === 'home') loadStories();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(btn, false);
    }
  }

  // ------------------------------------------------------------------------
  // Friends actions
  // ------------------------------------------------------------------------
  async function friendAction(action, uid, btn) {
    uid = Number(uid);
    const name = nameOf(uid);
    if (action === 'remove' && !confirm(`Remove ${name} from your friends?`)) return;
    setBusy(btn, true);
    try {
      if (action === 'add') {
        try {
          await api(`/users/${state.me.id}/friends/${uid}`, { method: 'POST' });
          toast(`Friend request sent to ${name}`, 'success');
        } catch (err) {
          if (err.status !== 400) throw err;
          toast(`A request between you and ${name} already exists`);
        }
        const sent = getSet('sent');
        sent.add(uid);
        saveSet('sent', sent);
      } else if (action === 'accept') {
        await api(`/users/${state.me.id}/friends/${uid}/accept`, { method: 'POST' });
        toast(`You and ${name} are now friends`, 'success');
      } else if (action === 'reject') {
        await api(`/users/${state.me.id}/friends/${uid}/reject`, { method: 'POST' });
        toast('Request declined');
      } else if (action === 'remove') {
        await api(`/users/${state.me.id}/friends/${uid}`, { method: 'DELETE' });
        toast(`Removed ${name} from friends`);
      }
    } catch (err) {
      setBusy(btn, false);
      toast(err.message, 'error');
      return;
    }
    await refreshSocial();
    const { page } = state.route;
    if (page === 'home') {
      if (action === 'accept' || action === 'remove') { loadFeed(); loadStories(); }
    } else if (page === 'explore') {
      renderExploreResults();
    } else if (page === 'friends' || page === 'profile') {
      route();
    }
  }

  // ------------------------------------------------------------------------
  // Explore
  // ------------------------------------------------------------------------
  let exploreResults = [];

  async function renderExplore() {
    $('#view').className = 'view wide';
    $('#view').innerHTML = `
      <div class="page-header"><div><h1>Explore people</h1><p>Find friends on Sociva and connect.</p></div></div>
      <div class="input-icon" style="margin-bottom:20px;">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input class="input" id="exploreSearch" type="search" placeholder="Search by name" value="${esc(state.exploreQuery)}" autocomplete="off">
      </div>
      <div class="people-grid" data-role="people">${Array.from({ length: 6 }, () => '<div class="card skeleton" style="height:200px"></div>').join('')}</div>`;
    try { setUsers(await api('/users/?limit=500')); renderAccountUI(); } catch { /* keep cached */ }
    await searchPeople(state.exploreQuery);
  }

  async function searchPeople(query) {
    state.exploreQuery = query;
    const q = query.trim();
    try {
      exploreResults = q ? await api(`/users/search?name=${encodeURIComponent(q)}`) : state.users;
    } catch (err) {
      toast(err.message, 'error');
      exploreResults = [];
    }
    renderExploreResults();
  }
  const debouncedSearch = debounce(searchPeople, 250);

  function renderExploreResults() {
    const grid = $('[data-role="people"]');
    if (!grid) return;
    const people = exploreResults.filter((u) => u.id !== state.me.id);
    if (!people.length) {
      grid.innerHTML = `<div style="grid-column:1/-1">${emptyState('fa-user-slash', 'No people found',
        state.exploreQuery ? `Nobody matches "${state.exploreQuery}".` : 'Invite your friends to join Sociva.')}</div>`;
      return;
    }
    grid.innerHTML = people.map((u) => `
      <div class="card person-card">
        <a href="#/profile/${u.id}">${avatar(u, 'lg')}</a>
        <div><a href="#/profile/${u.id}"><strong>${esc(u.name)}</strong></a></div>
        <small>${esc(handleOf(u))}</small>
        <div style="display:flex;gap:6px;width:100%;margin-top:auto;justify-content:center;flex-wrap:wrap;">${relationButtons(u.id)}</div>
      </div>`).join('');
  }

  // ------------------------------------------------------------------------
  // Friends page
  // ------------------------------------------------------------------------
  function renderFriends() {
    const sentIds = Array.from(getSet('sent'));
    const tabs = [
      ['requests', 'Requests', state.incoming.length],
      ['friends', 'Friends', state.friends.length],
      ['sent', 'Sent', sentIds.length],
    ];
    const tab = state.friendsTab;
    let body = '';

    if (tab === 'requests') {
      body = state.incoming.length
        ? `<div class="card">${state.incoming.map((u) => personRow(u, 'wants to be your friend')).join('')}</div>`
        : emptyState('fa-inbox', 'No pending requests', 'When someone adds you, it shows up here.');
    } else if (tab === 'friends') {
      body = state.friends.length
        ? `<div class="card">${state.friends.map((u) => personRow(u, handleOf(u))).join('')}</div>`
        : emptyState('fa-user-group', 'No friends yet', 'Friends see each other\'s posts and stories.',
          '<a class="btn btn-primary" href="#/explore">Explore people</a>');
    } else {
      const users = sentIds.map((id) => userOf(id)).filter(Boolean);
      body = users.length
        ? `<div class="card">${users.map((u) => personRow(u, 'Request pending')).join('')}</div>`
        : emptyState('fa-paper-plane', 'No sent requests', 'Requests you send from this device appear here.');
    }

    $('#view').className = 'view';
    $('#view').innerHTML = `
      <div class="page-header"><div><h1>Friends</h1><p>Manage your connections.</p></div>
        <a class="btn btn-secondary" href="#/explore"><i class="fa-solid fa-user-plus"></i> Find people</a></div>
      <div class="tabs" role="tablist">${tabs.map(([key, label, n]) => `
        <button class="tab ${tab === key ? 'active' : ''}" role="tab" aria-selected="${tab === key}" data-action="friends-tab" data-tab="${key}">
          ${label} <span class="count">${n}</span></button>`).join('')}</div>
      ${body}`;
  }

  function personRow(u, subtitle) {
    return `
      <div class="person-row">
        <a href="#/profile/${u.id}">${avatar(u)}</a>
        <div class="meta"><a href="#/profile/${u.id}"><strong>${esc(u.name)}</strong></a><small>${esc(subtitle)}</small></div>
        <div class="actions">${relationButtons(u.id)}</div>
      </div>`;
  }

  // ------------------------------------------------------------------------
  // Profile
  // ------------------------------------------------------------------------
  async function renderProfile(userId) {
    userId = Number(userId);
    const isMe = userId === state.me.id;
    $('#view').className = 'view wide';
    $('#view').innerHTML = `<div class="profile-head"><div class="skeleton" style="width:128px;height:128px;border-radius:50%"></div>
      <div style="flex:1"><div class="skeleton" style="width:40%;height:22px;margin-bottom:14px"></div><div class="skeleton" style="width:60%;height:14px"></div></div></div>`;

    let user = userOf(userId);
    let posts = [];
    let friendCount = 0;
    try {
      if (!user) user = await api(`/users/${userId}`);
      [posts, friendCount] = await Promise.all([
        api(`/posts/user/${userId}`),
        isMe ? Promise.resolve(state.friends.length) : api(`/users/${userId}/friends`).then((f) => f.length),
      ]);
    } catch (err) {
      $('#view').innerHTML = emptyState('fa-user-slash', 'Profile not found', err.status === 404 ? 'This account does not exist.' : err.message,
        '<a class="btn btn-primary" href="#/">Go home</a>');
      return;
    }
    if (state.route.page !== 'profile') return; // navigated away while loading
    posts.forEach((p) => state.postCache.set(p.id, p));

    const rel = relationship(userId);
    const canSee = rel === 'self' || rel === 'friend';
    const tab = isMe ? state.profileTab : 'posts';
    const actions = isMe
      ? `<button class="btn btn-secondary" data-action="open-edit-account"><i class="fa-solid fa-pen"></i> Edit profile</button>
         <button class="btn btn-primary" data-action="open-composer"><i class="fa-solid fa-plus"></i> New post</button>`
      : relationButtons(userId, { small: false });

    let content;
    if (tab === 'scheduled') {
      content = scheduledListHtml();
    } else if (!canSee) {
      content = `<div class="locked"><i class="fa-solid fa-lock"></i><h3>Posts are shared with friends</h3>
        <p>Become friends with ${esc(user.name.split(' ')[0])} to see their ${plural(posts.length, 'post')}.</p></div>`;
    } else if (!posts.length) {
      content = emptyState('fa-camera', isMe ? 'Share your first post' : 'No posts yet',
        isMe ? 'Posts you share will appear on your profile.' : `${user.name} hasn't posted anything yet.`,
        isMe ? '<button class="btn btn-primary" data-action="open-composer">Create post</button>' : '');
    } else {
      content = `<div class="post-grid">${posts.map(gridTile).join('')}</div>`;
    }

    $('#view').innerHTML = `
      <section class="profile-head">
        <div class="profile-avatar-ring">${avatar(user, 'xl')}</div>
        <div class="profile-info">
          <div class="profile-name-row"><h1>${esc(user.name)}</h1>${actions}</div>
          <div class="profile-stats">
            <span><strong>${posts.length}</strong>${posts.length === 1 ? 'post' : 'posts'}</span>
            <span><strong>${friendCount}</strong>${friendCount === 1 ? 'friend' : 'friends'}</span>
          </div>
          <div class="profile-handle">${esc(handleOf(user))} · ${esc(joinedText(user.created_at))}</div>
        </div>
      </section>
      ${isMe ? `<div class="tabs" role="tablist">
        <button class="tab ${tab === 'posts' ? 'active' : ''}" data-action="profile-tab" data-tab="posts"><i class="fa-solid fa-table-cells"></i> Posts</button>
        <button class="tab ${tab === 'scheduled' ? 'active' : ''}" data-action="profile-tab" data-tab="scheduled"><i class="fa-regular fa-calendar"></i> Scheduled</button>
      </div>` : '<div class="tabs"><span class="tab active"><i class="fa-solid fa-table-cells"></i> Posts</span></div>'}
      ${content}`;
  }

  function gridTile(p) {
    const overlay = `<div class="overlay"><span><i class="fa-solid fa-expand"></i> View</span>
      ${getSet('likes').has(p.id) ? '<span><i class="fa-solid fa-heart" style="color:var(--pink)"></i></span>' : ''}</div>`;
    if (p.media_url && p.media_type === 'video') {
      return `<div class="grid-tile" data-action="open-post" data-id="${p.id}"><video src="${esc(p.media_url)}" muted preload="metadata"></video>
        <i class="fa-solid fa-play type-icon"></i>${overlay}</div>`;
    }
    if (p.media_url) {
      return `<div class="grid-tile" data-action="open-post" data-id="${p.id}"><img src="${esc(p.media_url)}" alt="" loading="lazy">${overlay}</div>`;
    }
    return `<div class="grid-tile text" data-action="open-post" data-id="${p.id}"><p>${esc(p.content)}</p>${overlay}</div>`;
  }

  function scheduledListHtml() {
    const list = store.get(userKey('scheduled'), [])
      .slice()
      .sort((a, b) => new Date(b.schedule_at) - new Date(a.schedule_at));
    if (!list.length) {
      return emptyState('fa-calendar-plus', 'Nothing scheduled',
        'Use the calendar button in the composer to publish a post automatically later.',
        '<button class="btn btn-coral" data-action="open-composer">Schedule a post</button>');
    }
    const hasDone = list.some((s) => new Date(s.schedule_at) <= new Date());
    return `
      <p class="modal-hint" style="margin-bottom:14px;">Hasura delivers each post at its scheduled time — it then appears in your feed.
        ${hasDone ? '<button class="link" data-action="clear-delivered" style="margin-left:6px;">Clear delivered</button>' : ''}</p>
      <div class="card">${list.map((s) => {
        const done = new Date(s.schedule_at) <= new Date();
        return `<div class="schedule-item">
          <div class="schedule-icon ${done ? 'done' : 'pending'}"><i class="fa-solid ${done ? 'fa-check' : 'fa-hourglass-half'}"></i></div>
          <div style="flex:1;min-width:0">
            <p>${esc(s.content)}</p>
            <small>${esc(formatDateTime(s.schedule_at))} · ${timeAgo(s.schedule_at)}${s.media_url ? ' · <i class="fa-regular fa-image"></i> media' : ''}</small>
          </div>
          <span class="pill ${done ? 'done' : 'pending'}">${done ? 'Delivered' : 'Scheduled'}</span>
        </div>`;
      }).join('')}</div>`;
  }

  // ------------------------------------------------------------------------
  // Accounts
  // ------------------------------------------------------------------------
  function openAccountModal(mode) {
    state.accountMode = mode;
    const editing = mode === 'edit';
    $('#accountModalTitle').textContent = editing ? 'Edit profile' : 'Create account';
    $('#accountSubmit').textContent = editing ? 'Save changes' : 'Create account';
    $('#accountName').value = editing ? state.me.name : '';
    $('#accountHandle').value = editing ? state.me.clerk_user_id : '';
    openModal('accountModal');
    setTimeout(() => $('#accountName').focus(), 50);
  }

  async function submitAccount(e) {
    e.preventDefault();
    const name = $('#accountName').value.trim();
    const handle = $('#accountHandle').value.trim();
    if (!name) return;
    const btn = $('#accountSubmit');
    setBusy(btn, true);
    try {
      if (state.accountMode === 'edit') {
        const body = { name };
        if (handle && handle !== state.me.clerk_user_id) body.clerk_user_id = handle;
        const updated = await api(`/users/${state.me.id}`, { method: 'PUT', body });
        setUsers(state.users.map((u) => (u.id === updated.id ? updated : u)));
        state.me = updated;
        renderAccountUI();
        renderSuggestions();
        toast('Profile updated', 'success');
        closeModal($('#accountModal'));
        route();
      } else {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'user';
        const clerk = handle || `${slug}.${Math.random().toString(36).slice(2, 6)}`;
        const created = await api('/users/', { method: 'POST', body: { name, clerk_user_id: clerk } });
        setUsers([...state.users, created]);
        closeModal($('#accountModal'));
        if (!state.me) {
          state.me = created;
          localStorage.setItem('sociva:activeUser', String(created.id));
          renderAccountUI();
          await refreshSocial();
          route();
          setInterval(poll, POLL_MS);
          toast(`Welcome to Sociva, ${created.name}!`, 'success');
        } else {
          await switchUser(created.id);
        }
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(btn, false);
    }
  }

  // ------------------------------------------------------------------------
  // Events (delegated)
  // ------------------------------------------------------------------------
  const actions = {
    'open-composer': () => {
      if (state.route.page === 'home' && $('#view [data-composer]')) {
        const ta = $('#view [data-composer] textarea');
        ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ta.focus();
      } else {
        openComposerModal();
      }
    },
    'composer-toggle': (el) => toggleComposerSection(el),
    'composer-submit': (el) => submitComposer(el),
    'open-add-story': (el, e) => { e.stopPropagation(); openAddStory(); },
    'open-story': (el) => openViewer(el.dataset.user),
    'story-next': () => nextStory(),
    'story-prev': () => prevStory(),
    'story-close': () => closeViewer(),
    'story-pause': () => togglePauseStory(),
    'story-delete': () => deleteCurrentStory(),
    like: (el) => toggleLike(Number(el.dataset.id)),
    'media-like': (el, e) => {
      if (e.target.closest('video')) return;
      if (e.detail === 2) { toggleLike(Number(el.dataset.id), { forceOn: true }); burstHeart(el); }
    },
    save: (el) => toggleSave(Number(el.dataset.id)),
    share: (el) => sharePost(Number(el.dataset.id)),
    'toggle-comments': (el) => toggleComments(Number(el.dataset.id)),
    reply: (el) => startReply(el),
    'cancel-reply': (el) => { delete state.replyTo[Number(el.dataset.post)]; updatePostComments(Number(el.dataset.post)); },
    'delete-comment': (el) => deleteComment(el),
    'delete-post': (el) => deletePost(Number(el.dataset.id), el),
    'open-post': (el) => openPostModal(Number(el.dataset.id)),
    'load-new-posts': () => { window.scrollTo({ top: 0, behavior: 'smooth' }); loadFeed(); },
    'reload-feed': () => loadFeed(),
    'friend-add': (el) => friendAction('add', el.dataset.id, el),
    'friend-accept': (el) => friendAction('accept', el.dataset.id, el),
    'friend-reject': (el) => friendAction('reject', el.dataset.id, el),
    'friend-remove': (el) => friendAction('remove', el.dataset.id, el),
    'friends-tab': (el) => { state.friendsTab = el.dataset.tab; renderFriends(); },
    'profile-tab': (el) => { state.profileTab = el.dataset.tab; renderProfile(state.me.id); },
    'clear-delivered': () => {
      store.set(userKey('scheduled'), store.get(userKey('scheduled'), []).filter((s) => new Date(s.schedule_at) > new Date()));
      renderProfile(state.me.id);
    },
    'open-create-account': () => openAccountModal('create'),
    'open-edit-account': () => openAccountModal('edit'),
    'close-modal': (el) => closeModal(el.closest('.modal')),
  };

  function bindEvents() {
    document.addEventListener('click', (e) => {
      const modal = e.target.classList && e.target.classList.contains('modal') ? e.target : null;
      if (modal) { closeModal(modal); return; }
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      const handler = actions[el.dataset.action];
      if (handler) {
        if (el.tagName === 'BUTTON' || el.tagName === 'A') e.preventDefault();
        handler(el, e);
      }
    });

    document.addEventListener('input', (e) => {
      const t = e.target;
      const composer = t.closest('[data-composer]');
      if (composer) updateComposer(composer);
      if (t.form && t.form.dataset.form === 'comment') $('button[type="submit"]', t.form).disabled = !t.value.trim();
      if (t.id === 'exploreSearch') debouncedSearch(t.value);
      if (t.id === 'storyUrl' || t.id === 'storyType') updateStoryPreview();
    });

    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form.dataset.form === 'comment') { e.preventDefault(); submitComment(form); }
    });

    document.addEventListener('keydown', (e) => {
      if ($('#storyViewer').classList.contains('open')) {
        if (e.key === 'ArrowRight') nextStory();
        else if (e.key === 'ArrowLeft') prevStory();
        else if (e.key === 'Escape') closeViewer();
        else if (e.key === ' ') { e.preventDefault(); togglePauseStory(); }
        return;
      }
      if (e.key === 'Escape') {
        const open = $$('.modal.open');
        if (open.length) closeModal(open[open.length - 1]);
      }
      // Ctrl/Cmd + Enter submits the focused composer
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        const composer = document.activeElement && document.activeElement.closest('[data-composer]');
        if (composer) {
          const btn = $('[data-action="composer-submit"]', composer);
          if (!btn.disabled) submitComposer(btn);
        }
      }
    });

    $('#storyForm').addEventListener('submit', submitStory);
    $('#accountForm').addEventListener('submit', submitAccount);
    $('#accountSelect').addEventListener('change', (e) => switchUser(Number(e.target.value)));
    $('#accountSelectMobile').addEventListener('change', (e) => switchUser(Number(e.target.value)));
    window.addEventListener('hashchange', () => {
      $$('.modal.open').forEach((m) => closeModal(m));
      route();
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
