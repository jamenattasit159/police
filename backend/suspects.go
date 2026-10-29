package main

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type suspect struct {
	ID          int       `json:"id"`
	StationID   int       `json:"station_id"`
	StationName string    `json:"station_name"`
	FullName    string    `json:"full_name"`
	CitizenID   string    `json:"citizen_id"`
	Address     string    `json:"address"`
	Charge      string    `json:"charge"`
	Level       string    `json:"level"`
	Lat         float64   `json:"lat"`
	Lng         float64   `json:"lng"`
	Note        string    `json:"note"`
	CreatedBy   string    `json:"created_by"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type suspectInput struct {
	StationID int     `json:"station_id"` // only honoured for commander/inspector
	FullName  string  `json:"full_name"`
	CitizenID string  `json:"citizen_id"`
	Address   string  `json:"address"`
	Charge    string  `json:"charge"`
	Level     string  `json:"level"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Note      string  `json:"note"`
}

// validate trims fields and returns a Thai error message, or "" when valid.
func (in *suspectInput) validate() string {
	for _, f := range []*string{&in.FullName, &in.CitizenID, &in.Address, &in.Charge, &in.Note} {
		*f = strings.TrimSpace(*f)
	}
	var digits strings.Builder
	for _, r := range in.CitizenID {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	in.CitizenID = digits.String()
	if len(in.CitizenID) > 0 && len(in.CitizenID) != 13 {
		return "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก"
	}
	switch {
	case in.FullName == "" || in.Address == "" || in.Charge == "":
		return "กรุณากรอกชื่อ ที่อยู่ และข้อหา"
	case utf8.RuneCountInString(in.FullName) > 200 || utf8.RuneCountInString(in.Address) > 500 ||
		utf8.RuneCountInString(in.Charge) > 500 || utf8.RuneCountInString(in.Note) > 2000:
		return "ข้อความยาวเกินไป"
	case in.Level != "red" && in.Level != "orange" && in.Level != "yellow":
		return "ระดับสีไม่ถูกต้อง"
	case in.Lat < 14.0 || in.Lat > 15.2 || in.Lng < 99.9 || in.Lng > 100.9: // loose box around Ang Thong
		return "ตำแหน่งอยู่นอกพื้นที่จังหวัดอ่างทอง"
	}
	return ""
}

// stationFor decides which station a write applies to: officers are pinned to their own station.
func stationFor(u *user, in *suspectInput) int {
	if u.isAdmin() {
		return in.StationID
	}
	return *u.StationID
}

// scope returns a SQL condition + arg restricting officers to their own station.
// Every suspects query must go through this.
func scope(u *user, col string, argN int) (string, []any) {
	if u.isAdmin() {
		return "TRUE", nil
	}
	return col + " = $" + strconv.Itoa(argN), []any{*u.StationID}
}

func (a *app) listSuspects(w http.ResponseWriter, r *http.Request, u *user) {
	cond, args := scope(u, "x.station_id", 1)
	rows, err := a.db.Query(r.Context(), `
		SELECT x.id, x.station_id, s.name, x.full_name, x.citizen_id, x.address, x.charge, x.level, x.lat, x.lng, x.note, c.full_name, x.updated_at
		FROM suspects x JOIN stations s ON s.id = x.station_id JOIN users c ON c.id = x.created_by
		WHERE `+cond+` ORDER BY x.updated_at DESC`, args...)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	out := []suspect{}
	for rows.Next() {
		var s suspect
		if err := rows.Scan(&s.ID, &s.StationID, &s.StationName, &s.FullName, &s.CitizenID, &s.Address, &s.Charge, &s.Level,
			&s.Lat, &s.Lng, &s.Note, &s.CreatedBy, &s.UpdatedAt); err != nil {
			serverErr(w, err)
			return
		}
		out = append(out, s)
	}
	if rows.Err() != nil {
		serverErr(w, rows.Err())
		return
	}
	a.audit(r, u.ID, "list_suspects", nil)
	writeJSON(w, http.StatusOK, out)
}

func (a *app) createSuspect(w http.ResponseWriter, r *http.Request, u *user) {
	var in suspectInput
	if !decode(w, r, &in) {
		return
	}
	if msg := in.validate(); msg != "" {
		httpErr(w, http.StatusBadRequest, msg)
		return
	}
	var id int
	err := a.db.QueryRow(r.Context(), `
		INSERT INTO suspects (station_id, full_name, citizen_id, address, charge, level, lat, lng, note, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
		stationFor(u, &in), in.FullName, in.CitizenID, in.Address, in.Charge, in.Level, in.Lat, in.Lng, in.Note, u.ID).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") {
			httpErr(w, http.StatusBadRequest, "กรุณาเลือก สภ.")
			return
		}
		serverErr(w, err)
		return
	}
	a.audit(r, u.ID, "create", &id)
	writeJSON(w, http.StatusCreated, map[string]int{"id": id})
}

func (a *app) updateSuspect(w http.ResponseWriter, r *http.Request, u *user) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpErr(w, http.StatusNotFound, "ไม่พบข้อมูล")
		return
	}
	var in suspectInput
	if !decode(w, r, &in) {
		return
	}
	if msg := in.validate(); msg != "" {
		httpErr(w, http.StatusBadRequest, msg)
		return
	}
	cond, extra := scope(u, "station_id", 11)
	tag, err := a.db.Exec(r.Context(), `
		UPDATE suspects SET station_id=$1, full_name=$2, citizen_id=$3, address=$4, charge=$5, level=$6, lat=$7, lng=$8, note=$9, updated_at=now()
		WHERE id=$10 AND `+cond,
		append([]any{stationFor(u, &in), in.FullName, in.CitizenID, in.Address, in.Charge, in.Level, in.Lat, in.Lng, in.Note, id}, extra...)...)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") {
			httpErr(w, http.StatusBadRequest, "กรุณาเลือก สภ.")
			return
		}
		serverErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpErr(w, http.StatusNotFound, "ไม่พบข้อมูล")
		return
	}
	a.audit(r, u.ID, "update", &id)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *app) deleteSuspect(w http.ResponseWriter, r *http.Request, u *user) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		httpErr(w, http.StatusNotFound, "ไม่พบข้อมูล")
		return
	}
	cond, extra := scope(u, "station_id", 2)
	tag, err := a.db.Exec(r.Context(), `DELETE FROM suspects WHERE id=$1 AND `+cond, append([]any{id}, extra...)...)
	if err != nil {
		serverErr(w, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpErr(w, http.StatusNotFound, "ไม่พบข้อมูล")
		return
	}
	a.audit(r, u.ID, "delete", &id)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *app) dashboard(w http.ResponseWriter, r *http.Request, u *user) {
	cond, args := scope(u, "s.id", 1)
	rows, err := a.db.Query(r.Context(), `
		SELECT s.id, s.name,
		  count(*) FILTER (WHERE x.level='red'), count(*) FILTER (WHERE x.level='orange'), count(*) FILTER (WHERE x.level='yellow')
		FROM stations s LEFT JOIN suspects x ON x.station_id = s.id
		WHERE `+cond+` GROUP BY s.id, s.name ORDER BY s.code`, args...)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	type row struct {
		StationID   int    `json:"station_id"`
		StationName string `json:"station_name"`
		Red         int    `json:"red"`
		Orange      int    `json:"orange"`
		Yellow      int    `json:"yellow"`
	}
	out := []row{}
	for rows.Next() {
		var x row
		if err := rows.Scan(&x.StationID, &x.StationName, &x.Red, &x.Orange, &x.Yellow); err != nil {
			serverErr(w, err)
			return
		}
		out = append(out, x)
	}
	if rows.Err() != nil {
		serverErr(w, rows.Err())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *app) listStations(w http.ResponseWriter, r *http.Request, u *user) {
	rows, err := a.db.Query(r.Context(), `SELECT id, code, name FROM stations ORDER BY code`)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	type station struct {
		ID   int    `json:"id"`
		Code string `json:"code"`
		Name string `json:"name"`
	}
	out := []station{}
	for rows.Next() {
		var s station
		if err := rows.Scan(&s.ID, &s.Code, &s.Name); err != nil {
			serverErr(w, err)
			return
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, out)
}
