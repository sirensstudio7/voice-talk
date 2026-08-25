-- name: ListPresentationEmbeddings :many
SELECT * FROM presentation_embeddings WHERE presentation_id = $1;

-- name: DeleteNonKnowledgeEmbeddings :exec
DELETE FROM presentation_embeddings WHERE presentation_id = $1 AND source_type != 'knowledge';

-- name: CreatePresentationEmbedding :one
INSERT INTO presentation_embeddings (id, presentation_id, source_type, source_id, chunk_text)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: DeleteKnowledgeEmbeddings :exec
DELETE FROM presentation_embeddings WHERE presentation_id = $1 AND source_type = 'knowledge' AND source_id = $2;
