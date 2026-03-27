# AI Daily（纯静态版）

一个简约的 AI 新闻网址示例：
- 无需后端
- HTML / CSS / JS 分离
- 新闻数据按天存放在 `news/*.md`
- 支持按分类筛选 + 滚动懒加载更早日期
- 首页点击标题进入站内详情页（`detail.html?id=YYYY-MM-DD-idx`）
- 可部署到 GitHub Pages

## 目录结构

```text
.
├── index.html
├── styles.css
├── app.js
├── detail.html
├── detail.js
├── prompts/
│   ├── PROMPT.md
│   ├── kg-extract.md
│   └── insights.md
├── vendor/
│   └── jquery-3.7.1.min.js
└── news/
    ├── manifest.js        # 新闻清单（列出每日 Markdown 文件）
    ├── 2026-03-14.md
    ├── 2026-03-13.md
    └── ...
```

## 固定标签定义

本项目采用固定标签体系，不再添加新标签。共有9个标签（包括2个固定导航标签）：

### 固定导航标签
- **每日**：按天组织的日报视图（默认首页视图）
- **全部**：以列表形式展示所有新闻

### 内容分类标签（3个或以上可选）
1. **应用/产业**：工业界、商业化应用、产品发布、商业动态等内容
2. **论文**：学术研究、论文发布、研究进展等内容
3. **基础设施**：基础设施、系统优化、工具链、平台建设等内容
4. **观察**：行业洞察、趋势分析、观察评论等内容
5. **安全**：安全相关、治理、合规、隐私保护等内容
6. **生态**：生态建设、平台功能、规范制定等内容
7. **开源**：开源项目、开源社区、开源工具等内容

### 新闻标签使用说明
- 标签 3-9（应用/产业、论文、基础设施、观察、安全、生态、开源）允许**多选**
- category 字段使用逗号分隔的格式表示多个标签，例如：`应用/产业,生态`
- 如果新闻涉及多个领域，应该列举所有相关标签，而不是只选主要标签
- 当用户点击某个标签时，会显示所有包含该标签的新闻，无论该新闻是否还有其他标签

## 新闻 Markdown 格式

每个日文件（如 `news/2026-03-14.md`）示例：

```md
day: 2026-03-14

## 新闻标题
- source: 来源
- date: 2026-03-14
- category: 论文,基础设施
- url: https://example.com/news
- summary: 一句话摘要（首页列表使用）
- detail: |
    第一段：背景

    第二段：核心更新

    第三段：影响与后续观察点
```

可在同一个文件中追加多个 `## 标题` 区块，每个区块对应一条新闻。

字段说明：
- `summary`：用于首页新闻列表，仅展示一句话摘要。
- `detail`：用于详情页正文，建议 2~4 段（可使用 YAML 多行文本 `|`）。
- `category`：支持多选，用逗号分隔，例如 `应用/产业,生态` 表示既是商业产品又涉及生态建设。
- `url` + `source`：用于详情页底部统一渲染“来源链接”。

## 清单文件（manifest）

`news/manifest.js` 由全局变量提供新闻文件列表：

```js
window.NEWS_MANIFEST = {
  version: '20260314',
  files: ['2026-03-14.md', '2026-03-13.md']
};
```

- 新增一天新闻时，追加对应 Markdown 文件名到 `files`。
- 建议同步更新 `version`，用于给 `app.js` 与新闻请求附加版本号，避免浏览器缓存旧内容。

## 可视化说明

项目当前包含两个分析视图：

- `wordcloud.html`：高频词云
- `clues.html`：线索知识图谱

这两个视图都属于“帮助浏览新闻、发现模式”的辅助工具，不是事实数据库，也不做因果判断。

### 高频词云是什么

高频词云会在当前筛选范围内，统计新闻标题、摘要和正文中反复出现的词，并按词频展示。

词云的处理方式大致如下：

- 先对 `title`、`summary`、`detail` 做文本规范化。
- 优先使用浏览器内置的 `Intl.Segmenter('zh-CN')` 做中文分词；如果浏览器不支持，就退化为按空白切分。
- 同时补抓英文/拉丁字母词串。
- 过滤停用词、分析噪声词、过短词、纯数字词；年份如 `2026` 可以保留。
- 统计每个词的总出现次数、涉及新闻数和日期分布。
- 页面上默认只展示达到最小词频阈值的前若干个词。

这意味着词云更接近“过滤后的高频词统计”，不是 TF-IDF、TextRank 或大模型语义抽取。

### 线索知识图谱是什么

线索页会把当前筛选范围内的新闻组织成一张图，图中同时包含：

- 文章节点
- 来源节点
- 分类节点
- 从文章正文中抽取出的实体节点

