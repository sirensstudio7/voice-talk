-- name: ListPresentationFiles :many
SELECT * FROM presentation_files WHERE presentation_id = $1 ORDER BY created_at;

-- name: CreatePresentationFile :one
INSERT INTO presentation_files (id, presentation_id, file_name, file_type, size_bytes, storage_path)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetPresentationFile :one
SELECT * FROM presentation_files WHERE id = $1 AND presentation_id = $2;

-- name: GetPresentationFileByType :one
SELECT * FROM presentation_files WHERE presentation_id = $1 AND file_type = $2 ORDER BY created_at DESC LIMIT 1;
