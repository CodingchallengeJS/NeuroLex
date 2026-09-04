-- 002_add_vocab_to_review.sql
-- add_vocab_to_review(user_id, notebook_id, limit)
--
-- Queues the next N words of a notebook into the user review queue, resuming
-- from user_notebook_progress.current_word_id and wrapping around the end.
-- Used by other-tools/addtostudy.py.
--
-- Dumped from the live development database on 2026-09-04. It was never in
-- createdb.sql, so a database built from the repo alone did not have it.
-- Fold this into the numbered migrations when P1.4 lands.
CREATE OR REPLACE FUNCTION public.add_vocab_to_review(p_user_id bigint, p_notebook_id bigint, p_limit integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    WITH OrderedVocab AS (
        SELECT
            vocab_id,
            ROW_NUMBER() OVER (ORDER BY sort_order ASC, vocab_id ASC) - 1 AS rn
        FROM notebook_vocab
        WHERE notebook_id = p_notebook_id
    ),
    CurrentPos AS (
        SELECT COALESCE(
            (SELECT ov.rn
             FROM user_notebook_progress unp
             JOIN OrderedVocab ov ON unp.current_word_id = ov.vocab_id
             WHERE unp.user_id = p_user_id AND unp.notebook_id = p_notebook_id),
            -1
        ) AS curr_rn,
        (SELECT COUNT(*) FROM OrderedVocab) AS total_words
    ),
    NextWords AS (
        SELECT
            ov.vocab_id,
            ov.rn,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN ov.rn > cp.curr_rn THEN 0 ELSE 1 END ASC,
                    ov.rn ASC
            ) AS fetch_order
        FROM OrderedVocab ov
        CROSS JOIN CurrentPos cp
        WHERE cp.total_words > 0
        ORDER BY
            CASE WHEN ov.rn > cp.curr_rn THEN 0 ELSE 1 END ASC,
            ov.rn ASC
        LIMIT p_limit
    ),
    UpdateVocabProgress AS (
        INSERT INTO user_vocab_progress (user_id, vocab_id, next_review_at, repetition_level)
        SELECT
            p_user_id,
            vocab_id,
            CURRENT_TIMESTAMP,
	    -1
        FROM NextWords
        ON CONFLICT (user_id, vocab_id) DO NOTHING
        RETURNING vocab_id
    ),
    LastWord AS (
        SELECT vocab_id
        FROM NextWords
        ORDER BY fetch_order DESC
        LIMIT 1
    )
    INSERT INTO user_notebook_progress (user_id, notebook_id, current_word_id)
    SELECT
        p_user_id,
        p_notebook_id,
        (SELECT vocab_id FROM LastWord)
    ON CONFLICT (user_id, notebook_id)
    DO UPDATE SET current_word_id = EXCLUDED.current_word_id;
END;
$function$;
