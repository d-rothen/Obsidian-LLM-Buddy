import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
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

const SYSTEM_PROMPT = "You are a helpful AI assistant. Assist with the finishing of the following note. Please structure the note in a way that is (obsidian-) markdown compatible. If the last sentence in the note is a specific instruction, follow that instruction, else simply fill out the remaining content such that it adheres to the title and general idea of the note. Try to keep the level of detail consistent with the note. If the level of detail is not discernable, assume that everything should be explained from the ground up and - apart from the most fundamental facts - be part of the note. Note, that when TeX code is required, use MathJax compatible notation. Inline TeX is done via ${content}$ while block TeX is done via $${content}$$. The file title and content will be presented like: Title: [...]\nContent[...]. Please adhere to the following style guides:\n When writing in an empty node - or under a particular header where there is need for a formal (i.e. mathematical or physics) definition, do a concise scientific definition (as one may see in a lectures script) inside a definition paragraph that looks like this:\n>[!Definition] $DefinitionTitle\n>Line1\n>Line2 etc. Note the need for > to do indentation. When such a block is finished, simply use \n\n to write below it. Instead of [!Definition] - if need be - you can also use [!Remark] or [!Lemma]. If you deem a topic to be complex, feel free to be very extensive on covering the subject. Please write the response without any preamble.";

export default class AnthropicPlugin extends Plugin {
    settings: AnthropicPluginSettings;
    anthropic: Anthropic;

	async onload() {
        await this.loadSettings();

        this.addSettingTab(new AnthropicSettingTab(this.app, this));

	    this.addCommand({
            id: 'activate-anthropic-api',
            name: 'Activate Anthropic API',
            editorCallback: (editor: Editor) => this.activateAnthropicAPI(editor)
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.anthropic = new Anthropic({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true });
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.anthropic = new Anthropic({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true });
    }
	async activateAnthropicAPI(editor: Editor) {
		const content = editor.getValue();

		const file = this.app.workspace.getActiveFile();
	    const fileTitle = file ? file.basename : 'Untitled';

       try {
            const stream = await this.anthropic.messages.create({
                model: this.settings.model,
                max_tokens: this.settings.maxTokensToSample,
                messages: [
                    { role: "user", content: `Title: ${fileTitle}\nContent: ${content}` }
                ],
                system: SYSTEM_PROMPT,
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
            new Notice('Error: ' + error.message);
        }

	}
}

class AnthropicSettingTab extends PluginSettingTab {
    plugin: AnthropicPlugin;

    constructor(app: App, plugin: AnthropicPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

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
