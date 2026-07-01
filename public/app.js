const sampleText = `张敏：今天讨论 7 月运营活动复盘和下周上线准备。上周新用户转化率 12.8%，比目标低 2 个点，主要卡在权益说明不清楚。
李华：客服侧收到 36 条咨询，用户主要问“新人礼包”和“连续包月”能否叠加。建议在活动页增加一段套餐差异说明。
王磊：技术侧可以在周五前完成活动页说明模块，埋点也能一起补上。需要产品今天确认文案。
陈洁：决定保留新人礼包，不叠加连续包月折扣。运营今天 18 点前给出最终文案，客服明天更新 FAQ。
张敏：风险是周五上线窗口比较紧，如果文案今天没有确认，开发会延后。请王磊负责上线检查，李华负责客服话术同步。
李华：我明天下午 3 点前完成 FAQ 更新，并把高频问题整理到知识库。
陈洁：会议结论是本周五灰度上线，下周一看转化率和咨询量数据，再决定是否扩大流量。`;

const state = {
  minutes: null
};

const $ = selector => document.querySelector(selector);

function setLoading(isLoading) {
  $("#generateButton").disabled = isLoading;
  $("#generateButton").textContent = isLoading ? "生成中..." : "生成纪要";
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

function renderMinutes(minutes) {
  state.minutes = minutes;
  $("#resultTitle").textContent = minutes.title || "结构化纪要";
  $("#resultMeta").textContent = `参会人：${(minutes.participants || []).join("、") || "未识别"} · 引擎：${minutes.source === "llm-api" ? "LLM API" : "本地演示"}`;
  $("#engineStatus").textContent = minutes.source === "llm-api" ? "LLM API 已启用" : "本地演示引擎";

  const summary = $("#summaryList");
  summary.innerHTML = "";
  (minutes.summary || []).slice(0, 3).forEach(item => {
    const div = document.createElement("div");
    div.className = "summary-card";
    div.textContent = item;
    summary.appendChild(div);
  });

  listItems("#decisionList", minutes.decisions || []);
  listItems("#riskList", minutes.risks || []);

  const table = $("#actionTable");
  table.innerHTML = "";
  (minutes.actionItems || []).forEach(item => {
    const tr = document.createElement("tr");
    [item.owner, item.task, item.due, item.status].forEach(value => {
      const td = document.createElement("td");
      td.textContent = value || "待确认";
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

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
}

function renderInitial() {
  $("#transcriptInput").value = sampleText;
  $("#summaryList").innerHTML = `<div class="summary-card">粘贴会议转写文本后，系统会自动提炼摘要。</div><div class="summary-card">识别关键决策、待办事项和风险。</div><div class="summary-card">支持基于纪要内容继续追问。</div>`;
  listItems("#decisionList", ["等待生成"]);
  listItems("#riskList", ["等待生成"]);
  $("#actionTable").innerHTML = `<tr><td class="empty" colspan="4">等待生成待办事项</td></tr>`;
}

async function generateMinutes() {
  const title = $("#titleInput").value.trim();
  const transcript = $("#transcriptInput").value.trim();
  if (transcript.length < 20) {
    alert("请先输入至少 20 个字符的会议转写文本。");
    return;
  }

  setLoading(true);
  $("#answerBox").textContent = "";
  try {
    const response = await fetch("/api/minutes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, transcript })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "生成失败");
    renderMinutes(payload.minutes);
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(false);
  }
}

async function askQuestion() {
  if (!state.minutes) {
    alert("请先生成纪要。");
    return;
  }

  const question = $("#questionInput").value.trim();
  if (!question) return;

  $("#answerBox").textContent = "思考中...";
  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, minutes: state.minutes })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "追问失败");
    $("#answerBox").textContent = payload.answer;
  } catch (error) {
    $("#answerBox").textContent = error.message;
  }
}

function copyMinutes() {
  if (!state.minutes) return;
  const minutes = state.minutes;
  const text = [
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
    ...(minutes.risks || []).map(item => `- ${item}`)
  ].join("\n");
  navigator.clipboard.writeText(text);
}

$("#generateButton").addEventListener("click", generateMinutes);
$("#askButton").addEventListener("click", askQuestion);
$("#copyButton").addEventListener("click", copyMinutes);
$("#loadSampleButton").addEventListener("click", () => {
  $("#transcriptInput").value = sampleText;
});
$("#fileInput").addEventListener("change", async event => {
  const [file] = event.target.files;
  if (!file) return;
  $("#transcriptInput").value = await file.text();
});
$("#questionInput").addEventListener("keydown", event => {
  if (event.key === "Enter") askQuestion();
});

renderInitial();
