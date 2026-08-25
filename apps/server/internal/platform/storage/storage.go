// Package storage wraps Cloudflare R2 behind an S3-compatible client. R2
// is API-compatible with AWS S3, so this uses aws-sdk-go-v2/service/s3
// pointed at R2's account-scoped endpoint via a custom base endpoint and
// path-style addressing. Swapping in real R2 credentials later is a
// config change only — no code in this package or internal/modules/*
// references R2 directly.
package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	smithyhttp "github.com/aws/smithy-go/transport/http"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/config"
)

// Bucket-prefix convention per docs/TECHNICAL-ARCHITECTURE-SPEC.md §4.3.
const (
	PrefixAvatars       = "avatars/"
	PrefixProducts      = "products/"
	PrefixPayments      = "payments/"
	PrefixPresentations = "presentations/"
	PrefixPhotos        = "photos/"
)

// Size limits ported from apps-legacy/server/src/storage/index.ts.
const (
	MaxUploadBytes             = 5 * 1024 * 1024  // generic images
	MaxPhotoUploadBytes        = 8 * 1024 * 1024  // Smart Photo Moment captures
	MaxPresentationUploadBytes = 50 * 1024 * 1024 // .pptx decks
)

type Client struct {
	s3     *s3.Client
	bucket string
	pubURL string
}

// New constructs an R2 client. It fails if R2AccountID or R2Bucket are
// unset — config.Load() never validates these itself, since no module in
// this slice needs storage yet, so the failure happens here instead, at
// the point something actually tries to use it.
func New(ctx context.Context, cfg *config.Config) (*Client, error) {
	if cfg.R2AccountID == "" || cfg.R2Bucket == "" {
		return nil, fmt.Errorf("storage: R2_ACCOUNT_ID and R2_BUCKET are required")
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.R2AccessKeyID, cfg.R2SecretAccessKey, "")),
		awsconfig.WithRegion("auto"),
	)
	if err != nil {
		return nil, fmt.Errorf("storage: load aws config: %w", err)
	}

	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", cfg.R2AccountID)
	s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true // R2 requires path-style addressing
	})

	return &Client{s3: s3Client, bucket: cfg.R2Bucket, pubURL: cfg.R2PublicBaseURL}, nil
}

// Upload writes data to key, deleting any existing object at key first —
// mirrors the upsert-via-delete pattern in
// apps-legacy/server/src/storage/index.ts. A missing prior object is not
// an error.
func (c *Client) Upload(ctx context.Context, key string, data []byte, contentType string) error {
	if err := c.Delete(ctx, key); err != nil && !isNotFound(err) {
		return fmt.Errorf("storage: delete existing object %q: %w", key, err)
	}

	_, err := c.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return fmt.Errorf("storage: upload %q: %w", key, err)
	}
	return nil
}

// Download reads the object at key.
func (c *Client) Download(ctx context.Context, key string) ([]byte, error) {
	out, err := c.s3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("storage: download %q: %w", key, err)
	}
	defer func() { _ = out.Body.Close() }()

	data, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, fmt.Errorf("storage: read %q: %w", key, err)
	}
	return data, nil
}

// SignedURL returns a time-limited presigned GET URL for key.
func (c *Client) SignedURL(ctx context.Context, key string, expiresIn time.Duration) (string, error) {
	presignClient := s3.NewPresignClient(c.s3)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(expiresIn))
	if err != nil {
		return "", fmt.Errorf("storage: sign %q: %w", key, err)
	}
	return req.URL, nil
}

// Delete removes the object at key.
func (c *Client) Delete(ctx context.Context, key string) error {
	_, err := c.s3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("storage: delete %q: %w", key, err)
	}
	return nil
}

// Healthy performs a cheap connectivity check against the configured
// bucket. Not required for the server to boot — only meaningful once real
// credentials are in place.
func (c *Client) Healthy(ctx context.Context) error {
	_, err := c.s3.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(c.bucket)})
	if err != nil {
		return fmt.Errorf("storage: head bucket: %w", err)
	}
	return nil
}

func isNotFound(err error) bool {
	respErr, ok := errors.AsType[*smithyhttp.ResponseError](err)
	if !ok {
		return false
	}
	return respErr.HTTPStatusCode() == 404
}
