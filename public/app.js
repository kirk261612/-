const sampleText = `张敏：今天讨论 7 月运营活动复盘和下周上线准备。上周新用户转化率 12.8%，比目标低 2 个点，主要卡在权益说明不清楚。
李华：客服侧收到 36 条咨询，用户主要问“新人礼包”和“连续包月”能否叠加。建议在活动页增加一段套餐差异说明。
王磊：技术侧可以在周五前完成活动页说明模块，埋点也能一起补上。需要产品今天确认文案。
陈洁：决定保留新人礼包，不叠加连续包月折扣。运营今天 18 点前给出最终文案，客服明天更新 FAQ。
张敏：风险是周五上线窗口比较紧，如果文案今天没有确认，开发会延后。请王磊负责上线检查，李华负责客服话术同步。
李华：我明天下午 3 点前完成 FAQ 更新，并把高频问题整理到知识库。
陈洁：会议结论是本周五灰度上线，下周一看转化率和咨询量数据，再决定是否扩大流量。`;

const state = {
  minutes: null,
  toastTimer: null,
  actionFilter: "全部",
  lastTranscript: "",
  currentView: "intro",
  revealObserver: null,
  lastScrollY: 0,
  currentUser: null,
  subscription: null,
  selectedPlan: "pro",
  paymentMethod: "wechat",
  pendingView: null,
  organizedNotes: null,
  minutesHistory: []
};

const $ = selector => document.querySelector(selector);
const authStorageKey = "meeting-minutes-user";
const subscriptionStorageKey = "meeting-minutes-subscription";
const historyStorageKey = "meeting-minutes-history";
const protectedViews = new Set(["dashboard", "intelligence", "actions", "ask", "notes", "history", "export"]);

const meetingTemplates = {
  operation: {
    title: "7 月运营活动复盘会",
    transcript: sampleText
  },
  weekly: {
    title: "项目周会",
    transcript: "林晨：本周完成登录和支付页面联调，核心流程已经可以演示。\n周宁：数据看板还缺少导出指标，计划周四前补齐。\n陈洁：决定周五进行灰度发布，周四下午完成验收。\n林晨：风险是移动端兼容测试时间较短，我负责补充测试清单并在周四中午前同步结果。"
  },
  review: {
    title: "需求评审会",
    transcript: "产品：本次评审目标是确认历史纪要和日历导出范围。\n设计：历史列表需要支持搜索、打开和删除，移动端使用单列布局。\n开发：功能可以在本周五前完成，需要产品今天确认字段。\n产品：决定第一版使用浏览器本地存储，不接入云端数据库。\n测试：风险是旧数据兼容，明天下午前补充回归用例。"
  },
  interview: {
    title: "客户访谈整理",
    transcript: "访谈员：您目前如何整理会议内容？\n客户：主要依赖手工复制到文档，希望能自动提炼行动项。\n访谈员：导出方面最需要什么？\n客户：希望可以生成 PPT，并把待办同步到日历。\n客户：团队还需要搜索历史会议，快速找到以前的决策。\n访谈员：本次结论是优先优化整理、历史检索和交付能力。"
  }
};

const subscriptionPlans = {
  personal: {
    id: "personal",
    name: "个人效率版",
    price: 29,
    unit: "/月",
    description: "适合个人会议、学习笔记和轻量输出。",
    features: ["30 次 AI 纪要或笔记整理/月", "结构化纪要、待办和基础追问", "Markdown / JSON 导出", "5 份 PPT 生成/月"]
  },
  pro: {
    id: "pro",
    name: "专业创作版",
    price: 69,
    unit: "/月",
    description: "适合高频会议、深度整理和演示交付。",
    features: ["不限次数 AI 纪要与笔记整理", "高级洞察、多轮追问和自定义模板", "全部导出格式与批量处理", "不限份数 PPT 生成"]
  },
  team: {
    id: "team",
    name: "团队协作版",
    price: 129,
    unit: "/人/月",
    description: "适合项目组、运营团队和企业知识沉淀。",
    features: ["包含专业版全部能力", "共享空间、团队模板和协作待办", "成员权限、操作审计和集中管理", "API 接入、优先支持和品牌 PPT"]
  }
};

const viewMeta = {
  dashboard: {
    title: "功能工作台",
    subtitle: "在这里粘贴会议转写、生成结构化纪要，并继续追问或导出。"
  },
  intro: {
    title: "产品介绍",
    subtitle: "像浏览一款新设备一样，向下滑动查看会速记的核心能力。"
  },
  intelligence: {
    title: "智能洞察",
    subtitle: "查看会议质量评分、发言人贡献、议题标签和转写统计。"
  },
  actions: {
    title: "待办中心",
    subtitle: "集中管理关键决策、风险提醒和责任事项。"
  },
  ask: {
    title: "纪要追问",
    subtitle: "基于当前结构化纪要继续提问，快速定位结论和风险。"
  },
  notes: {
    title: "笔记整理",
    subtitle: "把零散记录整理为摘要、重点、行动项，并生成可下载的演示文稿。"
  },
  history: {
    title: "历史纪要",
    subtitle: "搜索、重新打开或管理保存在当前浏览器中的会议纪要。"
  },
  export: {
    title: "交付导出",
    subtitle: "复制或导出 Markdown / JSON，用于周报、邮件和任务系统。"
  },
  subscription: {
    title: "订阅方案",
    subtitle: "所有工作模式都需要订阅，不同方案对应不同额度、协作范围与 PPT 权益。"
  },
  payment: {
    title: "支付订阅",
    subtitle: "选择微信或支付宝二维码完成订阅支付。"
  }
};

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function splitSentences(text) {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[。！？!?])\s*|\n+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function extractParticipants(lines) {
  return unique(lines
    .map(line => line.match(/^([\u4e00-\u9fa5A-Za-z0-9_ -]{2,12})[：:]/))
    .filter(Boolean)
    .map(match => match[1].trim()));
}

function extractDue(text) {
  const patterns = [
    /((?:今天|明天|后天|本周|下周|周[一二三四五六日天]|星期[一二三四五六日天])(?:上午|下午|晚上)?\s*\d{0,2}\s*(?:点|:\d{2})?前?)/,
    /(\d{1,2}\s*月\s*\d{1,2}\s*日(?:前)?)/,
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:前)?)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].replace(/\s+/g, "");
  }
  return "待确认";
}

function inferOwner(text, participants, fallback) {
  const explicitPerson = text.match(/请?([\u4e00-\u9fa5A-Za-z]{2,4})(?:负责|跟进)/);
  if (explicitPerson) return explicitPerson[1];
  const department = text.match(/^(?:需要)?(产品|运营|客服|开发|技术|测试|设计)(?:团队|侧)?/);
  if (department) return department[1];
  const namedBeforeTask = text.match(/^([\u4e00-\u9fa5A-Za-z]{2,4})(?:今天|明天|后天|本周|下周|周[一二三四五六日天]|星期[一二三四五六日天]|\s|\d|点|前)*(?:负责|跟进|完成|确认|更新|整理|提交|同步|给出)/);
  if (namedBeforeTask && participants.includes(namedBeforeTask[1])) return namedBeforeTask[1];
  return participants.find(name => text.includes(name)) || fallback || "待分配";
}

