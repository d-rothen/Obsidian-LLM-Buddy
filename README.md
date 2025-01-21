# Obsidian LLM Buddy

Obsidian plugin that integrates multiple LLM providers (Anthropic, OpenAI, DeepSeek) into your note-taking workflow. Execute custom prompts with context-aware capabilities and (partial) support for images and PDFs.

## Features

- Support for multiple LLM providers:
  - Anthropic (Claude)
  - OpenAI
  - DeepSeek
- 📝 Configurable prompts
- 🖼️ Image and PDF support (provider dependent, WIP)
- ✨ Context-aware prompting
- 🎯 Selection-based operations
- 💫 Streaming responses
- 🎨 Ad-hoc prompt execution (WIP)

## Installation

1. Clone this repository
2. run `npm install`
3. run `npm run dev`
4. Copy `manifest.json` and `main.js` to `[Vault]/.obsidian/plugins/[llm-buddy]/`

## Configuration

- Check the configuration window in Obsidians plugin settings pane.
- Note: Keybinds have to be set in the Options>Hotkeys pane. (Just search for "LLM Buddy")


### Custom Prompts

Create and configure custom prompts:

1. Go to Settings > LLM Buddy > Custom Prompts
2. Click "Add Prompt"
3. Configure:
   - Name: The command name that will appear in the command palette
   - Prompt Text: Your system prompt (Instruction what the model should output)
   - LLM Provider: Choose between Anthropic, OpenAI, or DeepSeek
   - Model: Specify the model to use
   - Selection Mode: Toggle whether only the selected text is sent or the entire file as context too.

## Usage

Use the defined keybinds to execute the prompts. Make sure (if you dont use selection mode) that you toggle the setting for sending the entire note as context.

## Features in Detail

### Context-Aware Prompting

The plugin can use:
- Note title
- Tags
- Note content
- Selected text
- Linked images and PDFs

### Selection Modes

- **Normal Mode**: Selected text is used as context
- **Instruction Mode**: Selected text is used as instruction, and the rest of the note provides context

### File Support

- Supports embedded images (png, jpg, jpeg, gif, bmp, svg)
- Supports PDF files
- Files must be linked in the note using standard Obsidian syntax: `![[filename.ext]]`


### Example Prompt

Below is an example prompt I use to have an LLM write f.e. a Theorem I was missing in rendered TeX.
I am using the [obsidian-latex-theorem-equation-referencer](https://github.com/RyotaUshio/obsidian-latex-theorem-equation-referencer) plugin to render theorems etc.
(Remember to always double check if the LLM is not hallucinating in any case...)

- Prompt Text: `You are a helpful AI assistant. Assist with the finishing of the following note. Please structure the note in a way that is (obsidian-) markdown compatible. If the last sentence in the note is a specific instruction, follow that instruction, else simply fill out the remaining content such that it adheres to the title and general idea of the note. Try to keep the level of detail consistent with the note. If the level of detail is not discernable, assume that everything should be explained from the ground up and - apart from the most fundamental facts - be part of the note. Note, that when TeX code is required, use MathJax compatible notation. Inline TeX is done via ${content}$ while block TeX is done via $${content}$$. The file title and content will be presented in the following way: Title: [...]\\nContent[...]. When writing a note, do your best to structure the information in a concise manner - and go deep and in-depth when needed. Since I am using Obsidian for notetaking, feel free to make use of its features, especially referencing other notes like so for some Topic X: [[Topic X]] (Assume for any topic you need to explain the new note, this [[Topic X]] would already exist and reference it. Do not outsource the whole explanation to that reference but rather incorporate it in the explanation). The goal is to create a knowledge corpus that allows me to quickly catch up on scientific topics when I revisit them later. Please adhere to the following style guides:\\n When writing in an empty node - or under a particular header where there is need for a formal (i.e. mathematical or physics) definition, do a concise scientific definition (as one may see in a lecture's script) inside a definition paragraph that looks like this:\\n>[!definition] $DefinitionTitle\\n>Line1\\n>Line2 etc. Note the need for > to do indentation. When such a block is finished, simply use \\n\\n to write below it. Instead of [!definition], the following callouts are available as well (used the same as for the definition callout: [!{callout}] ):\\n<callouts>axiom, definition, lemma, proposition, theorem, corollary, claim, assumption, example, exercise, conjecture, hypothesis, remark</callouts>.\\nPrioritize using callouts over plain text or bullet-points whenever possible. If you deem a topic to be complex, feel free to be very extensive on covering the subject. Please write the response without any preamble..`

---