# KG 抽取经验库

这个文件由 Hermes 在每日审计后维护，内容会被自动注入 `kg-extract.md` 的「已积累的抽取经验」小节。
它是知识图谱质量的长期记忆：昨天被扣分的地方，今天变成硬规则。

维护规则：

- 每条经验写成**可执行的指令**，不要写感想。能写进审计器的规则就去改 `scripts/kg_audit.py`，写不进的才放这里。
- 条目格式：`- [YYYY-MM-DD] 指令。（触发原因：某次审计的具体扣分项）`
- 上限 25 条。超出时合并同类项、删掉已经连续 5 天不再复现的条目，保持 prompt 精简。
- 高频实体、易错命名、反复出现的主体写进「实体规范名对照」小节，这是跨文章连通的关键。

## 通用经验

- [2026-11-13] 事件 participants 中出现的每个实体必须同时出现在该篇 entities 列表里，不得跨文章悬空引用；跨文章复用的主体要在每一篇内都单独抽出来。
- [2026-11-14] 把数字搬进 metrics 时必须保留原文限定词：原文写「A 与 B 牵头，另有 N 家参与」时，label 不能直接按总数写 N，应记为 N+2 合计或明确标注「另有」。
- [2026-11-14] 「被指涉 + 未回应」这类静态状态不构成事件：没有动作发生的状态说明并入对应主张事件的 summary，不要为同一份报告拆出多个互相重复的事件。
- [2026-11-14] 架构/特性描述不是事件：只描述软件运行方式（跑在 X 上、不依赖 Y）的内容属于实体属性或关系，不要为其单列事件。
- [2026-11-15] 关系类型不要用泛化的 targets 兜底：当断言实质是"被质疑/被否定/相关但无明确作用"时应选能表达该语义的关系（如 insufficient_for、correlates_with）或干脆删除，共同出现不等于有关系。
- [2026-11-15] 只有单一维度（如速度、成本）占优时用 compared_with 并注明维度，不要用整体语义的 outperforms；outperforms 仅当在目标指标上全面/明确占优时才用。
- [2026-11-15] 评测机构（如 Artificial Analysis）是 organization 而不是 benchmark，应把具体评测集/基准才标为 benchmark，且实体列表与事件参与者的 type 必须一致。
- [2026-11-16] 关系类型要先判断交易实质：invests_in 仅用于对公司的股权/债务注资；资产出售/让渡（如 AWS 把数据中心多数股权卖给 Blackstone）用 sells_to 或 partnership，勿误标为 invests_in。
- [2026-11-16] 人类科学家与 AI 模型的协作研究用 collaborates_with，不要用 partners_with——partners_with 只用于公司或组织之间的伙伴关系。
- [2026-11-16] 事件的 participants 要覆盖原文点名的具体主体（公司、模型），不要只抽主题主体而遗漏被明确点名的关联组织。
- [2026-11-17] 推理框架/平台的『支持正通过公开 PR 落地』是进行时：支持未落地前不要建 模型 --uses--> 框架 的边，落地后用 框架 --integrates--> 模型。
- [2026-11-17] 模型移植类新闻中，执行移植的主体与被移植的目标模型是两个实体：『A 把 B 的性能带到 C 上』时，uses/运行类边挂在 B 与 C 之间，不要挂在执行移植的 A 与 C 之间。
- [2026-11-17] 事件 label 必须保留原文的程度限定：原文写『被视为…首次…之一』时，label 不得去掉限定断言成绝对『首次』。
- [2026-11-18] 「不使用/不依赖某技术」（如零 CUDA 训练）是中性事实，用 does_not_use/avoids 类关系表达，不要用 deprecates——deprecates 仅当原文明确宣告淘汰某技术时才用。
- [2026-11-18] 模型在一篇新闻里被报道的每个基准成绩都要建 evaluated_on 边，不能只写进 metrics 或事件 participants；headline 基准（出现在标题/摘要里的那个）最容易漏，漏了会让图缺最重要的证据边。
- [2026-11-18] 供应链投毒/冒名类安全新闻中，恶意发布的包与官方包同名但性质不同：developed_by 只连官方身份，恶意攻击行为单独建 targets 类边并带上被窃取的目标服务实体，避免图谱读成「官方开发了恶意版本」。
- [2026-11-19] 融资/IPO 类新闻中，公开发行募资、私募配售、含超额配售的上限金额是不同口径，应拆成独立事件或用明确 label 区分，不要用一个 label 承诺小金额却在 summary 里混入更大口径。
- [2026-11-19] 同一事件里多个并列实体（如多点故障、同周宕机）不要两两建 compared_with 关系，除非原文对每对实体有明确逐项对比证据；无证据的并列关联应留在事件证据里而非抽成实体关系边。
- [2026-11-19] "联合测试/联合调查"属于事件内协作事实，不要抽成 partners_with 这一类强合作关系边；只有原文明确表述为组织对组织的业务合作关系时才用 partners_with。
- [2026-11-20] 同一产品的单个发布动作不要拆成多个同类型（launch）事件；不同支撑特性并入一个主事件或用子事件/细节表达，避免互相重叠的重复事件。
- [2026-11-20] 同一实体在多处出现时类型必须一致（如期刊永远标 journal、论文标 paper），不要把期刊名称当作发布对象直接作为关系的 target。
- [2026-11-20] person 实体的 aliases 只放真实姓名与拼写变体（姓氏、英文原名），不要把职务头衔或角色描述塞进 aliases。
- [2026-11-21] 模型本体实体统一用 type=model（Claude、GPT-6.x、Beam、Nitro-P、Kimi 等），product 类型仅保留给面向用户的产品/服务（Codex、Cursor、Computer use 等）。
- [2026-11-21] 政策/项目等专名的规范名必须原样保留原文引号内的官方名称（如「国家美国开源权重计划」），不得调整语序或改写。
- [2026-11-21] 两家机构「都有类似发现/共同印证」的关系应归为 corroborates/related_to，不要抽成 compared_with 这类正面比较关系。

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
