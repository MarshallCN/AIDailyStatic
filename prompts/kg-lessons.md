# KG 抽取经验库

这个文件由 Hermes 在每日审计后维护，内容会被自动注入 `kg-extract.md` 的「已积累的抽取经验」小节。
它是知识图谱质量的长期记忆：昨天被扣分的地方，今天变成硬规则。

维护规则：

- 每条经验写成**可执行的指令**，不要写感想。能写进审计器的规则就去改 `scripts/kg_audit.py`，写不进的才放这里。
- 条目格式：`- [YYYY-MM-DD] 指令。（触发原因：某次审计的具体扣分项）`
- 上限 25 条。超出时合并同类项、删掉已经连续 5 天不再复现的条目，保持 prompt 精简。
- 高频实体、易错命名、反复出现的主体写进「实体规范名对照」小节，这是跨文章连通的关键。

## 通用经验

- [2026-09-16] 关系密度是当前最大短板：12 篇只产出 19 条关系、13 个事件，图谱接近孤立点集合。每篇先把「谁做了什么、基于什么、在哪测的、超过了谁」四条边补齐，再考虑别的。（触发原因：首次基线审计，关系/篇 1.58，事件/篇 1.08）
- [2026-09-16] 不要用 `partnership`、`research`、`policy` 这类事件类型当关系类型。发布写 `released_by`，研究产出写 `authored_by`，监管写 `regulates`。（触发原因：基线中 19 条关系里 8 条是 `partnership` 兜底）
- [2026-09-16] 基准测试必须建成三元结构：模型 --`evaluated_on`--> 基准，基准 --`developed_by`--> 提出方。只写实体不连边等于没抽。（触发原因：基线里 τ-Voice、EVA-Bench、Big Bench Audio 三个基准全是孤立节点）
- [2026-09-16] 同一天里 `Google` 与 `Google DeepMind` 同时出现时，两个都保留并用 `subsidiary_of` 连接，不要二选一，也不要互为别名。（触发原因：基线中两者并列但无关系）
- [2026-09-16] 论文类新闻必须抽 `paper` 实体并用 `authored_by` 连到作者与机构；只抽出机构不抽论文会让论文条目在图谱上完全消失。（触发原因：基线 91 个实体中仅 1 个 `paper`）
- [2026-09-16] 成立联盟、机构、学院的新闻中，机构作为 target 使用 founded_by（谁创立了它），不要用 developed_by 兜底。
- [2026-09-16] 数据中心、工厂等设施主体不要标注为 product；认证标准、测试框架不要标注为 policy，先核对主体真实类别再定 type。
- [2026-09-16] 不要把同一主体在同一新闻中的同类观点拆成多个重复事件；主题一致的 trend 事件应合并。
- [2026-09-17] 括号里仅作为并列举例出现的协议名（如"（如 MCP/A2A）"）不构成关系依据，同一句话共同出现不等于有关系；没有实质交互行为支撑就不要为其建立 compared_with / uses 等边。
- [2026-09-17] 硬件/基础设施新闻中，每个被赋予独立型号与具体数量的配置组件（如 Rubin GPU 与 Vera CPU、Blackwell Ultra 与 Rubin 分列）都要分别抽成独立实体并各自建 developed_by 边，不能只抽其一。
- [2026-09-17] 事件参与者的角色标签 partner 只能用于原文明确建立的合作关系，competitor 只能用于明确的对立关系；仅被提及的环境主体、对比参照对象应标为 context 或 object，勿用 partner/competitor 臆造合作或对立。

## 实体规范名对照

跨文章连通依赖拼写完全一致。遇到下列主体一律使用左侧规范名：

| 规范名 | type | 常见变体（写进 aliases） |
| --- | --- | --- |
| Google | company | 谷歌、Google Inc. |
| Google DeepMind | company | DeepMind、谷歌 DeepMind |
| OpenAI | company | Open AI |
| Anthropic | company | — |
| Meta | company | Facebook、Meta AI |
| Microsoft | company | 微软、MSFT |
| NVIDIA | company | 英伟达、Nvidia |
| Alibaba | company | 阿里巴巴、阿里 |
| DeepSeek | company | 深度求索 |
| Moonshot AI | company | 月之暗面、Kimi 团队 |
| Hugging Face | company | HuggingFace、HF |
| arXiv | organization | Arxiv |
