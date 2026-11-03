package main

import (
	"crypto/rand"
	"errors"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// tempPassword: 3 groups of 4 from an alphabet without look-alikes (0/o, 1/l/i), ~59 bits.
func tempPassword() string {
	const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
	var b strings.Builder
	for i := 0; i < 12; i++ {
		if i > 0 && i%4 == 0 {
			b.WriteByte('-')
		}
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		b.WriteByte(alphabet[n.Int64()])
	}
	return b.String()
}

// changePassword lets a logged-in user set a new password (required after first login / admin reset).
func (a *app) changePassword(w http.ResponseWriter, r *http.Request, u *user) {
	var in struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if !decode(w, r, &in) {
		return
	}
	key := "pw:" + strconv.Itoa(u.ID)
	if !a.limiter.allow(key, 5) {
		httpErr(w, http.StatusTooManyRequests, "ใส่รหัสผ่านเดิมผิดหลายครั้ง กรุณารอ 15 นาที")
		return
	}
	switch {
	case len(in.New) < 8:
		httpErr(w, http.StatusBadRequest, "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร")
		return
	case len(in.New) > 72:
		httpErr(w, http.StatusBadRequest, "รหัสผ่านใหม่ยาวเกินไป (สูงสุด 72 ตัวอักษรภาษาอังกฤษ)")
		return
	case in.New == in.Current:
		httpErr(w, http.StatusBadRequest, "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม")
		return
	case strings.EqualFold(in.New, u.Username):
		httpErr(w, http.StatusBadRequest, "รหัสผ่านใหม่ต้องไม่เหมือนชื่อผู้ใช้")
		return
	}
	var hash string
	if err := a.db.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id=$1`, u.ID).Scan(&hash); err != nil {
		serverErr(w, err)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Current)) != nil {
		a.limiter.fail(key)
		httpErr(w, http.StatusBadRequest, "รหัสผ่านเดิมไม่ถูกต้อง")
		return
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(in.New), bcrypt.DefaultCost)
	if err != nil {
		serverErr(w, err)
		return
	}
	if _, err := a.db.Exec(r.Context(), `UPDATE users SET password_hash=$1, must_change_password=false WHERE id=$2`, string(newHash), u.ID); err != nil {
		serverErr(w, err)
		return
	}
	a.limiter.reset(key)
	// Sign out every other device that knew the old password; keep this one.
	if c, err := r.Cookie("sid"); err == nil {
		a.db.Exec(r.Context(), `DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2`, u.ID, hashToken(c.Value))
	}
	a.audit(r, u.ID, "password_changed", nil)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// requestPasswordReset is public. It always answers the same way so it can't be used to find usernames.
func (a *app) requestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string `json:"username"`
		Contact  string `json:"contact"`
	}
	if !decode(w, r, &in) {
		return
	}
	key := "reset:" + clientIP(r)
	if !a.limiter.allow(key, 5) {
		httpErr(w, http.StatusTooManyRequests, "ส่งคำขอบ่อยเกินไป กรุณารอ 15 นาที")
		return
	}
	a.limiter.fail(key) // every request counts toward the per-IP cap
	username, contact := truncate(strings.TrimSpace(in.Username), 100), truncate(strings.TrimSpace(in.Contact), 200)
	if username == "" {
		httpErr(w, http.StatusBadRequest, "กรุณากรอกชื่อผู้ใช้")
		return
	}
	var userID *int
	var id int
	if a.db.QueryRow(r.Context(), `SELECT id FROM users WHERE username=$1 AND active`, username).Scan(&id) == nil {
		userID = &id
	}
	if _, err := a.db.Exec(r.Context(), `INSERT INTO password_reset_requests (username, user_id, contact, ip) VALUES ($1,$2,$3,$4)`,
		username, userID, contact, clientIP(r)); err != nil {
		serverErr(w, err)
		return
	}
	a.audit(r, 0, "reset_requested", nil, "username="+username)
	writeJSON(w, http.StatusOK, map[string]string{"message": "ส่งคำขอแล้ว เจ้าหน้าที่ที่เกี่ยวข้องจะติดต่อกลับและออกรหัสชั่วคราวให้"})
}

func (a *app) listResetRequests(w http.ResponseWriter, r *http.Request, u *user) {
	rows, err := a.db.Query(r.Context(), `
		SELECT q.id, q.username, q.user_id, u.full_name, s.name, q.contact, q.created_at
		FROM password_reset_requests q LEFT JOIN users u ON u.id = q.user_id LEFT JOIN stations s ON s.id = u.station_id
		WHERE q.resolved_at IS NULL ORDER BY q.created_at DESC LIMIT 100`)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	type req struct {
		ID          int       `json:"id"`
		Username    string    `json:"username"`
		UserID      *int      `json:"user_id"`
		FullName    *string   `json:"full_name"`
		StationName *string   `json:"station_name"`
		Contact     string    `json:"contact"`
		CreatedAt   time.Time `json:"created_at"`
	}
	out := []req{}
	for rows.Next() {
		var x req
		if err := rows.Scan(&x.ID, &x.Username, &x.UserID, &x.FullName, &x.StationName, &x.Contact, &x.CreatedAt); err != nil {
			serverErr(w, err)
			return
		}
		out = append(out, x)
	}
	writeJSON(w, http.StatusOK, out)
}

// resetUserPassword issues a one-time temporary password. It is shown to the admin once and never stored in plain text.
func (a *app) resetUserPassword(w http.ResponseWriter, r *http.Request, u *user) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpErr(w, http.StatusNotFound, "ไม่พบผู้ใช้")
		return
	}
	if id == u.ID {
		httpErr(w, http.StatusBadRequest, "บัญชีของตัวเองให้ใช้เมนูเปลี่ยนรหัสผ่าน")
		return
	}
	temp := tempPassword()
	hash, err := bcrypt.GenerateFromPassword([]byte(temp), bcrypt.DefaultCost)
	if err != nil {
		serverErr(w, err)
		return
	}
	var username string
	err = a.db.QueryRow(r.Context(), `UPDATE users SET password_hash=$1, must_change_password=true WHERE id=$2 RETURNING username`, string(hash), id).Scan(&username)
	if errors.Is(err, pgx.ErrNoRows) {
		httpErr(w, http.StatusNotFound, "ไม่พบผู้ใช้")
		return
	}
	if err != nil {
		serverErr(w, err)
		return
	}
	a.limiter.reset("u:" + username) // the owner was likely locked out by failed logins; the new temp password should work now
	a.db.Exec(r.Context(), `DELETE FROM sessions WHERE user_id=$1`, id)
	a.db.Exec(r.Context(), `UPDATE password_reset_requests SET resolved_at=now(), resolved_by=$1 WHERE user_id=$2 AND resolved_at IS NULL`, u.ID, id)
	a.audit(r, u.ID, "password_reset", nil, "user_id="+strconv.Itoa(id))
	writeJSON(w, http.StatusOK, map[string]string{"temp_password": temp})
}

func (a *app) dismissResetRequest(w http.ResponseWriter, r *http.Request, u *user) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpErr(w, http.StatusNotFound, "ไม่พบคำขอ")
		return
	}
	a.db.Exec(r.Context(), `UPDATE password_reset_requests SET resolved_at=now(), resolved_by=$1 WHERE id=$2 AND resolved_at IS NULL`, u.ID, id)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
