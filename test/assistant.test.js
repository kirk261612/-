const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeLocal, buildAnswer, extractParticipants, extractDue } = require("../server");

const transcript = `张敏：今天讨论上线风险。
李华：客服明天更新 FAQ。
王磊：请王磊负责上线检查，周五前完成。
陈洁：决定本周五灰度上线。风险是文案未确认会延后。`;

test("extracts participants from speaker labels", () => {
  assert.deepEqual(extractParticipants(transcript.split(/\n/)), ["张敏", "李华", "王磊", "陈洁"]);
});

test("extracts due time from Chinese date words", () => {
  assert.equal(extractDue("请王磊周五前完成上线检查"), "周五前");
});

test("local summarizer returns actionable minutes", () => {
  const result = summarizeLocal("上线会", transcript);
  assert.equal(result.title, "上线会");
  assert.ok(result.decisions.some(item => item.includes("灰度上线")));
  assert.ok(result.actionItems.some(item => item.owner === "王磊"));
  assert.ok(result.risks.some(item => item.includes("延后")));
});

test("follow-up answer can list action items", () => {
  const minutes = summarizeLocal("上线会", transcript);
  const answer = buildAnswer("谁负责待办？", minutes);
  assert.match(answer, /王磊/);
});
