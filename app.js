const STORAGE_KEY = "paper-workspace-v3";
const PROJECT_ROW_ID_KEY = "paper-project-row-id";

const state = {
  meta: {
    paperTitle: "",
    targetWords: ""
  },
  todos: [],
  chapters: [],
  activeChapter: 0,
  feedback: [],
  literature: [],
  activeLiterature: 0
};

let supabaseClient = null;
let currentUser = null;
let cloudSaveTimer = null;

const $ = (id) => document.getElementById(id);

function initSupabase() {
  if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase) {
    supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
}

async function load() {
  initSupabase();
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("paper-writing-assistant-v2") || localStorage.getItem("paper-writing-assistant-v1");
  if (saved) migrateAndAssign(JSON.parse(saved));
  hydrateFields();
  bindEvents();
  renderAll();
  await refreshAuth();
}

function migrateAndAssign(data) {
  if (data.meta || data.todos || data.feedback) {
    Object.assign(state, data);
    return;
  }
  state.meta.paperTitle = data.project?.title || "";
  state.meta.targetWords = data.project?.wordTarget || "";
  state.chapters = (data.chapters || []).map(c => ({
    title: c.title || "未命名章节",
    status: c.status === "进行中" ? "写作中" : (c.status || "未开始"),
    content: c.content || "",
    notes: c.notes || ""
  }));
  state.literature = (data.literature || []).map(l => ({
    reference: [l.authors, l.title, l.year].filter(Boolean).join(". ") || l.title || "未命名文献",
    link: l.link || "",
    notes: l.summary || "",
    quote: l.quote || "",
    chapter: l.chapter || ""
  }));
}

function hydrateFields() {
  $("paperTitle").value = state.meta.paperTitle || "";
  $("targetWords").value = state.meta.targetWords || "";
}

function collectMeta() {
  state.meta.paperTitle = $("paperTitle").value.trim();
  state.meta.targetWords = $("targetWords").value;
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => navTo(btn.dataset.section)));
  ["paperTitle", "targetWords"].forEach(id => $(id).addEventListener("input", () => save(false)));

  $("saveBtn").addEventListener("click", () => save(true));
  $("exportBtn").addEventListener("click", exportMarkdown);
  $("authOpenBtn").addEventListener("click", () => navTo("account"));
  $("saveCloudBtnTop").addEventListener("click", () => saveToCloud(true));

  $("addTodoBtn").addEventListener("click", addTodo);
  $("addChapterBtn").addEventListener("click", addChapter);
  $("saveChapterBtn").addEventListener("click", saveActiveChapter);
  $("deleteChapterBtn").addEventListener("click", deleteActiveChapter);
  $("chapterContent").addEventListener("input", updateChapterWordCount);

  $("addFeedbackBtn").addEventListener("click", addFeedback);
  $("addLitBtn").addEventListener("click", addLiterature);
  $("saveLitBtn").addEventListener("click", saveActiveLiterature);
  $("deleteLitBtn").addEventListener("click", deleteActiveLiterature);

  $("signUpBtn").addEventListener("click", signUp);
  $("signInBtn").addEventListener("click", signIn);
  $("signOutBtn").addEventListener("click", signOut);
  $("loadCloudBtn").addEventListener("click", () => loadFromCloud(true));
  $("saveCloudBtn").addEventListener("click", () => saveToCloud(true));
}

function navTo(sectionId) {
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.section === sectionId));
  document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("active", panel.id === sectionId));
  if (sectionId === "dashboard") renderDashboard();
}

function save(show = true, sync = true) {
  collectMeta();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (show) toast(currentUser ? "已保存，稍后同步云端" : "已保存到本地");
  renderDashboard();
  if (sync) scheduleCloudSave();
}

function scheduleCloudSave() {
  if (!currentUser || !supabaseClient) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => saveToCloud(false), 1200);
}

function renderAll() {
  renderDashboard();
  renderChapters();
  renderFeedback();
  renderLiterature();
}

function renderDashboard() {
  collectMeta();
  const currentWords = state.chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0);
  const targetWords = Number(state.meta.targetWords || 0);
  const completedTodos = state.todos.filter(todo => todo.status === "已完成").length;
  const completedChapters = state.chapters.filter(chapter => chapter.status === "已完成").length;
  $("dashboardStats").innerHTML = `
    <div class="stat-card"><strong>${currentWords}</strong><span>当前总字数</span></div>
    <div class="stat-card"><strong>${targetWords || 0}</strong><span>目标字数</span></div>
    <div class="stat-card"><strong>${targetWords ? Math.min(100, Math.round(currentWords / targetWords * 100)) : 0}%</strong><span>字数完成度</span></div>
    <div class="stat-card"><strong>${completedChapters}/${state.chapters.length}</strong><span>章节完成</span></div>
    <div class="stat-card"><strong>${completedTodos}/${state.todos.length}</strong><span>待办完成</span></div>
    <div class="stat-card"><strong>${state.feedback.filter(f => f.status !== "已处理").length}</strong><span>未处理导师意见</span></div>
  `;
  renderTodos();
}

