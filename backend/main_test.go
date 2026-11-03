package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Needs a throwaway database: TEST_DATABASE_URL=postgres://.../police_test (all tables are wiped).
func testApp(t *testing.T) (*app, http.Handler) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	db.Exec(ctx, `DROP TABLE IF EXISTS system_settings, audit_log, suspects, sessions, users, stations CASCADE`)
	t.Setenv("ADMIN_USER", "boss")
	t.Setenv("ADMIN_PASSWORD", "boss-password")
	if err := setupDB(ctx, db); err != nil {
		t.Fatal(err)
	}
	a := &app{db: db, limiter: newLoginLimiter()}
	mux := http.NewServeMux()
	a.routes(mux)
	return a, mux
}

type client struct {
	t      *testing.T
	h      http.Handler
	cookie *http.Cookie
}

func (c *client) do(method, path string, body any) (int, []byte) {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(method, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if c.cookie != nil {
		req.AddCookie(c.cookie)
	}
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, req)
	for _, ck := range rec.Result().Cookies() {
		if ck.Name == "sid" {
			c.cookie = ck
		}
	}
	return rec.Code, rec.Body.Bytes()
}

func login(t *testing.T, h http.Handler, user, pass string) *client {
	c := &client{t: t, h: h}
	if code, body := c.do("POST", "/api/login", map[string]string{"username": user, "password": pass}); code != 200 {
		t.Fatalf("login %s: %d %s", user, code, body)
	}
	return c
}

// firstLogin logs in with an admin-issued password and replaces it, as the server requires.
func firstLogin(t *testing.T, h http.Handler, user, issued, own string) *client {
	c := login(t, h, user, issued)
	if code, b := c.do("POST", "/api/password", map[string]string{"current_password": issued, "new_password": own}); code != 200 {
		t.Fatalf("change password %s: %d %s", user, code, b)
	}
	return c
}

func TestPasswordFlows(t *testing.T) {
	_, h := testApp(t)
	boss := login(t, h, "boss", "boss-password")
	if code, b := boss.do("POST", "/api/users", map[string]any{"username": "newbie", "password": "issued-123", "full_name": "n", "role": "officer", "station_id": 1}); code != 201 {
		t.Fatalf("create: %d %s", code, b)
	}
	u := login(t, h, "newbie", "issued-123")
	var me struct {
		ID   int  `json:"id"`
		Must bool `json:"must_change_password"`
	}
	_, b := u.do("GET", "/api/me", nil)
	json.Unmarshal(b, &me)
	if !me.Must {
		t.Fatal("new account should be flagged must_change_password")
	}
	if code, _ := u.do("GET", "/api/suspects", nil); code != 403 {
		t.Fatalf("flagged account reaching data: want 403, got %d", code)
	}
	for _, bad := range []map[string]string{
		{"current_password": "wrong-pass", "new_password": "good-pass-1"},
		{"current_password": "issued-123", "new_password": "issued-123"},
		{"current_password": "issued-123", "new_password": "newbie"},
		{"current_password": "issued-123", "new_password": "short"},
	} {
		if code, _ := u.do("POST", "/api/password", bad); code != 400 {
			t.Fatalf("bad change %v: want 400, got %d", bad, code)
		}
	}
	if code, b := u.do("POST", "/api/password", map[string]string{"current_password": "issued-123", "new_password": "my-own-pass-9"}); code != 200 {
		t.Fatalf("change: %d %s", code, b)
	}
	if code, _ := u.do("GET", "/api/suspects", nil); code != 200 {
		t.Fatalf("after change: want 200, got %d", code)
	}
	if code, _ := (&client{t: t, h: h}).do("POST", "/api/login", map[string]string{"username": "newbie", "password": "issued-123"}); code != 401 {
		t.Fatalf("old password still works: %d", code)
	}

	// Forgot password: public request, same answer for unknown users, admin issues a temporary password.
	anon := &client{t: t, h: h}
	c1, b1 := anon.do("POST", "/api/password-reset-requests", map[string]string{"username": "newbie", "contact": "081"})
	c2, b2 := anon.do("POST", "/api/password-reset-requests", map[string]string{"username": "nobody-here", "contact": ""})
	if c1 != 200 || c2 != 200 || string(b1) != string(b2) {
		t.Fatalf("reset request must answer identically: %d %s / %d %s", c1, b1, c2, b2)
	}
	if code, _ := u.do("GET", "/api/password-reset-requests", nil); code != 403 {
		t.Fatalf("officer listing reset requests: want 403, got %d", code)
	}
	var reqs []struct {
		Username string `json:"username"`
		UserID   *int   `json:"user_id"`
	}
	_, b = boss.do("GET", "/api/password-reset-requests", nil)
	json.Unmarshal(b, &reqs)
	if len(reqs) != 2 {
		t.Fatalf("want 2 pending requests, got %s", b)
	}
	if code, _ := u.do("POST", "/api/users/"+strconv.Itoa(me.ID)+"/reset-password", nil); code != 403 {
		t.Fatalf("officer resetting a password: want 403, got %d", code)
	}
	var temp struct {
		Temp string `json:"temp_password"`
	}
	code, b := boss.do("POST", "/api/users/"+strconv.Itoa(me.ID)+"/reset-password", nil)
	json.Unmarshal(b, &temp)
	if code != 200 || len(temp.Temp) != 14 {
		t.Fatalf("reset: %d %s", code, b)
	}
	if code, _ := u.do("GET", "/api/me", nil); code != 401 {
		t.Fatalf("reset must sign the user out: got %d", code)
	}
	firstLogin(t, h, "newbie", temp.Temp, "after-reset-77")
	_, b = boss.do("GET", "/api/password-reset-requests", nil)
	json.Unmarshal(b, &reqs)
	if len(reqs) != 1 || reqs[0].UserID != nil {
		t.Fatalf("the user's request should be resolved, unknown one left: %s", b)
	}
}

