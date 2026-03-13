# AI Daily（纯静态版）

一个简约的 AI 新闻网址示例：
- 无需后端
- HTML / CSS / JS 分离
- 新闻数据按天存放在 `news/*.json`
- 支持按分类筛选 + 滚动懒加载更早日期
- 可部署到 GitHub Pages

## 目录结构

```text
.
├── index.html
├── styles.css
├── app.js
└── news/
    ├── index.json          # 新闻清单（列出每日 JSON 文件）
    ├── 2026-03-13.json
    ├── 2026-03-12.json
    └── ...
```

## 新闻 JSON 格式

每个日文件（如 `news/2026-03-13.json`）示例：

```json
{
  "day": "2026-03-13",
  "items": [
    {
      "title": "2026-03-13 AI 新闻示例 1：模型 方向更新",
      "summary": "新闻概要",
      "url": "https://example.com/news/2026-03-13/1",
      "source": "OpenAI Blog",
      "category": "模型",
      "date": "2026-03-13"
    }
  ]
}
```

## 本地运行

> 注意：由于浏览器安全策略，直接双击 `index.html` 读取 JSON 可能失败（`file://` 跨域限制）。

推荐在项目目录运行：

```bash
python3 -m http.server 4173
```

然后访问：`http://localhost:4173/`

## GitHub Pages 部署

### 1) 先确认你要用哪种 Pages

1. **User/Org Pages（用户主页）**
   - 仓库名必须是：`<用户名>.github.io`
   - 例如用户名 `marshallcn`，仓库名必须是 `marshallcn.github.io`
   - 访问地址：`https://marshallcn.github.io/`

2. **Project Pages（项目主页）**
   - 仓库名可以是任意（如 `AIDaily`）
   - 访问地址：`https://marshallcn.github.io/AIDaily/`

### 2) 开启 Pages

1. 打开仓库 **Settings → Pages**。
2. 在 **Build and deployment** 中选择：
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`
   - **Folder**: `/ (root)`
3. 保存后等待 1~3 分钟。

## 404 快速排查

- 根目录是否有 `index.html`。
- `news/index.json` 与 `news/*.json` 是否已被推送。
- Pages 是否显示 `Your site is live at ...`。
- 分支是否是 `main`。
- Project Pages 是否使用了 `/<仓库名>/` 路径访问。