它的目标不是给出结论，而是把“哪些实体在多篇新闻里一起出现、围绕哪些主题聚集”可视化出来。

### 知识图谱里的箭头是什么意思

图里有两类边，所以你会看到有的线有箭头，有的没有：

- 有箭头：表示文章与其属性之间的归属关系，例如 `文章 -> 来源`、`文章 -> 分类`、`文章 -> 实体`
- 没箭头：表示实体与实体之间的强共现关系，也就是“它们在多篇新闻里反复一起出现”

因此，箭头不是“影响方向”或“因果方向”，只是为了区分两种不同类型的连接。

### 实体是怎么抽出来的

线索页中的“实体”不是命名实体识别模型直接抽取的结果，而是一套规则化的候选提取流程：

- 从 `title + summary` 和 `detail` 中抽取候选词。
- 用几组英文模式优先识别看起来像专名的短语，例如首字母大写短语、全大写缩写、带 `+` 的词。
- 再对文本做中英文分词，补充更多候选词。
- 对候选词做归一化，例如统一大小写、清理首尾符号、合并空白。
- 过滤停用词、噪声词、过短词、纯数字词。
- 固定分类词 `应用/产业`、`论文`、`基础设施`、`观察`、`安全`、`生态`、`开源` 不再重复作为实体节点出现，而是保留为分类节点。

为了强调“标题和摘要中的词更重要”，系统还会做一个简单加权：

- 标题/摘要中命中英文实体模式：权重更高
- 正文中命中英文实体模式：权重较低
- 标题/摘要中的分词结果：权重中等
- 正文前部的分词结果：权重较低

每篇新闻最终只保留一小组得分最高的实体候选，再进入后续的共现计算。

### 线索是怎么筛出来的

线索页不是简单把所有词都连起来，而是会继续做一层过滤和归纳：

- 每篇新闻先保留得分最高的一组实体候选。
- 全局再保留在当前时间范围内更常见的一部分实体，避免图过于嘈杂。
- 如果两个实体在多篇新闻中共同出现，就会形成一条实体共现边。
- 只有达到最低共现阈值的边，才会被当作“强共现边”显示出来。
- 再把强共现边连成若干实体社区（连通分量），生成线索卡片。
- 每张线索卡片会附带证据新闻、主导分类和对应子图。

因此，线索卡片代表的是“可解释的重复共现模式”，不是自动生成的新闻摘要，更不是事实判断。

### 怎么理解线索结果

阅读线索图谱时，建议把它当成一个探索工具：

- 它适合帮助你快速发现同一时间窗里反复一起出现的人名、机构名、主题词和分类。
- 它不保证抽出的每个实体都完全准确，也不保证所有重要关系都能被覆盖。
- 如果某条线索看起来有意思，最好点击证据新闻继续读原文，而不是只看图本身。

### 全屏浏览

词云区域和知识图谱区域都提供右上角的全屏切换按钮，适合在大屏上查看布局和细节；退出全屏可再次点击按钮或使用 `Esc`。

## 本地打开说明

不要直接双击 `index.html` 以 `file://` 方式打开。

当前首页和详情页都会通过 Ajax / `fetch()` 读取 `news/*.md`，浏览器通常会拦截 `file://` 下的这类请求，因此需要用一个本地 HTTP 服务启动项目。

推荐使用 Python：

```powershell
cd D:\Onebox\AI-Daily-Static
python3 -m http.server 8080
```

然后在浏览器打开：

```text
http://localhost:8080
```

说明：
- 首页依赖的 jQuery 已改为本地文件 `vendor/jquery-3.7.1.min.js`，离线也能加载脚本。
- 但新闻内容仍然需要通过本地 HTTP 服务读取，所以启动方式仍然不是双击 HTML。

## 新闻来源网站

### 官方一手来源（优先）

#### 大模型公司官方
- **OpenAI** - https://openai.com/news
- **Anthropic** - https://www.anthropic.com/news
- **Google DeepMind** - https://deepmind.google/
- **Meta AI** - https://ai.meta.com/
- **xAI** - https://x.ai/
- **Mistral AI** - https://mistral.ai/

#### 基础设施 & 平台官方
- **NVIDIA** - https://blogs.nvidia.com/
- **Microsoft Azure** - https://azure.microsoft.com/en-us/blog/
- **Hugging Face** - https://huggingface.co/blog
- **Stability AI** - https://stability.ai/news
- **TensorFlow** - https://blog.tensorflow.org/
- **PyTorch** - https://pytorch.org/blog/

### 学术论文 & 研究
- **arXiv AI/ML** - https://arxiv.org/list/cs.AI
- **Papers with Code** - https://paperswithcode.com/
- **ACL Anthology** - https://aclanthology.org/
- **Nature AI** - https://www.nature.com/