func TestOfficerIsolation(t *testing.T) {
	_, h := testApp(t)
	boss := login(t, h, "boss", "boss-password")

	var stations []struct{ ID int }
	_, body := boss.do("GET", "/api/stations", nil)
	json.Unmarshal(body, &stations)
	if len(stations) < 2 {
		t.Fatal("need 2 stations")
	}
	sA, sB := stations[0].ID, stations[1].ID
	for name, st := range map[string]int{"offa": sA, "offb": sB} {
		if code, b := boss.do("POST", "/api/users", map[string]any{"username": name, "password": "password1", "full_name": name, "role": "officer", "station_id": st}); code != 201 {
			t.Fatalf("create user: %d %s", code, b)
		}
	}
	offA := firstLogin(t, h, "offa", "password1", "offa-own-pass")
	offB := firstLogin(t, h, "offb", "password1", "offb-own-pass")

	pin := map[string]any{"full_name": "นาย ก", "address": "1 ม.1", "charge": "ลักทรัพย์", "level": "red", "lat": 14.59, "lng": 100.45, "station_id": sB}
	code, body := offA.do("POST", "/api/suspects", pin)
	if code != 201 {
		t.Fatalf("create: %d %s", code, body)
	}
	var created struct{ ID int }
	json.Unmarshal(body, &created)
	path := "/api/suspects/" + strconv.Itoa(created.ID)

	list := func(c *client) []suspect {
		var out []suspect
		_, b := c.do("GET", "/api/suspects", nil)
		json.Unmarshal(b, &out)
		return out
	}
	// station_id in the body is ignored for officers: pin belongs to A.
	if got := list(offA); len(got) != 1 || got[0].StationID != sA {
		t.Fatalf("officer A should see own pin at station A, got %+v", got)
	}
	if got := list(offB); len(got) != 0 {
		t.Fatalf("officer B must not see A's pins, got %+v", got)
	}
	if got := list(boss); len(got) != 1 {
		t.Fatalf("commander should see all pins, got %+v", got)
	}
	if code, _ := offB.do("PUT", path, pin); code != 404 {
		t.Fatalf("officer B update A's pin: want 404, got %d", code)
	}
	if code, _ := offB.do("DELETE", path, nil); code != 404 {
		t.Fatalf("officer B delete A's pin: want 404, got %d", code)
	}
	if code, _ := offA.do("GET", "/api/users", nil); code != 403 {
		t.Fatalf("officer listing users: want 403, got %d", code)
	}
	if code, _ := offA.do("PUT", "/api/settings", map[string]string{"system_title": "hack"}); code != 403 {
		t.Fatalf("officer updating settings: want 403, got %d", code)
	}
	if code, _ := offA.do("PUT", "/api/stations/1", map[string]string{"name": "hack"}); code != 403 {
		t.Fatalf("officer updating station: want 403, got %d", code)
	}
	if code, _ := offA.do("POST", "/api/stations", map[string]string{"name": "hack"}); code != 403 {
		t.Fatalf("officer creating station: want 403, got %d", code)
	}
	if code, _ := offA.do("DELETE", "/api/stations/1", nil); code != 403 {
		t.Fatalf("officer deleting station: want 403, got %d", code)
	}
	// Boss creates new station
	var newSt struct {
		ID int `json:"id"`
	}
	if code, b := boss.do("POST", "/api/stations", map[string]string{"name": "สภ.ใหม่", "code": "NEW99"}); code != 201 {
		t.Fatalf("boss creating station: want 201, got %d %s", code, b)
	} else {
		json.Unmarshal(b, &newSt)
	}
	// Boss cannot delete station sA because it has users/suspects
	if code, _ := boss.do("DELETE", "/api/stations/"+strconv.Itoa(sA), nil); code != 400 {
		t.Fatalf("boss deleting non-empty station: want 400, got %d", code)
	}
	// Boss can delete the newly created empty station
	if code, _ := boss.do("DELETE", "/api/stations/"+strconv.Itoa(newSt.ID), nil); code != 200 {
		t.Fatalf("boss deleting empty station: want 200, got %d", code)
	}
	if code, _ := boss.do("PUT", "/api/settings", map[string]string{"system_title": "ระบบสืบสวน"}); code != 200 {
		t.Fatalf("boss updating settings: want 200, got %d", code)
	}
	if code, _ := boss.do("PUT", "/api/stations/"+strconv.Itoa(sA), map[string]string{"name": "สภ.ทดสอบ"}); code != 200 {
		t.Fatalf("boss updating station: want 200, got %d", code)
	}
	var dash []struct {
		StationID int `json:"station_id"`
	}
	_, b := offB.do("GET", "/api/dashboard", nil)
	json.Unmarshal(b, &dash)
	if len(dash) != 1 || dash[0].StationID != sB {
		t.Fatalf("officer dashboard must be own station only, got %s", b)
	}
	if code, _ := offA.do("DELETE", path, nil); code != 200 {
		t.Fatalf("officer A delete own pin: want 200, got %d", code)
	}
	if code, _ := (&client{t: t, h: h}).do("GET", "/api/suspects", nil); code != 401 {
		t.Fatalf("anonymous: want 401, got %d", code)
	}
	bad := map[string]any{"full_name": "x", "address": "x", "charge": "x", "level": "red", "lat": 13.7, "lng": 100.5}
	if code, _ := offA.do("POST", "/api/suspects", bad); code != 400 {
		t.Fatalf("pin outside Ang Thong: want 400, got %d", code)
	}
}
