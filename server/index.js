import Database from 'better-sqlite3'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const organizerUsername = 'ashutosh.1407'
const organizerPasscode = process.env.ORGANIZER_PASSCODE || ''
const tournamentTiers = {
  rally_250: { label: 'Rally 250 · Court Sprint', points: 250, maxPlayers: 16, days: 1, scoring: 'single_set' },
  rally_500: { label: 'Rally 500 · Weekend Classic', points: 500, maxPlayers: 32, days: 2, scoring: 'best_of_three' },
}
const bundledDataDirectory = path.join(root, 'data')
const dataDirectory = process.env.DATABASE_DIR || bundledDataDirectory
fs.mkdirSync(dataDirectory, { recursive: true })
console.log(`Rally data directory: ${dataDirectory}`)
const db = new Database(path.join(dataDirectory, 'rally.db'))
db.pragma('journal_mode = WAL')
db.exec(fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8'))
// Keep existing local databases compatible as the schema evolves.
if (!db.prepare("SELECT 1 FROM pragma_table_info('tournaments') WHERE name = 'draw_published_at'").get()) {
  db.exec('ALTER TABLE tournaments ADD COLUMN draw_published_at TEXT')
}
if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'password_hash'").get()) {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT')
}
if (!db.prepare("SELECT 1 FROM pragma_table_info('tournaments') WHERE name = 'tournament_tier'").get()) {
  db.exec("ALTER TABLE tournaments ADD COLUMN tournament_tier TEXT NOT NULL DEFAULT 'rally_500' CHECK (tournament_tier IN ('rally_250', 'rally_500'))")
}

const snapshotPath = path.join(dataDirectory, 'rally.json')
const bundledSnapshotPath = path.join(bundledDataDirectory, 'rally.json')
const snapshotTables = ['users', 'tournaments', 'tournament_players', 'matches', 'match_results', 'sessions']

// A new Railway Volume starts empty. Seed it once from the deployed snapshot,
// then all later changes are saved only on the persistent Volume.
const persistentStorageIsEmpty = (() => {
  if (!fs.existsSync(snapshotPath)) return true
  try {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    return !Array.isArray(snapshot.users) || snapshot.users.length === 0
  } catch {
    return true
  }
})()
const forceSeedFromBundle = process.env.FORCE_SEED_FROM_BUNDLE === 'true'
if (path.resolve(dataDirectory) !== path.resolve(bundledDataDirectory) && (persistentStorageIsEmpty || forceSeedFromBundle) && fs.existsSync(bundledSnapshotPath)) {
  if (forceSeedFromBundle) {
    const bundledSnapshot = JSON.parse(fs.readFileSync(bundledSnapshotPath, 'utf8'))
    // Keep the password just chosen for the organizer while restoring all
    // tournament data from the bundled snapshot.
    if (fs.existsSync(snapshotPath)) {
      try {
        const currentSnapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
        const currentOrganizer = currentSnapshot.users?.find((user) => user.username?.toLowerCase() === organizerUsername)
        const bundledOrganizer = bundledSnapshot.users?.find((user) => user.username?.toLowerCase() === organizerUsername)
        if (currentOrganizer?.password_hash && bundledOrganizer) bundledOrganizer.password_hash = currentOrganizer.password_hash
      } catch {}
    }
    fs.writeFileSync(snapshotPath, JSON.stringify(bundledSnapshot, null, 2))
    console.log('Rally data force-restored into persistent storage')
  } else {
    fs.copyFileSync(bundledSnapshotPath, snapshotPath)
    console.log('Rally data seeded into persistent storage')
  }
}

function persistDatabase() {
  const snapshot = { version: 1, savedAt: new Date().toISOString() }
  for (const table of snapshotTables) snapshot[table] = db.prepare(`SELECT * FROM ${table}`).all()
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2))
}

