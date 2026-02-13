/**
 * 使用 LLM 生成论文摘要
 * @author Yingjie Wang @ SIOC
 * @repository https://github.com/Fucose/zotero-AI-script 
 * @source 基于 https://github.com/cs-qyzhang/zotero-ai-summary
 *
 * 简化版：无需外部服务器，使用 Zotero 内置的 PDF 文本提取
 */

// ========== 配置区域 ==========

// OpenAI 兼容 API 的基础地址
let openaiBaseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";

// 用于摘要生成的模型名称
let modelName = "qwen-flash";

// LLM 服务的 API 密钥
let apiKey = "your_api_key_here";

// 笔记标题模板（{{modelName}} 会被替换为实际模型名）
let headerTemplate = "<h2>AI Generated Summary ({{modelName}})</h2>";

// ========== 用户自定义区域 ==========
// 自定义摘要提示词
// 你可以修改该字符串来调整摘要风格、语言和详细程度
let userPromptInstructions = `
请提供一份清晰、具体的中文摘要，解释论文的核心贡献，重点描述方法与结果之间的因果关系。

请按以下结构回答：

1. **本文针对现有工作中的哪些具体问题或局限？**
2. **作者提出或使用了什么具体方法/思路/技术？**
3. **该方法产生了哪些具体结果？这些结果如何解决原始问题？**
4. **这些发现的更广泛影响或意义是什么？**

要求：
- 具体明确，避免空泛描述
- 清晰体现方法与结果的因果关系
- 不要仅复制或改写摘要（abstract）
- 聚焦能体现贡献的技术细节
- 若原文有定量数据，请尽量包含

示例格式：
"现有研究在[具体问题]方面存在局限。本文提出了[具体方法/技术]，通过[技术细节]实现了[具体功能]。实验证明，该方法能够[量化结果]，相比现有方法提升了[具体数据]。这一突破解决了[具体应用]中的关键挑战。"
`;

// ========== 高级配置（可选） ==========
// 如有需要，请取消注释并修改

// Temperature 参数（0-2，越高越随机）
// let temperature = 0.7;

// LLM 响应的最大 token 数
// let maxTokens = 4096;

// Top-P 采样参数（0-1）
// let topP = 1.0;

// 跳过已有摘要检查（每次都重新生成）
// let skipExistingCheck = false;

// ========== 配置结束 ==========


// ========== 内部逻辑（请勿修改） ==========

/**
 * 构建包含占位符的摘要提示词
 * 警告：请勿修改此函数
 */
function buildSummaryPrompt() {
    return `以下是一篇题为“{title}”的研究论文全文。
--- 论文开始 ---
{text}
--- 论文结束 ---

${userPromptInstructions}`;
}

/**
 * 替换字符串中的占位符
 */
function formatString(str, params) {
    return str.replace(/{([^{}]*)}/g, (match, key) => {
        return params[key] ?? match;
    });
}

/**
 * 判断附件是否支持文本提取
 */
function isSupportedAttachment(attachment) {
    if (!attachment) return false;
    let contentType = attachment.attachmentContentType;
    return contentType === 'application/pdf' || contentType === 'text/html';
}

/**
 * 根据当前上下文解析摘要目标并提取文本。
 * 同时支持顶层条目与 PDF/HTML 附件。
 */
async function resolveTargetAndFulltext(selectedItem) {
    if (!selectedItem) {
        throw new Error("No item selected.");
    }

    // 若选中的是顶层常规条目：寻找第一个可提取文本的受支持附件。
    if (selectedItem.isRegularItem && selectedItem.isRegularItem() && selectedItem.isTopLevelItem && selectedItem.isTopLevelItem()) {
        let attachmentIDs = selectedItem.getAttachments();
        if (!attachmentIDs || attachmentIDs.length === 0) {
            throw new Error("No attachments found on the selected item.");
        }

        for (let id of attachmentIDs) {
            let attachment = Zotero.Items.get(id);
            if (!isSupportedAttachment(attachment)) {
                continue;
            }
            let text = await getAttachmentFulltext(attachment);
            if (!text) {
                continue;
            }
            return {
                attachment: attachment,
                noteParent: selectedItem,
                fulltext: text
            };
        }

        throw new Error("No extractable PDF/HTML text found on the selected item.");
    }

    // 若直接选中的是附件。
    if (selectedItem.isAttachment && selectedItem.isAttachment()) {
        if (!isSupportedAttachment(selectedItem)) {
            throw new Error("Please select a PDF/HTML attachment or a top-level regular item.");
        }

        let parentID = selectedItem.parentID || selectedItem.parentItemID;
        let parentItem = parentID ? Zotero.Items.get(parentID) : null;
        let text = await getAttachmentFulltext(selectedItem);
        if (!text) {
            throw new Error("No extractable text found in the selected attachment. It may not be indexed yet by Zotero.");
        }
        return {
            attachment: selectedItem,
            noteParent: parentItem || selectedItem,
            fulltext: text
        };
    }

    throw new Error("Please select a top-level regular item or a PDF/HTML attachment.");
}

