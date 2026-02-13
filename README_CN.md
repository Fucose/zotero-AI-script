# Zotero AI 摘要脚本

在 Zotero 中通过 OpenAI 兼容的 LLM API 生成论文摘要。

## 脚本文件

使用 `zotero_ai_script.js`。

## 致谢

本项目基于 [cs-qyzhang/zotero-ai-summary](https://github.com/cs-qyzhang/zotero-ai-summary)，并改造为可直接用于 Zotero Actions & Tags 的简化脚本方案。

## 功能

- 无需外部服务器
- 支持 OpenAI 兼容的 Chat Completions API
- 支持在顶层条目或 PDF/HTML 附件上运行
- 自动将摘要保存为 Zotero 笔记

## 快速开始

### 1. 安装插件

安装 [zotero-actions-tags](https://github.com/windingwind/zotero-actions-tags)。

### 2. 添加动作

1. 进入 `edit ->setting->Actions & Tags`
2. 点击 `Add a new action`
3. 按如下配置：
- `Name`: `Summarize Paper`
- `Menu Label`: `Summarize Paper`
- `Event`: `None`
- `Operation`: `Script`
- `Data`: 粘贴 `zotero_ai_script.js` 全部内容

### 3. 配置 API

编辑 `zotero_ai_script.js` 的配置区，填写你自己的：
- LLM Base URL
- Model 名称
- API Key

示例：

```javascript
let openaiBaseUrl = "https://your-llm-endpoint/v1";
let modelName = "your-model-name";
let apiKey = "your-api-key";
```

### 4. 自定义 Prompt

你可以修改 `userPromptInstructions` 来调整：
- 输出语言
- 摘要结构
- 详细程度
- 行文风格

## 使用方式

1. 选中顶层论文条目，或选中某个 PDF/HTML 附件。
2. 右键 -> `Actions & Tags` -> `Summarize Paper`。
3. 等待摘要生成。
4. 在新建笔记中查看结果。

## 故障排查

### 无可提取文本

可能是 PDF 尚未被 Zotero 索引，或该 PDF 为图片型（不可选中文本）。

### HTTP / 网络错误

请检查：
- API URL
- API Key
- Model 名称
- 网络连通性
- API 配额

### LLM 响应无效

你的服务提供方可能返回了不兼容或空的响应格式。

## 说明

- 脚本上传的是提取后的文本，不是原始 PDF 文件。
- 如果未启用高级配置中的 `temperature`，默认使用 `0.3`。
- 可选高级参数（`maxTokens`、`topP`）仅在启用时才会发送。

## 环境要求

- Zotero 6 及以上
- [zotero-actions-tags](https://github.com/windingwind/zotero-actions-tags)
- 可访问互联网
- 有效的 API 凭据

## 许可证

MIT License
