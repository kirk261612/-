# 会速记 AI 会议纪要助手

这是一个面向日常办公场景的 AI 提效工具，用于把会议转写文本整理成结构化纪要，并支持对纪要内容继续追问。项目包含前端交互页面、Node.js 后端逻辑、可选 LLM API 调用，以及无 API Key 时可本地运行的演示引擎。

## 选题场景

场景 A：会议纪要助手。用户输入会议转写文本或上传 `.txt` 文件，系统自动生成会议摘要、参会人、关键决策、待办事项、风险提醒，并支持“本次会议有哪些决策”“谁负责哪些事项”等追问。

## 功能模块

- 会议输入：支持粘贴转写文本、上传 `.txt` 文件、载入示例。
- 纪要生成：输出摘要、主题、决策、待办、风险和追问建议。
- 会后追问：基于生成的纪要进行多轮问答。
- API 接入：配置 OpenAI 兼容 API 后调用真实大模型。
- 本地演示：没有 API Key 时自动使用本地规则引擎，保证可以直接运行体验。

## 技术方案

- 前端：原生 HTML、CSS、JavaScript，实现可视化交互页面。
- 后端：Node.js 内置 `http` 模块提供静态资源和 API。
- AI 方案：Prompt 工程为主，可选接入 LLM API；本地演示引擎用于无 Key 场景兜底。
- 追问方案：生成纪要后将结构化结果作为上下文，针对决策、待办、风险、参会人等问题返回检索增强回答。

## 环境要求

- Node.js 18 或更高版本。

## 启动方式

```bash
npm start
```

启动后访问：

```text
http://localhost:3000
```

## API Key 配置

项目可不配置 API Key 直接运行。如果需要接入真实大模型：

1. 复制 `.env.example` 为 `.env`。
2. 填写 OpenAI 兼容接口配置：

```bash
PORT=3000
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

3. 重新启动服务：

```bash
npm start
```

## 使用示例

示例输入：

```text
张敏：今天讨论 7 月运营活动复盘和下周上线准备。上周新用户转化率 12.8%，比目标低 2 个点，主要卡在权益说明不清楚。
李华：客服侧收到 36 条咨询，用户主要问“新人礼包”和“连续包月”能否叠加。建议在活动页增加一段套餐差异说明。
王磊：技术侧可以在周五前完成活动页说明模块，埋点也能一起补上。需要产品今天确认文案。
陈洁：决定保留新人礼包，不叠加连续包月折扣。运营今天 18 点前给出最终文案，客服明天更新 FAQ。
```

示例输出：

- 摘要：会议围绕转化率、客服咨询、活动页说明和上线安排展开。
- 决策：保留新人礼包，不叠加连续包月折扣；本周五灰度上线。
- 待办：王磊负责上线检查；李华负责 FAQ 更新和客服话术同步。
- 风险：文案未及时确认会影响周五上线窗口。

示例输出截图见：

- `docs/images/desktop-output.png`
- `docs/images/mobile-output.png`

## 测试

```bash
npm test
```

## 目录结构

```text
.
├── data/sample-meeting.txt
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── test/assistant.test.js
├── server.js
├── package.json
├── .env.example
├── DESIGN.md
└── README.md
```
