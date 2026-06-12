package extraction

import "strings"

// capitalize met la première lettre en majuscule, le reste en minuscule,
// et capitalise aussi la lettre qui suit un tiret (noms composés).
func capitalize(s string) string {
	if s == "" {
		return s
	}
	lower := strings.ToLower(s)
	var b strings.Builder
	afterHyphen := true
	for _, r := range lower {
		if afterHyphen {
			b.WriteString(strings.ToUpper(string(r)))
			afterHyphen = false
		} else {
			b.WriteRune(r)
		}
		if r == '-' || r == ' ' {
			afterHyphen = true
		}
	}
	return b.String()
}

type Prof struct {
	PR     string
	DET    string
	NOM    string
	PRENOM string
	MEL    string
}

func ExtractProf(content string) ([]Prof, error) {
	return getItems(content, createProf)
}

func createProf(items []string) *Prof {
	if items[0] != "PR" {
		return nil
	}
	prof := Prof{}
	for i := 0; i < len(items); i++ {
		switch items[i] {
		case "PR":
			prof.PR = items[i+1]

		case "DET":
			prof.DET = strings.TrimSpace(items[i+1])

		case "NOM":
			prof.NOM = capitalize(strings.TrimSpace(items[i+1]))

		case "PRENOM":
			prof.PRENOM = capitalize(strings.TrimSpace(items[i+1]))

		case "MEL":
			prof.MEL = strings.ToLower(strings.TrimSpace(items[i+1]))
		}

		i++
	}

	return &prof
}