function summarizeLocal(title, transcript) {
  const rawLines = transcript.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const participants = extractParticipants(rawLines);
  const contentLines = rawLines.map(line => line.replace(/^([\u4e00-\u9fa5A-Za-z0-9_ -]{2,12})[：:]\s*/, ""));
  const sentences = splitSentences(contentLines.join("\n"));

  const decisionKeywords = /(决定|确定|结论|同意|采用|保留|不叠加|灰度上线|扩大流量)/;
  const actionKeywords = /(负责|需要|请|完成|提交|确认|更新|整理|同步|安排|跟进|检查|给出)/;
  const riskKeywords = /(风险|阻塞|延后|延期|上线窗口.*紧|卡在|不足|低于|比目标低|下降|缺少|失败)/;

  const decisions = unique(sentences.filter(sentence => decisionKeywords.test(sentence))).slice(0, 6);
  const risks = unique(sentences.filter(sentence => riskKeywords.test(sentence))).slice(0, 5);
  const actionSentences = unique(sentences.flatMap(sentence => {
    if (!actionKeywords.test(sentence)) return [];
    return sentence
      .split(/[，,；;]/)
      .map(item => item.trim())
      .filter(item => !/^(如果|若|风险是|否则)/.test(item))
      .filter(item => actionKeywords.test(item) || /^(产品|运营|客服|开发|技术|测试|设计).*(前|完成|确认|更新|整理|同步|给出)/.test(item));
  })).slice(0, 8);

  const actionItems = actionSentences.map((sentence, index) => {
    const raw = rawLines.find(line => line.includes(sentence.slice(0, Math.min(12, sentence.length)))) || "";
    const speaker = raw.match(/^([\u4e00-\u9fa5A-Za-z0-9_ -]{2,12})[：:]/)?.[1];
    return {
      id: index + 1,
      owner: inferOwner(sentence, participants, speaker),
      task: sentence.replace(/^(请|需要)/, ""),
      due: extractDue(sentence),
      status: sentence.includes("完成") ? "进行中" : "待开始"
    };
  });

  const keywordPool = contentLines.join(" ");
  const topics = unique((keywordPool.match(/(转化率|客服|FAQ|知识库|活动页|埋点|上线|灰度|套餐|文案|咨询量|运营)/g) || [])).slice(0, 8);
  const highlights = sentences.filter(sentence => /(目标|主要|建议|结论|决定|风险|数据|咨询)/.test(sentence)).slice(0, 5);

  return {
    source: "browser-fallback",
    title: title || "会议纪要",
    summary: [
      `${title || "本次会议"}围绕${topics.slice(0, 3).join("、") || "业务推进"}展开，重点讨论现状问题、处理方案和上线安排。`,
      highlights[0] || "会议已形成主要结论，并拆分出后续负责人和截止时间。",
      risks[0] ? `当前主要风险：${risks[0]}` : "当前未识别到明显阻塞，后续需按任务清单推进。"
    ],
    participants,
    topics,
    decisions: decisions.length ? decisions : ["暂未识别到明确决策，建议补充会议结论。"],
    actionItems: actionItems.length ? actionItems : [{
      id: 1,
      owner: "待分配",
      task: "补充会议结论、责任人和截止时间",
      due: "待确认",
      status: "待开始"
    }],
    risks: risks.length ? risks : ["暂未发现明显风险。"],
    timeline: [
      "采集会议转写文本并识别参会角色",
      "提炼议题、结论、风险和责任事项",
      "生成可复制纪要并支持上下文追问"
    ],
    followUpHints: [
      "本次会议有哪些明确决策？",
      "谁需要在什么时候完成什么？",
      "当前最大的上线风险是什么？"
    ]
  };
}

function analyzeTranscript(transcript) {
  const rawLines = transcript.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const speakers = {};
  rawLines.forEach(line => {
    const match = line.match(/^([\u4e00-\u9fa5A-Za-z0-9_ -]{2,12})[：:]\s*(.*)$/);
    if (!match) return;
    const name = match[1].trim();
    const content = match[2] || "";
    speakers[name] = (speakers[name] || 0) + Math.max(1, content.length);
  });
  const speakerStats = Object.entries(speakers)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const sentences = splitSentences(transcript);
  return {
    chars: transcript.replace(/\s/g, "").length,
    lines: rawLines.length,
    sentences: sentences.length,
    speakers: speakerStats.length,
    speakerStats
  };
}

function scoreMinutes(minutes, stats) {
  const actionItems = minutes.actionItems || [];
  const decisions = minutes.decisions || [];
  const risks = minutes.risks || [];
  const dueReady = actionItems.filter(item => item.due && item.due !== "待确认").length;
  const ownerReady = actionItems.filter(item => item.owner && item.owner !== "待分配").length;
  const actionCompleteness = actionItems.length ? Math.round(((dueReady + ownerReady) / (actionItems.length * 2)) * 24) : 0;
  const score = Math.max(48, Math.min(96,
    54 +
    Math.min(decisions.length * 7, 18) +
    Math.min(actionItems.length * 3, 15) +
    actionCompleteness +
    Math.min(stats.speakers * 2, 8) -
    Math.max(risks.length - 2, 0) * 4
  ));
  let label = "可执行";
  if (score >= 86) label = "高质量纪要";
  else if (score < 68) label = "需要补充";
  return {
    score,
    label,
    reason: `识别到 ${decisions.length} 条决策、${actionItems.length} 条待办、${risks.length} 个风险点；责任人与截止时间完整度约 ${actionCompleteness}/24。`
  };
}

function buildNextSteps(minutes) {
  const actions = minutes.actionItems || [];
  const risks = minutes.risks || [];
  const firstPending = actions.find(item => item.status !== "已完成");
  const steps = [];
  if (firstPending) steps.push(`优先推进：${firstPending.owner} 负责的“${firstPending.task}”。`);
  if (risks.length) steps.push(`风险闭环：针对“${risks[0]}”设置检查点。`);
  steps.push("会后同步：将决策和待办复制到项目群或任务系统。");
  steps.push("复盘指标：下次会议回看转化率、咨询量和待办完成率。");
  return steps.slice(0, 4);
}

function enrichMinutes(minutes, transcript) {
  const stats = analyzeTranscript(transcript);
  return {
    ...minutes,
    transcriptStats: stats,
    speakerStats: stats.speakerStats,
    quality: scoreMinutes(minutes, stats),
    nextSteps: buildNextSteps(minutes)
  };
}

