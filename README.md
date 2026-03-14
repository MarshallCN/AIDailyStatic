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
└── news/
    ├── manifest.js        # 新闻清单（列出每日 Markdown 文件）
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

可以直接双击 `index.html` 打开（`file://`）。
