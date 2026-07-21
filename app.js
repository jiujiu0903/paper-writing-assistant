const STORAGE_KEY = "paper-writing-assistant-v2";
const PROJECT_ROW_ID_KEY = "paper-writing-assistant-project-row-id";

const state = {
  project: {},
  proposal: "",
  proposalAnalysis: {},
  outline: "",
  chapters: [],
  activeChapter: 0,
  literature: []
};

let supabaseClient = null;
let currentUser = null;
let cloudSaveTimer = null;

const $ = (id) => document.getElementById(id);
const fields = ["title", "major", "paperType", "wordTarget", "deadline", "formatRules", "advisorNotes"];

function initSupabase() {
  if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase) {
    supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
}

async function load() {
  initSupabase();
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("paper-writing-assistant-v1");
  if (saved) Object.assign(state, JSON.parse(saved));
  hydrateFields();
  renderAll();
  await refreshAuth();
}

function hydrateFields() {
  fields.forEach(id => { if ($(id)) $(id).value = state.project[id] || ""; });
  $("proposalText").value = state.proposal || "";
  $("outlineText").value = state.outline || "";
}

function collectFields() {
  fields.forEach(id => state.project[id] = $(id)?.value || "");
  state.proposal = $("proposalText")?.value || "";
  state.outline = $("outlineText")?.value || "";
}

function save(show = true, sync = true) {
  collectFields();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (show) toast(currentUser ? "已保存到本地，稍后同步云端" : "已保存到浏览器本地");
  if (sync) scheduleCloudSave();
}

function scheduleCloudSave() {
  if (!currentUser || !supabaseClient) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => saveToCloud(false), 1000);
}

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1800);
}

function navTo(sectionId) {
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.section === sectionId));
  document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("active", panel.id === sectionId));
  if (sectionId === "progress") renderProgress();
}

function renderAll() {
  renderProposalCards();
  renderChapters();
  renderLiterature();
  renderProgress();
}

document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => navTo(btn.dataset.section)));
fields.forEach(id => $(id)?.addEventListener("input", () => save(false)));
$("proposalText").addEventListener("input", () => save(false));
$("outlineText").addEventListener("input", () => save(false));
$("saveBtn").addEventListener("click", () => save(true));
$("syncCloudBtn").addEventListener("click", () => saveToCloud(true));
$("authOpenBtn").addEventListener("click", () => navTo("account"));

function pickSentences(text, keywords, fallback) {
  const sentences = text.replace(/\n+/g, " ").split(/[。！？；;.!?]/).map(s => s.trim()).filter(Boolean);
  const found = sentences.filter(s => keywords.some(k => s.includes(k))).slice(0, 3);
  return found.length ? found.join("。") + "。" : fallback;
}

$("analyzeProposalBtn").addEventListener("click", () => {
  const text = $("proposalText").value.trim();
  if (!text) return toast("请先粘贴开题报告");
  state.proposalAnalysis = {
    background: pickSentences(text, ["背景", "现状", "发展", "问题"], "待补充：研究背景与现实问题。"),
    significance: pickSentences(text, ["意义", "价值", "作用", "贡献"], "待补充：理论意义与实践意义。"),
    question: pickSentences(text, ["问题", "目标", "目的", "研究内容"], "待补充：核心研究问题与研究目标。"),
    method: pickSentences(text, ["方法", "问卷", "访谈", "实验", "案例", "模型", "数据"], "待补充：研究方法、数据来源与分析路径。"),
    innovation: pickSentences(text, ["创新", "特色", "不足", "改进"], "待补充：创新点、特色或预期贡献。")
  };
  renderProposalCards();
  save(false);
  toast("已完成初步解析");
});

