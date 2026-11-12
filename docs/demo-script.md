# Claim Lens · 30 秒演示脚本

已生成终端 GIF：`docs/demo.gif`。重新录制：

```bash
./scripts/record-demo.sh          # 人工录制时
asciinema rec -y --overwrite --cols 100 --rows 30 \
  -c "bash scripts/record-demo.sh" demo.cast
agg --font-size 18 --theme monokai --font-family "Menlo,PingFang SC" demo.cast docs/demo.gif
```

## 版本 A：中文（微信群 / 即刻 / 视频号）

| 时间 | 画面 | 旁白 |
|---|---|---|
| 0:00–0:03 | 黑底大字：**AI 理赔，不该是聊天框** | 大多数 AI 理赔，是让模型猜一个结论。 |
| 0:03–0:08 | 终端输入：`node bin/cli.js assess --policy data/policies/p1.json --claim data/claims/c1.json` | Claim Lens 反过来：规则先判定，每个结论都引用保单条款。 |
| 0:08–0:15 | 终端输出：`结论：可赔付`、`报损 ¥9,800`、`可赔 ¥9,300`、条款 `CL-A1` | 输入保单和理赔材料，几秒输出可赔金额、检查项和条款依据。 |
| 0:15–0:22 | 浏览器打开 `examples/report.html`，缓慢滚动展示金额、检查项、条款引用 | 每一个数字都能追溯到条款，不是一段无法复核的文字。 |
| 0:22–0:26 | 终端：`node bin/cli.js eval`，输出 `20/20 passed · accuracy 100%` | 20 个边界案例，20 个通过。 |
| 0:26–0:30 | GitHub 页面 + 字幕：**github.com/cdcailf/claim-lens** | 开源、MIT，Claude Code 可以直接调用。 |

**完整旁白（约 100 字，语速正常约 28 秒）**

> 大多数 AI 理赔，是让模型猜一个结论。Claim Lens 反过来：规则先判定，每个结论都引用保单条款。输入保单和理赔材料，几秒输出可赔金额、检查项和条款依据。每一个数字都能追溯到条款，不是一段无法复核的文字。20 个边界案例，20 个通过。开源、MIT，Claude Code 可以直接调用。

## 版本 B：英文（HN / X / Product Hunt）

| Time | Visual | Voiceover |
|---|---|---|
| 0:00–0:03 | **AI claims shouldn't be a chat box.** | Most AI claims tools guess. |
| 0:03–0:09 | Terminal: `node bin/cli.js assess ...` | Claim Lens decides with rules first, and cites the exact policy clause. |
| 0:09–0:16 | Output: approved, ¥9,300, clause CL-A1 | Claim amount, checks, and clause citations in seconds. |
| 0:16–0:23 | HTML report scroll | Every number is traceable, not a plausible paragraph. |
| 0:23–0:27 | `eval` → 20/20 | 20 edge cases, 20 passed. |
| 0:27–0:30 | GitHub URL | Open source, MIT, MCP-ready. |

**Voiceover (~85 words)**

> Most AI claims tools guess. Claim Lens decides with rules first, and cites the exact policy clause. Give it a policy and a claim; it returns the approved amount, every check, and the clause behind each decision. Every number is traceable — not a plausible paragraph. Twenty edge cases, twenty passed. Open source, MIT, and ready for Claude Code through MCP.

## 录制前准备

```bash
cd /Users/fional/Projects/claim-lens
npm install
node bin/cli.js assess --policy data/policies/p1.json --claim data/claims/c1.json --html examples/report.html
```

- 终端窗口 1440×900，字号 18，深色主题
- 关闭通知、隐藏桌面文件
- 浏览器只开 `examples/report.html` 和 GitHub 仓库两个标签页
- 全程使用合成数据，不出现真实客户信息

## 录制用命令

```bash
# 1. 核心判定
node bin/cli.js assess \
  --policy data/policies/p1.json \
  --claim data/claims/c1.json

# 2. 生成并打开报告
node bin/cli.js assess \
  --policy data/policies/p1.json \
  --claim data/claims/c1.json \
  --html examples/report.html
open examples/report.html

# 3. 评测
node bin/cli.js eval | head -1

# 4. MCP（可选，15 秒加长版）
claude mcp add claim-lens -- node "$(pwd)/bin/cli.js" mcp
```

## 60 秒加长版结构

1. 0–5：问题（LLM 理赔不可审计）
2. 5–15：PDF 导入 `import --pdf examples/policy-sample.pdf`
3. 15–30：评估理赔，展示结论、金额、条款
4. 30–40：HTML 报告滚动
5. 40–50：`eval` 20/20
6. 50–60：MCP 接入 Claude Code + GitHub 地址

## 字幕文案（无声播放）

```
AI 理赔，不该是聊天框
规则判定 · 条款引用 · 可复核

保单 + 理赔材料 → 结论 / 金额 / 依据
20 个边界案例，20 个通过
开源 · MIT · MCP
github.com/cdcailf/claim-lens
```

## 发布标题

**中文**

- 我做了个开源理赔 Agent：不让 LLM 猜钱，每个结论引用条款
- 保险理赔不该是聊天框：规则优先、条款可追溯的开源工具

**英文**

- Show HN: Claim Lens – rules-first claim adjudication with clause citations
- AI claims don't need a chat box; they need an audit trail

## 链接

- Repo: https://github.com/cdcailf/claim-lens
- Release: https://github.com/cdcailf/claim-lens/releases/tag/v0.2.0
- 30 秒素材：录屏 + 本文档旁白
