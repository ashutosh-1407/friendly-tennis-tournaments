PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT,
  password_hash TEXT,
  total_points INTEGER NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(trim(username)) BETWEEN 2 AND 32)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  registration_closes_at TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'current', 'past', 'cancelled')),
  tournament_tier TEXT NOT NULL DEFAULT 'rally_500' CHECK (tournament_tier IN ('rally_250', 'rally_500')),
  format TEXT NOT NULL DEFAULT 'singles' CHECK (format IN ('singles', 'doubles')),
  max_players INTEGER CHECK (max_players IS NULL OR max_players > 1),
  draw_published_at TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registration_status TEXT NOT NULL DEFAULT 'registered' CHECK (registration_status IN ('registered', 'waitlisted', 'withdrawn', 'disqualified')),
  seed INTEGER CHECK (seed IS NULL OR seed > 0),
  points_earned INTEGER NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_name TEXT NOT NULL,
  match_order INTEGER NOT NULL DEFAULT 1,
  player_one_id INTEGER NOT NULL REFERENCES users(id),
  player_two_id INTEGER NOT NULL REFERENCES users(id),
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (player_one_id <> player_two_id),
  UNIQUE (tournament_id, round_name, match_order)
);

CREATE TABLE IF NOT EXISTS match_results (
  match_id INTEGER PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  winner_user_id INTEGER NOT NULL REFERENCES users(id),
  player_one_score TEXT NOT NULL,
  player_two_score TEXT NOT NULL,
  notes TEXT,
  reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weekly_match_sessions (
  id INTEGER PRIMARY KEY,
  starts_at TEXT NOT NULL,
  required_players INTEGER NOT NULL CHECK (required_players >= 2 AND required_players <= 64 AND required_players % 2 = 0),
  court_name TEXT,
  court_numbers TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  draw_generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weekly_match_registrations (
  session_id INTEGER NOT NULL REFERENCES weekly_match_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS weekly_match_pairings (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES weekly_match_sessions(id) ON DELETE CASCADE,
  pairing_order INTEGER NOT NULL,
  player_one_id INTEGER NOT NULL REFERENCES users(id),
  player_two_id INTEGER NOT NULL REFERENCES users(id),
  UNIQUE (session_id, pairing_order)
);

CREATE VIEW IF NOT EXISTS leaderboard AS
SELECT u.id AS user_id, u.username, u.total_points,
  COUNT(DISTINCT CASE WHEN tp.registration_status = 'registered' THEN tp.tournament_id END) AS tournaments_played,
  RANK() OVER (ORDER BY u.total_points DESC, u.username COLLATE NOCASE ASC) AS rank
FROM users u
LEFT JOIN tournament_players tp ON tp.user_id = u.id
GROUP BY u.id, u.username, u.total_points;

CREATE INDEX IF NOT EXISTS idx_tournaments_status_starts_at ON tournaments(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_tournament_players_user ON tournament_players(user_id, registration_status);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_weekly_match_sessions_starts_at ON weekly_match_sessions(starts_at);
CREATE INDEX IF NOT EXISTS idx_weekly_match_registrations_session ON weekly_match_registrations(session_id, registered_at);
