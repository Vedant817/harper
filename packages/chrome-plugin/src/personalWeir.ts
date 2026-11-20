import {
	CORE_RULES,
	GREETING_FOLLOWERS,
	OPENER_RULES,
	ruleIdsFor,
	STOCK_RULES,
} from './personalPreset';
import type { PersonalPresetId } from './protocol';

const MANIFEST = `{
  "name": "Harper personal style",
  "author": "Harper personal build",
  "version": "1.0.0",
  "description": "In-memory style rules for the selected writing preset. Not saved as an installed pack.",
  "license": "Apache-2.0"
}
`;

function stars(count: number): string {
	return '*'.repeat(count);
}

/** Sentence-scoped arms. Stars are tokens, so they are written with no spaces. */
function arms(head: string, tail: string, maxTokens: number): string {
	const choices: string[] = [];
	for (let count = 0; count <= maxTokens; count += 1) {
		choices.push(`(${head}${stars(count)}${tail})`);
	}
	return choices.join(', ');
}

function rule(source: string): string {
	return source.trim();
}

const commaSplice = rule(`
expr firstVerb <VERB, (![know, mean, guess, suppose, understand])>
expr head (PRON @firstVerb)
expr splice [${arms('@head', ', PRON VERB', 24)}]
expr main <@splice, (, PRON VERB), (, )>
let message "This comma joins two sentences. Use a period or a semicolon."
let description "Flags a comma splice when a subject and verb are followed by a comma and another subject and verb. Greetings are left alone."
let kind "Punctuation"
let becomes [". ", "; "]
let strategy "Exact"
let scope "Sentence"

test "I finished the draft, I sent it." "I finished the draft. I sent it."
test "We wrote the note, she sent it." "We wrote the note. she sent it."
allows "Hi Sarah, I sent it."
allows "I finished the draft. I sent it."
allows "You know, I sent it."
`);

const directQuestion = rule(`
expr q [(Can you), (Could you), (Would you), (Did you), (Do you), (Does this), (Is there), (Are you), (Are there), (Have you), (What time), (When can), (Where is), (Why is), (Who is), (How are), (How do), (How can)]
expr questions [${arms('@q', '.', 24)}]
expr main <@questions, (.)>
let message "This looks like a direct question. End it with a question mark."
let description "Adds a question mark when a direct question ends with a period."
let kind "Punctuation"
let becomes "?"
let strategy "Exact"
let scope "Sentence"

test "Can you send the file." "Can you send the file?"
test "What time works." "What time works?"
allows "Can you send the file?"
allows "I sent the file."
allows "Do the right thing."
allows "When the build finished, I sent the note."
`);

const objectCase = rule(`
expr prep [between, with, for, to, from, without, about]
expr person [you, him, her, them, us, PROPN, NOUN]
expr main <(@prep @person and I[., ?]), (I)>
let message "Use me when this is the object."
let description "Corrects object-case and I, as in between you and I."
let kind "Grammar"
let becomes "me"
let strategy "Exact"
let scope "Sentence"

test "This stays between you and I." "This stays between you and me."
test "I spoke with Sarah and I." "I spoke with Sarah and me."
test "Is this between you and I?" "Is this between you and me?"
allows "Sarah and I went to the meeting."
allows "I went with Sarah and I left."
`);

const lessFewer = rule(`
expr nouns [meetings, emails, people, items, things, options, days, hours, weeks, months, errors, issues, comments, files, messages, questions, tasks, updates, changes, details, examples, times, reasons, points, steps, notes, calls, drafts, replies, chances, opportunities]
expr main <(less @nouns), (less)>
let message "Use fewer for a plural count."
let description "Corrects less before a plural count noun."
let kind "Grammar"
let becomes "fewer"
let strategy "MatchCase"

test "We need less meetings." "We need fewer meetings."
allows "We need less time."
allows "We need fewer meetings."
`);

const inOrderTo = rule(`
expr main (in order to)
let message "Use to."
let description "Shortens in order to."
let kind "WordChoice"
let becomes "to"
let strategy "MatchCase"

test "I wrote in order to explain." "I wrote to explain."
`);

const dueToTheFact = rule(`
expr main (due to the fact that)
let message "Use because."
let description "Shortens due to the fact that."
let kind "WordChoice"
let becomes "because"
let strategy "MatchCase"

test "I waited due to the fact that the file was open." "I waited because the file was open."
`);

const atThisPoint = rule(`
expr main (at this point in time)
let message "Use now."
let description "Shortens at this point in time."
let kind "WordChoice"
let becomes "now"
let strategy "MatchCase"

test "Nothing is blocked at this point in time." "Nothing is blocked now."
`);

