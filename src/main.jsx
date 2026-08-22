import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const USERNAME_KEY = 'rally.username'
const USER_ID_KEY = 'rally.userId'
const ORGANIZER_PASSCODE_KEY = 'rally.organizerPasscode'
const ACTIVE_TAB_KEY = 'rally.activeTab'
const ORGANIZER_USERNAME = 'ashutosh.1407'
const TOURNAMENT_TIERS = {
  rally_250: { label: 'Rally 250 · Court Sprint', points: 250, maxPlayers: 16, days: 1, scoring: 'One set' },
  rally_500: { label: 'Rally 500 · Weekend Classic', points: 500, maxPlayers: 32, days: 2, scoring: 'Best of three' },
}
const USERS_PER_PAGE = 10
const TOURNAMENT_NAME_PREFIXES = ['Sunday Rally', 'Baseline Bash', 'Court Side', 'Topspin', 'Ace', 'Match Point', 'Grand Slam', 'Golden Set', 'Net Rush', 'Racket Club']
const TOURNAMENT_NAME_SUFFIXES = ['Open', 'Classic', 'Cup', 'Challenge', 'Showdown', 'Social', 'Series', 'Rally', 'Championship']

function randomTournamentName() {
  const prefix = TOURNAMENT_NAME_PREFIXES[Math.floor(Math.random() * TOURNAMENT_NAME_PREFIXES.length)]
  const suffix = TOURNAMENT_NAME_SUFFIXES[Math.floor(Math.random() * TOURNAMENT_NAME_SUFFIXES.length)]
  return `${prefix} ${suffix}`
}

