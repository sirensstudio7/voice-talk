CREATE TABLE IF NOT EXISTS demo_requests (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  city VARCHAR(120) NOT NULL,
  business_industry VARCHAR(100) NOT NULL,
  branch_total INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demo_requests_branch_total_check CHECK (branch_total >= 1)
);

CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON demo_requests(status);
CREATE INDEX IF NOT EXISTS idx_demo_requests_created_at ON demo_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_requests_email ON demo_requests(email);
