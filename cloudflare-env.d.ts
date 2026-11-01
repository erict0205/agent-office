declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    OFFICE_INGEST_TOKEN_SHA256?: string;
    BUCKET?: R2Bucket;
  }
}
