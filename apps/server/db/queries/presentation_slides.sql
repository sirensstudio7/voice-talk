-- name: ListPresentationSlides :many
SELECT * FROM presentation_slides WHERE presentation_id = $1 ORDER BY slide_number;

-- name: DeletePresentationSlides :exec
DELETE FROM presentation_slides WHERE presentation_id = $1;

-- name: CreatePresentationSlide :one
INSERT INTO presentation_slides (id, presentation_id, slide_number, title, content_json, notes, script, duration_seconds)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;
