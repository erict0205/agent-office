declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    OFFICE_INGEST_TOKEN_SHA256?: string;
    OFFICE_RUNNER_TOKEN_SHA256?: string;
    OFFICE_OWNER_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