function restoreDatabase() {
  if (!fs.existsSync(snapshotPath)) return false
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  const restore = db.transaction(() => {
    db.exec('DELETE FROM sessions; DELETE FROM match_results; DELETE FROM matches; DELETE FROM tournament_players; DELETE FROM tournaments; DELETE FROM users;')
    for (const table of snapshotTables) {
      const rows = Array.isArray(snapshot[table]) ? snapshot[table] : []
      if (!rows.length) continue
      const columns = Object.keys(rows[0])
      const insert = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      for (const row of rows) insert.run(...columns.map((column) => row[column]))
    }
  })
  restore()
  return true
}

try {
  if (restoreDatabase()) console.log('Rally data restored from JSON snapshot')
  persistDatabase()
} catch (error) {
  console.error('Unable to restore or save Rally JSON snapshot:', error.message)
}

const app = express()
app.use(express.json())
app.use((req, res, next) => {
  res.on('finish', () => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) persistDatabase()
  })
  next()
})

function readCookie(req, name) {
  const item = String(req.headers.cookie || '').split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))
  return item ? decodeURIComponent(item.slice(name.length + 1)) : ''
}

function startSession(res, user) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt)
  res.setHeader('Set-Cookie', `rally_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`)
}

app.use((req, _res, next) => {
  const token = readCookie(req, 'rally_session')
  if (token) {
    req.authUser = db.prepare('SELECT u.id, u.username, u.total_points FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?').get(token, new Date().toISOString()) || null
  }
  next()
})

function requireUser(req, res, next) {
  if (!req.authUser) return res.status(401).json({ error: 'Please sign in to continue.' })
  next()
}

function validateCredentials(username, password) {
  if (username.length < 2 || username.length > 32) return 'Username must be 2–32 characters.'
  if (password.length < 6 || password.length > 128) return 'Password must be 6–128 characters.'
  return null
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

function passwordMatches(password, storedHash) {
  if (!storedHash) return false
  const [salt, expected] = storedHash.split(':')
  if (!salt || !expected) return false
  const actual = scryptSync(password, salt, 64).toString('hex')
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

function organizerPasscodeMatches(req) {
  const suppliedPasscode = String(req.header('x-rally-organizer-passcode') || '')
  return Boolean(organizerPasscode) && suppliedPasscode.length === organizerPasscode.length && timingSafeEqual(Buffer.from(suppliedPasscode), Buffer.from(organizerPasscode))
}

app.post('/api/auth/signup', (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  const error = validateCredentials(username, password)
  if (error) return res.status(400).json({ error })
  const existing = db.prepare('SELECT id, username, total_points, password_hash FROM users WHERE username = ?').get(username)
  if (existing?.password_hash) return res.status(409).json({ error: 'That username is already taken. Sign in instead.' })
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashPassword(password), existing.id)
    const user = { id: existing.id, username: existing.username, total_points: existing.total_points }
    startSession(res, user)
    return res.json({ user })
  }
  const user = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id, username, total_points').get(username, hashPassword(password))
  startSession(res, user)
  res.status(201).json({ user })
})

app.post('/api/auth/signin', (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  const error = validateCredentials(username, password)
  if (error) return res.status(400).json({ error })
  const user = db.prepare('SELECT id, username, total_points, password_hash FROM users WHERE username = ?').get(username)
  if (!user) return res.status(404).json({ error: 'We could not find that username. Sign up instead.' })
  if (!user.password_hash) return res.status(403).json({ error: 'This is an old username-only profile and cannot sign in. Please create a new account.' })
  if (!passwordMatches(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect password.' })
  const safeUser = { id: user.id, username: user.username, total_points: user.total_points }
  startSession(res, safeUser)
  res.json({ user: safeUser })
})

app.post('/api/auth/reset-organizer-password', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (username !== organizerUsername) return res.status(403).json({ error: 'Only the organizer account can be reset here.' })
  const error = validateCredentials(username, password)
  if (error) return res.status(400).json({ error })
  if (!organizerPasscode) return res.status(503).json({ error: 'Organizer passcode is not configured on this server.' })
  if (!organizerPasscodeMatches(req)) return res.status(403).json({ error: 'Incorrect organizer passcode.' })
  const user = db.prepare('SELECT id, username, total_points FROM users WHERE username = ?').get(organizerUsername)
  if (!user) return res.status(404).json({ error: 'Organizer account not found.' })
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashPassword(password), user.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
  })()
  startSession(res, user)
  res.json({ user })
})

