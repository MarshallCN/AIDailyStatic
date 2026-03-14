# AI Daily（纯静态版）

一个简约的 AI 新闻网址示例：
- 无需后端
- HTML / CSS / JS 分离
- 新闻数据按天存放在 `news/*.md`
- 支持按分类筛选 + 滚动懒加载更早日期
- 可部署到 GitHub Pages

## 目录结构

```text
.
├── index.html
├── styles.css
├── app.js
└── news/
    ├── index.json          # 新闻清单（列出每日 Markdown 文件）
    ├── 2026-03-14.md
    ├── 2026-03-13.md
    └── ...
```

## 新闻 Markdown 格式

每个日文件（如 `news/2026-03-14.md`）示例：

```md
day: 2026-03-14

## 新闻标题
- source: 来源
- date: 2026-03-14
- category: 分类
- url: https://example.com/news
- summary: 新闻概要
```

可在同一个文件中追加多个 `## 标题` 区块，每个区块对应一条新闻。

## 本地运行

> 注意：由于浏览器安全策略，直接双击 `index.html` 读取新闻文件可能失败（`file://` 跨域限制）。

推荐在项目目录运行：

```bash
python3 -m http.server 4173
```

然后访问：`http://localhost:4173/`