function buildAnswer(question, minutes) {
  const q = question.trim();
  if (!q) return "请先输入一个追问问题。";
  if (/决策|结论|决定/.test(q)) return minutes.decisions.map(item => `- ${item}`).join("\n");
  if (/待办|任务|谁|负责|截止|什么时候/.test(q)) {
    return minutes.actionItems.map(item => `- ${item.owner}：${item.task}（${item.due}，${item.status}）`).join("\n");
  }
  if (/风险|问题|阻塞|延期/.test(q)) return minutes.risks.map(item => `- ${item}`).join("\n");
  if (/参会|人员|谁参加/.test(q)) return minutes.participants.length ? minutes.participants.join("、") : "未识别到参会人。";
  return [
    "可参考本次会议纪要：",
    ...minutes.summary.map(item => `- ${item}`),
    "你也可以继续追问“决策”“待办”“风险”或“参会人”。"
  ].join("\n");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function loadSavedUser() {
  try {
    const saved = window.localStorage.getItem(authStorageKey);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveUser(user) {
  try {
    if (user) window.localStorage.setItem(authStorageKey, JSON.stringify(user));
    else window.localStorage.removeItem(authStorageKey);
  } catch {
    // Local storage can be unavailable in some embedded browsers; login still works for this session.
  }
}

function updateAuthUI() {
  const user = state.currentUser;
  const loginButton = $("#loginButton");
  const mobileLoginButton = $("#mobileLoginButton");
  const authForm = $("#authForm");
  const authProfile = $("#authProfile");
  const authDescription = $("#authDescription");

  loginButton.textContent = user ? user.name : "登录";
  loginButton.setAttribute("aria-label", user ? `当前登录：${user.name}` : "登录会速记");
  mobileLoginButton.textContent = user ? user.name : "登录";
  mobileLoginButton.setAttribute("aria-label", user ? `当前登录：${user.name}` : "登录会速记");
  authForm.hidden = Boolean(user);
  authProfile.hidden = !user;
  authDescription.textContent = user
    ? "你已登录演示账号，可以继续生成纪要、查看洞察并体验导出流程。"
    : "登录后可保存纪要草稿、同步团队模板，并在演示环境中体验协作入口。";
  if (!user) return;
  $("#profileName").textContent = user.name;
  $("#profileEmail").textContent = user.email;
}

function openAuthModal() {
  updateAuthUI();
  const modal = $("#authModal");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.requestAnimationFrame(() => {
    const focusTarget = state.currentUser ? $("#logoutButton") : $("#loginEmail");
    focusTarget?.focus();
  });
}

function closeAuthModal() {
  const modal = $("#authModal");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  $("#loginButton").focus();
}

function handleLogin(event) {
  event.preventDefault();
  const email = $("#loginEmail").value.trim() || "demo@minutes.ai";
  const rawName = email.split("@")[0] || "demo";
  const name = rawName === "demo" ? "演示用户" : rawName;
  state.currentUser = { name, email };
  saveUser(state.currentUser);
  updateAuthUI();
  closeAuthModal();
  showToast(`欢迎回来，${name}。`);
}

function handleLogout() {
  state.currentUser = null;
  saveUser(null);
  updateAuthUI();
  closeAuthModal();
  showToast("已退出登录。");
}

function loadSavedSubscription() {
  try {
    const saved = window.localStorage.getItem(subscriptionStorageKey);
    if (!saved) return null;
    const subscription = JSON.parse(saved);
    return subscription.expiresAt && Date.parse(subscription.expiresAt) > Date.now() ? subscription : null;
  } catch {
    return null;
  }
}

function saveSubscription(subscription) {
  try {
    if (subscription) window.localStorage.setItem(subscriptionStorageKey, JSON.stringify(subscription));
    else window.localStorage.removeItem(subscriptionStorageKey);
  } catch {
    // The current session still keeps the subscription when storage is unavailable.
  }
}

function hasSubscription() {
  return Boolean(state.subscription && subscriptionPlans[state.subscription.planId]);
}

function updateSubscriptionUI() {
  const plan = state.subscription ? subscriptionPlans[state.subscription.planId] : null;
  const status = $("#subscriptionStatus");
  if (status) {
    status.textContent = plan
      ? `当前订阅：${plan.name} · 有效期至 ${new Date(state.subscription.expiresAt).toLocaleDateString("zh-CN")}`
      : "当前未订阅 · 选择方案后才可使用功能";
  }

  document.querySelectorAll("[data-plan-card]").forEach(card => {
    const isCurrent = plan?.id === card.dataset.planCard;
    card.classList.toggle("is-current", isCurrent);
    const button = card.querySelector(".plan-select");
    if (!button) return;
    button.textContent = isCurrent ? "当前方案" : `选择${subscriptionPlans[card.dataset.planCard].name}`;
    button.disabled = isCurrent;
  });
}

function requireSubscription(action, targetView = "subscription") {
  if (hasSubscription()) return true;
  if (targetView && protectedViews.has(targetView)) state.pendingView = targetView;
  showToast(`${action}需要有效订阅，请先选择套餐。`);
  setView("subscription", { skipGate: true });
  return false;
}

function allowPlanUsage(type, targetView) {
  if (!requireSubscription(type === "ppt" ? "生成 PPT" : "AI 整理", targetView)) return false;
  if (state.subscription.planId !== "personal") return true;
  const used = Number(state.subscription[type === "ppt" ? "pptGenerated" : "aiRuns"] || 0);
  const limit = type === "ppt" ? 5 : 30;
  if (used < limit) return true;
  showToast(`个人效率版本月${type === "ppt" ? "PPT" : "AI 整理"}额度已用完，请升级方案。`);
  setView("subscription", { skipGate: true });
  return false;
}

function recordPlanUsage(type) {
  if (!state.subscription || state.subscription.planId !== "personal") return;
  const key = type === "ppt" ? "pptGenerated" : "aiRuns";
  state.subscription[key] = Number(state.subscription[key] || 0) + 1;
  saveSubscription(state.subscription);
}

function loadMinutesHistory() {
  try {
    const saved = window.localStorage.getItem(historyStorageKey);
    const items = saved ? JSON.parse(saved) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function saveMinutesHistory() {
  try {
    window.localStorage.setItem(historyStorageKey, JSON.stringify(state.minutesHistory.slice(0, 20)));
  } catch {
    // History remains available for the current session if storage is unavailable.
  }
}

function archiveMinutes(minutes, transcript) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    title: minutes.title || "未命名会议",
    transcript,
    minutes
  };
  state.minutesHistory = [item, ...state.minutesHistory].slice(0, 20);
  saveMinutesHistory();
  renderHistory();
}

function renderHistory(query = "") {
  const list = $("#historyList");
  if (!list) return;
  const keyword = query.trim().toLowerCase();
  const items = state.minutesHistory.filter(item => {
    const searchable = [item.title, ...(item.minutes?.summary || []), ...(item.minutes?.participants || [])].join(" ").toLowerCase();
    return !keyword || searchable.includes(keyword);
  });
  $("#historyCount").textContent = String(state.minutesHistory.length);
  list.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = keyword ? "没有找到匹配的纪要。" : "生成第一份纪要后，它会自动保存在这里。";
    list.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const article = document.createElement("article");
    article.className = "history-card";
    const content = document.createElement("div");
    const meta = document.createElement("div");
    meta.className = "history-meta";
    const date = document.createElement("span");
    date.textContent = new Date(item.savedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const people = document.createElement("span");
    people.textContent = `${item.minutes?.participants?.length || 0} 位参会人`;
    meta.append(date, people);
    const title = document.createElement("h3");
    title.textContent = item.title;
    const summary = document.createElement("p");
    summary.textContent = item.minutes?.summary?.[0] || "暂无摘要";
    content.append(meta, title, summary);

    const actions = document.createElement("div");
    actions.className = "history-actions";
    const openButton = document.createElement("button");
    openButton.className = "primary-button";
    openButton.type = "button";
    openButton.dataset.historyOpen = item.id;
    openButton.textContent = "打开纪要";
    const deleteButton = document.createElement("button");
    deleteButton.className = "ghost-button";
    deleteButton.type = "button";
    deleteButton.dataset.historyDelete = item.id;
    deleteButton.textContent = "删除";
    actions.append(openButton, deleteButton);
    article.append(content, actions);
    list.appendChild(article);
  });
}

function openHistoryItem(id) {
  const item = state.minutesHistory.find(entry => entry.id === id);
  if (!item) return;
  $("#titleInput").value = item.title;
  $("#transcriptInput").value = item.transcript || "";
  state.lastTranscript = item.transcript || "";
  renderMinutes(item.minutes);
  setView("dashboard");
  showToast("历史纪要已重新打开。");
}

function deleteHistoryItem(id) {
  state.minutesHistory = state.minutesHistory.filter(item => item.id !== id);
  saveMinutesHistory();
  renderHistory($("#historySearchInput").value);
  showToast("历史纪要已删除。");
}

function clearMinutesHistory() {
  state.minutesHistory = [];
  saveMinutesHistory();
  $("#historySearchInput").value = "";
  renderHistory();
  showToast("历史纪要已清空。");
}

function applyMeetingTemplate(templateId) {
  const template = meetingTemplates[templateId];
  if (!template) return;
  $("#titleInput").value = template.title;
  $("#transcriptInput").value = template.transcript;
  renderTranscriptStats(analyzeTranscript(template.transcript));
  showToast("会议模板已载入。");
}

function renderCheckout() {
  const plan = subscriptionPlans[state.selectedPlan] || subscriptionPlans.pro;
  $("#checkoutPlanName").textContent = plan.name;
  $("#checkoutPlanDescription").textContent = plan.description;
  $("#checkoutPrice").textContent = `¥${plan.price}`;
  $("#checkoutUnit").textContent = plan.unit;
  $("#checkoutFeatures").innerHTML = plan.features.map(item => `<li>${item}</li>`).join("");
  $("#confirmPaymentButton").textContent = `我已完成支付 · ¥${plan.price}`;
}

function startCheckout(planId) {
  if (!subscriptionPlans[planId]) return;
  state.selectedPlan = planId;
  renderCheckout();
  setView("payment", { skipGate: true });
}

function selectPaymentMethod(method) {
  if (method !== "wechat" && method !== "alipay") method = "wechat";
  state.paymentMethod = method;
  document.querySelectorAll("[data-payment-method]").forEach(button => {
    button.classList.toggle("active", button.dataset.paymentMethod === method);
  });
  const isWechat = method === "wechat";
  const image = $("#paymentQrImage");
  image.src = isWechat ? "assets/wechat-qr-source.jpg" : "assets/alipay-qr-source.jpg";
  image.className = `qr-source ${isWechat ? "wechat-qr" : "alipay-qr"}`;
  image.alt = isWechat ? "微信收款二维码" : "支付宝收款二维码";
  $("#walletTitle").textContent = isWechat ? "微信扫码支付" : "支付宝扫码支付";
  $("#walletHint").textContent = `打开${isWechat ? "微信" : "支付宝"}扫描二维码，完成后点击下方按钮继续。`;
}

function confirmPayment() {
  if (!state.currentUser) {
    showToast("支付前请先登录账号。");
    openAuthModal();
    return;
  }
  const plan = subscriptionPlans[state.selectedPlan] || subscriptionPlans.pro;
  const startedAt = new Date();
  const expiresAt = new Date(startedAt);
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  state.subscription = {
    planId: plan.id,
    paymentMethod: state.paymentMethod,
    startedAt: startedAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
  saveSubscription(state.subscription);
  updateSubscriptionUI();
  showToast(`${plan.name}订阅成功，功能已解锁。`);
  const destination = state.pendingView || "dashboard";
  state.pendingView = null;
  setView(destination, { skipGate: true });
}

function setView(view, options = {}) {
  let nextView = viewMeta[view] ? view : "intro";
  if (!options.skipGate && protectedViews.has(nextView) && !hasSubscription()) {
    state.pendingView = nextView;
    nextView = "subscription";
    showToast("使用功能前需要先完成订阅。");
  }
  state.currentView = nextView;
  document.body.dataset.view = nextView;
  document.querySelectorAll(".view").forEach(item => {
    item.classList.toggle("active", item.dataset.view === nextView);
  });
  document.querySelectorAll("[data-view-target]").forEach(item => {
    item.classList.toggle("active", item.dataset.viewTarget === nextView);
  });
  $("#pageTitle").textContent = viewMeta[nextView].title;
  $("#pageSubtitle").textContent = viewMeta[nextView].subtitle;
  window.location.hash = nextView;
  if (window.scrollY > 0) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (nextView === "history") renderHistory($("#historySearchInput")?.value || "");
  queueRevealRefresh();
  window.requestAnimationFrame(updateIntroShowcase);
}

function getRevealNodes(root = document) {
  return [
    ...root.querySelectorAll(`
      .hero > *,
      .landing-intro,
      .workflow-window,
      .capability-card,
      .overview-card,
      .metric,
      .panel,
      .module-card,
      .integration-hero,
      .integration-card,
      .summary-card,
      .plan-card,
      .chip,
      .stat-item,
      .speaker-row,
      .story-step,
      table tr
    `)
  ];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateIntroShowcase() {
  const showcase = document.querySelector(".feature-showcase");
  if (!showcase || state.currentView !== "intro") return;

  const rect = showcase.getBoundingClientRect();
  const travel = Math.max(1, rect.height - window.innerHeight);
  const progress = clamp((-rect.top / travel) * 100, 0, 100);
  showcase.style.setProperty("--scene-progress", progress.toFixed(2));

  const viewportFocus = window.innerHeight * 0.52;
  const steps = [...showcase.querySelectorAll(".story-step")];
  let activeIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  steps.forEach((step, index) => {
    const stepRect = step.getBoundingClientRect();
    const distance = Math.abs((stepRect.top + stepRect.height * 0.45) - viewportFocus);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      activeIndex = index;
    }
  });
  showcase.dataset.scene = String(activeIndex);
  steps.forEach((step, index) => step.classList.toggle("is-current", index === activeIndex));
}

function isElementInRevealRange(node) {
  const rect = node.getBoundingClientRect();
  return node.getClientRects().length > 0 && rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
}

function revealVisibleNow(root = document) {
  getRevealNodes(root).forEach(node => {
    if (node.classList.contains("is-visible")) return;
    if (!isElementInRevealRange(node)) return;
    node.classList.add("is-visible");
    state.revealObserver?.unobserve(node);
  });
}

function prepareReveal(root = document) {
  if (!state.revealObserver) return;
  const nodes = getRevealNodes(root);
  nodes.forEach((node, index) => {
    if (!node.classList.contains("reveal")) {
      node.classList.add("reveal");
    }
    node.classList.remove("is-visible");
    node.style.setProperty("--reveal-delay", `${Math.min(index % 8, 7) * 55}ms`);
    if (isElementInRevealRange(node)) {
      node.classList.add("is-visible");
      state.revealObserver.unobserve(node);
      return;
    }
    state.revealObserver.observe(node);
  });
}

function queueRevealRefresh(root = document) {
  if (!state.revealObserver) return;
  window.requestAnimationFrame(() => prepareReveal(root));
}

function initScrollMotion() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.body.classList.add("motion-ready");
  state.revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      state.revealObserver.unobserve(entry.target);
    });
  }, {
    rootMargin: "0px 0px -12% 0px",
    threshold: 0.14
  });

  const updateNavState = () => {
    document.body.classList.toggle("scrolled", window.scrollY > 12);
    revealVisibleNow(document.querySelector(".view.active") || document);
    updateIntroShowcase();
  };
  updateNavState();
  window.addEventListener("scroll", updateNavState, { passive: true });
  window.setInterval(updateNavState, 160);
  const monitorScroll = () => {
    if (window.scrollY !== state.lastScrollY) {
      state.lastScrollY = window.scrollY;
      updateNavState();
    }
    window.requestAnimationFrame(monitorScroll);
  };
  window.requestAnimationFrame(monitorScroll);
  prepareReveal();
}