function weeklyDraftFromStartsAt(startsAt, requiredPlayers, courtName = '', courtNumbers = '') {
  const date = new Date(startsAt)
  const pad = (value) => String(value).padStart(2, '0')
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}`, requiredPlayers: String(requiredPlayers), courtName, courtNumbers }
}

function TennisBall() {
  return <span className="tennis-ball" aria-hidden="true"><i /><b /></span>
}

function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.35" /></svg>
}

function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.9 4.4 4.4-.9L19 8.5l-3.5-3.5L4 16.5Z" /><path d="m13.8 6.7 3.5 3.5" /></svg>
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9 3.5h6M7 7l.8 13.5h8.4L17 7M10 10.5v6.5M14 10.5v6.5" /></svg>
}

function OrganizerPasscodeModal({ onSubmit, onClose }) {
  const [passcode, setPasscode] = React.useState('')
  return <div className="score-backdrop" role="presentation" onMouseDown={onClose}><section className="organizer-passcode-modal" role="dialog" aria-modal="true" aria-labelledby="organizer-passcode-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">ORGANIZER ACCESS</p><h2 id="organizer-passcode-title">Enter organizer passcode</h2><form onSubmit={(event) => { event.preventDefault(); if (passcode) onSubmit(passcode) }}><input className="passcode-input" type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} autoFocus /><div className="score-actions"><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-action">Continue</button></div></form></section></div>
}

function displayName(player) {
  return player?.name || player?.display_name || player?.username || ''
}

function registrationHasClosed(tournament) {
  const cutoff = tournament.registration_closes_at ? new Date(tournament.registration_closes_at) : new Date(new Date(tournament.starts_at).getTime() - 4 * 24 * 60 * 60 * 1000)
  return Date.now() >= cutoff.getTime()
}

function registrationDeadlineLabel(tournament) {
  if (tournament.status === 'past') return null
  if (registrationHasClosed(tournament)) return 'Registration closed'
  const cutoff = tournament.registration_closes_at ? new Date(tournament.registration_closes_at) : new Date(new Date(tournament.starts_at).getTime() - 4 * 24 * 60 * 60 * 1000)
  return `Registration closes ${cutoff.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function remainingCapacityLabel(tournament) {
  const capacity = Number(tournament.max_players) || TOURNAMENT_TIERS[tournament.tournament_tier]?.maxPlayers || 0
  const remaining = Math.max(0, capacity - Number(tournament.registered_count || 0))
  if (!capacity) return null
  return remaining === 0 ? 'Full' : `${remaining} ${remaining === 1 ? 'spot' : 'spots'} left`
}

function tournamentEndDate(startDate, tierKey) {
  if (!startDate) return ''
  const end = new Date(`${startDate}T12:00:00`)
  end.setDate(end.getDate() + (TOURNAMENT_TIERS[tierKey]?.days || 2) - 1)
  return end.toISOString().slice(0, 10)
}

function TournamentDraw({ draw, isOrganizer, tournamentStatus, drawActionPending, onManage, username, onEnterScore, onAwardBye }) {
  draw = { visible: false, organizerPreview: false, matches: [], ...draw }
  draw.rounds = Array.isArray(draw.rounds) ? draw.rounds : []
  const roundLabel = (round) => ({ 'Round of 32': 'R32', 'Round of 16': 'R16', Quarterfinals: 'QF', Semifinals: 'SF', Final: 'F' }[round] || round)
  const isPreview = !draw.visible && draw.organizerPreview
  const matches = draw.matches || []
  const openingMatches = matches.filter((match) => match.round_name === draw.rounds[0])

  if (!draw.visible && !isPreview) {
    return <div className="draw-panel">{isOrganizer && tournamentStatus !== 'past' && <div className="draw-tools">{matches.length ? <button className="undo-draw" disabled={drawActionPending === 'reset'} onClick={() => onManage('reset')}>{drawActionPending === 'reset' ? 'Undoing…' : 'Undo draw'}</button> : <button className="secondary-action" disabled={drawActionPending === 'generate'} onClick={() => onManage('generate')}>{drawActionPending === 'generate' ? 'Generating…' : 'Generate draw'}</button>}<button className="primary-action" disabled={drawActionPending === 'publish' || drawActionPending === 'unpublish' || !matches.length} onClick={() => onManage('publish')} title={!matches.length ? 'Generate a draw first' : undefined}>{drawActionPending === 'publish' ? 'Publishing…' : 'Publish draw'}</button></div>}<div className="draw-locked"><span>🔒</span><h2>Draws open two days before play</h2><p>The bracket will be available on {new Date(draw.visibleAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.</p></div></div>
  }

  return <div className="draw-panel">
    {isOrganizer && tournamentStatus !== 'past' && <div className="draw-tools">{matches.length ? <button className="undo-draw" disabled={drawActionPending === 'reset'} onClick={() => onManage('reset')}>{drawActionPending === 'reset' ? 'Undoing…' : 'Undo draw'}</button> : <button className="secondary-action" disabled={drawActionPending === 'generate'} onClick={() => onManage('generate')}>{drawActionPending === 'generate' ? 'Generating…' : 'Generate draw'}</button>}<button className={draw.visible ? 'secondary-action' : 'primary-action'} disabled={drawActionPending === 'publish' || drawActionPending === 'unpublish' || !matches.length} onClick={() => onManage(draw.visible ? 'unpublish' : 'publish')} title={!matches.length ? 'Generate a draw first' : undefined}>{drawActionPending === 'publish' ? 'Publishing…' : drawActionPending === 'unpublish' ? 'Unpublishing…' : draw.visible ? 'Unpublish draw' : 'Publish draw'}</button></div>}
    {isPreview && <div className="draw-visibility">Organizer preview — players cannot see this bracket yet.</div>}
    {draw.seeds?.length > 0 && <div className="draw-seeds"><span>Seeds</span>{draw.seeds.map((player) => <b key={player.id}>#{player.seed} {displayName(player)}</b>)}</div>}
    {!matches.length ? <div className="draw-locked"><span>◌</span><h2>Bracket not generated yet</h2><p>The organizer will create the bracket once registrations are in.</p></div> : <div className="bracket-scroller"><div className="bracket-board" style={{ '--round-count': draw.rounds.length }}>{draw.rounds.map((round, roundIndex) => {
      const matchCount = Math.max(1, Math.ceil(openingMatches.length / (2 ** roundIndex)))
      const roundMatches = matches.filter((match) => match.round_name === round).sort((left, right) => left.match_order - right.match_order)
      const priorRoundMatches = roundIndex > 0 ? matches.filter((match) => match.round_name === draw.rounds[roundIndex - 1]).sort((left, right) => left.match_order - right.match_order) : []
      return <section className={`bracket-column bracket-column--${roundIndex}`} key={round}><h3>{roundLabel(round)}</h3><div className="bracket-matches">{Array.from({ length: matchCount }, (_, matchIndex) => {
        const match = roundMatches[matchIndex]
        const firstPlaceholder = roundIndex === 0 ? null : priorRoundMatches[matchIndex * 2]?.winner_name || `Winner of ${roundLabel(draw.rounds[roundIndex - 1])} ${matchIndex * 2 + 1}`
        const secondPlaceholder = roundIndex === 0 ? null : priorRoundMatches[matchIndex * 2 + 1]?.winner_name || `Winner of ${roundLabel(draw.rounds[roundIndex - 1])} ${matchIndex * 2 + 2}`
        const canEnterScore = tournamentStatus === 'current' && match && (match.status !== 'completed' || isOrganizer) && (isOrganizer || [match.player_one_name, match.player_two_name].some((player) => player.toLowerCase() === username.toLowerCase()))
        const canShowWinner = ['current', 'past'].includes(tournamentStatus) && Boolean(match?.winner_user_id)
        return <div className={`bracket-match ${match ? '' : 'bracket-match--pending'} ${canEnterScore ? 'bracket-match--editable' : ''}`} key={match?.id || matchIndex} role={canEnterScore ? 'button' : undefined} tabIndex={canEnterScore ? 0 : undefined} onClick={() => canEnterScore && onEnterScore(match)} onKeyDown={(event) => canEnterScore && event.key === 'Enter' && onEnterScore(match)} title={canEnterScore ? 'Enter match score' : undefined}><div className={`bracket-player ${canShowWinner && match.winner_user_id === match.player_one_id ? 'bracket-player--winner' : ''}`}><span>{match ? <>{match.player_one_display_name || match.player_one_name}{match.player_one_seed && <sup className="draw-seed-number">[{match.player_one_seed}]</sup>}</> : firstPlaceholder}</span><b>{match?.player_one_score || '—'}</b></div><div className={`bracket-player ${canShowWinner && match.winner_user_id === match.player_two_id ? 'bracket-player--winner' : ''}`}><span>{match ? <>{match.player_two_display_name || match.player_two_name}{match.player_two_seed && <sup className="draw-seed-number">[{match.player_two_seed}]</sup>}</> : secondPlaceholder}</span><b>{match?.player_two_score || '—'}</b></div>{isOrganizer && tournamentStatus === 'current' && match && match.status !== 'completed' && <div className="bye-controls"><button onClick={(event) => { event.stopPropagation(); onAwardBye(match, match.player_one_id) }}>Bye → {match.player_one_display_name || match.player_one_name}</button><button onClick={(event) => { event.stopPropagation(); onAwardBye(match, match.player_two_id) }}>Bye → {match.player_two_display_name || match.player_two_name}</button></div>}</div>
      })}</div></section>
    })}</div></div>}
  </div>
}

function WeeklyMatchesPage({ sessions, isLoading, actionPending, onRegister, onWithdraw, onGenerate, error, notice, onCreate, onEdit, isOrganizer, onDelete }) {
  const generationIsOpen = (session) => Date.now() >= new Date(session.starts_at).getTime() - 60 * 60 * 1000
  const registrationIsOpen = (session) => Date.now() < new Date(session.starts_at).getTime() - 60 * 60 * 1000
  return <section className="page weekly-page" aria-labelledby="weekly-matches-title">
    <div className="page-heading"><div><p className="eyebrow">CASUAL COURT TIME</p><h1 id="weekly-matches-title">Weekly matches</h1><p>Join a session, then get a random partner or opponent shortly before play.</p></div><button className="primary-action" onClick={onCreate}>+ Create weekly match</button></div>
    {notice && <div className="notice" role="status">{notice}</div>}{error && <div className="registration-error" role="alert">{error}</div>}
    <div className="weekly-list">{isLoading ? <p>Loading weekly matches…</p> : sessions.length ? sessions.map((session) => { const startsAt = new Date(session.starts_at); const canRegister = registrationIsOpen(session); const pairedPlayerIds = new Set(session.pairings.flatMap((pairing) => [pairing.player_one_id, pairing.player_two_id])); const sittingOut = session.draw_generated_at ? session.registrations.filter((player) => !pairedPlayerIds.has(player.id)).map(displayName) : []; return <article className="weekly-card" key={session.id}><div className="weekly-card-head"><div><p className="card-date">{startsAt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · {startsAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p><h2>Weekly court session</h2>{(session.court_name || session.court_numbers) && <p className="weekly-court">{session.court_name}{session.court_name && session.court_numbers && ' · '}{session.court_numbers && `Courts ${session.court_numbers}`}</p>}<p className="weekly-capacity">{session.registered_count} registered · first {session.required_players} play</p></div><div className="weekly-card-actions"><div className="management-icons">{canRegister && <button className="icon-action" onClick={() => onEdit(session)} aria-label="Edit weekly match" title="Edit weekly match"><EditIcon /></button>}{isOrganizer && <button className="icon-action icon-action--delete" disabled={actionPending === `delete-${session.id}`} onClick={() => onDelete(session.id)} aria-label="Delete weekly match" title="Delete weekly match"><TrashIcon /></button>}</div>{session.registered ? (canRegister ? <button className="secondary-action withdraw-action" disabled={actionPending === `withdraw-${session.id}`} onClick={() => onWithdraw(session.id)}>{actionPending === `withdraw-${session.id}` ? 'Withdrawing…' : 'Withdraw'}</button> : <span className="registered">Registered</span>) : (canRegister ? <button className="secondary-action" disabled={actionPending === `register-${session.id}`} onClick={() => onRegister(session.id)}>{actionPending === `register-${session.id}` ? 'Registering…' : 'Register'}</button> : <span className="registration-closed">Registration closed one hour before play</span>)}</div></div>
      {session.registrations.length > 0 && <div className="weekly-players"><strong>Registered players</strong><div>{session.registrations.map((player, index) => <span key={player.id}><b>{index + 1}</b>{displayName(player)}</span>)}</div></div>}{!session.draw_generated_at ? <div className="weekly-pairing-state">{generationIsOpen(session) ? <button className="primary-action" disabled={actionPending === `generate-${session.id}`} onClick={() => onGenerate(session.id)}>{actionPending === `generate-${session.id}` ? 'Generating…' : 'Generate random pairings'}</button> : <span>Pairings can be generated one hour before play.</span>}</div> : <div className="weekly-pairings"><strong>Random pairings</strong>{session.pairings.length ? <div>{session.pairings.map((pairing) => <p key={pairing.pairing_order}>Court {pairing.pairing_order}: <b>{pairing.player_one_display_name || pairing.player_one_name}</b> <span>vs</span> <b>{pairing.player_two_display_name || pairing.player_two_name}</b></p>)}</div> : <p>Not enough players for a pairing yet.</p>}{sittingOut.length > 0 && <small>No pairing for: {sittingOut.join(', ')}.</small>}</div>}</article> }) : <div className="empty-state"><div className="court-mark"><TennisBall /></div><h2>No weekly matches yet</h2><p>Create the first session for your group.</p></div>}</div>
  </section>
}

function WeeklyMatchCreatePage({ draft, onDraftChange, onCreate, isCreating, error, onBack, isEditing = false }) {
  const verb = isEditing ? 'Save changes' : 'Create weekly match'
  return <section className="page create-page" aria-labelledby="weekly-create-title"><button className="back-button" onClick={onBack}>← Back to weekly matches</button><div className="create-heading"><p className="eyebrow">CASUAL COURT TIME</p><h1 id="weekly-create-title">{isEditing ? 'Edit weekly match' : 'Create a weekly match'}</h1><p>Set the date, time, courts, and number of players needed.</p></div><form className="weekly-form" onSubmit={onCreate}><div className="form-grid"><label>Date<input type="date" name="date" value={draft.date} onChange={onDraftChange} required autoFocus /></label><label>Time<input type="time" name="time" value={draft.time} onChange={onDraftChange} required /></label><label>Tennis court name<input name="courtName" value={draft.courtName} onChange={onDraftChange} placeholder="e.g. Riverside Tennis Center" maxLength="120" required /></label><label>Court numbers<input name="courtNumbers" value={draft.courtNumbers} onChange={onDraftChange} placeholder="e.g. 1, 2, 3" maxLength="80" required /></label><label>Players needed<input type="number" name="requiredPlayers" value={draft.requiredPlayers} onChange={onDraftChange} min="2" max="64" step="2" required /><span className="tier-description">Use an even number. Earliest registrations get the available spots.</span></label></div>{error && <p className="creation-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="cancel-button" onClick={onBack}>Cancel</button><button type="submit" className="primary-action" disabled={isCreating}>{isCreating ? 'Saving…' : verb}</button></div></form></section>
}

function AccessRequestsPage({ requests, error, isLoading, onGenerate, generatedInvite, onDismissInvite }) {
  return <section className="page" aria-labelledby="messages-title"><div className="page-heading"><div><p className="eyebrow">ORGANIZER TOOLS</p><h1 id="messages-title">Messages</h1><p>Review requests and create one-time signup codes.</p></div></div>{generatedInvite && <div className="notice generated-invite">Invite code: <strong>{generatedInvite}</strong> — expires in 24 hours. Send it to the player privately.<button type="button" onClick={onDismissInvite} aria-label="Dismiss invite code">×</button></div>}{error && <p className="creation-error">{error}</p>}{isLoading ? <p className="detail-loading">Loading access requests…</p> : <div className="users-table access-requests">{requests.length ? requests.map((request) => <div className="user-row access-request" key={request.id}><div><strong>{request.requested_name || request.requested_username}</strong><span>@{request.requested_username} · {new Date(request.created_at).toLocaleDateString()}</span>{request.message && <p>{request.message}</p>}</div>{request.status === 'pending' ? <button className="secondary-action" onClick={() => onGenerate(request.id)}>Generate invite</button> : <span className="registered">Approved</span>}</div>) : <p className="empty-inline">No access requests yet.</p>}</div>}</section>
}

function ScoreEntryModal({ match, onClose, onSave, isSaving, error, isSingleSet }) {
  const blankSet = { playerOneGames: '', playerTwoGames: '', tiebreakPlayerOne: '', tiebreakPlayerTwo: '' }
  const [sets, setSets] = React.useState(() => isSingleSet ? [blankSet] : [blankSet, blankSet, { playerOnePoints: '', playerTwoPoints: '' }])
  const updateSet = (index, field, value) => setSets((current) => current.map((set, setIndex) => setIndex === index ? { ...set, [field]: value } : set))
  const needsTiebreak = (set) => (set.playerOneGames === '7' && set.playerTwoGames === '6') || (set.playerOneGames === '6' && set.playerTwoGames === '7')
  return <div className="score-backdrop" role="presentation" onMouseDown={onClose}><section className="score-modal" role="dialog" aria-modal="true" aria-labelledby="score-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">ENTER RESULT</p><h2 id="score-title">{match.player_one_name} <span>vs</span> {match.player_two_name}</h2><p className="score-help">{isSingleSet ? 'One standard set. At 6–6, enter the 7-point, win-by-two tiebreak.' : 'Best of three sets. If tied at one set each, enter a first-to-10, win-by-two match tiebreak.'}</p><form onSubmit={(event) => { event.preventDefault(); onSave(sets) }}><div className="set-head"><span>Set</span><span>{match.player_one_name}</span><span>{match.player_two_name}</span></div>{sets.slice(0, isSingleSet ? 1 : 2).map((set, index) => <div className="score-set" key={index}><span>Set {index + 1}</span><input aria-label={`${match.player_one_name} games in set ${index + 1}`} inputMode="numeric" value={set.playerOneGames} onChange={(event) => updateSet(index, 'playerOneGames', event.target.value)} /><input aria-label={`${match.player_two_name} games in set ${index + 1}`} inputMode="numeric" value={set.playerTwoGames} onChange={(event) => updateSet(index, 'playerTwoGames', event.target.value)} />{needsTiebreak(set) && <div className="set-tiebreak"><span>7-point tiebreak</span><input aria-label={`${match.player_one_name} tiebreak points in set ${index + 1}`} inputMode="numeric" value={set.tiebreakPlayerOne} onChange={(event) => updateSet(index, 'tiebreakPlayerOne', event.target.value)} /><input aria-label={`${match.player_two_name} tiebreak points in set ${index + 1}`} inputMode="numeric" value={set.tiebreakPlayerTwo} onChange={(event) => updateSet(index, 'tiebreakPlayerTwo', event.target.value)} /></div>}</div>)}{!isSingleSet && <div className="score-set score-set--decider"><span>Match tiebreak <small>to 10</small></span><input aria-label={`${match.player_one_name} deciding tiebreak points`} inputMode="numeric" value={sets[2].playerOnePoints} onChange={(event) => updateSet(2, 'playerOnePoints', event.target.value)} /><input aria-label={`${match.player_two_name} deciding tiebreak points`} inputMode="numeric" value={sets[2].playerTwoPoints} onChange={(event) => updateSet(2, 'playerTwoPoints', event.target.value)} /></div>}{error && <p className="score-error" role="alert">{error}</p>}<div className="score-actions"><button type="button" className="cancel-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save result'}</button></div></form></section></div>
}

function App() {
  const savedUsername = localStorage.getItem(USERNAME_KEY) || ''
  const [username, setUsername] = React.useState('')
  const [name, setName] = React.useState('')
  const [userId, setUserId] = React.useState(null)
  const [draftName, setDraftName] = React.useState(savedUsername)
  const [isCheckingSession, setIsCheckingSession] = React.useState(true)
  const [draftPassword, setDraftPassword] = React.useState('')
  const [draftProfileName, setDraftProfileName] = React.useState('')
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false)
  const [authMode, setAuthMode] = React.useState(() => window.location.pathname === '/signup' ? 'signup' : 'signin')
  const [inviteOnlySignup, setInviteOnlySignup] = React.useState(null)
  const [inviteCode, setInviteCode] = React.useState(() => new URLSearchParams(window.location.search).get('code') || '')
  const [accessMessage, setAccessMessage] = React.useState('')
  const [accessRequestSent, setAccessRequestSent] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState(() => ['weekly', 'tournaments', 'leaderboard'].includes(localStorage.getItem(ACTIVE_TAB_KEY)) ? localStorage.getItem(ACTIVE_TAB_KEY) : 'tournaments')
  const [tournamentFilter, setTournamentFilter] = React.useState('upcoming')
  const [notice, setNotice] = React.useState('')
  const [isSavingUsername, setIsSavingUsername] = React.useState(false)
  const [usernameError, setUsernameError] = React.useState('')
  const isOrganizer = username.toLowerCase() === ORGANIZER_USERNAME
  const [organizerPasscode, setOrganizerPasscode] = React.useState(sessionStorage.getItem(ORGANIZER_PASSCODE_KEY) || '')
  const [tournamentDraft, setTournamentDraft] = React.useState({ name: '', startDate: '', tournamentTier: 'rally_500', location: '', description: '' })
  const [editingTournamentId, setEditingTournamentId] = React.useState(null)
  const [creationError, setCreationError] = React.useState('')
  const [isCreating, setIsCreating] = React.useState(false)
  const [isDeletingTournament, setIsDeletingTournament] = React.useState(false)
  const [tournaments, setTournaments] = React.useState([])
  const [isLoadingTournaments, setIsLoadingTournaments] = React.useState(false)
  const [registrationError, setRegistrationError] = React.useState('')
  const [registrationPending, setRegistrationPending] = React.useState(null)
  const [weeklyDraft, setWeeklyDraft] = React.useState({ date: '', time: '', requiredPlayers: '8', courtName: '', courtNumbers: '' })
  const [weeklySessions, setWeeklySessions] = React.useState([])
  const [isLoadingWeekly, setIsLoadingWeekly] = React.useState(false)
  const [isCreatingWeekly, setIsCreatingWeekly] = React.useState(false)
  const [weeklyActionPending, setWeeklyActionPending] = React.useState('')
  const [weeklyError, setWeeklyError] = React.useState('')
  const [weeklyVersion, setWeeklyVersion] = React.useState(0)
  const [editingWeeklyMatchId, setEditingWeeklyMatchId] = React.useState(null)
  const [selectedTournamentId, setSelectedTournamentId] = React.useState(null)
  const [tournamentDetail, setTournamentDetail] = React.useState(null)
  const [detailTab, setDetailTab] = React.useState('players')
  const [detailError, setDetailError] = React.useState('')
  const [drawActionPending, setDrawActionPending] = React.useState('')
  const [detailVersion, setDetailVersion] = React.useState(0)
  const [scoreMatch, setScoreMatch] = React.useState(null)
  const [scoreError, setScoreError] = React.useState('')
  const [isSavingScore, setIsSavingScore] = React.useState(false)
  const [leaderboardPlayers, setLeaderboardPlayers] = React.useState([])
  const [registeredUsers, setRegisteredUsers] = React.useState([])
  const [usersError, setUsersError] = React.useState('')
  const [usersPage, setUsersPage] = React.useState(1)
  const [leaderboardPage, setLeaderboardPage] = React.useState(1)
  const [passcodePrompt, setPasscodePrompt] = React.useState(null)
  const [accessRequests, setAccessRequests] = React.useState([])
  const [accessRequestsError, setAccessRequestsError] = React.useState('')
  const [isLoadingAccessRequests, setIsLoadingAccessRequests] = React.useState(false)
  const [generatedInvite, setGeneratedInvite] = React.useState('')
  const [unreadAccessRequestCount, setUnreadAccessRequestCount] = React.useState(0)

  function requestOrganizerPasscode() {
    if (organizerPasscode) return Promise.resolve(organizerPasscode)
    return new Promise((resolve) => setPasscodePrompt({ resolve }))
  }

  function submitOrganizerPasscode(passcode) {
    sessionStorage.setItem(ORGANIZER_PASSCODE_KEY, passcode)
    setOrganizerPasscode(passcode)
    passcodePrompt?.resolve(passcode)
    setPasscodePrompt(null)
  }

  function cancelOrganizerPasscode() {
    passcodePrompt?.resolve('')
    setPasscodePrompt(null)
  }

  React.useEffect(() => {
    fetch('/api/config').then((response) => response.ok ? response.json() : { inviteOnlySignup: false }).then((data) => setInviteOnlySignup(Boolean(data.inviteOnlySignup))).catch(() => setInviteOnlySignup(false))
  }, [])

  React.useEffect(() => {
    if (inviteOnlySignup && authMode === 'signup' && window.location.pathname !== '/signup') setAuthMode('request')
  }, [inviteOnlySignup, authMode])

  React.useEffect(() => {
    fetch('/api/auth/session')
      .then((response) => response.ok ? response.json() : { user: null })
      .then((data) => {
        if (!data.user) return
        setUsername(data.user.username)
        setName(data.user.name || '')
        setUserId(data.user.id)
        setDraftName(data.user.username)
        localStorage.setItem(USERNAME_KEY, data.user.username)
        localStorage.setItem(USER_ID_KEY, data.user.id)
      })
      .finally(() => setIsCheckingSession(false))
  }, [])

  React.useEffect(() => {
    if (['weekly', 'tournaments', 'leaderboard'].includes(activeTab)) localStorage.setItem(ACTIVE_TAB_KEY, activeTab)
  }, [activeTab])

  async function continueAsUser(event) {
    event.preventDefault()
    const cleanName = draftName.trim()
    if (!cleanName || !draftPassword) return
    setIsSavingUsername(true)
    setUsernameError('')
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanName, password: draftPassword, name: authMode === 'signup' ? draftProfileName : '', inviteCode }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to save your username.')
      localStorage.setItem(USERNAME_KEY, data.user.username)
      localStorage.setItem(USER_ID_KEY, data.user.id)
      setUsername(data.user.username)
      setName(data.user.name || '')
      setUserId(data.user.id)
      setDraftPassword('')
    } catch (error) {
      setUsernameError(error.message)
    } finally {
      setIsSavingUsername(false)
    }
  }

  async function requestAccess(event) {
    event.preventDefault()
    const cleanName = draftName.trim()
    if (!cleanName) return
    setIsSavingUsername(true)
    setUsernameError('')
    try {
      const response = await fetch('/api/access-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: cleanName, name: draftProfileName, message: accessMessage }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to send your request.')
      setAccessRequestSent(true)
    } catch (error) { setUsernameError(error.message) } finally { setIsSavingUsername(false) }
  }

  async function resetOrganizerPassword() {
    const cleanName = draftName.trim()
    if (cleanName.toLowerCase() !== ORGANIZER_USERNAME || !draftPassword) return
    const passcode = await requestOrganizerPasscode()
    if (!passcode) return
    setIsSavingUsername(true)
    setUsernameError('')
    try {
      const response = await fetch('/api/auth/reset-organizer-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-rally-organizer-passcode': passcode },
        body: JSON.stringify({ username: cleanName, password: draftPassword }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to reset the organizer password.')
      localStorage.setItem(USERNAME_KEY, data.user.username)
      localStorage.setItem(USER_ID_KEY, data.user.id)
      setUsername(data.user.username)
      setName(data.user.name || '')
      setUserId(data.user.id)
      setDraftPassword('')
    } catch (error) {
      setUsernameError(error.message)
    } finally {
      setIsSavingUsername(false)
    }
  }

  function changeUser() {
    fetch('/api/auth/signout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem(USERNAME_KEY)
    localStorage.removeItem(USER_ID_KEY)
    sessionStorage.removeItem(ORGANIZER_PASSCODE_KEY)
    setDraftName('')
    setUsername('')
    setName('')
    setUserId(null)
    setOrganizerPasscode('')
    setActiveTab('tournaments')
  }

  React.useEffect(() => {
    if (!username || userId) return
    fetch(`/api/users?username=${encodeURIComponent(username)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.user) { setUserId(data.user.id); localStorage.setItem(USER_ID_KEY, data.user.id) } })
      .catch(() => {})
  }, [username, userId])

  React.useEffect(() => {
    if (activeTab !== 'tournaments') return
    setIsLoadingTournaments(true)
    const parameters = new URLSearchParams({ status: tournamentFilter })
    if (userId) parameters.set('userId', userId)
    fetch(`/api/tournaments?${parameters}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setTournaments(data.tournaments || []))
      .catch(() => setTournaments([]))
      .finally(() => setIsLoadingTournaments(false))
  }, [activeTab, tournamentFilter, userId, notice])

  React.useEffect(() => {
    if (activeTab !== 'weekly' || !username) return
    setIsLoadingWeekly(true)
    fetch('/api/weekly-matches')
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load weekly matches.')
        return data
      })
      .then((data) => setWeeklySessions(data.sessions || []))
      .catch((error) => setWeeklyError(error.message))
      .finally(() => setIsLoadingWeekly(false))
  }, [activeTab, username, weeklyVersion])

  React.useEffect(() => {
    if (activeTab !== 'leaderboard') return
    fetch('/api/leaderboard')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { setLeaderboardPlayers(data.players || []); setLeaderboardPage(1) })
      .catch(() => setLeaderboardPlayers([]))
  }, [activeTab, detailVersion])

  React.useEffect(() => {
    if (activeTab !== 'users' || !isOrganizer) return
    ;(async () => {
    const passcode = await requestOrganizerPasscode()
    if (!passcode) {
      setUsersError('An organizer passcode is required to view registered users.')
      return
    }
    setUsersError('')
    fetch('/api/organizer/users', { headers: { 'x-rally-organizer-passcode': passcode } })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load users.')
        return data
      })
      .then((data) => { setRegisteredUsers(data.users); setUsersPage(1) })
      .catch((error) => setUsersError(error.message))
    })()
  }, [activeTab, isOrganizer, organizerPasscode])

  React.useEffect(() => {
    if (activeTab !== 'messages' || !isOrganizer) return
    ;(async () => {
      const passcode = await requestOrganizerPasscode()
      if (!passcode) { setAccessRequestsError('An organizer passcode is required to view access requests.'); return }
      setIsLoadingAccessRequests(true)
      setAccessRequestsError('')
      try {
        const response = await fetch('/api/organizer/access-requests', { headers: { 'x-rally-organizer-passcode': passcode } })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load access requests.')
        setAccessRequests(data.requests || [])
      } catch (error) { setAccessRequestsError(error.message) } finally { setIsLoadingAccessRequests(false) }
    })()
  }, [activeTab, isOrganizer, organizerPasscode])

  React.useEffect(() => {
    if (!isOrganizer || !inviteOnlySignup) { setUnreadAccessRequestCount(0); return }
    const loadUnreadCount = () => fetch('/api/organizer/access-requests/unread').then((response) => response.ok ? response.json() : { count: 0 }).then((data) => setUnreadAccessRequestCount(Number(data.count) || 0)).catch(() => {})
    loadUnreadCount()
    const interval = window.setInterval(loadUnreadCount, 60 * 1000)
    return () => window.clearInterval(interval)
  }, [isOrganizer, inviteOnlySignup, activeTab])

  async function generateInvite(requestId) {
    const passcode = await requestOrganizerPasscode()
    if (!passcode) return
    setAccessRequestsError('')
    try {
      const response = await fetch(`/api/organizer/access-requests/${requestId}/invite`, { method: 'POST', headers: { 'x-rally-organizer-passcode': passcode } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to generate invite.')
      setGeneratedInvite(data.code)
      setAccessRequests((requests) => requests.map((request) => request.id === requestId ? { ...request, has_active_invite: 1 } : request))
    } catch (error) { setAccessRequestsError(error.message) }
  }

  async function registerForTournament(tournament) {
    setRegistrationError('')
    setRegistrationPending(tournament.id)
    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/registrations`, { method: 'POST', headers: { 'x-rally-username': username } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to register.')
      setNotice(`You’re registered for “${tournament.name}”.`)
    } catch (error) {
      setRegistrationError(error.message)
    } finally {
      setRegistrationPending(null)
    }
  }

  async function withdrawFromTournament(tournament) {
    setRegistrationError('')
    setRegistrationPending(tournament.id)
    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/registrations`, { method: 'DELETE', headers: { 'x-rally-username': username } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to withdraw.')
      setNotice(`You’ve withdrawn from “${tournament.name}”.`)
    } catch (error) {
      setRegistrationError(error.message)
    } finally {
      setRegistrationPending(null)
    }
  }

  function updateWeeklyDraft(event) {
    setWeeklyDraft((draft) => ({ ...draft, [event.target.name]: event.target.value }))
  }

  async function createWeeklyMatch(event) {
    event.preventDefault()
    setWeeklyError('')
    setIsCreatingWeekly(true)
    try {
      const response = await fetch('/api/weekly-matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startsAt: `${weeklyDraft.date}T${weeklyDraft.time}`, requiredPlayers: Number(weeklyDraft.requiredPlayers), courtName: weeklyDraft.courtName, courtNumbers: weeklyDraft.courtNumbers }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create weekly match.')
      setWeeklyDraft({ date: '', time: '', requiredPlayers: '8', courtName: '', courtNumbers: '' })
      setWeeklyVersion((version) => version + 1)
      setNotice('Weekly match created.')
      setActiveTab('weekly')
    } catch (error) {
      setWeeklyError(error.message)
    } finally {
      setIsCreatingWeekly(false)
    }
  }

  function openWeeklyMatchEdit(session) {
    setWeeklyError('')
    setEditingWeeklyMatchId(session.id)
    setWeeklyDraft(weeklyDraftFromStartsAt(session.starts_at, session.required_players, session.court_name || '', session.court_numbers || ''))
    setActiveTab('weekly-edit')
  }

  async function saveWeeklyMatch(event) {
    event.preventDefault()
    if (!editingWeeklyMatchId) return
    setWeeklyError('')
    setIsCreatingWeekly(true)
    try {
      const response = await fetch(`/api/weekly-matches/${editingWeeklyMatchId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startsAt: `${weeklyDraft.date}T${weeklyDraft.time}`, requiredPlayers: Number(weeklyDraft.requiredPlayers), courtName: weeklyDraft.courtName, courtNumbers: weeklyDraft.courtNumbers }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update weekly match.')
      setEditingWeeklyMatchId(null)
      setWeeklyVersion((version) => version + 1)
      setNotice('Weekly match updated.')
      setActiveTab('weekly')
    } catch (error) {
      setWeeklyError(error.message)
    } finally {
      setIsCreatingWeekly(false)
    }
  }

  async function updateWeeklyRegistration(sessionId, method) {
    const action = method === 'POST' ? 'register' : 'withdraw'
    setWeeklyError('')
    setWeeklyActionPending(`${action}-${sessionId}`)
    try {
      const response = await fetch(`/api/weekly-matches/${sessionId}/registrations`, { method })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Unable to ${action}.`)
      setWeeklyVersion((version) => version + 1)
    } catch (error) {
      setWeeklyError(error.message)
    } finally {
      setWeeklyActionPending('')
    }
  }

  async function generateWeeklyPairings(sessionId) {
    setWeeklyError('')
    setWeeklyActionPending(`generate-${sessionId}`)
    try {
      const response = await fetch(`/api/weekly-matches/${sessionId}/draw/generate`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to generate pairings.')
      setWeeklyVersion((version) => version + 1)
    } catch (error) {
      setWeeklyError(error.message)
    } finally {
      setWeeklyActionPending('')
    }
  }

  async function deleteWeeklyMatch(sessionId) {
    if (!window.confirm('Delete this weekly match? This removes its registrations and pairings.')) return
    const passcode = await requestOrganizerPasscode()
    if (!passcode) {
      setWeeklyError('An organizer passcode is required to delete a weekly match.')
      return
    }
    setWeeklyError('')
    setWeeklyActionPending(`delete-${sessionId}`)
    try {
      const response = await fetch(`/api/weekly-matches/${sessionId}`, { method: 'DELETE', headers: { 'x-rally-organizer-passcode': passcode } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to delete weekly match.')
      setWeeklyVersion((version) => version + 1)
      setNotice('Weekly match deleted.')
    } catch (error) {
      setWeeklyError(error.message)
    } finally {
      setWeeklyActionPending('')
    }
  }

  function openTournament(tournamentId) {
    setSelectedTournamentId(tournamentId)
    setTournamentDetail(null)
    setDetailTab('players')
    setDetailError('')
    setActiveTab('detail')
  }

  // Show matches for a given round index (click handler for round labels)
  // This filters the visible `.match-row` entries to only those in the selected round.
  function showRoundMatches(roundIndex, container) {
    try {
      const parent = container || document.querySelector('.draw-panel')
      const containerEl = parent || document.querySelector('.draw-panel')
      if (!container) return
      const rows = Array.from(containerEl.querySelectorAll('.match-list .match-row'))
      const matches = tournamentDetail?.draw?.matches || []
      if (!rows.length || !matches.length) return

      // toggle behavior: if container currently filtered to this round, clear filter
      const active = containerEl.dataset.activeRound ? Number(containerEl.dataset.activeRound) : null
      const clearing = active === roundIndex
      if (clearing) {
        rows.forEach((r) => { r.style.display = ''; r.classList.remove('filtered') })
        delete containerEl.dataset.activeRound
        return
      }

      // apply filter: show only rows whose corresponding match has round_index === roundIndex
      rows.forEach((row, i) => {
        try {
          // prefer match id on row if present
          const mid = row.dataset && row.dataset.matchId ? row.dataset.matchId : null
          let match = null
          if (mid) match = matches.find((m) => String(m.id) === String(mid))
          if (!match) match = matches[i]
          if (!match) { row.style.display = 'none'; return }
          if ((match.round_index || 0) === roundIndex) { row.style.display = ''; row.classList.add('filtered') }
          else { row.style.display = 'none'; row.classList.remove('filtered') }
        } catch (e) { row.style.display = 'none' }
      })
      containerEl.dataset.activeRound = String(roundIndex)
    } catch (e) { console.error(e) }
  }

  React.useEffect(() => {
    if (activeTab !== 'detail' || !selectedTournamentId) return
    fetch(`/api/tournaments/${selectedTournamentId}`, { headers: { 'x-rally-username': username, 'x-rally-organizer-passcode': organizerPasscode } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setTournamentDetail)
      .catch(() => setDetailError('Unable to load this tournament.'))
  }, [activeTab, selectedTournamentId, username, organizerPasscode, detailVersion])

  // Make existing round labels (spans) clickable by wiring click handlers
  React.useEffect(() => {
    // Wire up any visible bracket-rounds on the page so round clicks filter the nearby draw-panel.
    const containers = Array.from(document.querySelectorAll('.bracket-rounds'))
    if (!containers.length) return
    containers.forEach((container) => {
      Array.from(container.children).forEach((child, idx) => {
        try {
          const panel = container.closest('.draw-panel') || document.querySelector('.draw-panel')
          child.style.cursor = 'pointer'
          child.onclick = () => showRoundMatches(idx, panel)
        } catch (e) {}
      })
    })
    return () => {
      const cs = Array.from(document.querySelectorAll('.bracket-rounds'))
      cs.forEach((c) => Array.from(c.children).forEach((child) => { child.onclick = null }))
    }
  }, [detailTab, tournamentDetail])

  async function manageDraw(action) {
    const passcode = await requestOrganizerPasscode()
    if (!passcode) {
      setDetailError('An organizer passcode is required to manage the draw.')
      return
    }
    setDetailError('')
    setDrawActionPending(action)
    try {
      const response = await fetch(`/api/tournaments/${selectedTournamentId}/draw/${action}`, { method: 'POST', headers: { 'x-rally-username': username, 'x-rally-organizer-passcode': passcode } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update the draw.')
      setDetailVersion((version) => version + 1)
    } catch (error) {
      setDetailError(error.message)
    } finally {
      setDrawActionPending('')
    }
  }

  async function awardBye(match, winnerUserId) {
    const passcode = await requestOrganizerPasscode()
    if (!passcode) {
      setDetailError('An organizer passcode is required to award a bye.')
      return
    }
    setDetailError('')
    setDrawActionPending(`bye-${match.id}`)
    try {
      const response = await fetch(`/api/matches/${match.id}/bye`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-rally-username': username, 'x-rally-organizer-passcode': passcode },
        body: JSON.stringify({ winnerUserId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to award the bye.')
      setDetailVersion((version) => version + 1)
    } catch (error) {
      setDetailError(error.message)
    } finally {
      setDrawActionPending('')
    }
  }

  function openScore(match) {
    setScoreError('')
    setScoreMatch(match)
  }

  async function saveScore(sets) {
    if (!scoreMatch) return
    const isMatchPlayer = [scoreMatch.player_one_name, scoreMatch.player_two_name].some((player) => player.toLowerCase() === username.toLowerCase())
    const isScoreOverride = scoreMatch.status === 'completed'
    const passcode = isOrganizer && (isScoreOverride || !isMatchPlayer) ? await requestOrganizerPasscode() : organizerPasscode
    if (isOrganizer && (isScoreOverride || !isMatchPlayer) && !passcode) {
      setScoreError(isScoreOverride ? 'An organizer passcode is required to change a submitted score.' : 'An organizer passcode is required to enter another player’s score.')
      return
    }
    setIsSavingScore(true)
    setScoreError('')
    try {
      const response = await fetch(`/api/matches/${scoreMatch.id}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-rally-username': username, 'x-rally-organizer-passcode': passcode },
        body: JSON.stringify({ sets }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to save the score.')
      setScoreMatch(null)
      setDetailVersion((version) => version + 1)
    } catch (error) {
      setScoreError(error.message)
    } finally {
      setIsSavingScore(false)
    }
  }

  // Compute and store tournament champion from the final match winner
  React.useEffect(() => {
    if (!tournamentDetail || !tournamentDetail.draw || !Array.isArray(tournamentDetail.draw.matches)) return
    try {
      const rounds = Array.isArray(tournamentDetail.draw.rounds) ? tournamentDetail.draw.rounds.length : null
      // prefer the last round by index if available
      const finalRoundIndex = rounds != null ? Math.max(0, rounds - 1) : Math.max(...(tournamentDetail.draw.matches.map((m) => m.round_index || 0)))
      const finalMatch = tournamentDetail.draw.matches.find((m) => (m.round_index || 0) === finalRoundIndex && (m.match_order === 1 || true))
      if (finalMatch && finalMatch.winner_name) {
        const champ = finalMatch.winner_name
        setTournamentDetail((prev) => {
          if (!prev) return prev
          if (prev.tournament && prev.tournament.champion_name === champ) return prev
          return { ...prev, tournament: { ...prev.tournament, champion_name: champ } }
        })
      }
    } catch (e) {}
  }, [tournamentDetail?.draw?.matches?.length, tournamentDetail?.draw?.rounds])

  function selectTab(tab) {
    setActiveTab(tab)
    setNotice('')
  }

  function updateTournamentDraft(event) {
    const nextDraft = { ...tournamentDraft, [event.target.name]: event.target.value }
    setTournamentDraft(nextDraft)
  }

  function fillRandomTournamentName() {
    setTournamentDraft((draft) => ({ ...draft, name: randomTournamentName() }))
  }

  async function createTournament(event) {
    event.preventDefault()
    const passcode = await requestOrganizerPasscode()
    if (!passcode) {
      setCreationError('An organizer passcode is required to create a tournament.')
      return
    }
    setCreationError('')
    setIsCreating(true)
    try {
      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-rally-username': username, 'x-rally-organizer-passcode': passcode },
        body: JSON.stringify(tournamentDraft),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create the tournament.')
      setTournamentDraft({ name: '', startDate: '', tournamentTier: 'rally_500', location: '', description: '' })
      setActiveTab('tournaments')
      setTournamentFilter(data.tournament.status === 'upcoming' ? 'current' : data.tournament.status)
      setNotice(`“${data.tournament.name}” has been created.`)
    } catch (error) {
      setCreationError(error.message)
    } finally {
      setIsCreating(false)
    }
  }

  function openTournamentEdit(tournament) {
    setCreationError('')
    setEditingTournamentId(tournament.id)
    setTournamentDraft({ name: tournament.name, startDate: tournament.starts_at.slice(0, 10), tournamentTier: tournament.tournament_tier || 'rally_500', location: tournament.location || '', description: tournament.description || '' })
    setActiveTab('edit-tournament')
  }

  async function deleteTournament(tournament) {
    if (!window.confirm(`Delete “${tournament.name}”? This permanently removes its players and draw.`)) return
    const passcode = await requestOrganizerPasscode()
    if (!passcode) { setDetailError('An organizer passcode is required to delete a tournament.'); return }
    setDetailError('')
    setIsDeletingTournament(true)
    try {
      const response = await fetch(`/api/tournaments/${tournament.id}`, { method: 'DELETE', headers: { 'x-rally-organizer-passcode': passcode } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to delete tournament.')
      setSelectedTournamentId(null)
      setTournamentDetail(null)
      setTournamentFilter('upcoming')
      setNotice(`“${data.name}” has been deleted.`)
      setActiveTab('tournaments')
    } catch (error) { setDetailError(error.message) } finally { setIsDeletingTournament(false) }
  }

  async function saveTournamentEdit(event) {
    event.preventDefault()
    if (!editingTournamentId) return
    const passcode = await requestOrganizerPasscode()
    if (!passcode) {
      setCreationError('An organizer passcode is required to edit a tournament.')
      return
    }
    setCreationError('')
    setIsCreating(true)
    try {
      const response = await fetch(`/api/tournaments/${editingTournamentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-rally-organizer-passcode': passcode }, body: JSON.stringify(tournamentDraft) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update tournament.')
      setEditingTournamentId(null)
      setActiveTab('tournaments')
      setTournamentFilter(data.tournament.status)
      setNotice(`“${data.tournament.name}” has been updated.`)
    } catch (error) {
      setCreationError(error.message)
    } finally {
      setIsCreating(false)
    }
  }

  const usersPageCount = Math.max(1, Math.ceil(registeredUsers.length / USERS_PER_PAGE))
  const visibleUsers = registeredUsers.slice((usersPage - 1) * USERS_PER_PAGE, usersPage * USERS_PER_PAGE)
  const leaderboardPageCount = Math.max(1, Math.ceil(leaderboardPlayers.length / USERS_PER_PAGE))
  const visibleLeaderboardPlayers = leaderboardPlayers.slice((leaderboardPage - 1) * USERS_PER_PAGE, leaderboardPage * USERS_PER_PAGE)

  if (!username) {
    if (isCheckingSession) return <main className="welcome-shell"><section className="welcome-card"><div className="brand brand--large"><TennisBall /><span>rally</span></div><p className="intro">Checking your sign-in…</p></section></main>
    return (
      <main className="welcome-shell">
        <section className="welcome-card" aria-labelledby="welcome-title">
          <div className="brand brand--large"><TennisBall /><span>rally</span></div>
          <p className="eyebrow">LOCAL TENNIS, MADE SIMPLE</p>
          <h1 id="welcome-title">Find your next friendly match.</h1>
          <p className="intro">Join local tournaments, follow your results, and see where you stand.</p>
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={authMode === 'signin'} className={authMode === 'signin' ? 'active' : ''} onClick={() => { setAuthMode('signin'); setUsernameError('') }}>Sign in</button>
            <button type="button" role="tab" aria-selected={authMode !== 'signin'} className={authMode !== 'signin' ? 'active' : ''} onClick={() => { setAuthMode(inviteOnlySignup ? 'request' : 'signup'); setUsernameError(''); setAccessRequestSent(false) }}>{inviteOnlySignup ? 'Request access' : 'Sign up'}</button>
          </div>
          {inviteOnlySignup && authMode === 'request' ? <form onSubmit={requestAccess}>
            <label htmlFor="username">Preferred username</label>
            <div className="input-row">
              <span aria-hidden="true">@</span>
              <input id="username" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. topspin_taylor" autoComplete="username" maxLength="32" autoFocus />
            </div>
            <label htmlFor="profile-name" className="password-label">Name <span className="optional">(optional)</span></label><div className="input-row"><input id="profile-name" value={draftProfileName} onChange={(event) => setDraftProfileName(event.target.value)} placeholder="e.g. Taylor Smith" autoComplete="name" maxLength="80" /></div>
            <label htmlFor="access-message" className="password-label">Message <span className="optional">(optional)</span></label><textarea id="access-message" value={accessMessage} onChange={(event) => setAccessMessage(event.target.value)} placeholder="Let the organizer know who you are." maxLength="500" rows="3" />
            <button type="submit" disabled={!draftName.trim() || isSavingUsername}>{isSavingUsername ? 'Sending…' : 'Send access request'}</button>
            {accessRequestSent && <p className="fine-print">Request sent. The organizer will give you a signup code directly.</p>}
          </form> : <form onSubmit={continueAsUser}>
            <label htmlFor="username">{authMode === 'signin' ? 'Your username' : 'Choose a username'}</label>
            <div className="input-row"><span aria-hidden="true">@</span><input id="username" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. topspin_taylor" autoComplete="username" maxLength="32" autoFocus /></div>
            {authMode === 'signup' && <>{inviteOnlySignup !== false && <><label htmlFor="invite-code" className="password-label">Invite code</label><div className="input-row"><input id="invite-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="e.g. ABCD-EFGH-IJKL" autoComplete="one-time-code" required /></div></>}<label htmlFor="profile-name" className="password-label">Name <span className="optional">(optional)</span></label><div className="input-row"><input id="profile-name" value={draftProfileName} onChange={(event) => setDraftProfileName(event.target.value)} placeholder="e.g. Taylor Smith" autoComplete="name" maxLength="80" /></div></>}
            <label htmlFor="password" className="password-label">Password</label>
            <div className="input-row password-row">
              <input id="password" type={isPasswordVisible ? 'text' : 'password'} value={draftPassword} onChange={(event) => setDraftPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} minLength="6" maxLength="128" />
              <button type="button" className="password-toggle" onClick={() => setIsPasswordVisible((visible) => !visible)} aria-label={isPasswordVisible ? 'Hide password' : 'Show password'} title={isPasswordVisible ? 'Hide password' : 'Show password'}><EyeIcon /></button>
            </div>
            <button type="submit" disabled={!draftName.trim() || !draftPassword || isSavingUsername}>{isSavingUsername ? 'Please wait…' : authMode === 'signin' ? <>Sign in <span aria-hidden="true">→</span></> : <>Create account <span aria-hidden="true">→</span></>}</button>
            {authMode === 'signin' && draftName.trim().toLowerCase() === ORGANIZER_USERNAME && <button type="button" className="organizer-reset" disabled={!draftPassword || isSavingUsername} onClick={resetOrganizerPassword}>Reset organizer password</button>}
          </form>}
          {usernameError && <p className="form-error" role="alert">{usernameError}</p>}
          {inviteOnlySignup && authMode === 'signup' && <p className="fine-print">Signup is invite-only. Your one-time code expires after 24 hours.</p>}
        </section>
        <footer>Built for the love of the game.</footer>
        {passcodePrompt && <OrganizerPasscodeModal onSubmit={submitOrganizerPasscode} onClose={cancelOrganizerPasscode} />}
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><TennisBall /><span>rally</span></div>
        <nav aria-label="Main navigation">
          <button className={['weekly', 'weekly-create', 'weekly-edit'].includes(activeTab) ? 'active' : ''} onClick={() => selectTab('weekly')}>Weekly Matches</button>
          <button className={['tournaments', 'create', 'edit-tournament'].includes(activeTab) ? 'active' : ''} onClick={() => selectTab('tournaments')}>Tournaments</button>
          <button className={activeTab === 'leaderboard' ? 'active' : ''} onClick={() => selectTab('leaderboard')}>Leaderboard</button>
          {isOrganizer && inviteOnlySignup && <button className={activeTab === 'messages' ? 'active' : ''} onClick={() => selectTab('messages')}>Messages{unreadAccessRequestCount > 0 && <span className="message-badge" aria-label={`${unreadAccessRequestCount} new access requests`}>{unreadAccessRequestCount}</span>}</button>}
          {isOrganizer && <button className={activeTab === 'users' ? 'active' : ''} onClick={() => selectTab('users')}>Users</button>}
        </nav>
        <button className="profile" onClick={changeUser} title="Use a different username"><span className="avatar">{(name || username).slice(0, 1).toUpperCase()}</span><span>{name || `@${username}`}</span><span className="switch">Switch</span></button>
      </header>

      {activeTab === 'weekly' ? <WeeklyMatchesPage sessions={weeklySessions} isLoading={isLoadingWeekly} actionPending={weeklyActionPending} onRegister={(sessionId) => updateWeeklyRegistration(sessionId, 'POST')} onWithdraw={(sessionId) => updateWeeklyRegistration(sessionId, 'DELETE')} onGenerate={generateWeeklyPairings} error={weeklyError} notice={notice} onCreate={() => { setWeeklyError(''); setActiveTab('weekly-create') }} onEdit={openWeeklyMatchEdit} isOrganizer={isOrganizer} onDelete={deleteWeeklyMatch} /> : activeTab === 'weekly-create' ? <WeeklyMatchCreatePage draft={weeklyDraft} onDraftChange={updateWeeklyDraft} onCreate={createWeeklyMatch} isCreating={isCreatingWeekly} error={weeklyError} onBack={() => selectTab('weekly')} /> : activeTab === 'weekly-edit' ? <WeeklyMatchCreatePage draft={weeklyDraft} onDraftChange={updateWeeklyDraft} onCreate={saveWeeklyMatch} isCreating={isCreatingWeekly} error={weeklyError} onBack={() => selectTab('weekly')} isEditing /> : activeTab === 'detail' ? (
        <section className="page detail-page" aria-labelledby="tournament-detail-title">
          <button className="back-button" onClick={() => selectTab('tournaments')}>← Back to tournaments</button>
          {detailError && <p className="creation-error" role="alert">{detailError}</p>}
          {!tournamentDetail ? <p className="detail-loading">Loading tournament…</p> : <><div className="detail-heading"><p className="eyebrow">{new Date(tournamentDetail.tournament.starts_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} · {TOURNAMENT_TIERS[tournamentDetail.tournament.tournament_tier]?.label || 'Rally 500 · Weekend Classic'} · {tournamentDetail.tournament.location || 'Location to be announced'}</p><div className="detail-title-row"><h1 id="tournament-detail-title">{tournamentDetail.tournament.name}</h1>{isOrganizer && tournamentDetail.tournament.status === 'upcoming' && <div className="management-icons"><button className="icon-action" onClick={() => openTournamentEdit(tournamentDetail.tournament)} aria-label="Edit tournament" title="Edit tournament"><EditIcon /></button><button className="icon-action icon-action--delete" disabled={isDeletingTournament} onClick={() => deleteTournament(tournamentDetail.tournament)} aria-label="Delete tournament" title="Delete tournament"><TrashIcon /></button></div>}</div>{tournamentDetail.tournament.description && <p>{tournamentDetail.tournament.description}</p>}</div><div className="detail-tabs"><button className={detailTab === 'players' ? 'active' : ''} onClick={() => setDetailTab('players')}>Players <span>{tournamentDetail.players.length}</span></button><button className={detailTab === 'draw' ? 'active' : ''} onClick={() => setDetailTab('draw')}>Draw</button></div>{detailTab === 'players' ? <div className="player-panel">{tournamentDetail.players.length ? tournamentDetail.players.map((player, index) => <div className="player-row" key={player.id}><span className="player-number">{index + 1}</span><span className="mini-avatar">{displayName(player)[0].toUpperCase()}</span><strong>{displayName(player)}</strong>{player.seed && <span className="seed">Seed {player.seed}</span>}</div>) : <div className="empty-detail"><TennisBall /><p>No players registered yet.</p></div>}</div> : <TournamentDraw draw={tournamentDetail.draw} isOrganizer={isOrganizer} tournamentStatus={tournamentDetail.tournament.status} drawActionPending={drawActionPending} onManage={manageDraw} username={username} onEnterScore={openScore} onAwardBye={awardBye} />}</>}
        </section>
      ) : ['create', 'edit-tournament'].includes(activeTab) && isOrganizer ? (
        <section className="page create-page" aria-labelledby="create-title">
          <button className="back-button" onClick={() => selectTab('tournaments')}>← Back to tournaments</button>
          <div className="create-heading"><p className="eyebrow">ORGANIZER TOOLS</p><h1 id="create-title">{activeTab === 'edit-tournament' ? 'Edit tournament' : 'Create a tournament'}</h1><p>{activeTab === 'edit-tournament' ? 'Update the tournament details below.' : 'Set the basics now. Registration and match setup come next.'}</p></div>
          <form className="tournament-form" onSubmit={activeTab === 'edit-tournament' ? saveTournamentEdit : createTournament}>
            <label><span className="form-label-row">Tournament name<button type="button" className="random-name-button" onClick={fillRandomTournamentName}>↻ Random name</button></span><input name="name" value={tournamentDraft.name} onChange={updateTournamentDraft} placeholder="e.g. Sunday Rally Open" maxLength="100" required autoFocus /></label>
            <label>Tournament tier<select name="tournamentTier" value={tournamentDraft.tournamentTier} onChange={updateTournamentDraft}>{Object.entries(TOURNAMENT_TIERS).map(([key, tier]) => <option key={key} value={key}>{tier.label} — {tier.points} pts</option>)}</select><span className="tier-description">{TOURNAMENT_TIERS[tournamentDraft.tournamentTier].days} day · {TOURNAMENT_TIERS[tournamentDraft.tournamentTier].scoring} · Up to {TOURNAMENT_TIERS[tournamentDraft.tournamentTier].maxPlayers} players</span></label>
            <div className="form-grid"><label>Start date<input type="date" name="startDate" value={tournamentDraft.startDate} onChange={updateTournamentDraft} required /></label><label>End date <span className="optional">(set by tier)</span><input type="date" value={tournamentEndDate(tournamentDraft.startDate, tournamentDraft.tournamentTier)} readOnly /></label></div>
            <label>Location <span className="optional">(optional)</span><input name="location" value={tournamentDraft.location} onChange={updateTournamentDraft} placeholder="e.g. Riverside Tennis Center" maxLength="120" /></label>
            <label>Note for players <span className="optional">(optional)</span><textarea name="description" value={tournamentDraft.description} onChange={updateTournamentDraft} placeholder="Share any useful details: start time, court number, or format." maxLength="500" rows="4" /></label>
            {creationError && <p className="creation-error" role="alert">{creationError}</p>}
            <div className="form-actions"><button type="button" className="cancel-button" onClick={() => selectTab('tournaments')}>Cancel</button><button type="submit" className="primary-action" disabled={isCreating}>{isCreating ? 'Saving…' : activeTab === 'edit-tournament' ? 'Save changes' : 'Create tournament'}</button></div>
          </form>
        </section>
      ) : activeTab === 'messages' && isOrganizer && inviteOnlySignup ? <AccessRequestsPage requests={accessRequests} error={accessRequestsError} isLoading={isLoadingAccessRequests} onGenerate={generateInvite} generatedInvite={generatedInvite} onDismissInvite={() => setGeneratedInvite('')} /> : activeTab === 'users' && isOrganizer ? (
        <section className="page" aria-labelledby="users-title">
          <div className="page-heading"><div><p className="eyebrow">ORGANIZER TOOLS</p><h1 id="users-title">Registered users</h1><p>{registeredUsers.length} players in Rally.</p></div></div>
          {usersError ? <p className="creation-error">{usersError}</p> : <><div className="users-table">{visibleUsers.map((player) => <div className="user-row" key={player.id}><strong>{displayName(player)}</strong><span>{player.total_points} pts</span></div>)}</div>{registeredUsers.length > USERS_PER_PAGE && <div className="pagination"><button className="secondary-action" disabled={usersPage === 1} onClick={() => setUsersPage((page) => page - 1)}>← Previous</button><span>Page {usersPage} of {usersPageCount}</span><button className="secondary-action" disabled={usersPage === usersPageCount} onClick={() => setUsersPage((page) => page + 1)}>Next →</button></div>}</>}
        </section>
      ) : activeTab === 'tournaments' ? (
        <section className="page" aria-labelledby="tournaments-title">
          <div className="page-heading">
            <div><p className="eyebrow">YOUR COURT CALENDAR</p><h1 id="tournaments-title">Tournaments</h1><p>See what’s happening and keep track of your entries.</p></div>
            {isOrganizer && <button className="primary-action" onClick={() => selectTab('create')}>+ Create tournament</button>}
          </div>
          <div className="filter-row" role="tablist" aria-label="Tournament status">
            {['current', 'upcoming', 'past'].map((filter) => <button key={filter} role="tab" aria-selected={tournamentFilter === filter} className={tournamentFilter === filter ? 'selected' : ''} onClick={() => { setTournamentFilter(filter); setNotice(''); setRegistrationError('') }}>{filter[0].toUpperCase() + filter.slice(1)}</button>)}
          </div>
          {notice && <div className="notice" role="status">{notice}</div>}
          {registrationError && <div className="registration-error" role="alert">{registrationError}</div>}
          <div className="empty-state">
            {isLoadingTournaments ? <p>Loading tournaments…</p> : tournaments.length ? <div className="tournament-list">{tournaments.map((tournament) => <article className="tournament-card" key={tournament.id} onClick={() => openTournament(tournament.id)}><div><p className="card-date">{new Date(tournament.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{tournament.starts_at.slice(0, 10) !== tournament.ends_at.slice(0, 10) && ` – ${new Date(tournament.ends_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</p><h2>{tournament.name}</h2><span className="tier-badge">{TOURNAMENT_TIERS[tournament.tournament_tier]?.label || 'Rally 500 · Weekend Classic'}</span>{tournament.status !== 'past' && <p className="capacity-note">{remainingCapacityLabel(tournament)}</p>}{tournament.location && <p>{tournament.location}</p>}{tournament.description && <p>{tournament.description}</p>}{registrationDeadlineLabel(tournament) && <p className={registrationHasClosed(tournament) ? 'registration-deadline registration-deadline--closed' : 'registration-deadline'}>{registrationDeadlineLabel(tournament)}</p>}</div><div className="card-action">{tournament.registration_status === 'registered' ? (tournament.status !== 'past' && !registrationHasClosed(tournament) ? <button className="secondary-action withdraw-action" disabled={registrationPending === tournament.id} onClick={(event) => { event.stopPropagation(); withdrawFromTournament(tournament) }}>{registrationPending === tournament.id ? 'Withdrawing…' : 'Withdraw'}</button> : <span className="registered">Registered</span>) : tournament.status !== 'past' && (registrationHasClosed(tournament) ? <span className="registration-closed">Registration closed</span> : <button className="secondary-action" disabled={registrationPending === tournament.id} onClick={(event) => { event.stopPropagation(); registerForTournament(tournament) }}>{registrationPending === tournament.id ? 'Registering…' : 'Register'}</button>)}</div></article>)}</div> : <><div className="court-mark"><TennisBall /></div><h2>No {tournamentFilter} tournaments yet</h2><p>{tournamentFilter === 'upcoming' ? 'Check back soon for a friendly match near you.' : `When you have ${tournamentFilter} tournaments, they’ll appear here.`}</p>{tournamentFilter === 'upcoming' && isOrganizer && <button className="secondary-action" onClick={() => selectTab('create')}>Create the first tournament</button>}</>}
          </div>
        </section>
      ) : (
        <section className="page leaderboard" aria-labelledby="leaderboard-title">
          <div className="page-heading"><div><p className="eyebrow">LOCAL RANKINGS</p><h1 id="leaderboard-title">Leaderboard</h1><p>Win matches to earn tournament points.</p></div></div>
          <div className="rating-note"><span>✦</span><div><strong>Win 250 or 500 points, depending on the tournament tier.</strong><p>Later-round wins are worth more; points update as scores are recorded and expire 180 days after the tournament ends.</p></div></div>
          {leaderboardPlayers.length ? <><div className="leaderboard-table">{visibleLeaderboardPlayers.map((player) => <div className="leaderboard-row" key={player.user_id}><span className="leaderboard-rank">{player.rank}</span><span className="mini-avatar">{displayName(player)[0].toUpperCase()}</span><strong>{displayName(player)}</strong><span className="leaderboard-points">{player.total_points} pts</span></div>)}</div>{leaderboardPlayers.length > USERS_PER_PAGE && <div className="pagination"><button className="secondary-action" disabled={leaderboardPage === 1} onClick={() => setLeaderboardPage((page) => page - 1)}>← Previous</button><span>Page {leaderboardPage} of {leaderboardPageCount}</span><button className="secondary-action" disabled={leaderboardPage === leaderboardPageCount} onClick={() => setLeaderboardPage((page) => page + 1)}>Next →</button></div>}</> : <div className="empty-state leaderboard-empty"><div className="trophy">♜</div><h2>The board is waiting</h2><p>Record the first result to begin earning points.</p></div>}
        </section>
      )}
      {scoreMatch && <ScoreEntryModal match={scoreMatch} onClose={() => setScoreMatch(null)} onSave={saveScore} isSaving={isSavingScore} error={scoreError} isSingleSet={tournamentDetail?.tournament?.tournament_tier === 'rally_250'} />}
      {passcodePrompt && <OrganizerPasscodeModal onSubmit={submitOrganizerPasscode} onClose={cancelOrganizerPasscode} />}
    </main>
  )
}

// React is referenced here to keep the component imports intentionally small.
import React from 'react'
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
