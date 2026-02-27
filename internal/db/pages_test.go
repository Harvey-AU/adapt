package db

import "testing"

func TestNormaliseURLPathRejectsEmptyHost(t *testing.T) {
	_, _, err := normaliseURLPath("/relative", "")
	if err == nil {
		t.Fatal("expected error when host and fallback domain are empty")
	}
}
