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
  currentView: "dashboard",
  revealObserver: null,
  lastScrollY: 0
};

const $ = selector => document.querySelector(selector);

const viewMeta = {
  dashboard: {
    title: "会议纪要中枢",
    subtitle: "首页只保留生成和总览，深度能力拆分到独立页面。"
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
  export: {
    title: "交付导出",
    subtitle: "复制或导出 Markdown / JSON，用于周报、邮件和任务系统。"
  },
  subscription: {
    title: "订阅方案",
    subtitle: "为个人、团队和企业选择不同级别的 AI 会议效率能力。"
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

function setView(view) {
  const nextView = viewMeta[view] ? view : "dashboard";
  state.currentView = nextView;
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
  queueRevealRefresh();
}

function getRevealNodes(root = document) {
  return [
    ...root.querySelectorAll(`
      .hero > *,
      .overview-card,
      .metric,
      .panel,
      .module-card,
      .summary-card,
      .plan-card,
      .chip,
      .stat-item,
      .speaker-row,
      table tr
    `)
  ];
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
  $("#scoreRing").style.background = `conic-gradient(var(--blue) 0deg, var(--blue) ${quality.score * 3.6}deg, #e8e8ed ${quality.score * 3.6}deg)`;
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
    [item.owner, item.task, item.due, item.status].forEach(value => {
      const td = document.createElement("td");
      td.textContent = value || "待确认";
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
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
    renderMinutes(enrichMinutes(payload.minutes, transcript));
    showToast("纪要已生成。");
  } catch (error) {
    const minutes = enrichMinutes(summarizeLocal(title, transcript), transcript);
    renderMinutes(minutes);
    showToast("后端 API 暂不可用，已自动切换到浏览器本地兜底。");
  } finally {
    setLoading(false);
  }
}

async function askQuestion() {
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
  if (!state.minutes) {
    showToast("请先生成纪要。");
    return;
  }
  downloadFile(`${state.minutes.title || "minutes"}.md`, buildMarkdown(state.minutes), "text/markdown;charset=utf-8");
  showToast("Markdown 已导出。");
}

function exportJson() {
  if (!state.minutes) {
    showToast("请先生成纪要。");
    return;
  }
  downloadFile(`${state.minutes.title || "minutes"}.json`, JSON.stringify(state.minutes, null, 2), "application/json;charset=utf-8");
  showToast("JSON 已导出。");
}

$("#generateButton").addEventListener("click", generateMinutes);
$("#generateButtonSecondary").addEventListener("click", generateMinutes);
$("#askButton").addEventListener("click", askQuestion);
$("#copyButton").addEventListener("click", copyMinutes);
$("#exportMarkdownButton").addEventListener("click", exportMarkdown);
$("#exportMarkdownButtonSide").addEventListener("click", exportMarkdown);
$("#exportJsonButton").addEventListener("click", exportJson);
$("#copyButtonSide").addEventListener("click", copyMinutes);
$("#actionFilters").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.actionFilter = button.dataset.filter;
  $("#actionFilters").querySelectorAll(".segment").forEach(item => item.classList.toggle("active", item === button));
  if (state.minutes) renderActionTable(state.minutes);
});
document.querySelectorAll("[data-view-target]").forEach(item => {
  item.addEventListener("click", event => {
    event.preventDefault();
    setView(item.dataset.viewTarget);
  });
});
$("#loadSampleButton").addEventListener("click", () => {
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
window.addEventListener("hashchange", () => {
  const hashView = (window.location.hash || "#dashboard").slice(1);
  if (hashView !== state.currentView) setView(hashView);
});

renderInitial();
setView((window.location.hash || "#dashboard").slice(1));
initScrollMotion();
