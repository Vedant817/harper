use super::{Lint, LintKind, Linter, Suggestion};
use crate::{CharStringExt, Document, Span};
use crate::TokenKind;

const QUESTION_WORDS: &[&str] = &[
    "what", "when", "where", "who", "why", "how", "which", "is", "are", "do", "does", "did",
    "can", "could", "will", "would", "should",
];

/// Adds a question mark to an unpunctuated question-word line.
#[derive(Debug, Clone, Default)]
pub struct PersonalDirectQuestion;

impl Linter for PersonalDirectQuestion {
    fn lint(&mut self, document: &Document) -> Vec<Lint> {
        let mut lints = Vec::new();
        let tokens: Vec<_> = document.tokens().collect();
        let mut line_start = 0;

        for index in 0..=tokens.len() {
            let at_end = index == tokens.len();
            let line_break = !at_end
                && matches!(
                    tokens[index].kind,
                    TokenKind::Newline(_) | TokenKind::ParagraphBreak
                );

            if !at_end && !line_break {
                continue;
            }

            let mut first = line_start;
            while first < index && tokens[first].kind.is_whitespace() {
                first += 1;
            }
            let mut last = index;
            while last > first && tokens[last - 1].kind.is_whitespace() {
                last -= 1;
            }

            if first < last {
                let first_token = &tokens[first];
                let word = document.get_span_content(&first_token.span);

                if word.eq_any_ignore_ascii_case_str(QUESTION_WORDS)
                    && !tokens[first..last]
                        .iter()
                        .any(|token| token.kind.is_sentence_terminator())
                {
                    let span = Span::new(
                        tokens[last - 1].span.start,
                        tokens[last - 1].span.end,
                    );
                    lints.push(Lint {
                        span,
                        lint_kind: LintKind::Punctuation,
                        suggestions: vec![Suggestion::InsertAfter(vec!['?'])],
                        message: "This looks like a direct question. End it with a question mark."
                            .to_owned(),
                        priority: 31,
                    });
                }
            }

            line_start = index + 1;
        }

        lints
    }

    fn description(&self) -> &'static str {
        "Adds a question mark to a line that starts with a question word and has no terminal punctuation."
    }
}

#[cfg(test)]
mod tests {
    use super::PersonalDirectQuestion;
    use crate::linting::tests::{assert_lint_count, assert_suggestion_result};

    #[test]
    fn adds_a_question_mark() {
        assert_suggestion_result(
            "What time is the call",
            PersonalDirectQuestion::default(),
            "What time is the call?",
        );
    }

    #[test]
    fn allows_a_complete_sentence() {
        assert_lint_count("Sounds good.", PersonalDirectQuestion::default(), 0);
    }

    #[test]
    fn allows_an_ellipsis() {
        assert_lint_count("Wait for it...", PersonalDirectQuestion::default(), 0);
    }

    #[test]
    fn allows_a_terminal_period() {
        assert_lint_count("What I mean is this.", PersonalDirectQuestion::default(), 0);
    }

    #[test]
    fn allows_a_question_word_inside_a_sentence() {
        assert_lint_count("I wonder what time it is.", PersonalDirectQuestion::default(), 0);
    }

    #[test]
    fn allows_a_question_mark() {
        assert_lint_count("Is this ok?", PersonalDirectQuestion::default(), 0);
    }

    #[test]
    fn flags_a_heading_like_line() {
        // Known false positive: a heading such as "How to install" has no terminator.
        assert_lint_count("How to install", PersonalDirectQuestion::default(), 1);
    }
}
