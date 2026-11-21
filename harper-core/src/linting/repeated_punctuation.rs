use super::{Lint, LintKind, Linter, Suggestion};
use crate::{Document, Punctuation, Span};

/// Collapses runs of three or more identical terminal punctuation marks.
#[derive(Debug, Clone, Default)]
pub struct RepeatedPunctuation;

impl Linter for RepeatedPunctuation {
    fn lint(&mut self, document: &Document) -> Vec<Lint> {
        let mut lints = Vec::new();

        {
            let chunk: Vec<_> = document.tokens().collect();
            let mut index = 0;

            while index < chunk.len() {
                let Some(mark) = chunk[index].kind.as_punctuation().copied() else {
                    index += 1;
                    continue;
                };

                if !matches!(mark, Punctuation::Bang | Punctuation::Question) {
                    index += 1;
                    continue;
                }

                let mut end = index + 1;
                while end < chunk.len()
                    && chunk[end].kind.as_punctuation().copied() == Some(mark)
                {
                    end += 1;
                }

                if end - index >= 3 {
                    let (replacement, message) = if mark == Punctuation::Bang {
                        ('!', "Use one exclamation mark.")
                    } else {
                        ('?', "Use one question mark.")
                    };

                    let mut span_start = chunk[index].span.start;
                    let mut replacement_text = vec![replacement];

                    if index > 0 && chunk[index - 1].kind.is_word() {
                        span_start = chunk[index - 1].span.start;
                        replacement_text = document
                            .get_span_content(&chunk[index - 1].span)
                            .to_vec();
                        replacement_text.push(replacement);
                    }

                    lints.push(Lint {
                        span: Span::new(span_start, chunk[end - 1].span.end),
                        lint_kind: LintKind::Punctuation,
                        suggestions: vec![Suggestion::ReplaceWith(replacement_text)],
                        message: message.to_owned(),
                        priority: 31,
                    });
                }

                index = end;
            }
        }

        lints
    }

    fn description(&self) -> &'static str {
        "Collapses three or more identical exclamation marks or question marks to one."
    }
}

#[cfg(test)]
mod tests {
    use super::RepeatedPunctuation;
    use crate::linting::tests::{assert_lint_count, assert_suggestion_result};

    #[test]
    fn collapses_three_exclamation_marks() {
        assert_suggestion_result(
            "urgent!!!",
            RepeatedPunctuation::default(),
            "urgent!",
        );
    }

    #[test]
    fn collapses_three_question_marks() {
        assert_suggestion_result("What???", RepeatedPunctuation::default(), "What?");
    }

    #[test]
    fn collapses_longer_runs() {
        assert_suggestion_result(
            "Wait!!!!",
            RepeatedPunctuation::default(),
            "Wait!",
        );
    }

    #[test]
    fn allows_a_single_mark() {
        assert_lint_count("urgent!", RepeatedPunctuation::default(), 0);
        assert_lint_count("What?", RepeatedPunctuation::default(), 0);
    }

    #[test]
    fn allows_two_marks() {
        assert_lint_count("What??", RepeatedPunctuation::default(), 0);
        assert_lint_count("urgent!!", RepeatedPunctuation::default(), 0);
    }

    #[test]
    fn allows_ellipsis() {
        assert_lint_count("Wait for it...", RepeatedPunctuation::default(), 0);
    }

    #[test]
    fn allows_mixed_marks() {
        assert_lint_count("Really?!", RepeatedPunctuation::default(), 0);
        assert_lint_count("Really!?", RepeatedPunctuation::default(), 0);
    }
}
