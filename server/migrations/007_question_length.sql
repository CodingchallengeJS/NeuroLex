-- 007_question_length.sql
--
-- Labels every question easy/hard by how much reading it takes, so a learner
-- grinding for a 700 verbal can pick the long ones instead of ploughing through
-- the bank in import order.
--
-- word_count is the fact; difficulty is a label derived from it. Storing both
-- means the threshold can be re-tuned later with a single UPDATE, without
-- recomputing anything.
--
-- WHY 45 AND NOT 80
-- Measured over all 427 questions: min 19 words, median 42, p75 50, max 83.
-- The whole bank is short - a threshold of 80 would call 424 of 427 "easy" and
-- leave 3 hard questions, which is no choice at all. 45 sits just above the
-- median, so "easy" means clearly shorter than typical and both buckets stay
-- big enough to practise from (~250 easy / ~177 hard).
--
-- To re-tune, change the number in one statement:
--   UPDATE questions SET difficulty = CASE WHEN word_count < 50 THEN 'easy' ELSE 'hard' END;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS word_count INTEGER;

-- btrim first: a leading space would otherwise produce an empty first element
-- and count one word too many.
UPDATE questions
   SET word_count = array_length(regexp_split_to_array(btrim(prompt), '\s+'), 1)
 WHERE prompt IS NOT NULL
   AND word_count IS DISTINCT FROM array_length(regexp_split_to_array(btrim(prompt), '\s+'), 1);

UPDATE questions
   SET difficulty = CASE WHEN word_count < 45 THEN 'easy' ELSE 'hard' END
 WHERE word_count IS NOT NULL
   AND difficulty IS DISTINCT FROM (CASE WHEN word_count < 45 THEN 'easy' ELSE 'hard' END);

-- Sorting and filtering by length are both cheap over 427 rows, but the index
-- keeps them cheap if the bank grows.
CREATE INDEX IF NOT EXISTS idx_questions_word_count ON questions(word_count);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
