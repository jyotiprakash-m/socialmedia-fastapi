/**
 * Sociva Frontend Application Logic & API Integration
 * Integrates:
 * - User Switching & Profile
 * - Real-time Stories Tray & Fullscreen Story Viewer
 * - Timeline Feed (Personalized & Bidirectional)
 * - Immediate Post & One-Off Scheduled Post creation
 * - Nested Comments and Replies
 * - Social Graph: Search, Send Request, Accept, Reject, Unfriend
 */

// Global State
const state = {
  currentUser: null,       // { id: 3, name: 'Jyoti Prakash', clerk_user_id: '...' }
  allUsers: [],           // List of all registered users
  friends: [],            // Accepted mutual friends
  pendingRequests: [],    // Incoming pending requests
  stories: [],            // Active stories
  feedPosts: [],          // Timeline feed posts
  activeTab: 'feed',      // 'feed' | 'friends' | 'scheduled' | 'profile'
  likedPosts: new Set(),
  activeStoryIndex: 0,
  storyTimer: null
};

// API Base URL (relative path works for both local and Render deployments)
const API_BASE = window.location.origin;

// DOM Elements
const elements = {
  userSwitcherSelect: document.getElementById('userSwitcherSelect'),
  currentAvatarText: document.getElementById('currentAvatarText'),
  composerAvatarText: document.getElementById('composerAvatarText'),
  storiesContainer: document.getElementById('storiesContainer'),
  feedContainer: document.getElementById('feedContainer'),
  pendingBadge: document.getElementById('pendingBadge'),
  
  // Modals
  storyModal: document.getElementById('storyModal'),
  storyProgressBar: document.getElementById('storyProgressBar'),
  storyAuthorName: document.getElementById('storyAuthorName'),
  storyAuthorTime: document.getElementById('storyAuthorTime'),
  storyMediaContainer: document.getElementById('storyMediaContainer'),
  
  newStoryModal: document.getElementById('newStoryModal'),
  scheduleModal: document.getElementById('scheduleModal'),
  friendsModal: document.getElementById('friendsModal'),
  toastContainer: document.getElementById('toastContainer')
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupComposer();
  await loadInitialUsers();
});

// Load Users & Initialize current active user
async function loadInitialUsers() {
  try {
    const res = await fetch(`${API_BASE}/users/`);
    if (!res.ok) throw new Error('Failed to fetch users');
    state.allUsers = await res.json();

    if (state.allUsers.length === 0) {
      showToast('No users found in database. Create a user to start!', 'error');
      return;
    }

    // Populate user switcher dropdown
    elements.userSwitcherSelect.innerHTML = state.allUsers.map(u => 
      `<option value="${u.id}">${u.name} (ID: ${u.id})</option>`
    ).join('');

    // Select first user or user #3 if present
    const savedUserId = localStorage.getItem('sociva_active_user_id');
    const defaultUser = state.allUsers.find(u => u.id == savedUserId) || 
                        state.allUsers.find(u => u.id === 3) || 
                        state.allUsers[0];

    state.currentUser = defaultUser;
    elements.userSwitcherSelect.value = defaultUser.id;
    updateUserAvatarUI();

    // Listen for user switches
    elements.userSwitcherSelect.addEventListener('change', async (e) => {
      const selectedId = parseInt(e.target.value);
      state.currentUser = state.allUsers.find(u => u.id === selectedId);
      localStorage.setItem('sociva_active_user_id', selectedId);
      updateUserAvatarUI();
      showToast(`Switched active user to ${state.currentUser.name}`);
      await refreshAllData();
    });

    await refreshAllData();
  } catch (err) {
    console.error(err);
    showToast('Failed to connect to backend: ' + err.message, 'error');
  }
}

function updateUserAvatarUI() {
  if (!state.currentUser) return;
  const initials = state.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  elements.currentAvatarText.innerText = initials;
  elements.composerAvatarText.innerText = initials;
}

// Refresh Stories, Feed, and Friend Requests for Active User
async function refreshAllData() {
  if (!state.currentUser) return;
  await Promise.all([
    fetchStories(),
    fetchTimelineFeed(),
    fetchFriendsAndRequests()
  ]);
}

