-- name: ListPresentationKnowledgeEntries :many
SELECT * FROM presentation_knowledge_entries WHERE presentation_id = $1 ORDER BY sort_order, created_at;

-- name: CreatePresentationKnowledgeEntry :one
INSERT INTO presentation_knowledge_entries (id, presentation_id, title, content, sort_order)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdatePresentationKnowledgeEntry :one
UPDATE presentation_knowledge_entries SET
  title = COALESCE(sqlc.narg('title'), title),
  content = COALESCE(sqlc.narg('content'), content),
  sort_order = COALESCE(sqlc.narg('sort_order'), sort_order),
  updated_at = NOW()
WHERE id = sqlc.arg('id') AND presentation_id = sqlc.arg('presentation_id')
RETURNING *;

-- name: DeletePresentationKnowledgeEntry :execrows
DELETE FROM presentation_knowledge_entries WHERE id = $1 AND presentation_id = $2;

-- name: GetPresentationKnowledgeEntry :one
SELECT * FROM presentation_knowledge_entries WHERE id = $1 AND presentation_id = $2;