function addTodo() {
  const text = $("todoText").value.trim();
  if (!text) return toast("请填写待办内容");
  state.todos.unshift({
    text,
    due: $("todoDue").value,
    status: $("todoStatus").value
  });
  ["todoText", "todoDue"].forEach(id => $(id).value = "");
  $("todoStatus").value = "未开始";
  renderTodos();
  save(false);
  toast("已添加待办");
}

function renderTodos() {
  $("todoList").innerHTML = state.todos.map((todo, index) => `
    <article class="list-item ${todo.status === "已完成" ? "done" : ""}">
      <div class="item-main">
        <h3>${escapeHtml(todo.text)}</h3>
        <div class="meta">${escapeHtml(todo.status)}${todo.due ? ` · 截止：${escapeHtml(todo.due)}` : ""}</div>
      </div>
      <div class="item-actions">
        <button class="btn secondary" onclick="cycleTodo(${index})">切换状态</button>
        <button class="btn secondary danger" onclick="removeTodo(${index})">删除</button>
      </div>
    </article>
  `).join("") || "<p class='review-box'>暂无待办事项。</p>";
}

window.cycleTodo = function(index) {
  const order = ["未开始", "进行中", "已完成"];
  const todo = state.todos[index];
  todo.status = order[(order.indexOf(todo.status) + 1) % order.length];
  renderDashboard();
  save(false);
};

window.removeTodo = function(index) {
  state.todos.splice(index, 1);
  renderDashboard();
  save(false);
};

function addChapter() {
  const next = state.chapters.length + 1;
  state.chapters.push({ title: `第${next}章 未命名章节`, status: "未开始", content: "", notes: "" });
  state.activeChapter = state.chapters.length - 1;
  renderChapters();
  save(false);
}

function renderChapters() {
  const list = $("chapterList");
  if (!state.chapters.length) {
    list.innerHTML = "<p class='review-box'>暂无章节，点击“添加章节”开始。</p>";
    fillChapterEditor(null);
    return;
  }
  list.innerHTML = state.chapters.map((chapter, index) => `
    <button class="chapter-tab ${index === state.activeChapter ? "active" : ""}" data-index="${index}">
      ${escapeHtml(chapter.title)}<br>
      <small>${escapeHtml(chapter.status)} · ${countWords(chapter.content)} 字</small>
    </button>
  `).join("");
  list.querySelectorAll(".chapter-tab").forEach(btn => btn.addEventListener("click", () => {
    state.activeChapter = Number(btn.dataset.index);
    renderChapters();
  }));
  fillChapterEditor(state.chapters[state.activeChapter]);
}

function fillChapterEditor(chapter) {
  $("chapterTitle").value = chapter?.title || "";
  $("chapterStatus").value = chapter?.status || "未开始";
  $("chapterContent").value = chapter?.content || "";
  $("chapterNotes").value = chapter?.notes || "";
  updateChapterWordCount();
}

function updateChapterWordCount() {
  $("chapterWordCount").textContent = countWords($("chapterContent").value || "");
}

function saveActiveChapter() {
  if (!state.chapters.length) return toast("请先添加章节");
  const chapter = state.chapters[state.activeChapter];
  chapter.title = $("chapterTitle").value.trim() || "未命名章节";
  chapter.status = $("chapterStatus").value;
  chapter.content = $("chapterContent").value;
  chapter.notes = $("chapterNotes").value;
  renderChapters();
  save(true);
}

function deleteActiveChapter() {
  if (!state.chapters.length) return;
  if (!confirm("确定删除当前章节吗？正文和备注也会删除。")) return;
  state.chapters.splice(state.activeChapter, 1);
  state.activeChapter = Math.max(0, state.activeChapter - 1);
  renderChapters();
  save(false);
  toast("已删除章节");
}

