import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Command } from 'obsidian';
import { Anthropic } from '@anthropic-ai/sdk';

interface AnthropicPluginSettings {
    apiKey: string;
    maxTokensToSample: number;
    model: string;
}

const DEFAULT_SETTINGS: AnthropicPluginSettings = {
    apiKey: '',
    maxTokensToSample: 1000,
    model: 'claude-3-5-sonnet-20240620'
}

const SYSTEM_PROMPT = "You are a helpful AI assistant. Assist with the finishing of the following note. Please structure the note in a way that is (obsidian-) markdown compatible. If the last sentence in the note is a specific instruction, follow that instruction, else simply fill out the remaining content such that it adheres to the title and general idea of the note. Try to keep the level of detail consistent with the note. If the level of detail is not discernable, assume that everything should be explained from the ground up and - apart from the most fundamental facts - be part of the note. Note, that when TeX code is required, use MathJax compatible notation. Inline TeX is done via ${content}$ while block TeX is done via $${content}$$. The file title and content will be presented like: Title: [...]\nContent[...]. When writing a note, do your best to structure the information in a concise way - and go deep and in-depth when needed. Since I am using Obsidian for notetaking, feel free to make use of its features, espacially referencing other notes like so for some Topic X: [[Topic X]] (Assume for any topic you need to explain the new note, this [[Topic X]] would already exist and reference it. Do not outsource the whole explanation to that reference but rather incorporate it in the explanation). The goal is to create a knowledge corpus that allows me to quickly catch up on scientific topics when I revisit them later. Please adhere to the following style guides:\n When writing in an empty node - or under a particular header where there is need for a formal (i.e. mathematical or physics) definition, do a concise scientific definition (as one may see in a lectures script) inside a definition paragraph that looks like this:\n>[!Definition] $DefinitionTitle\n>Line1\n>Line2 etc. Note the need for > to do indentation. When such a block is finished, simply use \n\n to write below it. Instead of [!Definition] - if need be - you can also use [!Remark] or [!Lemma]. If you deem a topic to be complex, feel free to be very extensive on covering the subject. Please write the response without any preamble.";

const TASK_PROMPT: "You are a helpful AI assistant. Execute the following request that is given in the 'Instruction: ' prompt. Please structure your answer in a way that is (obsidian-) markdown compatible. Try to be pedantic yet concise. Assume that the use case is to produce scientifically accurate answers. If no level of detail is explicitly requested, assume that everything should be explained from the ground up and - apart from the most fundamental facts - be part of the note. Note, that when TeX code is required, use MathJax compatible notation. Inline TeX is done via ${content}$ while block TeX is done via $${content}$$.  Since I am using Obsidian for notetaking, feel free to make use of its features, like referencing other notes like so for some Topic X: [[Topic X]] (simply assume cross links exist), or embedded code or mermaid like so:\n ```mermaid\n...\n```. Note the possibilities for highlighting sections if you are to explain complex topics:\n>[!Definition] $DefinitionTitle\n>Line1\n>Line2 etc. Note the need for > to do indentation. When such a block is finished, simply use \n\n to write below it. Instead of [!Definition] you can also use [!Remark] or [!Lemma]. Make sure to incorporate these obsidian features when it improves your responses structure, but do not go against explicit instructions. Please perform the task to the best of your abilities. You will be given a reward that is dependent on the evaluation of your performance. Make sure to respond solely with the task that you are given, and leave out any additional formalities or preambles."

export default class AnthropicPlugin extends Plugin {
    settings: AnthropicPluginSettings;
    anthropic: Anthropic;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new AnthropicSettingTab(this.app, this));

        // Existing command to activate Anthropic API on entire content
        this.addCommand({
            id: 'activate-anthropic-api',
            name: 'Activate Anthropic API on Entire Note',
            editorCallback: (editor: Editor) => this.activateAnthropicAPI(editor)
        });

        // New command to execute selected instruction
        this.addCommand({
            id: 'execute-selected-instruction',
            name: 'Execute Selected Instruction with Anthropic API',
            editorCallback: (editor: Editor) => this.taskAnthropicApi(editor),
            // Optional: Assign a default hotkey (users can override in Obsidian settings)
            hotkeys: [
                {
                    modifiers: ["Ctrl", "Alt"],
                    key: "T" // You can choose any key combination you prefer
                }
            ]
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.anthropic = new Anthropic({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true });
    }

    /**
     * Function to process the selected instruction using Anthropic API
     * @param editor - The active editor instance
     */
    async taskAnthropicApi(editor: Editor) {
        const selectedText = editor.getSelection().trim();

        if (!selectedText) {
            new Notice('Please select an instruction to execute.');
            return;
        }

        const file = this.app.workspace.getActiveFile();
        const fileTitle = file ? file.basename : 'Untitled';

        try {
            const stream = await this.anthropic.messages.create({
                model: this.settings.model,
                max_tokens: this.settings.maxTokensToSample,
				system: TASK_PROMPT,
                messages: [
                    { role: "user", content: `Topic: ${fileTitle}\nInstruction:\n ${selectedText}` }
                ],
                stream: true,
            });

            let response = '';

            for await (const chunk of stream) {
                if (chunk.type === 'content_block_start' || chunk.type === 'content_block_delta') {
                    let text = '';
                    if ('delta' in chunk && chunk.delta && 'text' in chunk.delta) {
                        text = chunk.delta.text;
                    }
                    response += text;
                }
            }

            // Insert the response below the selected text
            const cursor = editor.getCursor();
            editor.replaceSelection(`\n\n${response}`);
            new Notice('Instruction executed successfully.');
        } catch (error) {
            console.error(error);
            new Notice('Error: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    async activateAnthropicAPI(editor: Editor) {
        const content = editor.getValue();

        const file = this.app.workspace.getActiveFile();
        const fileTitle = file ? file.basename : 'Untitled';

        try {
            const stream = await this.anthropic.messages.create({
                model: this.settings.model,
                max_tokens: this.settings.maxTokensToSample,
				system: SYSTEM_PROMPT,
                messages: [
                    { role: "user", content: `Title: ${fileTitle}\nContent: ${content}` }
                ],
                stream: true,
            });

            let response = '';

            for await (const chunk of stream) {
                if (chunk.type === 'content_block_start' || chunk.type === 'content_block_delta') {
                    let text = '';
                    if ('delta' in chunk && chunk.delta && 'text' in chunk.delta) {
                        text = chunk.delta.text;
                    }
                    response += text;
                    editor.replaceSelection(text);
                }
            }
        } catch (error) {
            new Notice('Error: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.anthropic = new Anthropic({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true });
    }
}

class AnthropicSettingTab extends PluginSettingTab {
    plugin: AnthropicPlugin;

    constructor(app: App, plugin: AnthropicPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Anthropic Plugin Settings' });

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your Anthropic API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Max sampled Tokens')
            .setDesc('Set the maximum number of tokens the model samples from.')
            .addText(text => text
                .setPlaceholder('Enter max tokens')
                .setValue(String(this.plugin.settings.maxTokensToSample))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        this.plugin.settings.maxTokensToSample = numValue;
                        await this.plugin.saveSettings();
                    } else {
                        new Notice('Please enter a valid number for max tokens.');
                    }
                }));

        new Setting(containerEl)
            .setName('Model')
            .setDesc('Select the Claude model to use')
            .addText(text => text
                .setPlaceholder('claude-3-5-sonnet-20240620')
                .setValue(this.plugin.settings.model)
                .onChange(async (value) => {
                    this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                }));
    }
}

