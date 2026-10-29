package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

const sessionTTL = 12 * time.Hour

type user struct {
	ID          int     `json:"id"`
	Username    string  `json:"username"`
	FullName    string  `json:"full_name"`
	Role        string  `json:"role"`
	StationID   *int    `json:"station_id"`
	StationName *string `json:"station_name"`
}

func (u *user) isAdmin() bool { return u.Role == "commander" || u.Role == "inspector" }

type handler func(http.ResponseWriter, *http.Request, *user)

func hashToken(t string) string {
	s := sha256.Sum256([]byte(t))
	return hex.EncodeToString(s[:])
}

func (a *app) auth(h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("sid")
		if err != nil {
			httpErr(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบ")
			return
		}
		var u user
		err = a.db.QueryRow(r.Context(), `
			SELECT u.id, u.username, u.full_name, u.role, u.station_id, s.name
			FROM sessions x JOIN users u ON u.id = x.user_id LEFT JOIN stations s ON s.id = u.station_id
			WHERE x.token_hash = $1 AND x.expires_at > now() AND u.active`, hashToken(c.Value)).
			Scan(&u.ID, &u.Username, &u.FullName, &u.Role, &u.StationID, &u.StationName)
		if errors.Is(err, pgx.ErrNoRows) {
			httpErr(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบ")
			return
		}
		if err != nil {
			serverErr(w, err)
			return
		}
		h(w, r, &u)
	}
}

func adminOnly(h handler) handler {
	return func(w http.ResponseWriter, r *http.Request, u *user) {
		if !u.isAdmin() {
			httpErr(w, http.StatusForbidden, "ไม่มีสิทธิ์")
			return
		}
		h(w, r, u)
	}
}

func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Username, Password string }
	if !decode(w, r, &in) {
		return
	}
	userKey, ipKey := "u:"+in.Username, "ip:"+clientIP(r)
	if !a.limiter.allow(userKey, 5) || !a.limiter.allow(ipKey, 20) {
		httpErr(w, http.StatusTooManyRequests, "ใส่รหัสผิดหลายครั้ง กรุณารอ 15 นาที")
		return
	}
	var id int
	var hash string
	err := a.db.QueryRow(r.Context(), `SELECT id, password_hash FROM users WHERE username = $1 AND active`, in.Username).Scan(&id, &hash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		serverErr(w, err)
		return
	}
	found := err == nil
	if !found {
		hash = dummyHash // still run bcrypt so response time doesn't reveal which usernames exist
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil || !found {
		a.limiter.fail(userKey)
		a.limiter.fail(ipKey)
		a.audit(r, id, "login_failed", nil, "username="+truncate(in.Username, 100))
		httpErr(w, http.StatusUnauthorized, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
		return
	}
	a.limiter.reset(userKey)

	b := make([]byte, 32)
	rand.Read(b)
	token := hex.EncodeToString(b)
	if _, err := a.db.Exec(r.Context(), `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)`,
		hashToken(token), id, time.Now().Add(sessionTTL)); err != nil {
		serverErr(w, err)
		return
	}
	a.db.Exec(r.Context(), `DELETE FROM sessions WHERE expires_at < now()`)
	a.audit(r, id, "login", nil)
	setCookie(w, token, sessionTTL)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *app) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie("sid"); err == nil {
		a.db.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash = $1`, hashToken(c.Value))
	}
	setCookie(w, "", -1)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *app) me(w http.ResponseWriter, r *http.Request, u *user) { writeJSON(w, http.StatusOK, u) }

func setCookie(w http.ResponseWriter, token string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name: "sid", Value: token, Path: "/", MaxAge: int(ttl.Seconds()),
		HttpOnly: true, SameSite: http.SameSiteStrictMode,
		Secure: os.Getenv("COOKIE_INSECURE") != "1", // only set COOKIE_INSECURE=1 for plain-http dev
	})
}

// audit records who did what from where. userID 0 = unknown user (failed login).
func (a *app) audit(r *http.Request, userID int, action string, suspectID *int, detail ...string) {
	a.db.Exec(r.Context(), `INSERT INTO audit_log (user_id, action, suspect_id, ip, detail) VALUES (NULLIF($1,0),$2,$3,$4,$5)`,
		userID, action, suspectID, clientIP(r), strings.Join(detail, " "))
}

var dummyHash = func() string {
	h, _ := bcrypt.GenerateFromPassword([]byte("timing-equaliser"), bcrypt.DefaultCost)
	return string(h)
}()

// clientIP uses X-Real-IP only when TRUST_PROXY=1 (set it when running behind nginx/Caddy that sets the header);
// otherwise the header is attacker-controlled and ignored.
func clientIP(r *http.Request) string {
	if os.Getenv("TRUST_PROXY") == "1" {
		if ip := r.Header.Get("X-Real-IP"); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func truncate(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// loginLimiter counts failed logins per key (username and IP) over 15 minutes.
// shortcut: in-memory, resets on restart and not shared across instances; move to DB if running >1 server.
type loginLimiter struct {
	mu    sync.Mutex
	fails map[string][]time.Time
}

func newLoginLimiter() *loginLimiter { return &loginLimiter{fails: map[string][]time.Time{}} }

func (l *loginLimiter) recent(name string) []time.Time {
	var keep []time.Time
	for _, t := range l.fails[name] {
		if time.Since(t) < 15*time.Minute {
			keep = append(keep, t)
		}
	}
	l.fails[name] = keep
	return keep
}

func (l *loginLimiter) allow(name string, max int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.recent(name)) < max
}

func (l *loginLimiter) fail(name string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.fails[name] = append(l.recent(name), time.Now())
}

func (l *loginLimiter) reset(name string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.fails, name)
}