// ==========================================================================
// Stories Tray & Story Viewer
// ==========================================================================
async function fetchStories() {
  try {
    const res = await fetch(`${API_BASE}/stories/user/${state.currentUser.id}`);
    if (!res.ok) throw new Error('Failed to fetch stories');
    state.stories = await res.json();
    renderStoriesTray();
  } catch (err) {
    console.error('Error fetching stories:', err);
  }
}

function renderStoriesTray() {
  const container = elements.storiesContainer;
  const myInitials = state.currentUser ? state.currentUser.name[0].toUpperCase() : '+';

  let html = `
    <!-- Add Story Button -->
    <div class="story-item" onclick="openNewStoryModal()">
      <div class="story-ring story-add-btn">
        <div class="story-avatar">${myInitials}</div>
        <div class="story-add-badge"><i class="fas fa-plus"></i></div>
      </div>
      <span class="story-username">Add Story</span>
    </div>
  `;

  if (state.stories.length === 0) {
    html += `
      <div style="display: flex; align-items: center; color: var(--color-text-muted); font-size: 0.85rem; padding-left: 10px;">
        No active stories from friends yet.
      </div>
    `;
  } else {
    // Group stories by user
    const storiesByUser = {};
    state.stories.forEach(story => {
      if (!storiesByUser[story.user_id]) {
        storiesByUser[story.user_id] = [];
      }
      storiesByUser[story.user_id].push(story);
    });

    Object.keys(storiesByUser).forEach(userId => {
      const userStories = storiesByUser[userId];
      const storyAuthor = state.allUsers.find(u => u.id == userId);
      const authorName = storyAuthor ? storyAuthor.name : `User #${userId}`;
      const initials = authorName.split(' ').map(n => n[0]).join('').slice(0, 2);

      html += `
        <div class="story-item" onclick="viewStoriesForUser(${userId})">
          <div class="story-ring">
            <div class="story-avatar">${initials}</div>
          </div>
          <span class="story-username">${authorName}</span>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

// Fullscreen Story Viewer Logic
let activeViewingStories = [];
function viewStoriesForUser(userId) {
  activeViewingStories = state.stories.filter(s => s.user_id === userId);
  if (activeViewingStories.length === 0) return;

  state.activeStoryIndex = 0;
  displayCurrentStory();
  elements.storyModal.classList.add('active');
}

function displayCurrentStory() {
  if (state.storyTimer) clearInterval(state.storyTimer);

  const story = activeViewingStories[state.activeStoryIndex];
  if (!story) {
    closeStoryModal();
    return;
  }

  const author = state.allUsers.find(u => u.id === story.user_id);
  elements.storyAuthorName.innerText = author ? author.name : `User #${story.user_id}`;
  elements.storyAuthorTime.innerText = formatRelativeTime(story.created_at);

  if (story.media_type === 'video') {
    elements.storyMediaContainer.innerHTML = `<video src="${story.media_url}" autoplay playsinline class="story-viewer-img"></video>`;
  } else {
    elements.storyMediaContainer.innerHTML = `<img src="${story.media_url}" class="story-viewer-img" alt="Story">`;
  }

  // Progress Bar Animation (5 seconds per story)
  let progress = 0;
  elements.storyProgressBar.style.width = '0%';
  state.storyTimer = setInterval(() => {
    progress += 2;
    elements.storyProgressBar.style.width = `${progress}%`;
    if (progress >= 100) {
      clearInterval(state.storyTimer);
      state.activeStoryIndex++;
      if (state.activeStoryIndex < activeViewingStories.length) {
        displayCurrentStory();
      } else {
        closeStoryModal();
      }
    }
  }, 100);
}

function closeStoryModal() {
  if (state.storyTimer) clearInterval(state.storyTimer);
  elements.storyModal.classList.remove('active');
}

// Create New Story
function openNewStoryModal() {
  elements.newStoryModal.classList.add('active');
}
function closeNewStoryModal() {
  elements.newStoryModal.classList.remove('active');
}

async function handleCreateStory(e) {
  e.preventDefault();
  const mediaUrl = document.getElementById('storyMediaUrl').value.trim();
  const mediaType = document.getElementById('storyMediaType').value;

  if (!mediaUrl) {
    showToast('Please provide a media URL for the story', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/stories/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: state.currentUser.id,
        media_url: mediaUrl,
        media_type: mediaType
      })
    });
    if (!res.ok) throw new Error(await res.text());

    showToast('Story published! Active for 24 hours ⏳', 'success');
    closeNewStoryModal();
    document.getElementById('storyMediaUrl').value = '';
    await fetchStories();
  } catch (err) {
    showToast(`Error creating story: ${err.message}`, 'error');
  }
}

