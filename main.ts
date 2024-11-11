import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, Command } from 'obsidian';
import { Anthropic } from '@anthropic-ai/sdk';
import * as YAML from 'yaml';

interface AnthropicPluginSettings {
    apiKey: string;
    maxTokensToSample: number;
    model: string;
	betas: string;
	prompts: []
}

interface Prompt {
    id: string;
    name: string;
    promptText: string;
	useSelectionAsInstruction: boolean;
}

const DEFAULT_SETTINGS: AnthropicPluginSettings = {
    apiKey: '',
    maxTokensToSample: 1000,
    model: 'claude-3-5-sonnet-20241022',
	betas: 'pdfs-2024-09-25',
	prompts: []
}

export default class AnthropicPlugin extends Plugin {
    settings: AnthropicPluginSettings;
    anthropic: Anthropic;
	registeredCommands: string[] = [];

    onunload() {
        // Unregister all commands when the plugin is unloaded
        this.unregisterAllCommands();
    }

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new AnthropicSettingTab(this.app, this));
		this.registerAllPrompts();


        // Register the command for the ad-hoc prompt
        this.addCommand({
            id: 'anthropic-adhoc-prompt',
            name: 'Execute Ad-Hoc Prompt',
            editorCallback: (editor: Editor) => {
                new AdHocPromptModal(this.app, this, editor).open();
            }
        });
    }

    registerAllPrompts() {
        for (const prompt of this.settings.prompts) {
            this.registerPromptCommand(prompt);
        }
    }

    unregisterAllCommands() {
        for (const commandId of this.registeredCommands) {
            // Unregister the command
            // Obsidian doesn't provide a direct way to unregister commands,
            // but commands are automatically unregistered when the plugin is unloaded.
            // For dynamic commands, we need to manage them carefully.
            delete this.app.commands.commands[commandId];
            delete this.app.commands.editorCommands[commandId];
        }
        this.registeredCommands = [];
    }

    registerPromptCommand(prompt: Prompt) {
        const commandId = `anthropic-prompt-${prompt.id}`;
        this.addCommand({
            id: commandId,
            name: prompt.name,
            editorCallback: (editor: Editor) => this.executePrompt(prompt, editor)
        });
        this.registeredCommands.push(commandId);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.anthropic = new Anthropic({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true, beta: 'pdfs-2024-09-25' });
    }

	createContent(title: string, tags: string, note: string){
		return `<title>${title}</title>\n<tags>${tags.join(";")}</tags>\n<note>${note}</note>`
	}

	createTaskSelectionContent(title: string, tags: string, note: string, selection: string){
		return `<instruction>${selection}</instruction>\n<context>\n<title>${title}</title>\n<tags>${tags.join(";")}</tags>\n<note>${note}</note>\n</context>`
	}

	createSelectionContent(selection: string){
		return `<instruction>${selection}</instruction>`
	}

	extractYamlAndContentFromEditor(editor: Editor): [string, string[], string[], string] {
		const content = editor.getValue();
		let rawYaml = '';
		let tags: string[] = [];
		let aliases: string[] = [];
		let noteContent = content;

		// Regular expression to match YAML front matter at the beginning of the note
		const yamlRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
		const match = content.match(yamlRegex);

		if (match) {
			rawYaml = match[0];
			const yamlContent = match[1];

			// Parse YAML content
			let parsedYaml;
			try {
				parsedYaml = YAML.parse(yamlContent);
			} catch (error) {
				new Notice('Error parsing YAML front matter: ' + error.message);
				parsedYaml = {};
			}

			// Extract tags and aliases
			if (parsedYaml.tags) {
				if (Array.isArray(parsedYaml.tags)) {
					tags = parsedYaml.tags;
				} else if (typeof parsedYaml.tags === 'string') {
					tags = [parsedYaml.tags];
				}
			}

			if (parsedYaml.aliases) {
				if (Array.isArray(parsedYaml.aliases)) {
					aliases = parsedYaml.aliases;
				} else if (typeof parsedYaml.aliases === 'string') {
					aliases = [parsedYaml.aliases];
				}
			}

			// Remove the YAML front matter from the note content
			noteContent = content.substring(match[0].length).trimStart();
		}

		return [rawYaml, tags, aliases, noteContent];
}


	extractYamlAndContentFromApp(editor: Editor, app: App): [string, string[], string[], string] {
		const content = editor.getValue();
		const file = app.workspace.getActiveFile();

		let rawYaml = '';
		let tags: string[] = [];
		let aliases: string[] = [];
		let noteContent = content;

		if (file) {
			const metadata = app.metadataCache.getFileCache(file);
			if (metadata && metadata.frontmatter) {
				const frontmatter = metadata.frontmatter;

				// Extract raw YAML front matter
				const start = frontmatter.position.start.offset;
				const end = frontmatter.position.end.offset;

				rawYaml = content.substring(start, end);

				// Extract tags and aliases
				if (frontmatter.tags) {
					if (Array.isArray(frontmatter.tags)) {
						tags = frontmatter.tags;
					} else if (typeof frontmatter.tags === 'string') {
						tags = [frontmatter.tags];
					}
				}

				if (frontmatter.aliases) {
					if (Array.isArray(frontmatter.aliases)) {
						aliases = frontmatter.aliases;
					} else if (typeof frontmatter.aliases === 'string') {
						aliases = [frontmatter.aliases];
					}
				}

				// Remove the YAML front matter from the note content
				noteContent = content.substring(end).trimStart();
			}
		}

		return [rawYaml, tags, aliases, noteContent];
	}


    async executePrompt(prompt: Prompt, editor: Editor) {
        const { promptText, useSelectionAsInstruction } = prompt;

        let selectedText = editor.getSelection();
        const systemPrompt = promptText;
        //const note = editor.getValue();
		//const tags = this.getTags()
        const file = this.app.workspace.getActiveFile();
        const title = file ? file.basename : 'Untitled';

		const [rawYaml, tags, aliases, noteContent] = this.extractYamlAndContentFromEditor(editor);
		const note = noteContent

		// Prepare content for the API
        const contentArray: any[] = [];
		let textContent;

		if (selectedText){
			if (useSelectionAsInstruction) {
                // Get positions of the selection
                const from = editor.getCursor('from');
                const to = editor.getCursor('to');

                const fromOffset = editor.posToOffset(from);
                const toOffset = editor.posToOffset(to);
                // Remove the selected text from the content
                const slicedNote = note.slice(0, fromOffset) + note.slice(toOffset);
				//TODO maybe keep the selected text to have an "anchor" that the model knows where exactly information will be inserted?
				//taskPrefix = `Please resolve the following for the provided Context: ${selectedText}\n\n <Context>`

				//TODO selection is not sliced?
				textContent = this.createTaskSelectionContent(title, tags, slicedNote, selectedText)
			} else {
				textContent = this.createSelectionContent(selectedText)
			}
		} else {
			textContent = this.createContent(title, tags, note)
		}

		console.log(promptText)
		console.log(textContent)

        // Add the main content
        contentArray.push({
            "type": "text",
            "text": textContent
		});

        // Parse the content for linked images and PDFs
		// TODO Streamline, such that I pass one parameter etc.
        const linkedFiles = await this.getLinkedFiles(note + "\n" + selectedText);
        // Process each linked file
        for (const file of linkedFiles) {
            try {
                const data = await this.app.vault.readBinary(file);
                const base64Data = Buffer.from(data).toString('base64');

                // Get the media type
                const mediaType = this.getMediaType(file.extension);

                // Add to content array
                if (file.extension === 'pdf') {
                    contentArray.push({
                        "type": "document",
                        "source": {
                            "type": "base64",
                            //"media_type": mediaType,
                            "media_type": 'application/pdf',
                            "data": base64Data
                        }
                    });
                } else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg'].includes(file.extension)) {
                    contentArray.push({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mediaType,
                            "data": base64Data
                        }
                    });
                } else {
                    new Notice(`Unsupported file type: ${file.extension}`);
                }
            } catch (error) {
                new Notice(`Error reading file ${file.path}: ${error.message}`);
            }
        }

        // Remove the selected text and set cursor to start of selection
        const cursorFrom = editor.getCursor('from');
        editor.replaceSelection('');
        editor.setCursor(cursorFrom);

        // Now, send the contentArray to the API
        try {
            const stream = await this.anthropic.beta.messages.create({
                model: this.settings.model,
                betas: this.settings.betas.split(';'),
                max_tokens: this.settings.maxTokensToSample,
                messages: [
                    { role: "user", content: contentArray }
                ],
                system: systemPrompt,
                stream: true,
            });

            for await (const chunk of stream) {
                if (chunk.type === 'content_block_start' || chunk.type === 'content_block_delta') {
                    let text = '';
                    if ('delta' in chunk && chunk.delta && 'text' in chunk.delta) {
                        text = chunk.delta.text;
                    }
                    editor.replaceSelection(text);
                }
            }
        } catch (error) {
            new Notice('Error: ' + error.message);
        }
    }

    // Helper function to get media type from file extension
    getMediaType(extension: string): string {
        switch (extension.toLowerCase()) {
            case 'pdf':
                return 'application/pdf';
            case 'png':
                return 'image/png';
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'gif':
                return 'image/gif';
            case 'bmp':
                return 'image/bmp';
            case 'svg':
                return 'image/svg+xml';
            default:
                return 'application/octet-stream';
        }
    }

    // Helper function to find linked files in content
    async getLinkedFiles(content: string): Promise<TFile[]> {
        const linkedFiles: TFile[] = [];
        const linkRegex = /!\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = linkRegex.exec(content)) !== null) {
            const fileName = match[1];

            // Resolve the file
            const linkedFile = this.app.metadataCache.getFirstLinkpathDest(fileName, '');

            if (linkedFile instanceof TFile) {
                linkedFiles.push(linkedFile);
            } else {
                new Notice(`File not found: ${fileName}`);
            }
        }
        return linkedFiles;
    }

	
    async saveSettings() {
        await this.saveData(this.settings);
        this.anthropic = new Anthropic({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true });
        this.unregisterAllCommands();
        this.registerAllPrompts();
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
                .setPlaceholder('claude-3-5-sonnet-20241022')
                .setValue(this.plugin.settings.model)
                .onChange(async (value) => {
                    this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                }));
	
		new Setting(containerEl)
            .setName('Beta Features')
            .setDesc('Select the Claude Beta Modules')
            .addText(text => text
                .setPlaceholder('pdfs-2024-09-25')
                .setValue(this.plugin.settings.betas)
                .onChange(async (value) => {
                    this.plugin.settings.betas = value;
                    await this.plugin.saveSettings();
                }));

		
        containerEl.createEl('h2', { text: 'Custom Prompts' });

        this.plugin.settings.prompts.forEach((prompt, index) => {
            this.buildPromptSetting(containerEl, prompt, index);
        });

        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('Add Prompt')
                .onClick(() => {
                    const newPrompt: Prompt = {
                        id: Date.now().toString(),
                        name: 'New Prompt',
                        promptText: ''
                    };
                    this.plugin.settings.prompts.push(newPrompt);
                    this.plugin.saveSettings();
                    this.display();
                }));
	}

	buildPromptSetting(containerEl: HTMLElement, prompt: Prompt, index: number) {
        const setting = new Setting(containerEl)
            .setName(`Prompt ${index + 1}`)
            .setDesc('Configure your custom prompt');

        setting.addText(text => text
            .setPlaceholder('Command Name')
            .setValue(prompt.name)
            .onChange(async (value) => {
                prompt.name = value;
                await this.plugin.saveSettings();
            }));

        setting.addTextArea(textArea => textArea
            .setPlaceholder('Prompt Text')
            .setValue(prompt.promptText)
            .onChange(async (value) => {
                prompt.promptText = value;
                await this.plugin.saveSettings();
            }));

		// Add toggle for useSelectionAsInstruction
        new Setting(containerEl)
            .setName('Full Context')
            .setDesc('When text is selected, use it as the instruction with rest of note as context. Else only the selection is used for context.')
				.addToggle(toggle => toggle
                .setValue(prompt.useSelectionAsInstruction)
                .onChange(async (value) => {
                    prompt.useSelectionAsInstruction = value;
                    await this.plugin.saveSettings();
                })
            );

        setting.addExtraButton(cb => {
            cb.setIcon('up-chevron-glyph')
                .setTooltip('Move Up')
                .onClick(() => {
                    if (index > 0) {
                        const prompts = this.plugin.settings.prompts;
                        [prompts[index - 1], prompts[index]] = [prompts[index], prompts[index - 1]];
                        this.plugin.saveSettings();
                        this.display();
                    }
                });
        });

        setting.addExtraButton(cb => {
            cb.setIcon('down-chevron-glyph')
                .setTooltip('Move Down')
                .onClick(() => {
                    const prompts = this.plugin.settings.prompts;
                    if (index < prompts.length - 1) {
                        [prompts[index], prompts[index + 1]] = [prompts[index + 1], prompts[index]];
                        this.plugin.saveSettings();
                        this.display();
                    }
                });
        });

        setting.addExtraButton(cb => {
            cb.setIcon('cross')
                .setTooltip('Delete')
                .onClick(() => {
                    this.plugin.settings.prompts.splice(index, 1);
                    this.plugin.saveSettings();
                    this.display();
                });
        });

    }
}

// Modal class for ad-hoc prompt input
class AdHocPromptModal extends Modal {
    plugin: AnthropicPlugin;
    editor: Editor;

    constructor(app: App, plugin: AnthropicPlugin, editor: Editor) {
        super(app);
        this.plugin = plugin;
        this.editor = editor;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Enter System Prompt' });

        const promptInput = new Setting(contentEl)
            .setName('System Prompt')
            .setDesc('Enter the system prompt to execute')
            .addTextArea(text => {
                text
                    .setPlaceholder('Type your prompt here...')
                    .inputEl.rows = 6;
            });

        new Setting(contentEl)
            .addButton(btn => {
                btn
                    .setButtonText('Execute')
                    .setCta()
                    .onClick(() => {
                        const promptText = promptInput.controlEl.querySelector('textarea')!.value.trim();
                        if (promptText) {
                            this.close();
                            this.plugin.executePrompt({promptText: promptText, useSelectionAsInstruction: true, name: "AdHoc Prompt"}, this.editor);
                        } else {
                            new Notice('Please enter a prompt.');
                        }
                    });
            })
            .addButton(btn => {
                btn
                    .setButtonText('Cancel')
                    .onClick(() => {
                        this.close();
                    });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
