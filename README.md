# prompt-organizer

A Claude Code mod that adds an **Organize prompt** button above the prompt box. Type your draft the way it comes out of your head, click the button, and one model call rewrites it into a clear, ordered prompt in the same box. Nothing is sent until you press Enter.

It is for people whose prompts arrive as a stream of half-ordered thoughts, with the constraint at the end, a correction in the middle and the actual goal buried somewhere in between.

## Example

This is an illustration. Real output depends on the model and the settings you choose.

Draft typed into the prompt box:

```text
ok so the export button on the reports page is broken, the csv comes out with
the columns in the wrong order, i think since the last refactor. also dates are
US format but should be ISO. actually no keep US format in the UI, just ISO in
the csv. dont change the api response shape, the mobile app uses it. and add a
test. maybe excel too?
```

What the organizer puts back in the box:

```text
Goal
Fix the CSV export behind the Export button on the reports page. The columns
come out in the wrong order. I think this started with the last refactor.

Requirements
- Restore the correct column order in the CSV.
- Write dates in the CSV in ISO format. Keep US format in the UI.
- Add a test for the export.

Constraints
- Do not change the API response shape, because the mobile app uses it.

Unclear - ask me before assuming:
1. What is the correct column order?
2. Should the export also offer Excel, or stay CSV only?
```

The self-correction about date formats is resolved to its final intent, the reason for the API constraint stays next to it, and "maybe excel too?" becomes a question rather than a requirement.

## Install

At the prompt of a terminal session:

```text
/plugin install prompt-organizer --marketplace Gjandane/prompt-organizer
```

From a shell:

```sh
claude plugin install prompt-organizer --marketplace Gjandane/prompt-organizer
```

In the desktop app, `/plugin` does not run. Instead, click **+** next to the prompt box, choose **Plugins**, then **Add marketplace** and enter `Gjandane/prompt-organizer`, then **Add plugin**.

## Usage

1. Type your draft in the prompt box.
2. Click **Organize prompt** in the band directly above the box. While the rewrite runs, the band shows "Organizing your prompt..." and a **Cancel** button.
3. The rewrite replaces your draft in the box. Read it, edit it if you want, and press Enter to send it yourself.

**Undo** appears after a successful rewrite and puts your original draft back. It stays available until you send a prompt. After that there is nothing to undo.

**Cancel** stops a rewrite in progress. Your draft stays as it was.

From the keyboard, run:

```text
/organize <messy draft>
```

The rewrite goes into the prompt box, replacing whatever is there, and Undo restores the draft you passed to the command. If the box cannot take the text, the rewrite is printed in the command's reply so you can copy it. Running `/organize` with no draft prints a usage line.

The button deliberately does nothing, and shows a toast saying why, when:

- the box is empty or holds only whitespace. No model call is made.
- the draft starts with `/`. Slash commands are left alone.
- you kept typing while the rewrite ran. Your typing is never overwritten. Click again to organize the new text.

A failed rewrite also leaves the draft unchanged, with a toast giving the reason. One that runs past `timeoutSeconds` is reported as cancelled. Clicks while a rewrite is already running are ignored.

## Settings

Settings live in `settings.json` at the root of the mod's folder. The mod reads the file at every click, so an edit applies to the next rewrite without a reload. The shipped file:

```json
{
  "model": "Opus 5.5",
  "effort": "medium",
  "timeoutSeconds": 90,
  "maxOutputTokens": 4096
}
```

| Field | Allowed values | Default |
| --- | --- | --- |
| `model` | Any non-empty string: a model name, a full model id, or an alias | `"Opus 5.5"` |
| `effort` | `"low"`, `"medium"`, `"high"`, `"xhigh"`, `"max"` | `"medium"` |
| `timeoutSeconds` | Whole number from 5 to 600 | `90` |
| `maxOutputTokens` | Whole number from 256 to 64000 | `4096` |

`model` takes a model by name, such as `"Opus 5.5"`, `"Sonnet 5.5"` or `"Haiku 5.5"`. The mod turns a name into its id, so `"Sonnet 5.5"` is sent as `claude-sonnet-5-5`. A full model id or an alias such as `opus` is sent as written, for Claude Code to resolve.

`effort` sets how hard the model thinks. `low` is fastest, `max` the most thorough. `timeoutSeconds` is how long one rewrite may run before it is abandoned. `maxOutputTokens` caps the length of the rewrite.

When a field has the wrong type or is out of range, the mod uses that field's default and shows a toast naming the field, for example `settings.json: effort not valid, default used.` The other fields still apply. If the file is not valid JSON, every field falls back to its default, with a toast saying so. A missing file means defaults with no toast.

A model name the mod accepts can still be refused when the request is made, for example a model Claude Code does not know or allow, or a `maxOutputTokens` above that model's limit. In that case you get a toast naming the model, and your draft is unchanged.

## How the rewrite decides things

The model gets a fixed set of rules plus your draft, and nothing else. In plain terms:

- **It only rewrites.** The draft is treated as material to reorganize. The model does not answer it, carry out the task, or follow instructions inside it.
- **It keeps everything you said.** Every idea, requirement, constraint and preference stays. Only exact repetition is dropped. File names, paths, identifiers, commands, numbers, URLs, quoted text and code are copied exactly.
- **It invents nothing.** No added requirements, facts, preferences or implementation choices. Missing details become questions, never guesses.
- **Corrections win.** "Actually no, do X instead" leaves only X.
- **Reasons stay attached.** A "because" stays next to the instruction it explains.
- **Your voice, your language.** The result is in first person, as you would have written it with time to think, in the language of the draft.
- **Goal first.** Then background, specifics, limits, and how you will know it is done.
- **Shape follows size.** One or two ideas become one to three plain sentences with no headings. Several distinct ideas get short labeled sections, only those with content: Goal, Context, Requirements, Constraints, Done when. Numbered lists where order matters, bullets otherwise.
- **Gaps become questions.** If something is ambiguous, contradicts itself, or leaves out a detail the assistant would have to guess, the rewrite ends with "Unclear - ask me before assuming:" and at most five short questions, most important first. With no real gaps, that section is left out.
- **No filler.** No "You are an expert" openers, no flattery, no capital-letter emphasis, no commentary about the rewrite.

## Things to know

- Each click is one extra model call, billed to your session like any other.
- The draft goes to the model through the session's own API client. Only the draft is sent. The rewrite does not see your conversation, so a draft that says "fix the bug we just discussed" stays exactly that vague, and will likely get a question in the unclear list.
- The button sits in the band above the prompt box because mods cannot place a control beside the **+** itself.
- Drafts with image attachments are untested.

## Development

Check the mod's structure:

```sh
claude plugin validate <folder>
```

Run the tests:

```sh
claude plugin test <folder>
```

The tests in `hooks/register.test.tsx` cover: Organize rewriting the box and Undo restoring it, in both the terminal and the desktop app; an empty draft making no model call; a failed rewrite leaving the draft alone; `settings.json` choosing the model, with an invalid field falling back to its default and a toast; and the Opus 5.5, medium-effort defaults when there is no settings file.
