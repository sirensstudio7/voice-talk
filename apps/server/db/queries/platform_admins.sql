-- name: GetPlatformAdminByEmail :one
SELECT * FROM platform_admins WHERE email = $1;

-- name: GetPlatformAdminByID :one
SELECT * FROM platform_admins WHERE id = $1;

-- name: CreatePlatformAdmin :one
INSERT INTO platform_admins (id, name, email, password_hash, role)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: CountPlatformAdmins :one
SELECT count(*) FROM platform_admins;

-- name: SetPlatformAdminTOTP :one
UPDATE platform_admins SET totp_secret = $2, totp_enabled = $3
WHERE id = $1
RETURNING *;

-- name: UpdatePlatformAdminLastLogin :exec
UPDATE platform_admins SET last_login_at = NOW() WHERE id = $1;

-- name: UpdatePlatformAdminPasswordHash :exec
UPDATE platform_admins SET password_hash = $2 WHERE id = $1;