function setLoading(isLoading) {
  $("#generateButton").disabled = isLoading;
  $("#generateButtonSecondary").disabled = isLoading;
  $("#generateButton").textContent = isLoading ? "生成中..." : "生成纪要";
  $("#generateButtonSecondary").textContent = isLoading ? "生成中..." : "生成纪要";
}

function listItems(target, items) {
  const node = $(target);
  node.innerHTML = "";
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "暂无内容";
    node.appendChild(li);
    return;
  }
  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    node.appendChild(li);
  });
}

function renderChips(target, items) {
  const node = $(target);
  node.innerHTML = "";
  if (!items || !items.length) {
    const span = document.createElement("span");
    span.className = "empty";
    span.textContent = "暂无标签";
    node.appendChild(span);
    return;
  }
  items.forEach(item => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;
    node.appendChild(chip);
  });
}

function renderTimeline(items) {
  const node = $("#timelineList");
  node.innerHTML = "";
  (items || []).forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    node.appendChild(li);
  });
}

function setMetrics(minutes) {
  $("#participantCount").textContent = String((minutes.participants || []).length);
  $("#decisionCount").textContent = String((minutes.decisions || []).length);
  $("#actionCount").textContent = String((minutes.actionItems || []).length);
  $("#riskCount").textContent = String((minutes.risks || []).length);
}

