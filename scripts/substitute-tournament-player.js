import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDirectory = process.env.DATABASE_DIR || path.join(root, 'data')
const snapshotPath = path.join(dataDirectory, 'rally.json')
const [tournamentName, outgoingUsername, replacementUsername] = process.argv.slice(2)

if (!tournamentName || !outgoingUsername || !replacementUsername) {
  console.error('Usage: DATABASE_DIR=/data node scripts/substitute-tournament-player.js "Tournament name" outgoingUsername replacementUsername')
  process.exit(1)
}

if (!fs.existsSync(snapshotPath)) {
  console.error(`Could not find the Rally snapshot at ${snapshotPath}.`)
  process.exit(1)
}

const db = new Database(path.join(dataDirectory, 'rally.db'))
db.pragma('foreign_keys = ON')

const snapshotTables = ['users', 'access_requests', 'signup_invites', 'tournaments', 'tournament_players', 'tournament_organizers', 'tournament_draw_nodes', 'matches', 'match_results', 'weekly_match_sessions', 'weekly_match_registrations', 'weekly_match_pairings', 'sessions']
const tournamentTiers = { rally_250: 250, rally_500: 500 }
const pointsExpiryDays = 180

function pointsByRound(tournamentTier, fieldSize) {
  if (fieldSize < 2) return {}
  const bracketSize = 2 ** Math.ceil(Math.log2(fieldSize))
  const names = { 2: 'Final', 4: 'Semifinals', 8: 'Quarterfinals', 16: 'Round of 16', 32: 'Round of 32' }
  const rounds = []
  for (let size = bracketSize; size >= 2; size /= 2) rounds.push(names[size] || `Round of ${size}`)
  const weights = rounds.map((_, index) => 2 ** index)
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  const totalPoints = tournamentTiers[tournamentTier] || 500
  const points = {}
  let allocated = 0
  rounds.forEach((round, index) => {
    points[round] = index === rounds.length - 1 ? totalPoints - allocated : Math.floor(totalPoints * weights[index] / totalWeight)
    allocated += points[round]
  })
  return points
}

function recalculateTournamentPoints(tournamentId, tier) {
  const fieldSize = db.prepare("SELECT COUNT(*) AS count FROM tournament_players WHERE tournament_id = ? AND registration_status = 'registered'").get(tournamentId).count
  const points = pointsByRound(tier, fieldSize)
  const earned = new Map()
  for (const result of db.prepare('SELECT r.winner_user_id, m.round_name FROM match_results r JOIN matches m ON m.id = r.match_id WHERE m.tournament_id = ?').all(tournamentId)) {
    earned.set(result.winner_user_id, (earned.get(result.winner_user_id) || 0) + (points[result.round_name] || 0))
  }
  const update = db.prepare('UPDATE tournament_players SET points_earned = ? WHERE tournament_id = ? AND user_id = ?')
  for (const player of db.prepare("SELECT user_id FROM tournament_players WHERE tournament_id = ? AND registration_status = 'registered'").all(tournamentId)) {
    update.run(earned.get(player.user_id) || 0, tournamentId, player.user_id)
  }
}

