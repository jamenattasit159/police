package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

//go:embed schema.sql
var schema string

type app struct {
	db      *pgxpool.Pool
	limiter *loginLimiter
}

func main() {
	ctx := context.Background()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	if err := setupDB(ctx, db); err != nil {
		log.Fatal(err)
	}
	a := &app{db: db, limiter: newLoginLimiter()}

	mux := http.NewServeMux()
	a.routes(mux)
	mux.Handle("/", spa(envOr("STATIC_DIR", "../frontend/dist")))

	addr := os.Getenv("ADDR")
	if addr == "" {
		if p := os.Getenv("PORT"); p != "" {
			addr = ":" + p
		} else {
			addr = ":8080"
		}
	}

	srv := &http.Server{
		Addr:              addr,
		Handler:           securityHeaders(mux),
		ReadHeaderTimeout: 5 * time.Second, // slowloris
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	log.Println("listening on", srv.Addr)
	log.Fatal(srv.ListenAndServe())
}

const csp = "default-src 'self'; script-src 'self'; " +
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
	"img-src 'self' data: https: https://tile.openstreetmap.org; connect-src 'self'; " +
	"frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"

func securityHeaders(next http.Handler) http.Handler {
	hsts := os.Getenv("COOKIE_INSECURE") != "1"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if hsts {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Cache-Control", "no-store") // suspect data must not sit in browser/proxy caches
		}
		next.ServeHTTP(w, r)
		// Drain unread body (e.g. 401/403 before decode) so closing the socket doesn't RST away the response.
		io.Copy(io.Discard, io.LimitReader(r.Body, 64<<10))
	})
}

// setupDB applies the schema and ensures ADMIN_USER / ADMIN_PASSWORD exist and are synced.
func setupDB(ctx context.Context, db *pgxpool.Pool) error {
	if _, err := db.Exec(ctx, schema); err != nil {
		return err
	}

	user, pass := os.Getenv("ADMIN_USER"), os.Getenv("ADMIN_PASSWORD")
	if user != "" && len(pass) >= 8 {
		hash, err := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
		if err == nil {
			var exists bool
			_ = db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)`, user).Scan(&exists)
			if exists {
				_, _ = db.Exec(ctx, `UPDATE users SET password_hash = $1 WHERE username = $2`, string(hash), user)
			} else {
				_, _ = db.Exec(ctx, `INSERT INTO users (username, password_hash, full_name, role) VALUES ($1,$2,$3,'commander')`,
					user, string(hash), "ผู้กำกับ")
			}
		}
	}

	var n int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return errors.New("no users yet: set ADMIN_USER and ADMIN_PASSWORD (8+ chars) to create the first commander")
	}
	return nil
}

func (a *app) routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/login", a.login)
	mux.HandleFunc("POST /api/logout", a.logout)
	mux.HandleFunc("GET /api/me", a.auth(a.me))
	mux.HandleFunc("GET /api/stations", a.auth(a.listStations))
	mux.HandleFunc("POST /api/stations", a.auth(adminOnly(a.createStation)))
	mux.HandleFunc("PUT /api/stations/{id}", a.auth(adminOnly(a.updateStation)))
	mux.HandleFunc("DELETE /api/stations/{id}", a.auth(adminOnly(a.deleteStation)))
	mux.HandleFunc("GET /api/suspects", a.auth(a.listSuspects))
	mux.HandleFunc("POST /api/suspects", a.auth(a.createSuspect))
	mux.HandleFunc("PUT /api/suspects/{id}", a.auth(a.updateSuspect))
	mux.HandleFunc("DELETE /api/suspects/{id}", a.auth(a.deleteSuspect))
	mux.HandleFunc("GET /api/dashboard", a.auth(a.dashboard))
	mux.HandleFunc("GET /api/users", a.auth(adminOnly(a.listUsers)))
	mux.HandleFunc("POST /api/users", a.auth(adminOnly(a.createUser)))
	mux.HandleFunc("PUT /api/users/{id}", a.auth(adminOnly(a.updateUser)))
	mux.HandleFunc("GET /api/settings", a.getSettings)
	mux.HandleFunc("PUT /api/settings", a.auth(adminOnly(a.updateSettings)))
}

// spa serves the built React app, falling back to index.html for unknown paths.
func spa(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := os.Stat(filepath.Join(dir, filepath.Clean(r.URL.Path))); err != nil {
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	})
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// serverErr logs the real error and returns a generic message (no DB details to the client).
func serverErr(w http.ResponseWriter, err error) {
	log.Println("error:", err)
	httpErr(w, http.StatusInternalServerError, "เกิดข้อผิดพลาดในระบบ")
}

// decode only accepts application/json: HTML forms can't send it cross-site, which blocks CSRF
// even if SameSite cookies are bypassed.
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	return decodeMax(w, r, v, 64<<10)
}

func decodeMax(w http.ResponseWriter, r *http.Request, v any, maxBytes int64) bool {
	if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
		httpErr(w, http.StatusUnsupportedMediaType, "ต้องส่งข้อมูลแบบ JSON")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		httpErr(w, http.StatusBadRequest, "ข้อมูลไม่ถูกต้อง")
		return false
	}
	return true
}
