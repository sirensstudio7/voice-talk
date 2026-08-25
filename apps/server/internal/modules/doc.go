// Package modules is a documentation anchor for every domain module
// (auth, commerce, booking, knowledge, streaming, presenter, photomoment)
// living in its own subpackage below. It holds no code of its own.
//
// Convention, enforced by .golangci.yml's depguard rule plus code review
// until CI is wired up to actually run it:
//
//   - No file under internal/modules/** may import a storage-provider SDK
//     directly — today that means aws-sdk-go-v2 (Cloudflare R2), which
//     belongs exclusively in internal/platform/storage.
//   - internal/platform/** is the only place a genuinely new vendor SDK
//     should be introduced (database, cache, storage, sessions, meter,
//     events, logger). Modules depend on what platform exposes.
//
// Two honest, pre-existing exceptions, not enforced by lint: each
// module's Deps struct already carries *pgxpool.Pool and *redis.Client
// directly, not a platform-owned wrapper type — that's the scaffold's
// existing design from before this convention was written down — and
// internal/modules/auth/handler.go checks pgx.ErrNoRows directly rather
// than a platform-defined sentinel error. Fully hiding those behind
// platform interfaces would mean platform owns all query execution too,
// which is a bigger refactor than this slice attempts — deferred until it
// causes real pain, not silently pretended away.
package modules
