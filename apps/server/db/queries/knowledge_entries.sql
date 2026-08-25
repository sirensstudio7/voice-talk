-- name: ListKnowledgeEntries :many
SELECT * FROM knowledge_entries WHERE business_id = $1 ORDER BY sort_order, category;

-- name: CreateKnowledgeEntry :one
INSERT INTO knowledge_entries (id, business_id, category, title, content, sort_order)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateKnowledgeEntry :one
UPDATE knowledge_entries SET
  category = COALESCE(sqlc.narg('category'), category),
  title = COALESCE(sqlc.narg('title'), title),
  content = COALESCE(sqlc.narg('content'), content),
  sort_order = COALESCE(sqlc.narg('sort_order'), sort_order)
WHERE id = sqlc.arg('id') AND business_id = sqlc.arg('business_id')
RETURNING *;

-- name: DeleteKnowledgeEntry :execrows
DELETE FROM knowledge_entries WHERE id = $1 AND business_id = $2;

-- name: DeleteAllKnowledgeEntries :execrows
DELETE FROM knowledge_entries WHERE business_id = $1;
