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
│   └── PROMPT.md
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
- `detail`：用于详情页正文，建议 2~4 段（可使用 YAML 多行文本 `|`）。- `category`：支持多选，用逗号分隔，例如 `应用/产业,生态` 表示既是商业产品又涉及生态建设。- `url` + `source`：用于详情页底部统一渲染“来源链接”。

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

## 本地打开说明

不要直接双击 `index.html` 以 `file://` 方式打开。

当前首页和详情页都会通过 Ajax / `fetch()` 读取 `news/*.md`，浏览器通常会拦截 `file://` 下的这类请求，因此需要用一个本地 HTTP 服务启动项目。

推荐使用 Python：

```powershell
cd D:\Onebox\AI-Daily-Static
py -m http.server 8080
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
