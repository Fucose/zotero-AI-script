/**
 * Generate paper summary using LLM
 * @author Yingjie Wang @ SIOC
 * @repository https://github.com/Fucose/zotero-AI-script 
 * @source Based on https://github.com/cs-qyzhang/zotero-ai-summary
 *
 * Simplified version: No external server needed, uses Zotero's built-in PDF text extraction
 */

// ========== CONFIGURATION AREA ==========

// OpenAI-compatible API base URL
let openaiBaseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";

// Model name to use for summarization
let modelName = "qwen-flash";

// API key for your LLM service
let apiKey = "your_api_key_here";

// Note header template ({{modelName}} will be replaced with actual model name)
let headerTemplate = "<h2>AI Generated Summary ({{modelName}})</h2>";

// ========== USER CUSTOMIZABLE AREA ==========
// Your custom prompt instructions for summarization
// You can modify this string to adjust the summary style, language, and detail level
let userPromptInstructions = `
Please provide a clear and specific summary in Chinese that explains the paper's core contribution. Focus on describing the causal relationship between methods and results.

Structure your answer to address:

1. **What specific problem or limitation in existing work does this paper address?**
2. **What exact method/approach/technique did the authors develop or use?**
3. **What specific results did this method produce, and how do these results solve the original problem?**
4. **What is the broader impact or significance of these findings?**

Requirements:
- Be specific and concrete, avoid vague descriptions
- Clearly connect the method to the results (cause-effect relationship)
- Do NOT simply copy or rephrase the abstract
- Focus on technical details that make the contribution clear
- Include quantitative data if available in the text
- Please respond in Chinese

Example format:
"现有研究在[具体问题]方面存在局限。本文提出了[具体方法/技术]，通过[技术细节]实现了[具体功能]。实验证明，该方法能够[量化结果]，相比现有方法提升了[具体数据]。这一突破解决了[具体应用]中的关键挑战。"
`;

// ========== ADVANCED CONFIGURATION (OPTIONAL) ==========
// Uncomment and modify these if needed

// Temperature parameter (0-2, higher = more random)
// let temperature = 0.7;

// Maximum tokens for the LLM response
// let maxTokens = 4096;

// Top-P sampling parameter (0-1)
// let topP = 1.0;

// Skip checking for existing summaries (always regenerate)
// let skipExistingCheck = false;

// ========== END OF CONFIGURATION ==========


// ========== INTERNAL LOGIC (DO NOT MODIFY) ==========

/**
 * Build the summary prompt with placeholders
 * WARNING: Do not modify this function
 */
function buildSummaryPrompt() {
    return `Below is the full text from a research paper titled "{title}".
--- START OF PAPER ---
{text}
--- END OF PAPER ---

${userPromptInstructions}`;
}

/**
 * Replace placeholders in a string
 */
function formatString(str, params) {
    return str.replace(/{([^{}]*)}/g, (match, key) => {
        return params[key] ?? match;
    });
}

/**
 * Check whether attachment can provide extractable text
 */
function isSupportedAttachment(attachment) {
    if (!attachment) return false;
    let contentType = attachment.attachmentContentType;
    return contentType === 'application/pdf' || contentType === 'text/html';
}

/**
 * Resolve summary target from current context and extract text.
 * Supports both top-level regular items and PDF/HTML attachments.
 */
async function resolveTargetAndFulltext(selectedItem) {
    if (!selectedItem) {
        throw new Error("No item selected.");
    }

    // Selected a regular top-level item: find first supported attachment with extractable text.
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

    // Selected an attachment directly.
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
 * Extract full text from a specific attachment
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
 * Send request to OpenAI-compatible API
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
 * Convert Markdown-formatted summary to HTML format
 */
function formatSummaryAsHtml(summaryText) {
    if (!summaryText) return '';

    let text = summaryText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Convert Markdown bold to HTML first, then parse blocks.
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

// ========== MAIN PROGRAM ==========

if (!item) return;

let progressWindow = undefined;
let itemProgress = undefined;

// Normalize API URL (remove trailing slash)
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

    // Initialize progress window
    progressWindow = new Zotero.ProgressWindow({
        "closeOnClick": true,
    });
    progressWindow.addDescription(shortTitle);
    itemProgress = new progressWindow.ItemProgress();
    itemProgress.setItemTypeAndIcon("note");
    itemProgress.setText("Extracting PDF text...");
    progressWindow.show();

    // Check if summary already exists
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

    // Extract full text from first PDF attachment
    itemProgress.setProgress(20);
    itemProgress.setText("Extracting PDF text...");

    if (!fulltext || fulltext.trim().length === 0) {
        throw new Error("No PDF text found. The PDF may not have been indexed yet by Zotero. Please wait a few minutes and try again.");
    }

    if (fulltext.trim().length < 100) {
        throw new Error(`Extracted text is too short (${fulltext.length} characters). The PDF may not have been properly indexed by Zotero yet. Please wait a few minutes and try again.`);
    }

    // Generate summary
    itemProgress.setProgress(50);
    itemProgress.setText("Generating summary...");

    const summaryText = await openaiRequest(
        formatString(buildSummaryPrompt(), { title: title, text: fulltext })
    );

    // Create note
    itemProgress.setProgress(80);
    itemProgress.setText("Creating note...");

    const headerHtml = headerTemplate.replace("{{modelName}}", modelName);
    let summaryHtml;
    try {
        summaryHtml = formatSummaryAsHtml(summaryText);
    } catch (error) {
        // If HTML conversion fails, use <pre> tag to display raw text
        summaryHtml = `<pre>${summaryText.replace(/</g, '&lt;')}</pre>`;
    }

    const finalHtml = headerHtml + '\n' + summaryHtml;

    let newNote = new Zotero.Item('note');
    newNote.setNote(finalHtml);
    newNote.parentID = noteParent.id;
    newNote.libraryID = noteParent.libraryID;
    await newNote.saveTx();

    // Complete
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