function renderQuality(minutes) {
  const quality = minutes.quality || { score: 0, label: "等待分析", reason: "生成纪要后将展示质量评估。" };
  $("#qualityScore").textContent = String(quality.score);
  $("#qualityLabel").textContent = quality.label;
  $("#qualityReason").textContent = quality.reason;
  $("#scoreRing").style.background = `conic-gradient(var(--green) 0deg, var(--green) ${quality.score * 3.6}deg, rgba(243, 244, 244, 0.1) ${quality.score * 3.6}deg)`;
}

function renderSpeakerStats(items) {
  const node = $("#speakerList");
  node.innerHTML = "";
  if (!items || !items.length) {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "暂无发言人数据";
    node.appendChild(empty);
    return;
  }
  const max = Math.max(...items.map(item => item.value), 1);
  items.slice(0, 5).forEach(item => {
    const row = document.createElement("div");
    row.className = "speaker-row";
    const name = document.createElement("span");
    name.className = "speaker-name";
    name.textContent = item.name;
    const bar = document.createElement("div");
    bar.className = "speaker-bar";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(8, Math.round((item.value / max) * 100))}%`;
    bar.appendChild(fill);
    const count = document.createElement("span");
    count.className = "speaker-count";
    count.textContent = `${item.value}`;
    row.append(name, bar, count);
    node.appendChild(row);
  });
}

function renderNextSteps(items) {
  listItems("#nextStepList", items || []);
}

function renderTranscriptStats(stats) {
  const node = $("#transcriptStats");
  node.innerHTML = "";
  const rows = [
    ["字符数", stats?.chars || 0],
    ["发言人", stats?.speakers || 0],
    ["段落", stats?.lines || 0],
    ["句子", stats?.sentences || 0]
  ];
  rows.forEach(([label, value]) => {
    const div = document.createElement("div");
    div.className = "stat-item";
    div.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    node.appendChild(div);
  });
}

function renderActionTable(minutes) {
  const table = $("#actionTable");
  table.innerHTML = "";
  const items = (minutes.actionItems || []).filter(item => state.actionFilter === "全部" || item.status === state.actionFilter);
  if (!items.length) {
    table.innerHTML = `<tr><td class="empty" colspan="4">当前筛选下暂无待办</td></tr>`;
    return;
  }
  items.forEach(item => {
    const tr = document.createElement("tr");
    [item.owner, item.task, item.due].forEach(value => {
      const td = document.createElement("td");
      td.textContent = value || "待确认";
      tr.appendChild(td);
    });
    const statusCell = document.createElement("td");
    const statusButton = document.createElement("button");
    statusButton.className = "status-control";
    statusButton.type = "button";
    statusButton.dataset.actionId = String(item.id);
    statusButton.dataset.status = item.status || "待开始";
    statusButton.textContent = item.status || "待开始";
    statusButton.title = "点击更新状态";
    statusCell.appendChild(statusButton);
    tr.appendChild(statusCell);
    table.appendChild(tr);
  });
}

function cycleActionStatus(id) {
  if (!state.minutes) return;
  const item = (state.minutes.actionItems || []).find(action => String(action.id) === String(id));
  if (!item) return;
  const statuses = ["待开始", "进行中", "已完成"];
  const currentIndex = Math.max(0, statuses.indexOf(item.status));
  item.status = statuses[(currentIndex + 1) % statuses.length];
  renderActionTable(state.minutes);
  renderExportPreview();
  showToast(`待办状态已更新为“${item.status}”。`);
}

function renderMinutes(minutes) {
  state.minutes = minutes;
  $("#resultTitle").textContent = minutes.title || "结构化纪要";
  const engineName = minutes.source === "llm-api" ? "LLM API" : minutes.source === "browser-fallback" ? "浏览器本地兜底" : "本地演示";
  $("#resultMeta").textContent = `参会人：${(minutes.participants || []).join("、") || "未识别"} · 引擎：${engineName}`;
  $("#engineStatus").textContent = engineName;
  setMetrics(minutes);

  const summary = $("#summaryList");
  summary.innerHTML = "";
  (minutes.summary || []).slice(0, 3).forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "summary-card";
    div.textContent = `${["摘要", "证据", "风险"][index] || "洞察"}：${item}`;
    summary.appendChild(div);
  });

  listItems("#decisionList", minutes.decisions || []);
  listItems("#riskList", minutes.risks || []);
  renderChips("#topicList", minutes.topics || []);
  renderQuality(minutes);
  renderSpeakerStats(minutes.speakerStats || []);
  renderNextSteps(minutes.nextSteps || []);
  renderTranscriptStats(minutes.transcriptStats || {});
  renderActionTable(minutes);

  const hints = $("#hintList");
  hints.innerHTML = "";
  (minutes.followUpHints || []).forEach(hint => {
    const button = document.createElement("button");
    button.className = "chip";
    button.type = "button";
    button.textContent = hint;
    button.addEventListener("click", () => {
      $("#questionInput").value = hint;
      askQuestion();
    });
    hints.appendChild(button);
  });
  renderExportPreview();
  prepareReveal(document.querySelector(".view.active") || document);
}

function renderInitial() {
  $("#transcriptInput").value = sampleText;
  $("#summaryList").innerHTML = `<div class="summary-card">摘要：粘贴会议转写文本后，系统会自动提炼执行摘要。</div><div class="summary-card">证据：识别关键决策、待办事项和风险来源。</div><div class="summary-card">风险：支持基于纪要内容继续追问。</div>`;
  listItems("#decisionList", ["等待生成"]);
  listItems("#riskList", ["等待生成"]);
  renderChips("#topicList", ["运营", "上线", "客服", "FAQ"]);
  renderQuality({});
  renderSpeakerStats([]);
  renderNextSteps(["生成纪要后将展示优先推进事项。"]);
  renderTranscriptStats(analyzeTranscript(sampleText));
  $("#actionTable").innerHTML = `<tr><td class="empty" colspan="4">等待生成待办事项</td></tr>`;
  renderExportPreview();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : { error: await response.text() };
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

async function generateMinutes() {
  if (!allowPlanUsage("ai", "dashboard")) return;
  const title = $("#titleInput").value.trim();
  const transcript = $("#transcriptInput").value.trim();
  if (transcript.length < 20) {
    showToast("请先输入至少 20 个字符的会议转写文本。");
    return;
  }

  setLoading(true);
  state.lastTranscript = transcript;
  $("#answerBox").textContent = "";
  try {
    const payload = await postJson("/api/minutes", { title, transcript });
    const minutes = enrichMinutes(payload.minutes, transcript);
    renderMinutes(minutes);
    archiveMinutes(minutes, transcript);
    recordPlanUsage("ai");
    showToast("纪要已生成。");
  } catch (error) {
    const minutes = enrichMinutes(summarizeLocal(title, transcript), transcript);
    renderMinutes(minutes);
    archiveMinutes(minutes, transcript);
    recordPlanUsage("ai");
    showToast("后端 API 暂不可用，已自动切换到浏览器本地兜底。");
  } finally {
    setLoading(false);
  }
}

async function askQuestion() {
  if (!requireSubscription("纪要追问", "ask")) return;
  if (!state.minutes) {
    showToast("请先生成纪要。");
    return;
  }

  const question = $("#questionInput").value.trim();
  if (!question) return;

  $("#answerBox").textContent = "思考中...";
  try {
    const payload = await postJson("/api/ask", { question, minutes: state.minutes });
    $("#answerBox").textContent = payload.answer;
  } catch (error) {
    $("#answerBox").textContent = buildAnswer(question, state.minutes);
    showToast("追问接口暂不可用，已使用本地纪要上下文回答。");
  }
}

function copyMinutes() {
  if (!requireSubscription("复制纪要", "export")) return;
  if (!state.minutes) {
    showToast("暂无可复制纪要，请先生成。");
    return;
  }
  const minutes = state.minutes;
  const text = buildMarkdown(minutes);
  navigator.clipboard.writeText(text);
  showToast("纪要已复制。");
}

function buildMarkdown(minutes) {
  return [
    `# ${minutes.title}`,
    "",
    "## 摘要",
    ...(minutes.summary || []).map(item => `- ${item}`),
    "",
    "## 关键决策",
    ...(minutes.decisions || []).map(item => `- ${item}`),
    "",
    "## 待办事项",
    ...(minutes.actionItems || []).map(item => `- ${item.owner}：${item.task}（${item.due}，${item.status}）`),
    "",
    "## 风险",
    ...(minutes.risks || []).map(item => `- ${item}`),
    "",
    "## 下一步建议",
    ...((minutes.nextSteps || []).map(item => `- ${item}`))
  ].join("\n");
}

