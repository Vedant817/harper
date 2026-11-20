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

/** Sentence-scoped arms. Stars are tokens, so they are written with no spaces. */
function arms(head: string, tail: string, maxTokens: number): string {
	return repeated(head, '*', tail, maxTokens);
}

/**
 * Like `arms`, but `step` is repeated instead of `*`.
 * `step` is written with no spaces around it. `!is` is one following token
 * that is not is, so that token cannot hide in the gap. An expr ref cannot
 * be glued here: `@q!@gap` is read as one name.
 * A space is its own token, so the count includes spaces.
 */
function repeated(head: string, step: string, tail: string, maxTokens: number): string {
	const choices: string[] = [];
	for (let count = 0; count <= maxTokens; count += 1) {
		choices.push(`(${head}${step.repeat(count)}${tail})`);
	}
	return choices.join(', ');
}

function rule(source: string): string {
	return source.trim();
}

const commaSplice = rule(`
expr headVerb <VERB, (![know, mean, guess, suppose, understand, think, said, says, told, asked])>
expr tailVerb <VERB, (![know, mean, guess, suppose, understand, think, hope, believe, recall, remember, assume, assumed, thought, thinks, suspect, imagine, fear, feared, reckon, figure, gather, presume])>
expr head (^PRON @headVerb)
expr splice [${arms('@head', ', I @tailVerb', 24)}]
expr main <@splice, (, I @tailVerb), (, )>
let message "This comma joins two sentences. Use a period or a semicolon."
let description "Flags a comma splice that starts the sentence and continues with I. Speech such as I said, and parentheticals such as I hope, I thought, I assume, I suspect, and I imagine, are left alone. The suggestion replaces only the comma, so the following word must already be I."
let kind "Punctuation"
let becomes [". ", "; "]
let strategy "Exact"
let scope "Sentence"

test "I finished the draft, I sent it." "I finished the draft. I sent it."
test "We wrote the note, I sent it." "We wrote the note. I sent it."
test "I hope, I sent it." "I hope. I sent it."
allows "Hi Sarah, I sent it."
allows "I finished the draft. I sent it."
allows "You know, I sent it."
allows "When I arrived, I saw her."
allows "We left, I think."
allows "I sent, I hope, the file."
allows "I sent, I believe, the note."
allows "We left, I recall, around noon."
allows "I called, I remember, on Tuesday."
allows "I said, I sent it."
allows "I sent the file, I thought, on Tuesday."
allows "I sent the file, I assume, yesterday."
allows "I sent the note, I assume, before she left."
allows "I sent the file, I suspect, on Tuesday."
allows "I sent the file, I imagine, on Tuesday."
allows "I sent the file, I fear, on Tuesday."
allows "I sent the file, I feared, yesterday."
allows "I sent the file, I reckon, on Tuesday."
allows "I sent the file, I figure, on Tuesday."
allows "I sent the file, I gather, on Tuesday."
allows "I sent the file, I presume, on Tuesday."
`);

const directQuestionStop =
	"![is, isn't, wasn't, aren't, was, were, wants, wanted, needs, remains, depends, matters, seems, deserves]";

const directQuestion = rule(`
expr doYou (Do you VERB)
expr howDo (How do you !do)
expr whatTime [(What time is), (What time)]
expr q [(Can you), (Could you), (Would you), (Did you), @doYou, (Does this), (Is there), (Are you), (Are there), (Have you), (When can), (Where is), (Why is), (Who is), (How are), @howDo, (How can)]
expr questions [${repeated('^@q', directQuestionStop, '.', 24)}, ${repeated('^@whatTime', directQuestionStop, '.', 24)}]
expr main <@questions, (.)>
let message "This looks like a direct question. End it with a question mark."
let description "Adds a question mark when the sentence starts as a direct question and ends with a period. A later is, isn't, aren't, was, were, wants, wanted, needs, remains, depends, matters, seems, or deserves is left alone, as are How do you do and Do you a favor."
let kind "Punctuation"
let becomes "?"
let strategy "Exact"
let scope "Sentence"

test "Can you send the file." "Can you send the file?"
test "What time works." "What time works?"
test "What time is it." "What time is it?"
test "Do you send the file." "Do you send the file?"
test "Where is the exit." "Where is the exit?"
allows "Can you send the file?"
allows "I sent the file."
allows "Do the right thing."
allows "When the build finished, I sent the note."
allows "I know what time works."
allows "What time works is Tuesday."
allows "Who is speaking is none of your business."
allows "Why is this hard is obvious."
allows "Where is the exit is posted on the door."
allows "How are the kids is beside the point."
allows "Do you a favor and send the file."
allows "How do you do."
allows "Who is calling wants a refund."
allows "What time works isn't Tuesday."
allows "Who is speaking was never announced."
allows "Who is calling needs a refund."
allows "What time works aren't Tuesdays."
allows "Who is calling remains outside."
allows "What time works depends on her."
allows "Who is speaking matters today."
allows "What time works seems early."
allows "Who is calling deserves an answer."
`);