app.get('/api/auth/session', (req, res) => res.json({ user: req.authUser || null }))

app.post('/api/auth/signout', (req, res) => {
  const token = readCookie(req, 'rally_session')
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  res.setHeader('Set-Cookie', 'rally_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
  res.status(204).end()
})

app.post('/api/users', (req, res) => {
  res.status(410).json({ error: 'Use the sign-up endpoint to create an account.' })
})

app.get('/api/users', (req, res) => {
  const username = String(req.query.username || '').trim()
  const user = db.prepare('SELECT id, username, total_points FROM users WHERE username = ?').get(username)
  if (!user) return res.status(404).json({ error: 'User not found.' })
  res.json({ user })
})

// Management requires both the organizer username and a server-side passcode.
function requireOrganizer(req, res, next) {
  if (!organizerPasscode) {
    return res.status(503).json({ error: 'Organizer passcode is not configured on this server.' })
  }
  if (!isOrganizer(req)) {
    return res.status(403).json({ error: 'Enter the correct organizer passcode to do that.' })
  }
  next()
}

function isOrganizer(req) {
  const usernameMatches = req.authUser?.username?.toLowerCase() === organizerUsername
  return usernameMatches && organizerPasscodeMatches(req)
}

app.post('/api/tournaments', requireOrganizer, (req, res) => {
  const name = String(req.body?.name || '').trim()
  const startDate = String(req.body?.startDate || '').trim()
  const tierKey = String(req.body?.tournamentTier || 'rally_500')
  const tier = tournamentTiers[tierKey]
  const location = String(req.body?.location || '').trim() || null
  const description = String(req.body?.description || '').trim() || null
  if (!name || name.length > 100) return res.status(400).json({ error: 'Tournament name is required (up to 100 characters).' })
  const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
  if (!tier) return res.status(400).json({ error: 'Choose a valid tournament tier.' })
  if (!isValidDate(startDate)) return res.status(400).json({ error: 'Choose a valid start date.' })
  const end = new Date(`${startDate}T12:00:00`)
  end.setDate(end.getDate() + tier.days - 1)
  const endDate = end.toISOString().slice(0, 10)

  const today = new Date().toISOString().slice(0, 10)
  const status = endDate < today ? 'past' : startDate > today ? 'upcoming' : 'current'
  const organizer = db.prepare('SELECT id FROM users WHERE username = ?').get(organizerUsername)
  if (!organizer) return res.status(400).json({ error: 'Open Rally once as the organizer before creating a tournament.' })
  const registrationClosesAt = new Date(new Date(`${startDate}T09:00:00`).getTime() - 4 * 24 * 60 * 60 * 1000).toISOString()
  const tournament = db.prepare(`
    INSERT INTO tournaments (name, description, location, starts_at, ends_at, registration_closes_at, status, tournament_tier, max_players, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(name, description, location, `${startDate}T09:00:00`, `${endDate}T23:00:00`, registrationClosesAt, status, tierKey, tier.maxPlayers, organizer.id)
  res.status(201).json({ tournament })
})

app.get('/api/tournaments', (req, res) => {
  const status = req.query.status
  const userId = req.authUser?.id || 0
  const validStatuses = ['upcoming', 'current', 'past']
  let query = 'SELECT t.*, tp.registration_status FROM tournaments t'
  const params = []
  if (Number.isInteger(userId) && userId > 0) { query += ' LEFT JOIN tournament_players tp ON tp.tournament_id = t.id AND tp.user_id = ?'; params.push(userId) }
  else query += ' LEFT JOIN tournament_players tp ON 1 = 0'
  if (status === 'registered' && Number.isInteger(userId) && userId > 0) query += " WHERE tp.registration_status = 'registered'"
  else if (validStatuses.includes(status)) { query += ' WHERE t.status = ?'; params.push(status) }
  if (['current', 'past'].includes(status)) {
    if (Number.isInteger(userId) && userId > 0) query += " AND tp.registration_status = 'registered'"
    else query += ' AND 1 = 0'
  }
  res.json({ tournaments: db.prepare(`${query} ORDER BY t.starts_at ASC`).all(...params) })
})

app.post('/api/tournaments/:id/registrations', requireUser, (req, res) => {
  const tournamentId = Number(req.params.id)
  const tournament = db.prepare('SELECT id, max_players, status, starts_at, registration_closes_at FROM tournaments WHERE id = ?').get(tournamentId)
  const user = req.authUser
  if (!tournament || !user) return res.status(404).json({ error: 'Tournament or player not found.' })
  if (!['upcoming', 'current'].includes(tournament.status)) return res.status(400).json({ error: 'Registration is closed for this tournament.' })
  const cutoff = tournament.registration_closes_at ? new Date(tournament.registration_closes_at) : new Date(new Date(tournament.starts_at).getTime() - 4 * 24 * 60 * 60 * 1000)
  if (new Date() >= cutoff) return res.status(400).json({ error: 'Registration closed four days before this tournament.' })
  const alreadyRegistered = db.prepare("SELECT 1 FROM tournament_players WHERE tournament_id = ? AND user_id = ? AND registration_status = 'registered'").get(tournamentId, user.id)
  const playerCount = db.prepare("SELECT COUNT(*) AS count FROM tournament_players WHERE tournament_id = ? AND registration_status = 'registered'").get(tournamentId).count
  if (!alreadyRegistered && tournament.max_players && playerCount >= tournament.max_players) return res.status(409).json({ error: 'This tournament is full.' })
  db.prepare(`INSERT INTO tournament_players (tournament_id, user_id, registration_status)
    VALUES (?, ?, 'registered')
    ON CONFLICT(tournament_id, user_id) DO UPDATE SET registration_status = 'registered', registered_at = CURRENT_TIMESTAMP`).run(tournamentId, user.id)
  res.status(201).json({ registration: 'registered' })
})

app.get('/api/tournaments/:id', (req, res) => {
  const tournamentId = Number(req.params.id)
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId)
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' })
  const players = db.prepare(`SELECT u.id, u.username, tp.seed, tp.points_earned, tp.registered_at
    FROM tournament_players tp JOIN users u ON u.id = tp.user_id
    WHERE tp.tournament_id = ? AND tp.registration_status = 'registered'
    ORDER BY tp.seed IS NULL, tp.seed, u.username COLLATE NOCASE`).all(tournamentId)
  const visibleAt = new Date(new Date(tournament.starts_at).getTime() - 48 * 60 * 60 * 1000)
  const publicDrawVisible = Boolean(tournament.draw_published_at) || new Date() >= visibleAt
  const organizerPreview = isOrganizer(req)
  const canViewDraw = publicDrawVisible || organizerPreview
  const matches = canViewDraw ? db.prepare(`SELECT m.*, p1.username AS player_one_name, p2.username AS player_two_name,
      r.winner_user_id, winner.username AS winner_name, r.player_one_score, r.player_two_score
    FROM matches m
    JOIN users p1 ON p1.id = m.player_one_id JOIN users p2 ON p2.id = m.player_two_id
    LEFT JOIN match_results r ON r.match_id = m.id
    LEFT JOIN users winner ON winner.id = r.winner_user_id
    WHERE m.tournament_id = ? ORDER BY m.match_order`).all(tournamentId) : []
  const bracketSize = players.length > 1 ? 2 ** Math.ceil(Math.log2(players.length)) : 0
  const roundNames = { 2: 'Final', 4: 'Semifinals', 8: 'Quarterfinals', 16: 'Round of 16', 32: 'Round of 32' }
  const rounds = []
  for (let size = bracketSize; size >= 2; size /= 2) rounds.push(roundNames[size] || `Round of ${size}`)
  res.json({ tournament, players, draw: { visible: publicDrawVisible, visibleAt: visibleAt.toISOString(), organizerPreview, matches, rounds } })
})

app.post('/api/tournaments/:id/draw/generate', requireOrganizer, (req, res) => {
  const tournamentId = Number(req.params.id)
  const tournament = db.prepare('SELECT id, status FROM tournaments WHERE id = ?').get(tournamentId)
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' })
  if (tournament.status === 'past') return res.status(400).json({ error: 'Draws cannot be generated for past tournaments.' })
  const players = db.prepare(`SELECT user_id FROM tournament_players
    WHERE tournament_id = ? AND registration_status = 'registered' ORDER BY seed IS NULL, seed, user_id`).all(tournamentId)
  if (players.length < 2) return res.status(400).json({ error: 'At least two registered players are needed for a bracket.' })
  if (players.length > 32) return res.status(400).json({ error: 'This version supports a maximum of 32 players.' })
  const bracketSize = 2 ** Math.ceil(Math.log2(players.length))
  const roundNames = { 2: 'Final', 4: 'Semifinals', 8: 'Quarterfinals', 16: 'Round of 16', 32: 'Round of 32' }
  const openingRound = roundNames[bracketSize] || `Round of ${bracketSize}`
  const generate = db.transaction(() => {
    db.prepare('DELETE FROM matches WHERE tournament_id = ?').run(tournamentId)
    recalculateTournamentPoints(tournamentId)
    const insert = db.prepare(`INSERT INTO matches (tournament_id, round_name, match_order, player_one_id, player_two_id)
      VALUES (?, ?, ?, ?, ?)`)
    let matchOrder = 1
    for (let left = 0; left + 1 < players.length; left += 2) insert.run(tournamentId, openingRound, matchOrder++, players[left].user_id, players[left + 1].user_id)
    return matchOrder - 1
  })
  res.json({ matchesCreated: generate(), openingRound, bracketSize })
})

app.post('/api/tournaments/:id/draw/publish', requireOrganizer, (req, res) => {
  const tournament = db.prepare('SELECT status FROM tournaments WHERE id = ?').get(Number(req.params.id))
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' })
  if (tournament.status === 'past') return res.status(400).json({ error: 'Draws cannot be published for past tournaments.' })
  const drawMatches = db.prepare('SELECT COUNT(*) AS count FROM matches WHERE tournament_id = ?').get(Number(req.params.id)).count
  if (!drawMatches) return res.status(400).json({ error: 'Generate the draw before publishing it.' })
  db.prepare('UPDATE tournaments SET draw_published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(req.params.id))
  res.json({ published: true })
})

app.post('/api/tournaments/:id/draw/unpublish', requireOrganizer, (req, res) => {
  const tournament = db.prepare('SELECT status FROM tournaments WHERE id = ?').get(Number(req.params.id))
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' })
  if (tournament.status === 'past') return res.status(400).json({ error: 'Draws cannot be changed for past tournaments.' })
  db.prepare('UPDATE tournaments SET draw_published_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(req.params.id))
  res.json({ published: false })
})

app.post('/api/tournaments/:id/draw/reset', requireOrganizer, (req, res) => {
  const tournament = db.prepare('SELECT id, status FROM tournaments WHERE id = ?').get(Number(req.params.id))
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' })
  if (tournament.status === 'past') return res.status(400).json({ error: 'Draws cannot be changed for past tournaments.' })
  const reset = db.transaction(() => {
    db.prepare('DELETE FROM matches WHERE tournament_id = ?').run(tournament.id)
    db.prepare('UPDATE tournaments SET draw_published_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(tournament.id)
    recalculateTournamentPoints(tournament.id)
  })
  reset()
  res.json({ reset: true })
})

function validTiebreak(one, two, target) {
  return Number.isInteger(one) && Number.isInteger(two) && ((one >= target || two >= target) && Math.abs(one - two) >= 2)
}

function validStandardSet(set) {
  const one = Number(set.playerOneGames)
  const two = Number(set.playerTwoGames)
  if (!Number.isInteger(one) || !Number.isInteger(two) || one < 0 || two < 0) return false
  const winner = Math.max(one, two)
  const loser = Math.min(one, two)
  if (winner === 6 && loser <= 4) return true
  if (winner === 7 && loser === 5) return true
  if (winner === 7 && loser === 6) {
    const tieOne = Number(set.tiebreakPlayerOne)
    const tieTwo = Number(set.tiebreakPlayerTwo)
    return validTiebreak(tieOne, tieTwo, 7) && ((one > two) === (tieOne > tieTwo))
  }
  return false
}

function advanceWinner(match, winnerUserId) {
  const nextRound = { 'Round of 32': 'Round of 16', 'Round of 16': 'Quarterfinals', Quarterfinals: 'Semifinals', Semifinals: 'Final' }[match.round_name]
  if (!nextRound) return
  const pairedOrder = match.match_order % 2 === 0 ? match.match_order - 1 : match.match_order + 1
  const pairedWinner = db.prepare(`SELECT r.winner_user_id FROM matches m
    JOIN match_results r ON r.match_id = m.id
    WHERE m.tournament_id = ? AND m.round_name = ? AND m.match_order = ?`).get(match.tournament_id, match.round_name, pairedOrder)
  if (!pairedWinner) return
  const nextOrder = Math.ceil(match.match_order / 2)
  const playerOneId = match.match_order % 2 === 1 ? winnerUserId : pairedWinner.winner_user_id
  const playerTwoId = match.match_order % 2 === 1 ? pairedWinner.winner_user_id : winnerUserId
  const existingNext = db.prepare('SELECT id, status FROM matches WHERE tournament_id = ? AND round_name = ? AND match_order = ?').get(match.tournament_id, nextRound, nextOrder)
  if (existingNext?.status === 'completed') return
  if (existingNext) {
    db.prepare('UPDATE matches SET player_one_id = ?, player_two_id = ? WHERE id = ?').run(playerOneId, playerTwoId, existingNext.id)
  } else {
    db.prepare('INSERT INTO matches (tournament_id, round_name, match_order, player_one_id, player_two_id) VALUES (?, ?, ?, ?, ?)').run(match.tournament_id, nextRound, nextOrder, playerOneId, playerTwoId)
  }
}

function recalculateTournamentPoints(tournamentId) {
  const tournament = db.prepare('SELECT tournament_tier FROM tournaments WHERE id = ?').get(tournamentId)
  const totalPoints = tournamentTiers[tournament?.tournament_tier]?.points || 500
  const fieldSize = db.prepare("SELECT COUNT(*) AS count FROM tournament_players WHERE tournament_id = ? AND registration_status = 'registered'").get(tournamentId).count
  if (fieldSize < 2) return
  const bracketSize = 2 ** Math.ceil(Math.log2(fieldSize))
  const names = { 2: 'Final', 4: 'Semifinals', 8: 'Quarterfinals', 16: 'Round of 16', 32: 'Round of 32' }
  const rounds = []
  for (let size = bracketSize; size >= 2; size /= 2) rounds.push(names[size] || `Round of ${size}`)
  const weights = rounds.map((_, index) => 2 ** index)
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  const pointsByRound = {}
  let allocated = 0
  rounds.forEach((round, index) => {
    pointsByRound[round] = index === rounds.length - 1 ? totalPoints - allocated : Math.floor(totalPoints * weights[index] / totalWeight)
    allocated += pointsByRound[round]
  })
  const earned = new Map()
  for (const result of db.prepare('SELECT r.winner_user_id, m.round_name FROM match_results r JOIN matches m ON m.id = r.match_id WHERE m.tournament_id = ?').all(tournamentId)) {
    earned.set(result.winner_user_id, (earned.get(result.winner_user_id) || 0) + (pointsByRound[result.round_name] || 0))
  }
  const registrations = db.prepare("SELECT user_id, points_earned FROM tournament_players WHERE tournament_id = ? AND registration_status = 'registered'").all(tournamentId)
  const updateRegistration = db.prepare('UPDATE tournament_players SET points_earned = ? WHERE tournament_id = ? AND user_id = ?')
  const updateUser = db.prepare('UPDATE users SET total_points = MAX(0, total_points + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
  for (const registration of registrations) {
    const nextPoints = earned.get(registration.user_id) || 0
    const delta = nextPoints - registration.points_earned
    if (delta) updateUser.run(delta, registration.user_id)
    updateRegistration.run(nextPoints, tournamentId, registration.user_id)
  }
}

app.post('/api/matches/:id/result', requireUser, (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(Number(req.params.id))
  if (!match) return res.status(404).json({ error: 'Match not found.' })
  const tournament = db.prepare('SELECT status, tournament_tier FROM tournaments WHERE id = ?').get(match.tournament_id)
  if (tournament?.status !== 'current') return res.status(400).json({ error: 'Scores can only be entered for current tournaments.' })
  const user = req.authUser
  if (!user || (!isOrganizer(req) && user.id !== match.player_one_id && user.id !== match.player_two_id)) return res.status(403).json({ error: 'Only a player in this match or the organizer can enter its score.' })
  const sets = Array.isArray(req.body?.sets) ? req.body.sets : []
  const isSingleSet = tournament.tournament_tier === 'rally_250'
  if (isSingleSet && (sets.length !== 1 || !validStandardSet(sets[0]))) return res.status(400).json({ error: 'Enter one valid tennis set score.' })
  if (!isSingleSet && (sets.length !== 3 || !validStandardSet(sets[0]) || !validStandardSet(sets[1]))) return res.status(400).json({ error: 'Enter two valid tennis set scores.' })
  const firstTwoWinners = sets.slice(0, isSingleSet ? 1 : 2).map((set) => Number(set.playerOneGames) > Number(set.playerTwoGames) ? 1 : 2)
  if (isSingleSet) {
    const winnerUserId = firstTwoWinners[0] === 1 ? match.player_one_id : match.player_two_id
    const scoreFor = (player) => sets.map((set) => player === 1 ? set.playerOneGames : set.playerTwoGames).join(' ')
    const saveResult = db.transaction(() => {
      db.prepare(`INSERT INTO match_results (match_id, winner_user_id, player_one_score, player_two_score, notes) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(match_id) DO UPDATE SET winner_user_id = excluded.winner_user_id, player_one_score = excluded.player_one_score, player_two_score = excluded.player_two_score, notes = excluded.notes, reported_at = CURRENT_TIMESTAMP`).run(match.id, winnerUserId, scoreFor(1), scoreFor(2), 'Entered in Rally')
      db.prepare("UPDATE matches SET status = 'completed' WHERE id = ?").run(match.id)
      advanceWinner(match, winnerUserId)
      recalculateTournamentPoints(match.tournament_id)
    })
    saveResult()
    return res.json({ completed: true, winnerUserId })
  }
  const playerOneSets = firstTwoWinners.filter((winner) => winner === 1).length
  const playerTwoSets = 2 - playerOneSets
  const finalSet = sets[2]
  const hasFinalSet = finalSet && finalSet.playerOnePoints !== '' && finalSet.playerTwoPoints !== ''
  let winnerUserId
  if (playerOneSets === 2 || playerTwoSets === 2) {
    if (hasFinalSet) return res.status(400).json({ error: 'A match tiebreak is only used when the first two sets are split.' })
    winnerUserId = playerOneSets === 2 ? match.player_one_id : match.player_two_id
  } else {
    const one = Number(finalSet.playerOnePoints)
    const two = Number(finalSet.playerTwoPoints)
    if (!validTiebreak(one, two, 10)) return res.status(400).json({ error: 'The deciding match tiebreak must be first to 10 points, leading by 2.' })
    winnerUserId = one > two ? match.player_one_id : match.player_two_id
  }
  const scoreFor = (player) => sets.slice(0, 2).map((set) => {
    const games = player === 1 ? set.playerOneGames : set.playerTwoGames
    const tie = player === 1 ? set.tiebreakPlayerOne : set.tiebreakPlayerTwo
    return tie !== '' && tie !== undefined ? `${games}(${tie})` : games
  }).concat(hasFinalSet ? [`[${player === 1 ? finalSet.playerOnePoints : finalSet.playerTwoPoints}]`] : []).join(' ')
  const saveResult = db.transaction(() => {
    db.prepare(`INSERT INTO match_results (match_id, winner_user_id, player_one_score, player_two_score, notes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET winner_user_id = excluded.winner_user_id, player_one_score = excluded.player_one_score, player_two_score = excluded.player_two_score, notes = excluded.notes, reported_at = CURRENT_TIMESTAMP`).run(match.id, winnerUserId, scoreFor(1), scoreFor(2), 'Entered in Rally')
    db.prepare("UPDATE matches SET status = 'completed' WHERE id = ?").run(match.id)
    advanceWinner(match, winnerUserId)
    recalculateTournamentPoints(match.tournament_id)
  })
  saveResult()
  res.json({ completed: true, winnerUserId })
})

app.post('/api/matches/:id/bye', requireOrganizer, (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(Number(req.params.id))
  if (!match) return res.status(404).json({ error: 'Match not found.' })
  const tournament = db.prepare('SELECT status FROM tournaments WHERE id = ?').get(match.tournament_id)
  if (tournament?.status !== 'current') return res.status(400).json({ error: 'Byes can only be awarded for current tournaments.' })
  const winnerUserId = Number(req.body?.winnerUserId)
  if (![match.player_one_id, match.player_two_id].includes(winnerUserId)) return res.status(400).json({ error: 'Choose a player from this match to receive the bye.' })
  const playerOneScore = winnerUserId === match.player_one_id ? 'BYE' : '—'
  const playerTwoScore = winnerUserId === match.player_two_id ? 'BYE' : '—'
  const saveBye = db.transaction(() => {
    db.prepare(`INSERT INTO match_results (match_id, winner_user_id, player_one_score, player_two_score, notes)
      VALUES (?, ?, ?, ?, 'Bye awarded by organizer')
      ON CONFLICT(match_id) DO UPDATE SET winner_user_id = excluded.winner_user_id, player_one_score = excluded.player_one_score, player_two_score = excluded.player_two_score, notes = excluded.notes, reported_at = CURRENT_TIMESTAMP`).run(match.id, winnerUserId, playerOneScore, playerTwoScore)
    db.prepare("UPDATE matches SET status = 'completed' WHERE id = ?").run(match.id)
    advanceWinner(match, winnerUserId)
    recalculateTournamentPoints(match.tournament_id)
  })
  saveBye()
  res.json({ completed: true, winnerUserId, bye: true })
})

app.get('/api/leaderboard', (_req, res) => res.json({ players: db.prepare('SELECT * FROM leaderboard WHERE total_points > 0 ORDER BY rank').all() }))

const dist = path.join(root, 'dist')
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html'))) }
app.listen(process.env.PORT || 8787, () => console.log('Rally server running'))