function renderProposalCards() {
  const map = { background: "研究背景", significance: "研究意义", question: "研究问题", method: "研究方法", innovation: "创新点" };
  const html = Object.entries(map).map(([key, title]) => `
    <article class="card"><h3>${title}</h3><p>${escapeHtml(state.proposalAnalysis[key] || "暂无内容，点击解析开题报告后生成。")}</p></article>
  `).join("");
  $("proposalCards").innerHTML = html;
}

$("generateOutlineBtn").addEventListener("click", () => {
  const title = state.project.title || $("title").value || "你的论文题目";
  const outline = [
    `论文题目：${title}`,
    "",
    "第一章 绪论",
    "1.1 研究背景",
    "1.2 研究意义",
    "1.3 国内外研究现状",
    "1.4 研究内容与研究方法",
    "1.5 研究思路与技术路线",
    "",
    "第二章 文献综述与理论基础",
    "2.1 核心概念界定",
    "2.2 相关理论基础",
    "2.3 既有研究评述",
    "",
    "第三章 研究设计",
    "3.1 研究对象与样本说明",
    "3.2 数据来源与收集方法",
    "3.3 指标设计与分析方法",
    "",
    "第四章 研究结果与分析",
    "4.1 数据描述与基本情况",
    "4.2 主要问题分析",
    "4.3 影响因素或机制分析",
    "",
    "第五章 对策建议",
    "5.1 研究发现总结",
    "5.2 对策与优化建议",
    "5.3 实施保障",
    "",
    "第六章 结论与展望",
    "6.1 研究结论",
    "6.2 研究不足",
    "6.3 未来展望",
    "",
    "参考文献",
    "致谢"
  ].join("\n");
  $("outlineText").value = outline;
  state.outline = outline;
  save(false);
  toast("已生成通用论文大纲");
});

$("syncChaptersBtn").addEventListener("click", syncChaptersFromOutline);

function syncChaptersFromOutline() {
  const lines = $("outlineText").value.split("\n").map(s => s.trim()).filter(Boolean);
  const chapterLines = lines.filter(line => /^(第[一二三四五六七八九十]+章|\d+(\.\d+)*\s+)/.test(line));
  if (!chapterLines.length) return toast("大纲里没有识别到章节");
  state.chapters = chapterLines.map(title => {
    const old = state.chapters.find(c => c.title === title);
    return old || { title, content: "", status: "未开始" };
  });
  state.activeChapter = 0;
  renderChapters();
  save(false);
  toast("已同步到分章写作");
}

function renderChapters() {
  const list = $("chapterList");
  if (!state.chapters.length) {
    list.innerHTML = `<button class="chapter-tab active">暂无章节，请先同步大纲</button>`;
    $("chapterTitle").value = "";
    $("chapterContent").value = "";
    return;
  }
  list.innerHTML = state.chapters.map((c, i) => `<button class="chapter-tab ${i === state.activeChapter ? "active" : ""}" data-index="${i}">${escapeHtml(c.title)}<br><small>${countWords(c.content)} 字</small></button>`).join("");
  list.querySelectorAll(".chapter-tab").forEach(btn => btn.addEventListener("click", () => {
    state.activeChapter = Number(btn.dataset.index);
    renderChapters();
  }));
  const chapter = state.chapters[state.activeChapter];
  $("chapterTitle").value = chapter.title;
  $("chapterContent").value = chapter.content;
}

function currentChapter() {
  if (!state.chapters.length) syncChaptersFromOutline();
  return state.chapters[state.activeChapter];
}

$("saveChapterBtn").addEventListener("click", () => {
  const c = currentChapter();
  if (!c) return toast("请先创建章节");
  c.title = $("chapterTitle").value.trim();
  c.content = $("chapterContent").value.trim();
  c.status = c.content ? "进行中" : "未开始";
  renderChapters();
  save(true);
});

document.querySelectorAll("[data-ai]").forEach(btn => btn.addEventListener("click", () => generateText(btn.dataset.ai)));

