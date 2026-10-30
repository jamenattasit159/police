package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"
)

func (a *app) getSettings(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT key, value FROM system_settings`)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	out := map[string]string{
		"system_title":    "ติดตามผู้ต้องหา",
		"system_org":      "ภ.จว.อ่างทอง",
		"system_subtitle": "ระบบสารสนเทศภูมิศาสตร์สืบสวน",
		"system_badge_url": "",
		"system_notice":   "",
	}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			serverErr(w, err)
			return
		}
		out[k] = v
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *app) updateSettings(w http.ResponseWriter, r *http.Request, u *user) {
	var in map[string]string
	// Allow up to 2MB to support compressed badge image data URLs
	if !decodeMax(w, r, &in, 2<<20) {
		return
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		serverErr(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	allowedKeys := map[string]bool{
		"system_title":    true,
		"system_org":      true,
		"system_subtitle": true,
		"system_badge_url": true,
		"system_notice":   true,
	}

	for k, v := range in {
		if !allowedKeys[k] {
			continue
		}
		if utf8.RuneCountInString(v) > 500_000 {
			httpErr(w, http.StatusBadRequest, "ข้อมูลมีขนาดใหญ่เกินไป")
			return
		}
		_, err := tx.Exec(r.Context(), `
			INSERT INTO system_settings (key, value) VALUES ($1, $2)
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
		`, k, v)
		if err != nil {
			serverErr(w, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		serverErr(w, err)
		return
	}
	a.audit(r, u.ID, "update_settings", nil, "updated system settings")
	a.getSettings(w, r)
}

func (a *app) updateStation(w http.ResponseWriter, r *http.Request, u *user) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		httpErr(w, http.StatusNotFound, "ไม่พบสถานีตำรวจ")
		return
	}
	var in struct {
		Name    string `json:"name"`
		Phone   string `json:"phone"`
		Address string `json:"address"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		httpErr(w, http.StatusBadRequest, "กรุณาระบุชื่อสถานีตำรวจ")
		return
	}
	if utf8.RuneCountInString(in.Name) > 200 {
		httpErr(w, http.StatusBadRequest, "ชื่อสถานียาวเกินไป")
		return
	}
	cmd, err := a.db.Exec(r.Context(), `
		UPDATE stations SET name = $1, phone = $2, address = $3 WHERE id = $4
	`, in.Name, strings.TrimSpace(in.Phone), strings.TrimSpace(in.Address), id)
	if err != nil {
		serverErr(w, err)
		return
	}
	if cmd.RowsAffected() == 0 {
		httpErr(w, http.StatusNotFound, "ไม่พบสถานีตำรวจ")
		return
	}
	a.audit(r, u.ID, "update_station", nil, "station_id="+strconv.Itoa(id)+" name="+in.Name)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id, "name": in.Name})
}

func (a *app) createStation(w http.ResponseWriter, r *http.Request, u *user) {
	var in struct {
		Code    string `json:"code"`
		Name    string `json:"name"`
		Phone   string `json:"phone"`
		Address string `json:"address"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Code = strings.ToUpper(strings.TrimSpace(in.Code))
	in.Phone = strings.TrimSpace(in.Phone)
	in.Address = strings.TrimSpace(in.Address)

	if in.Name == "" {
		httpErr(w, http.StatusBadRequest, "กรุณาระบุชื่อสถานีตำรวจ")
		return
	}
	if in.Code == "" {
		var maxID int
		_ = a.db.QueryRow(r.Context(), `SELECT COALESCE(MAX(id), 0) + 1 FROM stations`).Scan(&maxID)
		in.Code = "ST" + fmt.Sprintf("%02d", maxID)
	}

	if utf8.RuneCountInString(in.Name) > 200 || utf8.RuneCountInString(in.Code) > 30 {
		httpErr(w, http.StatusBadRequest, "ชื่อหรือรหัสสถานียาวเกินไป")
		return
	}

	var exists bool
	_ = a.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM stations WHERE code = $1)`, in.Code).Scan(&exists)
	if exists {
		httpErr(w, http.StatusBadRequest, "รหัสสถานีตำรวจ "+in.Code+" มีอยู่ในระบบแล้ว")
		return
	}

	var newID int
	err := a.db.QueryRow(r.Context(), `
		INSERT INTO stations (code, name, phone, address)
		VALUES ($1, $2, $3, $4) RETURNING id
	`, in.Code, in.Name, in.Phone, in.Address).Scan(&newID)
	if err != nil {
		serverErr(w, err)
		return
	}

	a.audit(r, u.ID, "create_station", nil, "station_id="+strconv.Itoa(newID)+" code="+in.Code+" name="+in.Name)
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":      newID,
		"code":    in.Code,
		"name":    in.Name,
		"phone":   in.Phone,
		"address": in.Address,
	})
}

func (a *app) deleteStation(w http.ResponseWriter, r *http.Request, u *user) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		httpErr(w, http.StatusNotFound, "ไม่พบสถานีตำรวจ")
		return
	}

	var code, name string
	err = a.db.QueryRow(r.Context(), `SELECT code, name FROM stations WHERE id = $1`, id).Scan(&code, &name)
	if err != nil {
		httpErr(w, http.StatusNotFound, "ไม่พบสถานีตำรวจ")
		return
	}

	var suspectCount int
	_ = a.db.QueryRow(r.Context(), `SELECT count(*) FROM suspects WHERE station_id = $1`, id).Scan(&suspectCount)
	if suspectCount > 0 {
		httpErr(w, http.StatusBadRequest, "ไม่สามารถลบ "+name+" ได้ เนื่องจากมีข้อมูลผู้ต้องหาจำนวน "+strconv.Itoa(suspectCount)+" คนผูกอยู่ กรุณาย้ายหรือลบข้อมูลผู้ต้องหาก่อน")
		return
	}

	var userCount int
	_ = a.db.QueryRow(r.Context(), `SELECT count(*) FROM users WHERE station_id = $1`, id).Scan(&userCount)
	if userCount > 0 {
		httpErr(w, http.StatusBadRequest, "ไม่สามารถลบ "+name+" ได้ เนื่องจากมีบัญชีผู้ใช้งานจำนวน "+strconv.Itoa(userCount)+" บัญชีผูกอยู่ กรุณาย้ายหรือลบบัญชีผู้ใช้งานก่อน")
		return
	}

	cmd, err := a.db.Exec(r.Context(), `DELETE FROM stations WHERE id = $1`, id)
	if err != nil {
		serverErr(w, err)
		return
	}
	if cmd.RowsAffected() == 0 {
		httpErr(w, http.StatusNotFound, "ไม่พบสถานีตำรวจ")
		return
	}

	a.audit(r, u.ID, "delete_station", nil, "station_id="+strconv.Itoa(id)+" code="+code+" name="+name)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id, "name": name})
}