const objectCase = rule(`
expr prep [between, with, for, to, from, without, about]
expr person [you, him, her, them, us, PROPN, NOUN]
expr punct <(@prep @person and I[., ?]), (I)>
expr verb <(@prep @person and I [is, has, does]), (I)>
expr main [@punct, @verb]
let message "Use me when this is the object."
let description "Corrects object-case and I after a preposition when a period or a question mark follows I, or when is, has, or does follows. A comma after I, and I was or I left, are left alone."
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
allows "I went with Sarah and I was late."
allows "He left without warning and I was stuck."
allows "I came from work and I was late."
allows "She stood with pride and I was proud too."
allows "I went with Sarah and I, and we were late."
`);

const lessFewer = rule(`
expr nouns [meetings, emails, people, items, things, options, days, hours, weeks, months, errors, issues, comments, files, messages, questions, tasks, updates, changes, details, examples, times, reasons, points, steps, notes, calls, drafts, replies, chances, opportunities]
expr main <([(^less @nouns), (![much, or, the] less @nouns)]), (less)>
let message "Use fewer for a plural count."
let description "Corrects less before a plural count noun. much less, more or less, and the less are left alone."
let kind "Grammar"
let becomes "fewer"
let strategy "MatchCase"

test "We need less meetings." "We need fewer meetings."
test "Less meetings were scheduled." "Fewer meetings were scheduled."
allows "We need less time."
allows "We need fewer meetings."
allows "There were much less calls."
allows "There were much less messages."
allows "There were much less people."
allows "We have more or less options."
allows "The less people know about the delay, the better."
`);

const dueToTheFact = rule(`
expr main <([(![is, was, are, were, be, been, being, not, isn't, aren't, wasn't, weren't, never, partly, largely, mostly, solely, seems, appears, remains, became] due to the fact that), (^due to the fact that)]), (due to the fact that)>
let message "Use because."
let description "Shortens due to the fact that. A copula, been, being, not, never, partly, or seems immediately before due is left alone. only, just, and now still shorten."
let kind "WordChoice"
let becomes "because"
let strategy "MatchCase"

test "I waited due to the fact that the file was open." "I waited because the file was open."
test "Due to the fact that the file was open, I waited." "Because the file was open, I waited."
allows "The delay was due to the fact that the file was open."
allows "Success was due to the fact that we started early."
allows "The error is due to the fact that the key is missing."
allows "The delay has been due to the fact that the server was down."
allows "The delay was not due to the fact that the file was open."
allows "The delay wasn't due to the fact that the file was open."
allows "It has been due to the fact that the file was open."
allows "The delay was never due to the fact that the file was open."
allows "The delay seems due to the fact that the server was down."
allows "The delay was partly due to the fact that the file was open."
allows "The delay was largely due to the fact that the file was open."
allows "The delay was mostly due to the fact that the file was open."
allows "The delay was solely due to the fact that the file was open."
allows "The delay appears due to the fact that the server was down."
allows "The delay remains due to the fact that the server was down."
allows "The delay became due to the fact that the server was down."
`);

const atThisPoint = rule(`
expr main <((at this point in time).), (at this point in time)>
let message "Use now."
let description "Shortens at this point in time when a period follows the phrase. A following word, including time and space and time travel, is left alone."
let kind "WordChoice"
let becomes "now"
let strategy "MatchCase"

test "Nothing is blocked at this point in time." "Nothing is blocked now."
allows "We study the universe at this point in time and space."
allows "At this point in time travel, the hero returns."
allows "Can we talk at this point in time next week."
`);

const inTheEvent = rule(`
expr follower [the, a, an, it, this, there]
expr main <((in the event that) @follower), (in the event that)>
let message "Use if."
let description "Shortens in the event that when the, a, an, it, this, or there follows. A relative clause such as the event that raised is left alone. A title such as the event that the school hosted still shortens, because it has the same shape as a real condition."
let kind "WordChoice"
let becomes "if"
let strategy "MatchCase"

test "Call me in the event that the draft changes." "Call me if the draft changes."
allows "We met in the event that raised the money."
allows "In the event that happened last year, we were ready."
allows "She spoke in the event that opened the conference."
allows "Please add me in the event that you created for Friday."
`);