function generateText(mode) {
  const c = currentChapter();
  if (!c) return;
  const title = $("chapterTitle").value.trim() || c.title;
  const analysis = state.proposalAnalysis;
  const base = $("chapterContent").value.trim();
  let text = "";
  if (mode === "draft") {
    text = `【${title}】\n\n本节围绕“${state.project.title || "本研究主题"}”展开论述。结合开题报告中的研究背景可以看出，${analysis.background || "该问题具有明确的现实背景和研究价值。"}\n\n从研究意义来看，${analysis.significance || "本研究既有助于补充相关理论讨论，也能够为实践改进提供参考。"}\n\n在具体写作中，本节可进一步从概念界定、现实问题、已有研究不足以及本文研究切入点四个方面展开，以保证论述层次清晰、逻辑完整。`;
  } else if (mode === "expand") {
    text = base + `\n\n进一步来看，该部分还需要结合具体研究对象展开说明。一方面，应说明该问题产生的背景与表现；另一方面，也需要分析其背后的原因、影响路径及可能后果。通过这种展开方式，可以使章节内容从一般性描述转向更具针对性的学术分析。`;
  } else if (mode === "polish") {
    text = (base || `本节主要讨论${title}。`).replace(/我觉得/g, "本文认为").replace(/很重要/g, "具有重要意义").replace(/有帮助/g, "能够提供参考");
    text += `\n\n【润色提示】后续可补充权威文献支撑，并减少绝对化表达，使论证更符合学术写作规范。`;
  } else if (mode === "shorten") {
    text = base.split(/[。！？]/).filter(Boolean).slice(0, 4).join("。") + "。";
  }
  $("chapterContent").value = text;
  c.title = title;
  c.content = text;
  c.status = "进行中";
  renderChapters();
  save(false);
  toast("已生成文本，可继续手动调整");
}

$("addLitBtn").addEventListener("click", () => {
  const item = {
    title: $("litTitle").value.trim(),
    authors: $("litAuthors").value.trim(),
    year: $("litYear").value.trim(),
    summary: $("litSummary").value.trim()
  };
  if (!item.title) return toast("请填写文献标题");
  state.literature.push(item);
  ["litTitle", "litAuthors", "litYear", "litSummary"].forEach(id => $(id).value = "");
  renderLiterature();
  save(false);
  toast("已添加文献");
});

function renderLiterature() {
  $("litList").innerHTML = state.literature.map((item, i) => `
    <article class="list-item">
      <h3>${escapeHtml(item.title)}</h3>
      <div class="meta">${escapeHtml(item.authors || "未知作者")} · ${escapeHtml(item.year || "未知年份")}</div>
      <p>${escapeHtml(item.summary || "暂无摘要")}</p>
      <button class="btn secondary" onclick="removeLit(${i})">删除</button>
    </article>
  `).join("") || "<p class='review-box'>暂无文献。</p>";
}
window.removeLit = function(index) { state.literature.splice(index, 1); renderLiterature(); save(false); };

$("runReviewBtn").addEventListener("click", () => {
  const text = $("chapterContent").value.trim();
  const issues = [];
  if (!text) issues.push("当前章节还没有正文。");
  if (countWords(text) < 500) issues.push("章节字数偏少，建议补充背景、文献依据、分析过程或案例材料。");
  if (!/[（(]?\d{4}[）)]?/.test(text) && state.literature.length) issues.push("正文中暂未发现年份型引用，建议在关键观点后加入参考文献支撑。");
  if (/我觉得|非常|特别|很明显|肯定/.test(text)) issues.push("存在口语化或绝对化表达，建议改为更客观的学术表述。");
  if (!/[。！？]$/.test(text) && text) issues.push("段落结尾标点可能不完整。");
  if (!issues.length) issues.push("暂未发现明显问题。建议继续检查引用格式、图表编号和学校模板要求。");
  $("reviewResult").textContent = issues.map((x, i) => `${i + 1}. ${x}`).join("\n");
});

function countWords(text = "") {
  const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  return cn + en;
}