function addFeedback() {
  const text = $("feedbackText").value.trim();
  if (!text) return toast("请填写反馈内容");
  state.feedback.unshift({
    chapter: $("feedbackChapter").value.trim(),
    status: $("feedbackStatus").value,
    text,
    record: $("feedbackRecord").value.trim(),
    createdAt: new Date().toLocaleDateString()
  });
  ["feedbackChapter", "feedbackText", "feedbackRecord"].forEach(id => $(id).value = "");
  $("feedbackStatus").value = "未处理";
  renderFeedback();
  save(false);
  toast("已添加导师意见");
}

function renderFeedback() {
  $("feedbackList").innerHTML = state.feedback.map((item, index) => `
    <article class="list-item">
      <h3>${escapeHtml(item.chapter || "未指定章节")}</h3>
      <div class="meta">${escapeHtml(item.status)} · ${escapeHtml(item.createdAt || "")}</div>
      <p><strong>反馈内容：</strong>${escapeHtml(item.text)}</p>
      <p><strong>处理记录：</strong>${escapeHtml(item.record || "暂无")}</p>
      <div class="item-actions">
        <button class="btn secondary" onclick="cycleFeedback(${index})">切换状态</button>
        <button class="btn secondary danger" onclick="removeFeedback(${index})">删除</button>
      </div>
    </article>
  `).join("") || "<p class='review-box'>暂无导师意见。</p>";
}

window.cycleFeedback = function(index) {
  const order = ["未处理", "处理中", "已处理"];
  const item = state.feedback[index];
  item.status = order[(order.indexOf(item.status) + 1) % order.length];
  renderFeedback();
  save(false);
};

window.removeFeedback = function(index) {
  state.feedback.splice(index, 1);
  renderFeedback();
  save(false);
};

function addLiterature() {
  state.literature.unshift({
    reference: "未命名文献",
    link: "",
    notes: "",
    quote: "",
    chapter: ""
  });
  state.activeLiterature = 0;
  renderLiterature();
  save(false);
  toast("已新建文献，请在右侧填写详情");
}

function renderLiterature() {
  const list = $("litList");
  if (typeof state.activeLiterature !== "number") state.activeLiterature = 0;
  if (!state.literature.length) {
    list.innerHTML = "<p class='review-box'>暂无文献，点击“添加文献”开始。</p>";
    fillLiteratureEditor(null);
    return;
  }
  if (state.activeLiterature >= state.literature.length) state.activeLiterature = state.literature.length - 1;
  list.innerHTML = state.literature.map((item, index) => `
    <button class="literature-tab ${index === state.activeLiterature ? "active" : ""}" data-index="${index}">
      ${escapeHtml(shortText(item.reference || "未命名文献", 42))}<br>
      <small>${escapeHtml(item.chapter || "未指定章节")}</small>
    </button>
  `).join("");
  list.querySelectorAll(".literature-tab").forEach(btn => btn.addEventListener("click", () => {
    state.activeLiterature = Number(btn.dataset.index);
    renderLiterature();
  }));
  fillLiteratureEditor(state.literature[state.activeLiterature]);
}

function fillLiteratureEditor(item) {
  $("litReference").value = item?.reference || "";
  $("litLink").value = item?.link || "";
  $("litNotes").value = item?.notes || "";
  $("litQuote").value = item?.quote || "";
  $("litChapter").value = item?.chapter || "";
}

function saveActiveLiterature() {
  if (!state.literature.length) addLiterature();
  const item = state.literature[state.activeLiterature];
  item.reference = $("litReference").value.trim() || "未命名文献";
  item.link = $("litLink").value.trim();
  item.notes = $("litNotes").value.trim();
  item.quote = $("litQuote").value.trim();
  item.chapter = $("litChapter").value.trim();
  renderLiterature();
  save(true);
}

function deleteActiveLiterature() {
  if (!state.literature.length) return;
  if (!confirm("确定删除当前文献吗？")) return;
  state.literature.splice(state.activeLiterature, 1);
  state.activeLiterature = Math.max(0, state.activeLiterature - 1);
  renderLiterature();
  save(false);
  toast("已删除文献");
}

function exportMarkdown() {
  save(false, false);
  const md = buildMarkdown();
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.meta.paperTitle || "论文管理记录"}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildMarkdown() {
  const currentWords = state.chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0);
  return `# ${state.meta.paperTitle || "论文管理记录"}

## 论文总控台

- 当前总字数：${currentWords}
- 目标字数：${state.meta.targetWords || "未设置"}

### 待办事项

${state.todos.map(todo => `- [${todo.status === "已完成" ? "x" : " "}] ${todo.text}${todo.due ? `（截止：${todo.due}）` : ""} - ${todo.status}`).join("\n") || "暂无"}

## 章节写作管理

${state.chapters.map(chapter => `### ${chapter.title}