/**
 * 从指定附件中提取全文
 */
async function getAttachmentFulltext(attachment) {
    if (!isSupportedAttachment(attachment)) {
        return null;
    }

    try {
        let text = await attachment.attachmentText;
        if (text && text.trim().length > 0) {
            return text.trim();
        }
    } catch (error) {
        return null;
    }

    return null;
}

/**
 * 向 OpenAI 兼容 API 发送请求
 */
async function openaiRequest(message) {
    const payload = {
        model: modelName,
        messages: [{
            role: 'user',
            content: message
        }],
        temperature: 0.3
    };

    if (typeof temperature === 'number') {
        payload.temperature = temperature;
    }
    if (typeof maxTokens === 'number') {
        payload.max_tokens = maxTokens;
    }
    if (typeof topP === 'number') {
        payload.top_p = topP;
    }

    let response;
    try {
        response = await fetch(`${openaiBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        throw new Error(`Network error while calling ${openaiBaseUrl}: ${error.message}`);
    }

    if (!response.ok) {
        let message = undefined;
        try {
            const data = await response.json();
            message = data.detail || data.error?.message;
        } catch (error) {}
        throw new Error(`${openaiBaseUrl} HTTP Error: ${response.status} ${response.statusText}${message ? ` - ${message}` : ''}`);
    }

    let result;
    try {
        result = await response.json();
    } catch (error) {
        throw new Error(`Error when parsing json of ${openaiBaseUrl}/chat/completions: ${error.message}`);
    }

    if (!Array.isArray(result.choices) || result.choices.length === 0) {
        throw new Error("Invalid LLM response: missing choices.");
    }

    let content = result.choices[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
        throw new Error("Invalid LLM response: missing choices[0].message.content.");
    }

    return content;
}

/**
 * 将 Markdown 格式摘要转换为 HTML
 */
function formatSummaryAsHtml(summaryText) {
    if (!summaryText) return '';

    let text = summaryText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 先将 Markdown 粗体转换为 HTML，再进行块级解析。
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    const lines = text.split('\n');
    const html = [];
    let inUl = false;
    let inOl = false;

    function closeLists() {
        if (inUl) {
            html.push('</ul>');
            inUl = false;
        }
        if (inOl) {
            html.push('</ol>');
            inOl = false;
        }
    }

    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) {
            closeLists();
            continue;
        }

        let h3Match = line.match(/^###\s+(.+)$/);
        if (h3Match) {
            closeLists();
            html.push(`<h3>${h3Match[1]}</h3>`);
            continue;
        }

        let h2Match = line.match(/^##\s+(.+)$/);
        if (h2Match) {
            closeLists();
            html.push(`<h2>${h2Match[1]}</h2>`);
            continue;
        }

        let ulMatch = line.match(/^\-\s+(.+)$/);
        if (ulMatch) {
            if (inOl) {
                html.push('</ol>');
                inOl = false;
            }
            if (!inUl) {
                html.push('<ul>');
                inUl = true;
            }
            html.push(`<li>${ulMatch[1]}</li>`);
            continue;
        }

        let olMatch = line.match(/^\d+\.\s+(.+)$/);
        if (olMatch) {
            if (inUl) {
                html.push('</ul>');
                inUl = false;
            }
            if (!inOl) {
                html.push('<ol>');
                inOl = true;
            }
            html.push(`<li>${olMatch[1]}</li>`);
            continue;
        }

        closeLists();
        html.push(`<p>${line.replace(/\s{2,}/g, ' ')}</p>`);
    }

    closeLists();
    return html.join('\n');
}

// ========== 主程序 ==========

if (!item) return;

let progressWindow = undefined;
let itemProgress = undefined;

// 标准化 API URL（移除末尾斜杠）
if (openaiBaseUrl.endsWith('/')) {
    openaiBaseUrl = openaiBaseUrl.slice(0, -1);
}

try {
    let target = await resolveTargetAndFulltext(item);
    let targetAttachment = target.attachment;
    let noteParent = target.noteParent;
    let fulltext = target.fulltext;
    let title = noteParent.getField ? noteParent.getField('title') : "";
    if (!title || !title.trim()) {
        title = targetAttachment.getField ? targetAttachment.getField('title') : "";
    }
    if (!title || !title.trim()) {
        title = "Untitled Item";
    }
    const shortTitle = title.length > 50 ? title.substring(0, 50) + "..." : title;

    // 初始化进度窗口
    progressWindow = new Zotero.ProgressWindow({
        "closeOnClick": true,
    });
    progressWindow.addDescription(shortTitle);
    itemProgress = new progressWindow.ItemProgress();
    itemProgress.setItemTypeAndIcon("note");
    itemProgress.setText("Extracting PDF text...");
    progressWindow.show();

    // 检查摘要是否已存在
    let summary_exist = false;
    if (!(typeof skipExistingCheck === 'boolean' && skipExistingCheck)) {
        let noteIds = noteParent.getNotes ? noteParent.getNotes() : [];
        let header = headerTemplate.replace("{{modelName}}", modelName);
        for (const id of noteIds) {
            let note = Zotero.Items.get(id);
            if (!note) continue;
            let content = note.getNote();
            if (typeof content === 'string' && content.startsWith(header)) {
                summary_exist = true;
                break;
            }
        }
    }

    if (summary_exist) {
        itemProgress.setProgress(100);
        itemProgress.setText("Summary already exists.");
        progressWindow.startCloseTimer(2000);
        return;
    }

    // 提取附件全文
    itemProgress.setProgress(20);
    itemProgress.setText("Extracting PDF text...");

    if (!fulltext || fulltext.trim().length === 0) {
        throw new Error("No PDF text found. The PDF may not have been indexed yet by Zotero. Please wait a few minutes and try again.");
    }

    if (fulltext.trim().length < 100) {
        throw new Error(`Extracted text is too short (${fulltext.length} characters). The PDF may not have been properly indexed by Zotero yet. Please wait a few minutes and try again.`);
    }

    // 生成摘要
    itemProgress.setProgress(50);
    itemProgress.setText("Generating summary...");

    const summaryText = await openaiRequest(
        formatString(buildSummaryPrompt(), { title: title, text: fulltext })
    );

    // 创建笔记
    itemProgress.setProgress(80);
    itemProgress.setText("Creating note...");

    const headerHtml = headerTemplate.replace("{{modelName}}", modelName);
    let summaryHtml;
    try {
        summaryHtml = formatSummaryAsHtml(summaryText);
    } catch (error) {
        // 如果 HTML 转换失败，使用 <pre> 显示原始文本
        summaryHtml = `<pre>${summaryText.replace(/</g, '&lt;')}</pre>`;
    }

    const finalHtml = headerHtml + '\n' + summaryHtml;

    let newNote = new Zotero.Item('note');
    newNote.setNote(finalHtml);
    newNote.parentID = noteParent.id;
    newNote.libraryID = noteParent.libraryID;
    await newNote.saveTx();

    // 完成
    itemProgress.setProgress(100);
    itemProgress.setText("Summary generated successfully!");
    progressWindow.startCloseTimer(2000);

} catch (error) {
    const errorMessage = `Error: ${error && error.message ? error.message : String(error)}`;

    if (itemProgress) {
        itemProgress.setError();
        itemProgress.setText(errorMessage);
    }
    if (progressWindow) {
        progressWindow.startCloseTimer(5000);
    } else {
        Zotero.alert(null, "AI Summary Error", errorMessage);
    }
}
