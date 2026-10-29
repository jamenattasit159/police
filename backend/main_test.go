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
	db.Exec(ctx, `DROP TABLE IF EXISTS audit_log, suspects, sessions, users, stations CASCADE`)
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
	offA := login(t, h, "offa", "password1")
	offB := login(t, h, "offb", "password1")

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
	var dash []struct{ StationID int `json:"station_id"` }
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
