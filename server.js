const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new Error("请求内容超过 2MB"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").trim();
  }
}

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
  const speakers = lines
    .map(line => line.match(/^([\u4e00-\u9fa5A-Za-z0-9_ -]{2,12})[：:]/))
    .filter(Boolean)
    .map(match => match[1].trim());
  return unique(speakers);
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
  const mentioned = participants.find(name => text.includes(name));
  return mentioned || fallback || "待分配";
}

function summarizeLocal(title, transcript) {
  const rawLines = transcript.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const lines = rawLines.flatMap(line => line.split(/(?<=。)/).map(item => item.trim()).filter(Boolean));
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
  const highlights = sentences
    .filter(sentence => /(目标|主要|建议|结论|决定|风险|数据|咨询)/.test(sentence))
    .slice(0, 5);

  return {
    source: "local-demo-engine",
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
      "会前：收集会议转写文本或录音转写结果",
      "会中：识别议题、结论、待办和风险",
      "会后：按责任人跟踪任务并支持追问"
    ],
    followUpHints: [
      "本次会议有哪些明确决策？",
      "谁需要在什么时候完成什么？",
      "当前最大的上线风险是什么？"
    ]
  };
}

function buildPrompt(title, transcript) {
  return [
    {
      role: "system",
      content: [
        "你是企业办公会议纪要助手，负责把会议转写文本转成可执行纪要。",
        "请只输出 JSON，不要 Markdown。",
        "字段必须包含：title, summary, participants, topics, decisions, actionItems, risks, timeline, followUpHints。",
        "actionItems 每项包含 id, owner, task, due, status。输出要简洁、准确、可执行。"
      ].join("\n")
    },
    {
      role: "user",
      content: `会议标题：${title || "会议纪要"}\n\n会议转写文本：\n${transcript}`
    }
  ];
}

async function callLLM(title, transcript) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  if (!apiKey || !global.fetch) return null;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: buildPrompt(title, transcript),
      temperature: 0.2,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`LLM API 调用失败：${response.status} ${message}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM API 未返回内容");
  return JSON.parse(content);
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

async function handleMinutes(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req) || "{}");
    const title = String(body.title || "").trim();
    const transcript = String(body.transcript || "").trim();
    if (transcript.length < 20) {
      sendJson(res, 400, { error: "请提供至少 20 个字符的会议转写文本。" });
      return;
    }

    let minutes;
    try {
      minutes = await callLLM(title, transcript);
      if (minutes) minutes.source = "llm-api";
    } catch (error) {
      minutes = summarizeLocal(title, transcript);
      minutes.llmWarning = error.message;
    }

    if (!minutes) minutes = summarizeLocal(title, transcript);
    sendJson(res, 200, { minutes });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "生成纪要失败" });
  }
}

async function handleAsk(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req) || "{}");
    const minutes = body.minutes;
    const question = String(body.question || "");
    if (!minutes || !question.trim()) {
      sendJson(res, 400, { error: "请提供纪要结果和追问问题。" });
      return;
    }
    sendJson(res, 200, { answer: buildAnswer(question, minutes) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "追问失败" });
  }
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const safePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

loadEnvFile();

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/minutes") {
    handleMinutes(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/ask") {
    handleAsk(req, res);
    return;
  }
  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }
  sendJson(res, 405, { error: "Method Not Allowed" });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`会议纪要助手已启动：http://${HOST}:${PORT}`);
  });
}

module.exports = {
  summarizeLocal,
  buildAnswer,
  extractParticipants,
  extractDue,
  server
};
