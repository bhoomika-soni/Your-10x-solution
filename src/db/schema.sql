-- Job Match Tracker schema. Safe to run more than once.

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM ('applied', 'interviewing', 'offer', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE match_job_status AS ENUM ('pending', 'processing', 'done', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  resume_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  job_description TEXT NOT NULL,
  status application_status NOT NULL DEFAULT 'applied',
  notes TEXT,
  applied_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);

-- Cache of resume<->job-description match results, keyed by content hash.
-- The same resume scored against the same job description is never sent
-- to the LLM twice: this table is the caching layer.
CREATE TABLE IF NOT EXISTS match_results (
  id SERIAL PRIMARY KEY,
  resume_hash TEXT NOT NULL,
  jd_hash TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  verdict TEXT NOT NULL,
  strengths JSONB NOT NULL DEFAULT '[]',
  gaps JSONB NOT NULL DEFAULT '[]',
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resume_hash, jd_hash)
);

-- Queue of match work. A row is inserted as 'pending' by the API request
-- and picked up by the background worker (src/services/worker.js), which
-- is what keeps the slow LLM call off the request path.
CREATE TABLE IF NOT EXISTS match_jobs (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status match_job_status NOT NULL DEFAULT 'pending',
  match_result_id INTEGER REFERENCES match_results(id),
  cached BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_jobs_status ON match_jobs(status);
CREATE INDEX IF NOT EXISTS idx_match_jobs_application ON match_jobs(application_id);