// ==========================================================================
// Timeline Feed & Posts
// ==========================================================================
async function fetchTimelineFeed() {
  elements.feedContainer.innerHTML = `
    <div style="text-align: center; padding: 40px; color: var(--color-text-muted);">
      <i class="fas fa-spinner fa-spin" style="font-size: 1.8rem; color: var(--color-pink); margin-bottom: 12px;"></i>
      <p>Loading your Sociva feed...</p>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/posts/timeline/${state.currentUser.id}`);
    if (!res.ok) throw new Error('Failed to load timeline feed');
    state.feedPosts = await res.json();
    renderTimelineFeed();
  } catch (err) {
    elements.feedContainer.innerHTML = `
      <div style="text-align: center; padding: 30px; color: #EF4444;">
        Failed to load feed: ${err.message}
      </div>
    `;
  }
}

function renderTimelineFeed() {
  if (state.feedPosts.length === 0) {
    elements.feedContainer.innerHTML = `
      <div class="post-card" style="padding: 40px 20px; text-align: center;">
        <i class="far fa-newspaper" style="font-size: 3rem; color: var(--color-magenta); margin-bottom: 14px;"></i>
        <h3 style="margin-bottom: 8px;">Your Feed is Empty</h3>
        <p style="color: var(--color-text-secondary); font-size: 0.95rem; margin-bottom: 18px;">
          Create your first post or add friends to see their updates right here!
        </p>
        <button class="btn-primary" style="margin: 0 auto;" onclick="openFriendsModal()">
          <i class="fas fa-user-plus"></i> Find & Add Friends
        </button>
      </div>
    `;
    return;
  }

  elements.feedContainer.innerHTML = state.feedPosts.map(post => {
    const author = state.allUsers.find(u => u.id === post.user_id);
    const authorName = author ? author.name : `User #${post.user_id}`;
    const initials = authorName.split(' ').map(n => n[0]).join('').slice(0, 2);
    const isLiked = state.likedPosts.has(post.id);
    const likeCount = isLiked ? 1 : 0;
    const isOwnPost = post.user_id === state.currentUser.id;

    let mediaHtml = '';
    if (post.media_url) {
      if (post.media_type === 'video') {
        mediaHtml = `
          <div class="post-media-container">
            <video src="${post.media_url}" controls class="post-media-video"></video>
          </div>
        `;
      } else {
        mediaHtml = `
          <div class="post-media-container">
            <img src="${post.media_url}" class="post-media-img" alt="Post media">
          </div>
        `;
      }
    }

    return `
      <article class="post-card" id="post-${post.id}">
        <!-- Post Header -->
        <div class="post-header">
          <div class="post-author">
            <div class="post-author-avatar">${initials}</div>
            <div class="post-author-info">
              <span class="post-author-name">${authorName}</span>
              <span class="post-time">${formatRelativeTime(post.created_at)}</span>
            </div>
          </div>
          ${isOwnPost ? `
            <button class="post-options-btn" title="Delete post" onclick="deletePost(${post.id})">
              <i class="far fa-trash-alt"></i>
            </button>
          ` : ''}
        </div>

        <!-- Post Text -->
        <div class="post-content">${escapeHtml(post.content)}</div>

        <!-- Post Media -->
        ${mediaHtml}

        <!-- Post Interaction Bar -->
        <div class="post-actions">
          <div class="post-action-group">
            <button class="action-btn like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLikePost(${post.id})">
              <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
              <span>${likeCount > 0 ? likeCount : ''}</span>
            </button>
            <button class="action-btn" onclick="toggleComments(${post.id})">
              <i class="far fa-comment"></i>
              <span id="comment-count-${post.id}"></span>
            </button>
            <button class="action-btn" onclick="sharePost(${post.id})">
              <i class="far fa-paper-plane"></i>
            </button>
          </div>
          <button class="action-btn" onclick="showToast('Post bookmarked!')">
            <i class="far fa-bookmark"></i>
          </button>
        </div>

        <!-- Post Comments Container -->
        <div class="post-comments-container" id="comments-box-${post.id}">
          <div class="comments-list" id="comments-list-${post.id}">
            <div style="font-size: 0.8rem; color: var(--color-text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading comments...</div>
          </div>

          <!-- Add Comment Input -->
          <div class="add-comment-bar">
            <input type="text" class="comment-input" id="input-comment-${post.id}" placeholder="Write a comment..." onkeydown="if(event.key==='Enter') submitComment(${post.id})">
            <button class="comment-submit-btn" onclick="submitComment(${post.id})">Post</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Load comments for each post
  state.feedPosts.forEach(post => loadCommentsForPost(post.id));
}

// ==========================================================================
// Post Composer (Immediate & Scheduled)
// ==========================================================================
function setupComposer() {
  const contentInput = document.getElementById('composerContent');
  const mediaToggle = document.getElementById('btnToggleMedia');
  const scheduleToggle = document.getElementById('btnToggleSchedule');
  const mediaExtras = document.getElementById('composerMediaExtras');
  const scheduleExtras = document.getElementById('composerScheduleExtras');
  const submitBtn = document.getElementById('btnPublishPost');

  mediaToggle.addEventListener('click', () => {
    mediaExtras.classList.toggle('visible');
    mediaToggle.classList.toggle('active');
  });

  scheduleToggle.addEventListener('click', () => {
    scheduleExtras.classList.toggle('visible');
    scheduleToggle.classList.toggle('active');
    if (scheduleExtras.classList.contains('visible')) {
      submitBtn.innerHTML = '<i class="far fa-calendar-alt"></i> Schedule Post';
      submitBtn.style.background = 'linear-gradient(135deg, #FF7043 0%, #C026D3 100%)';
    } else {
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post';
      submitBtn.style.background = 'var(--gradient-brand)';
    }
  });

  submitBtn.addEventListener('click', async () => {
    const content = contentInput.value.trim();
    if (!content) {
      showToast('Please type something to post', 'error');
      return;
    }

    const mediaUrl = document.getElementById('composerMediaUrl').value.trim() || null;
    const mediaType = document.getElementById('composerMediaType').value;
    const isScheduling = scheduleExtras.classList.contains('visible');

    if (isScheduling) {
      const scheduleTimeInput = document.getElementById('composerScheduleTime').value;
      if (!scheduleTimeInput) {
        showToast('Please pick a future date & time to schedule', 'error');
        return;
      }

      const scheduleDate = new Date(scheduleTimeInput);
      if (scheduleDate <= new Date()) {
        showToast('Scheduled time must be in the future', 'error');
        return;
      }

      try {
        submitBtn.disabled = true;
        const res = await fetch(`${API_BASE}/posts/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: state.currentUser.id,
            content: content,
            schedule_at: scheduleDate.toISOString(),
            media_url: mediaUrl,
            media_type: mediaType
          })
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        showToast(`Post scheduled for ${formatRelativeTime(data.schedule_at)} via Hasura! 🚀`, 'success');
        resetComposer();
      } catch (err) {
        showToast(`Failed to schedule post: ${err.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
      }
    } else {
      // Immediate Post Creation
      try {
        submitBtn.disabled = true;
        const res = await fetch(`${API_BASE}/posts/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: state.currentUser.id,
            content: content,
            media_url: mediaUrl,
            media_type: mediaType
          })
        });

        if (!res.ok) throw new Error(await res.text());
        showToast('Post published to Sociva feed! ✨', 'success');
        resetComposer();
        await fetchTimelineFeed();
      } catch (err) {
        showToast(`Failed to create post: ${err.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
      }
    }
  });
}

function resetComposer() {
  document.getElementById('composerContent').value = '';
  document.getElementById('composerMediaUrl').value = '';
  document.getElementById('composerScheduleTime').value = '';
  document.getElementById('composerMediaExtras').classList.remove('visible');
  document.getElementById('composerScheduleExtras').classList.remove('visible');
  document.getElementById('btnToggleMedia').classList.remove('active');
  document.getElementById('btnToggleSchedule').classList.remove('active');
  const submitBtn = document.getElementById('btnPublishPost');
  submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post';
  submitBtn.style.background = 'var(--gradient-brand)';
}

// Delete Post
async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this post?')) return;
  try {
    const res = await fetch(`${API_BASE}/posts/${postId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    showToast('Post deleted', 'success');
    const el = document.getElementById(`post-${postId}`);
    if (el) el.remove();
  } catch (err) {
    showToast('Failed to delete post: ' + err.message, 'error');
  }
}

// Toggle Like
function toggleLikePost(postId) {
  if (state.likedPosts.has(postId)) {
    state.likedPosts.delete(postId);
  } else {
    state.likedPosts.add(postId);
  }
  const postCard = document.getElementById(`post-${postId}`);
  if (postCard) {
    const btn = postCard.querySelector('.like-btn');
    const isLiked = state.likedPosts.has(postId);
    btn.className = `action-btn like-btn ${isLiked ? 'liked' : ''}`;
    btn.querySelector('i').className = `${isLiked ? 'fas' : 'far'} fa-heart`;
    btn.querySelector('span').innerText = isLiked ? '1' : '';
  }
}

function sharePost(postId) {
  navigator.clipboard.writeText(`${window.location.origin}/#post-${postId}`);
  showToast('Post link copied to clipboard!');
}

// ==========================================================================
// Comments & Nested Replies
// ==========================================================================
async function loadCommentsForPost(postId) {
  try {
    const res = await fetch(`${API_BASE}/posts/${postId}/comments`);
    if (!res.ok) return;
    const comments = await res.json();
    renderComments(postId, comments);
  } catch (err) {
    console.error(`Error loading comments for post ${postId}:`, err);
  }
}

function renderComments(postId, comments) {
  const container = document.getElementById(`comments-list-${postId}`);
  if (!container) return;

  const countBadge = document.getElementById(`comment-count-${postId}`);
  if (countBadge && comments.length > 0) {
    countBadge.innerText = comments.length;
  }

  if (comments.length === 0) {
    container.innerHTML = `<div style="font-size: 0.8rem; color: var(--color-text-muted);">No comments yet. Be the first to reply!</div>`;
    return;
  }

  // Filter root comments and replies
  const rootComments = comments.filter(c => !c.parent_comment_id);
  const replies = comments.filter(c => c.parent_comment_id);

  container.innerHTML = rootComments.map(comment => {
    const author = state.allUsers.find(u => u.id === comment.user_id);
    const authorName = author ? author.name : `User #${comment.user_id}`;
    const commentReplies = replies.filter(r => r.parent_comment_id === comment.id);

    return `
      <div class="comment-item" id="comment-${comment.id}">
        <div class="comment-bubble">
          <div class="comment-header">
            <span class="comment-user">${authorName}</span>
            <span class="comment-time">${formatRelativeTime(comment.created_at)}</span>
          </div>
          <div class="comment-body">${escapeHtml(comment.content)}</div>
          <button class="comment-reply-btn" onclick="promptReply(${postId}, ${comment.id}, '${authorName}')">
            <i class="fas fa-reply"></i> Reply
          </button>

          <!-- Nested Replies -->
          ${commentReplies.length > 0 ? `
            <div class="replies-container">
              ${commentReplies.map(reply => {
                const replyAuthor = state.allUsers.find(u => u.id === reply.user_id);
                const replyAuthorName = replyAuthor ? replyAuthor.name : `User #${reply.user_id}`;
                return `
                  <div class="comment-item" id="comment-${reply.id}">
                    <div class="comment-bubble">
                      <div class="comment-header">
                        <span class="comment-user">${replyAuthorName}</span>
                        <span class="comment-time">${formatRelativeTime(reply.created_at)}</span>
                      </div>
                      <div class="comment-body">${escapeHtml(reply.content)}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Add Root Comment
async function submitComment(postId) {
  const input = document.getElementById(`input-comment-${postId}`);
  const content = input.value.trim();
  if (!content) return;

  try {
    const res = await fetch(`${API_BASE}/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: state.currentUser.id,
        content: content
      })
    });
    if (!res.ok) throw new Error(await res.text());
    input.value = '';
    await loadCommentsForPost(postId);
  } catch (err) {
    showToast('Failed to add comment: ' + err.message, 'error');
  }
}

// Reply to a Comment
async function promptReply(postId, commentId, authorName) {
  const replyContent = prompt(`Reply to ${authorName}:`);
  if (!replyContent || !replyContent.trim()) return;

  try {
    const res = await fetch(`${API_BASE}/posts/comments/${commentId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: state.currentUser.id,
        content: replyContent.trim(),
        post_id: postId
      })
    });
    if (!res.ok) throw new Error(await res.text());
    showToast('Reply posted!', 'success');
    await loadCommentsForPost(postId);
  } catch (err) {
    showToast('Failed to post reply: ' + err.message, 'error');
  }
}

function toggleComments(postId) {
  const box = document.getElementById(`comments-box-${postId}`);
  if (box) {
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  }
}

// ==========================================================================
// Social Graph: Friends, Requests & Search Modal
// ==========================================================================
async function fetchFriendsAndRequests() {
  if (!state.currentUser) return;
  try {
    const [friendsRes, requestsRes] = await Promise.all([
      fetch(`${API_BASE}/users/${state.currentUser.id}/friends`),
      fetch(`${API_BASE}/users/${state.currentUser.id}/friends/pending`)
    ]);

    if (friendsRes.ok) state.friends = await friendsRes.json();
    if (requestsRes.ok) state.pendingRequests = await requestsRes.json();

    // Update pending badge
    if (state.pendingRequests.length > 0) {
      elements.pendingBadge.style.display = 'inline-block';
      elements.pendingBadge.innerText = state.pendingRequests.length;
    } else {
      elements.pendingBadge.style.display = 'none';
    }

    renderFriendsModal();
    renderRightSidebarSuggestions();
  } catch (err) {
    console.error('Error fetching friends:', err);
  }
}

function openFriendsModal() {
  elements.friendsModal.classList.add('active');
  renderFriendsModal();
}

function closeFriendsModal() {
  elements.friendsModal.classList.remove('active');
}

function renderFriendsModal() {
  const container = document.getElementById('friendsModalContent');
  if (!container) return;

  // Requests Section
  let requestsHtml = `
    <h4 style="color: var(--color-coral); margin-bottom: 12px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px;">
      <i class="fas fa-bell"></i> Pending Requests (${state.pendingRequests.length})
    </h4>
  `;

  if (state.pendingRequests.length === 0) {
    requestsHtml += `<p style="color: var(--color-text-muted); font-size: 0.88rem; margin-bottom: 20px;">No pending friend requests.</p>`;
  } else {
    requestsHtml += `
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
        ${state.pendingRequests.map(user => `
          <div style="display: flex; align-items: center; justify-content: space-between; background: #1C1C30; padding: 10px 14px; border-radius: var(--radius-md);">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="user-avatar-small">${user.name[0]}</div>
              <div>
                <div style="font-weight: 700; font-size: 0.9rem;">${user.name}</div>
                <div style="font-size: 0.75rem; color: var(--color-text-muted);">sent you a friend request</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="acceptFriendRequest(${user.id})">
                <i class="fas fa-check"></i> Accept
              </button>
              <button class="btn-secondary" style="padding: 6px 10px; font-size: 0.8rem;" onclick="rejectFriendRequest(${user.id})">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Accepted Friends Section
  let friendsHtml = `
    <h4 style="color: var(--color-magenta); margin-bottom: 12px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px;">
      <i class="fas fa-users"></i> Mutual Friends (${state.friends.length})
    </h4>
  `;

  if (state.friends.length === 0) {
    friendsHtml += `<p style="color: var(--color-text-muted); font-size: 0.88rem; margin-bottom: 20px;">You haven't added any friends yet.</p>`;
  } else {
    friendsHtml += `
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
        ${state.friends.map(friend => `
          <div style="display: flex; align-items: center; justify-content: space-between; background: #1C1C30; padding: 10px 14px; border-radius: var(--radius-md);">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="user-avatar-small">${friend.name[0]}</div>
              <div style="font-weight: 700; font-size: 0.9rem;">${friend.name}</div>
            </div>
            <button class="btn-secondary" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.3); font-size: 0.78rem;" onclick="removeFriend(${friend.id})">
              Unfriend
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Search & Discover Users
  let discoverHtml = `
    <h4 style="color: var(--color-violet); margin-bottom: 12px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px;">
      <i class="fas fa-search"></i> Discover People
    </h4>
    <div style="display: flex; gap: 8px; margin-bottom: 14px;">
      <input type="text" id="inputSearchUser" class="input-field" style="flex: 1;" placeholder="Search people by name..." oninput="handleSearchUsers(this.value)">
    </div>
    <div id="searchResultsList" style="display: flex; flex-direction: column; gap: 10px; max-height: 200px; overflow-y: auto;">
      ${renderDiscoveryList(state.allUsers)}
    </div>
  `;

  container.innerHTML = requestsHtml + friendsHtml + discoverHtml;
}

function renderDiscoveryList(users) {
  const friendIds = new Set(state.friends.map(f => f.id));
  const pendingSenderIds = new Set(state.pendingRequests.map(r => r.id));

  const eligible = users.filter(u => u.id !== state.currentUser.id && !friendIds.has(u.id));
  if (eligible.length === 0) {
    return `<div style="color: var(--color-text-muted); font-size: 0.85rem;">No other users found.</div>`;
  }

  return eligible.map(user => {
    const isPending = pendingSenderIds.has(user.id);
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; background: #161628; padding: 8px 12px; border-radius: var(--radius-sm);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="user-avatar-small" style="width: 30px; height: 30px; font-size: 0.8rem;">${user.name[0]}</div>
          <span style="font-size: 0.88rem; font-weight: 600;">${user.name}</span>
        </div>
        ${isPending ? `
          <button class="btn-primary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="acceptFriendRequest(${user.id})">Accept Request</button>
        ` : `
          <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="sendFriendRequest(${user.id})">
            <i class="fas fa-user-plus"></i> Add
          </button>
        `}
      </div>
    `;
  }).join('');
}

async function handleSearchUsers(query) {
  const list = document.getElementById('searchResultsList');
  if (!query.trim()) {
    list.innerHTML = renderDiscoveryList(state.allUsers);
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/users/search?name=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const users = await res.json();
    list.innerHTML = renderDiscoveryList(users);
  } catch (err) {
    console.error('Search error:', err);
  }
}

// Friend Actions
async function sendFriendRequest(targetUserId) {
  try {
    const res = await fetch(`${API_BASE}/users/${state.currentUser.id}/friends/${targetUserId}`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Could not send request');
    }
    showToast('Friend request sent! Hasura Event Trigger fired ⚡', 'success');
    await fetchFriendsAndRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function acceptFriendRequest(senderUserId) {
  try {
    const res = await fetch(`${API_BASE}/users/${state.currentUser.id}/friends/${senderUserId}/accept`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    showToast('Friend request accepted! Feed & stories synchronized 🎉', 'success');
    await refreshAllData();
  } catch (err) {
    showToast('Failed to accept: ' + err.message, 'error');
  }
}

async function rejectFriendRequest(senderUserId) {
  try {
    const res = await fetch(`${API_BASE}/users/${state.currentUser.id}/friends/${senderUserId}/reject`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    showToast('Friend request declined');
    await fetchFriendsAndRequests();
  } catch (err) {
    showToast('Failed to reject: ' + err.message, 'error');
  }
}

async function removeFriend(friendId) {
  if (!confirm('Remove this person from your friends list?')) return;
  try {
    const res = await fetch(`${API_BASE}/users/${state.currentUser.id}/friends/${friendId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    showToast('Friend removed');
    await refreshAllData();
  } catch (err) {
    showToast('Failed to remove friend: ' + err.message, 'error');
  }
}

// Right Sidebar Suggestions
function renderRightSidebarSuggestions() {
  const container = document.getElementById('sidebarSuggestions');
  if (!container) return;
  const friendIds = new Set(state.friends.map(f => f.id));
  const suggested = state.allUsers.filter(u => u.id !== state.currentUser.id && !friendIds.has(u.id)).slice(0, 4);

  if (suggested.length === 0) {
    container.innerHTML = `<div style="font-size: 0.85rem; color: var(--color-text-muted);">You are connected with everyone!</div>`;
    return;
  }

  container.innerHTML = suggested.map(user => `
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="user-avatar-small" style="width: 34px; height: 34px; font-size: 0.85rem;">${user.name[0]}</div>
        <div>
          <div style="font-weight: 700; font-size: 0.88rem;">${user.name}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted);">Suggested for you</div>
        </div>
      </div>
      <button class="btn-primary" style="padding: 4px 12px; font-size: 0.75rem;" onclick="sendFriendRequest(${user.id})">Follow</button>
    </div>
  `).join('');
}

// Navigation Tabs
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      const action = item.getAttribute('data-action');
      if (action === 'feed') {
        refreshAllData();
      } else if (action === 'friends') {
        openFriendsModal();
      } else if (action === 'story') {
        openNewStoryModal();
      }
    });
  });
}

// Utilities
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
    <span>${message}</span>
  `;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}
