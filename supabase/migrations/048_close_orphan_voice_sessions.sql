-- Close leftover active voice sessions and cap inflated interrupted closes.
-- Abandoned rows end at last transcript time (or start), never more than 15 minutes.

UPDATE voice_sessions vs
SET
  status = 'ended',
  end_reason = coalesce(vs.end_reason, 'interrupted'),
  ended_at = least(
    vs.started_at + interval '15 minutes',
    greatest(
      vs.started_at,
      coalesce(
        (
          SELECT max(tm.created_at)
          FROM transcript_messages tm
          WHERE tm.voice_session_id = vs.id
        ),
        vs.started_at
      )
    )
  )
WHERE vs.status = 'active'
  AND vs.ended_at IS NULL
  AND vs.started_at < now() - interval '15 minutes';

UPDATE voice_sessions vs
SET ended_at = least(
  vs.started_at + interval '15 minutes',
  greatest(
    vs.started_at,
    coalesce(
      (
        SELECT max(tm.created_at)
        FROM transcript_messages tm
        WHERE tm.voice_session_id = vs.id
      ),
      vs.started_at
    )
  )
)
WHERE vs.end_reason = 'interrupted'
  AND vs.ended_at IS NOT NULL
  AND vs.ended_at > vs.started_at + interval '15 minutes';