### 高质量科技媒体（二手来源）
- **VentureBeat** - https://venturebeat.com/
- **The Information** - https://theinformation.com/
- **MIT Technology Review** - https://www.technologyreview.com/
- **TechCrunch** - https://techcrunch.com/
- **Reuters Technology** - https://www.reuters.com/technology/

## 自动化脚本

项目新增了一个 Python CLI：`scripts/ai_daily.py`，把 Prompt 里重复执行的几步收敛成了命令行工具。

### 1. 抓取当天候选新闻

```powershell
python scripts/ai_daily.py collect --date 2026-03-17
```

默认会抓取：
- TechCrunch 当天 AI 相关文章
- NVIDIA Blog 当天官方文章
- arXiv `cs.AI / cs.CL / cs.LG` 当天新列表中的高相关论文

也可以输出 JSON，方便后续二次处理：

```powershell
python scripts/ai_daily.py collect --date 2026-03-17 --format json
```

### 2. 生成精简 Prompt

```powershell
python scripts/ai_daily.py prompt --date 2026-03-17 > prompt.txt
```

默认使用 `compact` 模式，只输出必要规则和当天候选素材，比直接复制整份 `prompts/PROMPT.md` 更省 token。

如果你仍想保留原 Prompt 全文，也可以：

```powershell
python scripts/ai_daily.py prompt --date 2026-03-17 --style full > prompt.txt
```

### 3. 校验 AI 生成结果

```powershell
python scripts/ai_daily.py validate --input draft.md
```

它会检查：
- `day` / `date` 是否一致
- 是否有 7 到 10 条新闻
- 是否覆盖 `应用/产业`、`论文`、`基础设施`
- 是否至少有 1 条 `观察`
- `category` 是否只使用固定标签
- `summary` / `detail` / 观察类参考来源是否符合约束

### 4. 发布日报并更新 manifest

如果 AI 已经生成好 Markdown：

```powershell
python scripts/ai_daily.py publish --date 2026-03-17 --input draft.md
```

脚本会自动：
- 保存为 `news/2026-03-17.md`
- 更新 `news/manifest.js`
- 同步设置 `version: '20260317'`

### 建议工作流

```powershell
python scripts/ai_daily.py collect --date 2026-03-17 > candidates.md
python scripts/ai_daily.py prompt --date 2026-03-17 > prompt.txt
# 将 prompt.txt 发给具备联网能力的 AI，拿回 draft.md
python scripts/ai_daily.py validate --date 2026-03-17 --input draft.md
python scripts/ai_daily.py publish --date 2026-03-17 --input draft.md
```

## 静态 KG / 洞察升级

项目现在除了新闻列表、词云和线索页之外，还新增了一套纯静态的知识图谱与洞察产物链路，整个站点仍然可以直接部署到 GitHub Pages。

- `clues.html`：改为本地 `d3` 力导向动态图，支持拖拽、缩放、图例、右侧详情面板，以及“全图 / 线索子图”切换。
- `insights.html`：新增静态洞察报告页，支持按 `?date=YYYY-MM-DD` 浏览日报告，保留主题子图、证据新闻索引和稳定文章 ID。
- `kg/*.json`：每天一份 KG 日产物，包含 `signal_records`、滚动 `clue_packets` 和分析窗口信息。
- `insights/*.json`：每天一份静态洞察报告。
- `memory/recent.json` 与 `memory/archive.json`：分别保存近 30 天详细记忆和更早历史的压缩长期记忆。
- `prompts/kg-extract.md`：KG 抽取的通用模板。
- `prompts/insights.md`：洞察报告的通用模板。

### 新增命令

```powershell
python scripts/ai_daily.py kg-prompt --date 2026-03-26
python scripts/ai_daily.py kg-build --date 2026-03-26
python scripts/ai_daily.py insight-prompt --date 2026-03-26
python scripts/ai_daily.py insight-build --date 2026-03-26
python scripts/ai_daily.py memory-refresh
python scripts/ai_daily.py repair-static
```

`kg-prompt` 与 `insight-prompt` 现在只按需渲染 prompt 到标准输出或你指定的文件，不会再自动写入 `drafts/generated/`。

### 发布后的离线流程

```powershell
python scripts/ai_daily.py publish --date 2026-03-26 --input draft.md
```

执行 `publish` 后，脚本现在会继续自动：

1. 写入 `news/YYYY-MM-DD.md` 并更新 `news/manifest.js`
2. 重建静态 KG 日产物与 `kg/manifest.js`
3. 重建静态洞察报告与 `insights/manifest.js`
4. 刷新近期 / 长期记忆文件