const irregardless = rule(`
expr main <([(![word, use, using, write, writing, say, saying, spell, spelling, stop, avoid, avoiding, avoided, term, terms, mention, mentioning, mentioned] irregardless), (^irregardless)]), (irregardless)>
let message "The word is regardless."
let description "Corrects irregardless. Naming the word, or a verb such as avoid or mention immediately before it, is left alone."
let kind "Usage"
let becomes "regardless"
let strategy "MatchCase"

test "I will send it irregardless." "I will send it regardless."
test "Irregardless of the delay, I sent it." "Regardless of the delay, I sent it."
allows "Please stop writing irregardless."
allows "Do not use irregardless in the draft."
allows "The word irregardless is nonstandard."
allows "Please avoid irregardless in the draft."
allows "The term irregardless is nonstandard."
`);

const couldCareLess = rule(`
expr opener [(^could care less), (^[I, You, We, They] could care less)]
expr span [${repeated('@opener about', '![more, than]', '.', 24)}]
expr main <@span, (could care less)>
let message "The phrase is couldn't care less."
let description "Corrects could care less about at the start of a sentence. A comparison that uses more or than before the period is left alone. A later if still changes the phrase."
let kind "Usage"
let becomes "couldn't care less"
let strategy "MatchCase"
let scope "Sentence"

test "I could care less about the font." "I couldn't care less about the font."
test "Could care less about the font." "Couldn't care less about the font."
test "They could care less about the cost if they tried." "They couldn't care less about the cost if they tried."
allows "I couldn't care less about the font."
allows "If we could care less, we would have left."
allows "You could care less than you do."
allows "You could care less and still pass."
allows "We could care less if we wanted to."
allows "I could care less about the title and more about the work."
allows "I could care less about the title than the work."
`);

function greetingComma(word: string): string {
	return rule(`
expr greet [Hi, Hey, Hello, Dear]
expr addressee [PROPN, Sarah, John, Priya, Alex, Sam, Maria, David, Lisa, there, team, folks]
expr main <(^@greet @addressee ${word}), ( ${word})>
let message "Add a comma after the greeting."
let description "Inserts the comma when the sentence starts with a greeting and a name. all and everyone are not treated as names. there stays, so Hey there, I still gains a comma."
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
expr main <((^per my last email), ![which, who, that, where, when]), (per my last email)>
let message "Say this in a plainer way."
let description "Flags per my last email when it starts the sentence and a comma follows, unless which, who, that, where, or when comes next. On only for the email preset."
let kind "Style"
let becomes "As I mentioned"
let strategy "Exact"
let scope "Sentence"

test "Per my last email, the draft is ready." "As I mentioned, the draft is ready."
allows "See per my last email for the date."
allows "Per my last email was a mistake."
allows "Per my last email, which I sent Tuesday, the date changed."
allows "Per my last email, which I sent on Tuesday, still has the dates."
`);

const circlingBack = rule(`
expr subject [(the draft), (the email), (the note), (the role), (the thread), (the message), (the proposal), (the meeting), (the call), (the document), (the file), (the invoice), (the update), (the offer), (the application), (the request)]
expr main <((^just circling back) [(on @subject), (about @subject), (regarding @subject)]), (just circling back)>
let message "Say this in a plainer way."
let description "Flags just circling back on, about, or regarding a short list of work nouns when it starts the sentence. On only for the email preset."
let kind "Style"
let becomes "following up"
let strategy "MatchCase"
let scope "Sentence"

test "Just circling back on the draft." "Following up on the draft."
allows "The hawk was just circling back toward the nest."
allows "Just circling back toward the nest, the hawk cried."
allows "Just circling back to the house, I noticed the light."
allows "Just circling back on my way to the office."
allows "Just circling back on the trail, we turned around."
`);

const wantedToReachOut = rule(`
expr measure [mile, inch, foot, hour, minute, while]
expr target [(about the), (about our), (about your), (about this), (about my), (regarding the), (regarding our), (regarding your), (regarding this), (regarding my), ((about a) !@measure), ((about an) !@measure), ((regarding a) !@measure), ((regarding an) !@measure)]
expr main <((just wanted to reach out) @target), (just wanted to reach out)>
let message "Say this in a plainer way."
let description "Flags just wanted to reach out about or regarding when a determiner follows. A measure after a or an, such as a mile or an hour, is left alone. about the role still changes. On only for the email preset."
let kind "Style"
let becomes "wanted to write"
let strategy "MatchCase"

test "Just wanted to reach out about the role." "Wanted to write about the role."
test "I just wanted to reach out about the role." "I wanted to write about the role."
test "I just wanted to reach out about a role." "I wanted to write about a role."
allows "I just wanted to reach out and shake your hand."
allows "The intern just wanted to reach out the window."
allows "I just wanted to reach out for the salt."
allows "The baby just wanted to reach out toward her mother."
allows "He just wanted to reach out his hand."
allows "They just wanted to reach out across the aisle."
allows "I just wanted to reach out about noon to grab lunch."
allows "He just wanted to reach out about six inches."
allows "I just wanted to reach out about a mile."
allows "I just wanted to reach out about an hour before lunch."
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