- 状态：${chapter.status}
- 当前字数：${countWords(chapter.content)}

#### 章节正文

${chapter.content || "暂无"}

#### 修改备注

${chapter.notes || "暂无"}`).join("\n\n") || "暂无章节"}

## 导师意见追踪

${state.feedback.map(item => `### ${item.chapter || "未指定章节"}

- 状态：${item.status}
- 日期：${item.createdAt || ""}

**反馈内容：** ${item.text}

**处理记录：** ${item.record || "暂无"}`).join("\n\n") || "暂无导师意见"}

## 文献资料库

${state.literature.map(item => `### ${item.reference}

- 对应章节：${item.chapter || "未指定"}
- 来源链接：${item.link || "暂无"}

**摘要/笔记：** ${item.notes || "暂无"}

**可引用观点：** ${item.quote || "暂无"}`).join("\n\n") || "暂无文献"}
`;
}

async function refreshAuth() {
  const cloudStatus = $("cloudStatus");
  const authInfo = $("authInfo");
  if (!supabaseClient) {
    cloudStatus.textContent = "未配置云端";
    cloudStatus.className = "cloud-status offline";
    authInfo.textContent = "还没有配置 Supabase。请先填写 config.js 中的 SUPABASE_URL 和 SUPABASE_ANON_KEY。";
    return;
  }
  const { data } = await supabaseClient.auth.getUser();
  currentUser = data.user;
  if (currentUser) {
    cloudStatus.textContent = `已登录：${currentUser.email}`;
    cloudStatus.className = "cloud-status online";
    authInfo.textContent = `当前账号：${currentUser.email}\n数据可保存到云端，换设备登录同一账号后点击“从云端加载”。`;
  } else {
    cloudStatus.textContent = "未登录";
    cloudStatus.className = "cloud-status offline";
    authInfo.textContent = "未登录。注册或登录后，可以把论文管理数据保存到云数据库。";
  }
}

async function signUp() {
  if (!ensureConfigured()) return;
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) return toast("请填写邮箱和密码");
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return toast(error.message);
  toast("注册成功，如需邮箱验证请去邮箱点击验证链接");
  await refreshAuth();
}

async function signIn() {
  if (!ensureConfigured()) return;
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) return toast("请填写邮箱和密码");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);
  await refreshAuth();
  await loadFromCloud(false);
  toast("登录成功");
}

async function signOut() {
  if (!ensureConfigured()) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  await refreshAuth();
  toast("已退出登录");
}

function ensureConfigured() {
  if (!supabaseClient) {
    toast("请先配置 Supabase");
    navTo("account");
    return false;
  }
  return true;
}

function ensureSupabase() {
  if (!ensureConfigured()) return false;
  if (!currentUser) {
    toast("请先登录");
    navTo("account");
    return false;
  }
  return true;
}

async function saveToCloud(show = true) {
  if (!ensureSupabase()) return;
  collectMeta();
  const title = state.meta.paperTitle || "未命名论文";
  let rowId = localStorage.getItem(PROJECT_ROW_ID_KEY);
  const payload = {
    user_id: currentUser.id,
    title,
    data: JSON.parse(JSON.stringify(state)),
    updated_at: new Date().toISOString()
  };
  let result;
  if (rowId) {
    result = await supabaseClient.from("paper_projects").update(payload).eq("id", rowId).eq("user_id", currentUser.id).select("id").single();
  } else {
    result = await supabaseClient.from("paper_projects").insert(payload).select("id").single();
  }
  if (result.error) return toast(result.error.message);
  localStorage.setItem(PROJECT_ROW_ID_KEY, result.data.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (show) toast("已保存到云端");
}

async function loadFromCloud(show = true) {
  if (!ensureSupabase()) return;
  const { data, error } = await supabaseClient
    .from("paper_projects")
    .select("id,title,data,updated_at")
    .eq("user_id", currentUser.id)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) return toast(error.message);
  if (!data.length) {
    if (show) toast("云端还没有项目，先保存一次");
    return;
  }
  localStorage.setItem(PROJECT_ROW_ID_KEY, data[0].id);
  migrateAndAssign(data[0].data);
  hydrateFields();
  renderAll();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (show) toast("已从云端加载最新项目");
}

function shortText(text = "", max = 40) {
  const value = String(text).trim();
  return value.length > max ? value.slice(0, max) + "…" : value;
}

function countWords(text = "") {
  const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  return cn + en;
}

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1800);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

load();
