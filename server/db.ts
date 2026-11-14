import 'dotenv/config';
import pg from 'pg';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||'postgresql://a3:a3_local_dev@localhost:5432/a3',connectionTimeoutMillis:3000,max:10});
export const schema=`
CREATE TABLE IF NOT EXISTS rooms (
 id text PRIMARY KEY,
 state jsonb NOT NULL,
 members jsonb NOT NULL,
 status text NOT NULL DEFAULT 'waiting',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS match_results (
 room_id text PRIMARY KEY REFERENCES rooms(id),
 scores jsonb NOT NULL,
 ranking jsonb NOT NULL,
 finished_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rooms_updated ON rooms(updated_at);
-- multiple rounds per room (tribute carries over between rounds)
ALTER TABLE match_results ADD COLUMN IF NOT EXISTS round int NOT NULL DEFAULT 1;
ALTER TABLE match_results DROP CONSTRAINT IF EXISTS match_results_pkey, ADD PRIMARY KEY (room_id, round);
CREATE TABLE IF NOT EXISTS room_messages (
 id bigserial PRIMARY KEY,
 room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 seat int NOT NULL,
 name text NOT NULL,
 body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_messages_room ON room_messages(room_id, id);
-- accounts: e-mail + password, WeChat (open platform / mini program), sessions shared by every client
CREATE TABLE IF NOT EXISTS users (
 id bigserial PRIMARY KEY,
 email text UNIQUE,
 password_hash text,
 wechat_openid text UNIQUE,
 wechat_unionid text UNIQUE,
 mini_openid text UNIQUE,
 name text NOT NULL,
 avatar jsonb NOT NULL,
 games int NOT NULL DEFAULT 0,
 wins int NOT NULL DEFAULT 0,
 score int NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 device text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
-- 独立账号名供登录使用；已有用户保留空值，可在资料页补设。
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(lower(username)) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS email_codes (
 email text PRIMARY KEY,
 code_hash text NOT NULL,
 attempts int NOT NULL DEFAULT 0,
 sent_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS login_tickets (
 id text PRIMARY KEY,
 mode text NOT NULL,
 user_id bigint REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rooms_members ON rooms USING gin (members jsonb_path_ops);
`;
