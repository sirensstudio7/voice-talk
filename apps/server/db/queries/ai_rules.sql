-- name: GetAIRules :one
SELECT * FROM ai_rules WHERE business_id = $1;

-- name: CreateAIRules :one
INSERT INTO ai_rules (id, business_id, assistant_name, personality, tone)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateAIRules :one
UPDATE ai_rules SET
  assistant_name = COALESCE(sqlc.narg('assistant_name'), assistant_name),
  avatar_model_path = COALESCE(sqlc.narg('avatar_model_path'), avatar_model_path),
  personality = COALESCE(sqlc.narg('personality'), personality),
  tone = COALESCE(sqlc.narg('tone'), tone),
  language = COALESCE(sqlc.narg('language'), language),
  behavioral_rules = COALESCE(sqlc.narg('behavioral_rules'), behavioral_rules),
  tool_instructions = COALESCE(sqlc.narg('tool_instructions'), tool_instructions),
  idle_timeout_seconds = COALESCE(sqlc.narg('idle_timeout_seconds'), idle_timeout_seconds),
  voice_preset = COALESCE(sqlc.narg('voice_preset'), voice_preset),
  voice_gender = COALESCE(sqlc.narg('voice_gender'), voice_gender)
WHERE business_id = sqlc.arg('business_id')
RETURNING *;