function renderExportPreview() {
  const node = $("#exportPreview");
  if (!node) return;
  node.textContent = state.minutes ? buildMarkdown(state.minutes) : "生成纪要后，这里会显示可交付的 Markdown 预览。";
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportMarkdown() {
  if (!requireSubscription("导出 Markdown", "export")) return;
  if (!state.minutes) {
    showToast("请先生成纪要。");
    return;
  }
  downloadFile(`${state.minutes.title || "minutes"}.md`, buildMarkdown(state.minutes), "text/markdown;charset=utf-8");
  showToast("Markdown 已导出。");
}

function exportJson() {
  if (!requireSubscription("导出 JSON", "export")) return;
  if (!state.minutes) {
    showToast("请先生成纪要。");
    return;
  }
  downloadFile(`${state.minutes.title || "minutes"}.json`, JSON.stringify(state.minutes, null, 2), "application/json;charset=utf-8");
  showToast("JSON 已导出。");
}

function escapeIcs(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function resolveDueDate(due, offset = 1) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (/明天/.test(due)) date.setDate(date.getDate() + 1);
  else if (/后天/.test(due)) date.setDate(date.getDate() + 2);
  else {
    const monthDay = String(due || "").match(/(\d{1,2})月(\d{1,2})日/);
    const isoDate = String(due || "").match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    const weekDay = String(due || "").match(/(?:周|星期)([一二三四五六日天])/);
    if (isoDate) date.setFullYear(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
    else if (monthDay) date.setMonth(Number(monthDay[1]) - 1, Number(monthDay[2]));
    else if (weekDay) {
      const dayMap = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
      const target = dayMap[weekDay[1]];
      const delta = (target - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + delta);
    } else date.setDate(date.getDate() + offset);
  }
  return date;
}

function formatIcsDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function exportActionCalendar() {
  if (!requireSubscription("导出待办日历", "export")) return;
  const actions = state.minutes?.actionItems || [];
  if (!actions.length) {
    showToast("当前纪要没有可导出的待办事项。");
    return;
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = actions.map((item, index) => {
    const start = resolveDueDate(item.due, index + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [
      "BEGIN:VEVENT",
      `UID:${Date.now()}-${index}@minutes-ai.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatIcsDate(start)}`,
      `DTEND;VALUE=DATE:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcs(item.task)}`,
      `DESCRIPTION:${escapeIcs(`负责人：${item.owner || "待分配"}；状态：${item.status || "待开始"}`)}`,
      "END:VEVENT"
    ].join("\r\n");
  });
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Minutes AI//Action Calendar//ZH-CN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR"
  ].join("\r\n");
  $("#exportCalendarButton").dataset.lastIcsSize = String(calendar.length);
  $("#exportCalendarButton").dataset.lastIcsEvents = String(actions.length);
  downloadFile(`${state.minutes.title || "会议待办"}.ics`, calendar, "text/calendar;charset=utf-8");
  showToast("待办日历已生成并开始下载。");
}

function loadMinutesToNotes() {
  if (!requireSubscription("导入纪要到笔记", "notes")) return;
  if (!state.minutes) {
    showToast("请先生成一份纪要，再导入笔记工作区。");
    return;
  }
  $("#noteTitleInput").value = state.minutes.title || "会议整理";
  $("#noteInput").value = buildMarkdown(state.minutes);
  showToast("当前纪要已导入笔记工作区。");
}

function organizeNoteContent(title, content) {
  const cleanLines = content
    .replace(/^#{1,6}\s*/gm, "")
    .split(/\n+/)
    .map(line => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  const sentences = unique(cleanLines.flatMap(line => splitSentences(line)));
  const actionPattern = /(负责|需要|完成|跟进|提交|确认|更新|整理|同步|截止|下一步|行动)/;
  const highlightPattern = /(决定|结论|重点|目标|数据|风险|建议|方案|问题|成果|增长|下降)/;
  const actions = sentences.filter(item => actionPattern.test(item)).slice(0, 6);
  const highlights = unique([
    ...sentences.filter(item => highlightPattern.test(item)),
    ...sentences.filter(item => !actionPattern.test(item))
  ]).slice(0, 6);
  const summarySource = highlights.length ? highlights : sentences;
  const summary = summarySource.slice(0, 2).join("；") || "已完成内容整理，建议补充更多原始信息。";
  const resolvedActions = actions.length ? actions : ["补充负责人、截止时间和下一步行动。"];
  const resolvedHighlights = highlights.length ? highlights : ["当前内容较短，建议补充背景、结论和关键数据。"];
  return {
    title: title || "整理笔记",
    summary,
    highlights: resolvedHighlights,
    actions: resolvedActions,
    slides: [
      { title: title || "整理笔记", bullets: ["AI 整理演示", "由会速记自动生成"] },
      { title: "内容摘要", bullets: [summary] },
      { title: "核心重点", bullets: resolvedHighlights },
      { title: "行动事项", bullets: resolvedActions }
    ]
  };
}

function renderOrganizedNotes(notes) {
  $("#organizedNoteTitle").textContent = notes.title;
  $("#organizedSummary").textContent = notes.summary;
  listItems("#organizedHighlights", notes.highlights);
  listItems("#organizedActions", notes.actions);
  $("#slideOutline").innerHTML = [
    '<span class="result-label">PPT 结构</span>',
    ...notes.slides.map((slide, index) => `<p>${index + 1}. ${slide.title} · ${slide.bullets.length} 个内容点</p>`)
  ].join("");
  $("#generatePptButton").disabled = false;
  prepareReveal($("#notesView"));
}

function organizeNotes() {
  if (!allowPlanUsage("ai", "notes")) return;
  const title = $("#noteTitleInput").value.trim();
  const content = $("#noteInput").value.trim();
  if (content.length < 20) {
    showToast("请先输入至少 20 个字符的笔记内容。");
    return;
  }
  state.organizedNotes = organizeNoteContent(title, content);
  renderOrganizedNotes(state.organizedNotes);
  recordPlanUsage("ai");
  showToast("笔记已完成结构化整理。");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  bytes.forEach(byte => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  entries.forEach(entry => {
    const name = encoder.encode(entry.name);
    const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localParts.push(localHeader, name, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + data.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);
  return concatBytes([...localParts, centralDirectory, end]);
}

function pptTextShape(id, name, x, y, cx, cy, paragraphs, options = {}) {
  const fontSize = options.fontSize || 2200;
  const color = options.color || "F3F4F4";
  const paragraphXml = paragraphs.map(text => `
    <a:p>${options.bullet ? '<a:pPr marL="342900" indent="-228600"><a:buChar char="•"/></a:pPr>' : ""}<a:r><a:rPr lang="zh-CN" sz="${fontSize}" b="${options.bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Aptos"/><a:ea typeface="Microsoft YaHei"/></a:rPr><a:t>${escapeXml(text)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="${fontSize}"/></a:p>`).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphXml}</p:txBody></p:sp>`;
}

function pptSlideXml(slide, index) {
  const title = pptTextShape(2, "Title", 700000, 520000, 10800000, 950000, [slide.title], { fontSize: index === 0 ? 3600 : 3000, bold: true, color: "F3F4F4" });
  const body = pptTextShape(3, "Content", 900000, 1750000, 10200000, 4050000, slide.bullets, { fontSize: index === 0 ? 2200 : 1900, bullet: index !== 0, color: index === 0 ? "3EC9A2" : "ACAAA4" });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="030404"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${title}${body}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function buildPptx(notes) {
  const slideCount = notes.slides.length;
  const overrides = notes.slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  const slideIds = notes.slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
  const slideRelationships = notes.slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
  const entries = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides}</Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(notes.title)}</dc:title><dc:creator>会速记 AI</dc:creator><cp:lastModifiedBy>会速记 AI</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
    { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>会速记 AI</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slideCount}</Slides><Notes>0</Notes></Properties>` },
    { name: "ppt/presentation.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>` },
    { name: "ppt/_rels/presentation.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRelationships}</Relationships>` },
    { name: "ppt/slideMasters/slideMaster1.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>` },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>` },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>` },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>` },
    { name: "ppt/theme/theme1.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="会速记"><a:themeElements><a:clrScheme name="会速记"><a:dk1><a:srgbClr val="030404"/></a:dk1><a:lt1><a:srgbClr val="F3F4F4"/></a:lt1><a:dk2><a:srgbClr val="121B2F"/></a:dk2><a:lt2><a:srgbClr val="ACAAA4"/></a:lt2><a:accent1><a:srgbClr val="3EC9A2"/></a:accent1><a:accent2><a:srgbClr val="1A67A5"/></a:accent2><a:accent3><a:srgbClr val="2B9DA4"/></a:accent3><a:accent4><a:srgbClr val="609ADE"/></a:accent4><a:accent5><a:srgbClr val="A06E4D"/></a:accent5><a:accent6><a:srgbClr val="D65B74"/></a:accent6><a:hlink><a:srgbClr val="609ADE"/></a:hlink><a:folHlink><a:srgbClr val="2B9DA4"/></a:folHlink></a:clrScheme><a:fontScheme name="会速记"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="会速记"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>` }
  ];
  notes.slides.forEach((slide, index) => {
    const slideNumber = index + 1;
    entries.push({ name: `ppt/slides/slide${slideNumber}.xml`, data: pptSlideXml(slide, index) });
    entries.push({ name: `ppt/slides/_rels/slide${slideNumber}.xml.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>` });
  });
  return createStoredZip(entries);
}

function generateNotesPpt() {
  if (!allowPlanUsage("ppt", "notes")) return;
  if (!state.organizedNotes) {
    showToast("请先完成笔记整理。");
    return;
  }
  const safeName = state.organizedNotes.title.replace(/[\\/:*?"<>|]/g, "-") || "整理笔记";
  const pptx = buildPptx(state.organizedNotes);
  $("#generatePptButton").dataset.lastPptSize = String(pptx.length);
  $("#generatePptButton").dataset.lastPptSignature = Array.from(pptx.slice(0, 4)).join(",");
  downloadFile(`${safeName}.pptx`, pptx, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  recordPlanUsage("ppt");
  showToast("PPT 已生成并开始下载。");
}

$("#generateButton").addEventListener("click", generateMinutes);
$("#generateButtonSecondary").addEventListener("click", generateMinutes);
$("#askButton").addEventListener("click", askQuestion);
$("#copyButton").addEventListener("click", copyMinutes);
$("#exportMarkdownButton").addEventListener("click", exportMarkdown);
$("#exportMarkdownButtonSide").addEventListener("click", exportMarkdown);
$("#exportJsonButton").addEventListener("click", exportJson);
$("#exportCalendarButton").addEventListener("click", exportActionCalendar);
$("#copyButtonSide").addEventListener("click", copyMinutes);
$("#loginButton").addEventListener("click", openAuthModal);
$("#mobileLoginButton").addEventListener("click", openAuthModal);
$("#authCloseButton").addEventListener("click", closeAuthModal);
$("#authForm").addEventListener("submit", handleLogin);
$("#logoutButton").addEventListener("click", handleLogout);
$("#loadMinutesToNotesButton").addEventListener("click", loadMinutesToNotes);
$("#organizeNotesButton").addEventListener("click", organizeNotes);
$("#generatePptButton").addEventListener("click", generateNotesPpt);
$("#confirmPaymentButton").addEventListener("click", confirmPayment);
document.querySelectorAll("[data-plan-id]").forEach(button => {
  button.addEventListener("click", () => startCheckout(button.dataset.planId));
});
$("#paymentMethods").addEventListener("click", event => {
  const button = event.target.closest("[data-payment-method]");
  if (!button) return;
  selectPaymentMethod(button.dataset.paymentMethod);
});
document.querySelectorAll("[data-auth-close]").forEach(item => {
  item.addEventListener("click", closeAuthModal);
});
$("#actionFilters").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.actionFilter = button.dataset.filter;
  $("#actionFilters").querySelectorAll(".segment").forEach(item => item.classList.toggle("active", item === button));
  if (state.minutes) renderActionTable(state.minutes);
});
$("#actionTable").addEventListener("click", event => {
  const button = event.target.closest("[data-action-id]");
  if (!button) return;
  cycleActionStatus(button.dataset.actionId);
});
$("#meetingTemplateSelect").addEventListener("change", event => applyMeetingTemplate(event.target.value));
$("#historySearchInput").addEventListener("input", event => renderHistory(event.target.value));
$("#clearHistoryButton").addEventListener("click", clearMinutesHistory);
$("#historyList").addEventListener("click", event => {
  const openButton = event.target.closest("[data-history-open]");
  const deleteButton = event.target.closest("[data-history-delete]");
  if (openButton) openHistoryItem(openButton.dataset.historyOpen);
  if (deleteButton) deleteHistoryItem(deleteButton.dataset.historyDelete);
});
document.querySelectorAll("[data-view-target]").forEach(item => {
  item.addEventListener("click", event => {
    event.preventDefault();
    setView(item.dataset.viewTarget);
  });
});
$("#loadSampleButton").addEventListener("click", () => {
  $("#meetingTemplateSelect").value = "operation";
  $("#transcriptInput").value = sampleText;
  renderTranscriptStats(analyzeTranscript(sampleText));
  showToast("示例会议已载入。");
});
$("#fileInput").addEventListener("change", async event => {
  const [file] = event.target.files;
  if (!file) return;
  $("#transcriptInput").value = await file.text();
  renderTranscriptStats(analyzeTranscript($("#transcriptInput").value));
  showToast("文本已导入。");
});
$("#transcriptInput").addEventListener("input", () => {
  renderTranscriptStats(analyzeTranscript($("#transcriptInput").value));
});
$("#questionInput").addEventListener("keydown", event => {
  if (event.key === "Enter") askQuestion();
});
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && $("#authModal").classList.contains("is-open")) {
    closeAuthModal();
  }
});
window.addEventListener("hashchange", () => {
  const hashView = (window.location.hash || "#dashboard").slice(1);
  if (hashView !== state.currentView) setView(hashView);
});

state.currentUser = loadSavedUser();
state.subscription = loadSavedSubscription();
state.minutesHistory = loadMinutesHistory();
updateAuthUI();
updateSubscriptionUI();
renderCheckout();
selectPaymentMethod(state.paymentMethod);
renderInitial();
renderHistory();
setView((window.location.hash || "#intro").slice(1));
initScrollMotion();
