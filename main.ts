import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { Anthropic } from '@anthropic-ai/sdk';

interface AnthropicPluginSettings {
    apiKey: string;
    activationHotkey: string;
}

const DEFAULT_SETTINGS: AnthropicPluginSettings = {
    apiKey: '',
    activationHotkey: 'Ctrl+Shift+A'
}

const INSTRUCTION_PREFIX = "You are a helpful AI assistant. Assist with the finishing of the following note. If the last sentence in the note is a specific instruction, follow that instruction, else simply fill out the remaining content such that it adheres to the title and general idea of the note. Try to keep the level of detail consistent with the note. If the level of detail is not discernable, assume that everything should be explained from the ground up and - apart from the most fundamental facts - be part of the note. Note, that when TeX code is required, use MathJax compatible notation. Inline TeX is done via ${content}$ while block TeX is done via $${conten}$$.";

export default class AnthropicPlugin extends Plugin {
    settings: AnthropicPluginSettings;
    anthropic: Anthropic;

	async onload() {
        await this.loadSettings();

        this.addSettingTab(new AnthropicSettingTab(this.app, this));

        this.registerCodeMirror((cm: CodeMirror.Editor) => {
            cm.setOption("extraKeys", {
                [this.settings.activationHotkey]: this.activateAnthropicAPI.bind(this)
            });
        });
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

		try {
			const stream = await this.anthropic.completions.create({
				model: 'claude-2',
				max_tokens_to_sample: 1000,
				prompt: `${INSTRUCTION_PREFIX}\n\nHuman: ${content}\n\nAssistant:`,
				stream: true,
			});

			let response = '';
			for await (const completion of stream) {
				response += completion.completion;
				editor.replaceSelection(completion.completion);
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
            .setName('Activation Hotkey')
            .setDesc('Set the hotkey to activate the Anthropic API')
            .addText(text => text
                .setPlaceholder('Enter hotkey (e.g., Ctrl+Shift+A)')
                .setValue(this.plugin.settings.activationHotkey)
                .onChange(async (value) => {
                    this.plugin.settings.activationHotkey = value;
                    await this.plugin.saveSettings();
                }));
    }
}