function renderProgress() {
  const total = state.chapters.reduce((sum, c) => sum + countWords(c.content), 0);
  const target = Number(state.project.wordTarget || 0);
  $("stats").innerHTML = `
    <div class="stat-card"><strong>${state.chapters.length}</strong><span>章节数</span></div>
    <div class="stat-card"><strong>${total}</strong><span>当前字数</span></div>
    <div class="stat-card"><strong>${target ? Math.min(100, Math.round(total / target * 100)) : 0}%</strong><span>目标完成度</span></div>
  `;
  $("progressList").innerHTML = state.chapters.map(c => {
    const words = countWords(c.content);
    const status = words >= 800 ? "初稿完成" : words > 0 ? "进行中" : "未开始";
    return `<article class="list-item"><h3>${escapeHtml(c.title)}</h3><div class="meta">${status} · ${words} 字</div><p>${words >= 800 ? "可以进入润色与引用检查。" : "建议继续补充论证、文献和案例。"}</p></article>`;
  }).join("") || "<p class='review-box'>暂无章节，请先生成大纲并同步。</p>";
}

$("exportBtn").addEventListener("click", () => {
  save(false, false);
  const md = buildMarkdown();
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.project.title || "论文草稿"}.md`;
  a.click();
  URL.revokeObjectURL(url);
});

function buildMarkdown() {
  const project = state.project;
  const chapters = state.chapters.map(c => `## ${c.title}\n\n${c.content || "（待补充）"}`).join("\n\n");
  const refs = state.literature.map((l, i) => `[${i + 1}] ${l.authors || ""}. ${l.title}. ${l.year || ""}.`).join("\n");
  return `# ${project.title || "论文草稿"}\n\n- 专业/方向：${project.major || ""}\n- 论文类型：${project.paperType || ""}\n- 预计字数：${project.wordTarget || ""}\n- 提交日期：${project.deadline || ""}\n\n## 开题报告摘要\n\n${state.proposal || ""}\n\n${chapters}\n\n## 参考文献\n\n${refs || "（待补充）"}\n`;
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
    authInfo.textContent = "未登录。注册或登录后，可以把论文项目保存到云数据库。";
  }
}

$("signUpBtn").addEventListener("click", async () => {
  if (!ensureConfigured()) return;
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) return toast("请填写邮箱和密码");
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return toast(error.message);
  toast("注册成功，如需邮箱验证请去邮箱点击验证链接");
  await refreshAuth();
});

$("signInBtn").addEventListener("click", async () => {
  if (!ensureConfigured()) return;
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) return toast("请填写邮箱和密码");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);
  await refreshAuth();
  await loadFromCloud(false);
  toast("登录成功");
});

$("signOutBtn").addEventListener("click", async () => {
  if (!ensureConfigured()) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  await refreshAuth();
  toast("已退出登录");
});

$("loadCloudBtn").addEventListener("click", () => loadFromCloud(true));
$("saveCloudBtn").addEventListener("click", () => saveToCloud(true));

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
  collectFields();
  const title = state.project.title || "未命名论文";
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
  if (result.error) {
    toast(result.error.message);
    return;
  }
  rowId = result.data.id;
  localStorage.setItem(PROJECT_ROW_ID_KEY, rowId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (show) toast("已保存到云端");
}

async function loadFromCloud(show = true) {
  if (!ensureSupabase()) return;
  let query = supabaseClient.from("paper_projects").select("id,title,data,updated_at").eq("user_id", currentUser.id).order("updated_at", { ascending: false }).limit(1);
  const { data, error } = await query;
  if (error) return toast(error.message);
  if (!data.length) return show && toast("云端还没有项目，先保存一次");
  localStorage.setItem(PROJECT_ROW_ID_KEY, data[0].id);
  Object.assign(state, data[0].data);
  hydrateFields();
  renderAll();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (show) toast("已从云端加载最新项目");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

load();
