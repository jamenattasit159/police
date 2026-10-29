package main

import (
	"net/http"
	"strconv"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

type userRow struct {
	user
	Active bool `json:"active"`
}

type userInput struct {
	Username  string `json:"username"`
	Password  string `json:"password"` // optional on update: empty keeps the current password
	FullName  string `json:"full_name"`
	Role      string `json:"role"`
	StationID *int   `json:"station_id"`
	Active    bool   `json:"active"`
}

func (in *userInput) validate(creating bool) string {
	in.Username, in.FullName = strings.TrimSpace(in.Username), strings.TrimSpace(in.FullName)
	switch {
	case creating && in.Username == "":
		return "กรุณากรอกชื่อผู้ใช้"
	case in.FullName == "":
		return "กรุณากรอกชื่อ-สกุล"
	case (creating || in.Password != "") && len(in.Password) < 8:
		return "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร"
	case len(in.Password) > 72: // bcrypt limit
		return "รหัสผ่านยาวเกินไป (สูงสุด 72 ตัวอักษรภาษาอังกฤษ)"
	case in.Role != "commander" && in.Role != "inspector" && in.Role != "officer":
		return "บทบาทไม่ถูกต้อง"
	case in.Role == "officer" && in.StationID == nil:
		return "เจ้าหน้าที่ต้องเลือก สภ."
	}
	if in.Role != "officer" {
		in.StationID = nil
	}
	return ""
}

func (a *app) listUsers(w http.ResponseWriter, r *http.Request, u *user) {
	rows, err := a.db.Query(r.Context(), `
		SELECT u.id, u.username, u.full_name, u.role, u.station_id, s.name, u.active
		FROM users u LEFT JOIN stations s ON s.id = u.station_id ORDER BY u.role, s.code, u.username`)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	out := []userRow{}
	for rows.Next() {
		var x userRow
		if err := rows.Scan(&x.ID, &x.Username, &x.FullName, &x.Role, &x.StationID, &x.StationName, &x.Active); err != nil {
			serverErr(w, err)
			return
		}
		out = append(out, x)
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *app) createUser(w http.ResponseWriter, r *http.Request, u *user) {
	var in userInput
	if !decode(w, r, &in) {
		return
	}
	if msg := in.validate(true); msg != "" {
		httpErr(w, http.StatusBadRequest, msg)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		serverErr(w, err)
		return
	}
	var id int
	err = a.db.QueryRow(r.Context(), `
		INSERT INTO users (username, password_hash, full_name, role, station_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		in.Username, string(hash), in.FullName, in.Role, in.StationID).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "users_username_key") {
			httpErr(w, http.StatusConflict, "ชื่อผู้ใช้นี้มีอยู่แล้ว")
			return
		}
		serverErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (a *app) updateUser(w http.ResponseWriter, r *http.Request, u *user) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpErr(w, http.StatusNotFound, "ไม่พบผู้ใช้")
		return
	}
	var in userInput
	if !decode(w, r, &in) {
		return
	}
	if msg := in.validate(false); msg != "" {
		httpErr(w, http.StatusBadRequest, msg)
		return
	}
	if id == u.ID && (!in.Active || !(in.Role == "commander" || in.Role == "inspector")) {
		httpErr(w, http.StatusBadRequest, "ไม่สามารถปิดใช้งานหรือลดสิทธิ์บัญชีของตัวเอง")
		return
	}
	hash := ""
	if in.Password != "" {
		b, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
		if err != nil {
			serverErr(w, err)
			return
		}
		hash = string(b)
	}
	tag, err := a.db.Exec(r.Context(), `
		UPDATE users SET full_name=$1, role=$2, station_id=$3, active=$4,
		  password_hash = CASE WHEN $5 = '' THEN password_hash ELSE $5 END
		WHERE id=$6`, in.FullName, in.Role, in.StationID, in.Active, hash, id)
	if err != nil {
		serverErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpErr(w, http.StatusNotFound, "ไม่พบผู้ใช้")
		return
	}
	// Any change to role/station/password/active must take effect immediately: drop existing sessions.
	if id != u.ID {
		a.db.Exec(r.Context(), `DELETE FROM sessions WHERE user_id=$1`, id)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
