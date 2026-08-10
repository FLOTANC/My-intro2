import { neon, neonConfig } from '@neondatabase/serverless';

// ローカル開発専用の分岐: NEON_LOCAL_PROXY が設定されているときだけ、
// @neondatabase/serverless の fetch(HTTP)ベースの neon() クライアントを
// ローカルの Neon HTTP プロキシ（例: timowilhelm/local-neon-http-proxy を
// Docker で起動したもの）経由に向ける。これにより DATABASE_URL には
// ローカル Postgres コンテナへの普通の postgres:// 接続文字列を渡せる。
// 本番環境（Neon の DATABASE_URL のみで NEON_LOCAL_PROXY 未設定）では
// この if 文は素通りし、挙動は今までとまったく変わらない。
if (process.env.NEON_LOCAL_PROXY) {
  neonConfig.fetchEndpoint = process.env.NEON_LOCAL_PROXY;
  neonConfig.useSecureWebSocket = false;
  neonConfig.poolQueryViaFetch = true;
}

export const sql = neon(process.env.DATABASE_URL!);