function refreshUserPoints() {
  const expiresBefore = new Date(Date.now() - pointsExpiryDays * 24 * 60 * 60 * 1000)
  const totals = new Map()
  for (const award of db.prepare(`SELECT tp.user_id, tp.points_earned, t.ends_at
    FROM tournament_players tp JOIN tournaments t ON t.id = tp.tournament_id
    WHERE tp.registration_status = 'registered'`).all()) {
    if (new Date(award.ends_at) <= expiresBefore) continue
    totals.set(award.user_id, (totals.get(award.user_id) || 0) + Number(award.points_earned || 0))
  }
  const update = db.prepare('UPDATE users SET total_points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
  for (const user of db.prepare('SELECT id FROM users').all()) update.run(totals.get(user.id) || 0, user.id)
}

function persistSnapshot() {
  const backupDirectory = path.join(dataDirectory, 'backups')
  fs.mkdirSync(backupDirectory, { recursive: true })
  const backupPath = path.join(backupDirectory, `rally-before-substitution-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  fs.copyFileSync(snapshotPath, backupPath)
  const snapshot = { version: 1, savedAt: new Date().toISOString() }
  for (const table of snapshotTables) snapshot[table] = db.prepare(`SELECT * FROM ${table}`).all()
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`)
  return backupPath
}

try {
  const tournament = db.prepare('SELECT id, name, tournament_tier FROM tournaments WHERE name = ? COLLATE NOCASE').get(tournamentName)
  const outgoing = db.prepare('SELECT id, username, name FROM users WHERE username = ? COLLATE NOCASE').get(outgoingUsername)
  const replacement = db.prepare('SELECT id, username, name FROM users WHERE username = ? COLLATE NOCASE').get(replacementUsername)
  if (!tournament) throw new Error(`Tournament not found: ${tournamentName}`)
  if (!outgoing) throw new Error(`Outgoing player not found: ${outgoingUsername}`)
  if (!replacement) throw new Error(`Replacement player not found: ${replacementUsername}`)
  if (outgoing.id === replacement.id) throw new Error('Outgoing and replacement players must be different.')
  const outgoingRegistration = db.prepare("SELECT seed FROM tournament_players WHERE tournament_id = ? AND user_id = ? AND registration_status = 'registered'").get(tournament.id, outgoing.id)
  if (!outgoingRegistration) throw new Error(`${outgoing.username} is not a registered player in ${tournament.name}.`)
  const existingReplacement = db.prepare("SELECT registration_status FROM tournament_players WHERE tournament_id = ? AND user_id = ?").get(tournament.id, replacement.id)
  if (existingReplacement?.registration_status === 'registered') throw new Error(`${replacement.username} is already registered in ${tournament.name}.`)

  db.transaction(() => {
    db.prepare("UPDATE tournament_players SET registration_status = 'withdrawn', seed = NULL, points_earned = 0 WHERE tournament_id = ? AND user_id = ?").run(tournament.id, outgoing.id)
    db.prepare(`INSERT INTO tournament_players (tournament_id, user_id, registration_status, seed, points_earned)
      VALUES (?, ?, 'registered', ?, 0)
      ON CONFLICT(tournament_id, user_id) DO UPDATE SET registration_status = 'registered', seed = excluded.seed, points_earned = 0, registered_at = CURRENT_TIMESTAMP`).run(tournament.id, replacement.id, outgoingRegistration.seed)
    db.prepare(`UPDATE tournament_draw_nodes SET
      player_one_id = CASE WHEN player_one_id = ? THEN ? ELSE player_one_id END,
      player_two_id = CASE WHEN player_two_id = ? THEN ? ELSE player_two_id END,
      winner_user_id = CASE WHEN winner_user_id = ? THEN ? ELSE winner_user_id END
      WHERE tournament_id = ?`).run(outgoing.id, replacement.id, outgoing.id, replacement.id, outgoing.id, replacement.id, tournament.id)
    db.prepare(`UPDATE matches SET
      player_one_id = CASE WHEN player_one_id = ? THEN ? ELSE player_one_id END,
      player_two_id = CASE WHEN player_two_id = ? THEN ? ELSE player_two_id END
      WHERE tournament_id = ?`).run(outgoing.id, replacement.id, outgoing.id, replacement.id, tournament.id)
    db.prepare('UPDATE match_results SET winner_user_id = ? WHERE winner_user_id = ? AND match_id IN (SELECT id FROM matches WHERE tournament_id = ?)').run(replacement.id, outgoing.id, tournament.id)
    recalculateTournamentPoints(tournament.id, tournament.tournament_tier)
    refreshUserPoints()
  })()

  const backupPath = persistSnapshot()
  const replacementPoints = db.prepare('SELECT points_earned FROM tournament_players WHERE tournament_id = ? AND user_id = ?').get(tournament.id, replacement.id).points_earned
  console.log(JSON.stringify({ updated: true, tournament: tournament.name, outgoing: outgoing.username, replacement: replacement.username, replacementPoints, snapshotBackup: backupPath }, null, 2))
} catch (error) {
  console.error(`Substitution failed: ${error.message}`)
  process.exitCode = 1
} finally {
  db.close()
}
