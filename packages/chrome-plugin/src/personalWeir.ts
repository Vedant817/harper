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
expr firstVerb <VERB, (![know, mean, guess, suppose, understand, think])>
expr head (^PRON @firstVerb)
expr splice [${arms('@head', ', I @firstVerb', 24)}]
expr main <@splice, (, I @firstVerb), (, )>
let message "This comma joins two sentences. Use a period or a semicolon."
let description "Flags a comma splice that starts the sentence and continues with I. A clause such as When I arrived is left alone. The suggestion replaces only the comma, so the following word must already be I."
let kind "Punctuation"
let becomes [". ", "; "]
let strategy "Exact"
let scope "Sentence"

test "I finished the draft, I sent it." "I finished the draft. I sent it."
test "We wrote the note, I sent it." "We wrote the note. I sent it."
allows "Hi Sarah, I sent it."
allows "I finished the draft. I sent it."
allows "You know, I sent it."
allows "When I arrived, I saw her."
allows "We left, I think."
`);

const directQuestion = rule(`
expr q [(Can you), (Could you), (Would you), (Did you), (Do you), (Does this), (Is there), (Are you), (Are there), (Have you), (What time), (When can), (Where is), (Why is), (Who is), (How are), (How do), (How can)]
expr questions [${arms('^@q', '.', 24)}]
expr main <@questions, (.)>
let message "This looks like a direct question. End it with a question mark."
let description "Adds a question mark when the sentence starts as a direct question and ends with a period."
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
allows "I know what time works."
`);

const objectCase = rule(`
expr prep [between, with, for, to, from, without, about]
expr person [you, him, her, them, us, PROPN, NOUN]
expr punct <(@prep @person and I[., ?]), (I)>
expr verb <(@prep @person and I [is, has, does]), (I)>
expr main [@punct, @verb]
let message "Use me when this is the object."
let description "Corrects object-case and I after a preposition. I was and I left are left alone, because those verbs can take I as a subject."
let kind "Grammar"
let becomes "me"
let strategy "Exact"
let scope "Sentence"

test "This stays between you and I." "This stays between you and me."
test "I spoke with Sarah and I." "I spoke with Sarah and me."
test "Is this between you and I?" "Is this between you and me?"
test "The bond between you and I is strong." "The bond between you and me is strong."
allows "Sarah and I went to the meeting."
allows "I went with Sarah and I left."
allows "I stood between you and I was stuck."
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
expr main <([(^could care less), (^[I, You, We, They] could care less)]), (could care less)>
let message "The phrase is couldn't care less."
let description "Corrects could care less at the start of a sentence. A conditional such as if we could care less is left alone."
let kind "Usage"
let becomes "couldn't care less"
let strategy "MatchCase"
let scope "Sentence"

test "I could care less about the font." "I couldn't care less about the font."
test "Could care less about the font." "Couldn't care less about the font."
allows "I couldn't care less about the font."
allows "If we could care less, we would have left."
`);

function greetingComma(word: string): string {
	return rule(`
expr greet [Hi, Hey, Hello, Dear]
expr addressee [PROPN, Sarah, John, Priya, Alex, Sam, Maria, David, Lisa, there, team, folks]
expr main <(^@greet @addressee ${word}), ( ${word})>
let message "Add a comma after the greeting."
let description "Inserts the comma when the sentence starts with a greeting and a name. all and everyone are not treated as names."
let kind "Punctuation"
let becomes ", ${word}"
let strategy "MatchCase"
let scope "Sentence"

test "Hi Sarah ${word} sent a note." "Hi Sarah, ${word} sent a note."
test "Hi Sarah ${word.toLowerCase()} sent a note." "Hi Sarah, ${word.toLowerCase()} sent a note."
allows "Hi Sarah, ${word} sent a note."
allows "I said hey all I know is the title."
allows "Everyone I know is here."
`);
}

const hopeYoureWell = rule(`
expr main (^Hope you're well)
let message "Start with I."
let description "Inserts I in Hope you're well when that phrase starts the sentence."
let kind "Style"
let becomes "I hope you're well"
let strategy "Exact"
let scope "Sentence"

test "Hope you're well." "I hope you're well."
allows "I hope you're well."
allows "Thanks, Hope you're well."
`);

const wantedToFollowUp = rule(`
expr main (^Wanted to follow up)
let message "Start with I."
let description "Inserts I in Wanted to follow up when that phrase starts the sentence."
let kind "Style"
let becomes "I wanted to follow up"
let strategy "Exact"
let scope "Sentence"

test "Wanted to follow up on the draft." "I wanted to follow up on the draft."
allows "I wanted to follow up on the draft."
allows "Thanks, Wanted to follow up."
`);

const perMyLastEmail = rule(`
expr main (^per my last email)
let message "Say this in a plainer way."
let description "Flags per my last email when it starts the sentence. On only for the email preset."
let kind "Style"
let becomes "As I mentioned"
let strategy "Exact"
let scope "Sentence"

test "Per my last email, the draft is ready." "As I mentioned, the draft is ready."
allows "See per my last email for the date."
`);

const circlingBack = rule(`
expr main (^just circling back)
let message "Say this in a plainer way."
let description "Flags just circling back when it starts the sentence. On only for the email preset."
let kind "Style"
let becomes "following up"
let strategy "MatchCase"
let scope "Sentence"

test "Just circling back on the draft." "Following up on the draft."
allows "The hawk was just circling back toward the nest."
`);

const wantedToReachOut = rule(`
expr main <((just wanted to reach out) [about, regarding]), (just wanted to reach out)>
let message "Say this in a plainer way."
let description "Flags just wanted to reach out about or regarding. Reaching out a window is left alone. On only for the email preset."
let kind "Style"
let becomes "wanted to write"
let strategy "MatchCase"

test "Just wanted to reach out about the role." "Wanted to write about the role."
test "I just wanted to reach out about the role." "I wanted to write about the role."
allows "I just wanted to reach out and shake your hand."
allows "The intern just wanted to reach out the window."
`);

const SOURCES: Record<string, string> = {
	PersonalCommaSplice: commaSplice,
	PersonalDirectQuestion: directQuestion,
	PersonalObjectCase: objectCase,
	PersonalLessFewer: lessFewer,
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