const inTheEvent = rule(`
expr main (in the event that)
let message "Use if."
let description "Shortens in the event that."
let kind "WordChoice"
let becomes "if"
let strategy "MatchCase"

test "Call me in the event that the draft changes." "Call me if the draft changes."
`);

const irregardless = rule(`
expr main irregardless
let message "The word is regardless."
let description "Corrects irregardless."
let kind "Usage"
let becomes "regardless"
let strategy "MatchCase"

test "I will send it irregardless." "I will send it regardless."
`);

const couldCareLess = rule(`
expr main (could care less)
let message "The phrase is couldn't care less."
let description "Corrects could care less."
let kind "Usage"
let becomes "couldn't care less"
let strategy "MatchCase"

test "I could care less about the font." "I couldn't care less about the font."
allows "I couldn't care less about the font."
`);

function greetingComma(word: string): string {
	return rule(`
expr greet [Hi, Hey, Hello, Dear]
expr addressee [PROPN, Sarah, John, Priya, Alex, Sam, Maria, David, Lisa, there, team, all, everyone, folks]
expr main <(@greet @addressee ${word}), ( ${word})>
let message "Add a comma after the greeting."
let description "Inserts the comma in a greeting such as Hi Priya, before the next word."
let kind "Punctuation"
let becomes ", ${word}"
let strategy "Exact"
let scope "Sentence"

test "Hi Sarah ${word} sent a note." "Hi Sarah, ${word} sent a note."
allows "Hi Sarah, ${word} sent a note."
`);
}

const hopeYoureWell = rule(`
expr main (^Hope you're well)
let message "Start with I."
let description "Inserts I in Hope you're well, and only in that phrase."
let kind "Style"
let becomes "I hope you're well"
let strategy "Exact"

test "Hope you're well." "I hope you're well."
allows "I hope you're well."
`);

const wantedToFollowUp = rule(`
expr main (^Wanted to follow up)
let message "Start with I."
let description "Inserts I in Wanted to follow up, and only in that phrase."
let kind "Style"
let becomes "I wanted to follow up"
let strategy "Exact"

test "Wanted to follow up on the draft." "I wanted to follow up on the draft."
allows "I wanted to follow up on the draft."
`);

const perMyLastEmail = rule(`
expr main (per my last email)
let message "Say this in a plainer way."
let description "Flags per my last email. On only for the email preset."
let kind "Style"
let becomes "As I mentioned"
let strategy "Exact"

test "Per my last email, the draft is ready." "As I mentioned, the draft is ready."
`);

const circlingBack = rule(`
expr main (just circling back)
let message "Say this in a plainer way."
let description "Flags just circling back. On only for the email preset."
let kind "Style"
let becomes "following up"
let strategy "MatchCase"

test "Just circling back on the draft." "Following up on the draft."
`);

const wantedToReachOut = rule(`
expr main (just wanted to reach out)
let message "Say this in a plainer way."
let description "Flags just wanted to reach out. On only for the email preset."
let kind "Style"
let becomes "wanted to write"
let strategy "MatchCase"

test "Just wanted to reach out about the role." "Wanted to write about the role."
test "I just wanted to reach out about the role." "I wanted to write about the role."
`);

const SOURCES: Record<string, string> = {
	PersonalCommaSplice: commaSplice,
	PersonalDirectQuestion: directQuestion,
	PersonalObjectCase: objectCase,
	PersonalLessFewer: lessFewer,
	PersonalInOrderTo: inOrderTo,
	PersonalDueToTheFact: dueToTheFact,
	PersonalAtThisPoint: atThisPoint,
	PersonalInTheEvent: inTheEvent,
	PersonalIrregardless: irregardless,
	PersonalCouldCareLess: couldCareLess,
	PersonalHopeYoureWell: hopeYoureWell,
	PersonalWantedToFollowUp: wantedToFollowUp,
	PersonalPerMyLastEmail: perMyLastEmail,
	PersonalCirclingBack: circlingBack,
	PersonalWantedToReachOut: wantedToReachOut,
};

for (const word of GREETING_FOLLOWERS) {
	SOURCES[`PersonalGreetingComma${word}`] = greetingComma(word);
}

/** Files for one preset, including manifest.json. Null when the preset is off. */
export function buildPresetFiles(preset: PersonalPresetId): Map<string, string> | null {
	const ruleIds = ruleIdsFor(preset);
	if (ruleIds.length === 0) {
		return null;
	}

	const files = new Map<string, string>();
	files.set('manifest.json', MANIFEST);
	for (const ruleId of ruleIds) {
		const source = SOURCES[ruleId];
		if (source == null) {
			throw new Error(`Missing personal Weir rule ${ruleId}`);
		}
		files.set(`${ruleId}.weir`, source);
	}
	return files;
}

export function allPersonalRuleIds(): string[] {
	return [...CORE_RULES, ...OPENER_RULES, ...STOCK_RULES];
}
