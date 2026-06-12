package extraction

import (
	"bufio"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

type GroupeData struct {
	Id          int           `json:"id"`
	Promotion   string        `json:"promotion"`
	Groupe      string        `json:"groupe"`
	Matiere     string        `json:"matiere"`
	Controle    string        `json:"controle"`
	Coefficient string        `json:"coefficient"`
	Eleves      []EleveGroupe `json:"eleves"`
}

type EleveGroupe struct {
	NumEtudiant int    `json:"num_etudiant"`
	Nom         string `json:"nom"`
	Prenom      string `json:"prenom"`
	Promotion   string `json:"promotion"`
	Groupe      string `json:"groupe"`
}

var metaRegex = regexp.MustCompile(`Promotion :\s*([^\t]*)\s*Groupe :\s*([^\t]*)\s*Matière :\s*([^\t]*)\s*Contrôle :\s*([^\t]*)\s*Coefficient :\s*([^\t]*)`)
var eleveRegex = regexp.MustCompile(`^(\d+)\t([^\t]+)\t([^\t]+)`)

func ExtractGroupe(baseURL string) ([]GroupeData, error) {
	var groupes []GroupeData
	for i := range 2000 {
		url := fmt.Sprintf(baseURL+"/cybema/cgi-bin/cgihtml.exe?TYPE=listegroupe_html&GRCLEUNIK=%d&MODE=10", i)
		content, err := GetDataWithResty(url)
		if err != nil {
			return nil, err
		}
		if len(content) == 0 {
			continue
		}
		data, err := parseGroupe(i, content)
		if err != nil {
			return nil, err
		}
		groupes = append(groupes, data)
	}
	return groupes, nil
}

func parseGroupe(index int, rawData string) (GroupeData, error) {
	scanner := bufio.NewScanner(strings.NewReader(rawData))
	ligneCompteur := 0
	meta := GroupeData{}

	for scanner.Scan() {
		ligne := scanner.Text()
		ligneCompteur++

		if ligneCompteur == 1 {
			matches := metaRegex.FindStringSubmatch(ligne)
			if len(matches) == 6 {
				meta.Id = index
				meta.Promotion = strings.TrimSpace(matches[1])
				meta.Groupe = strings.TrimSpace(matches[2])
				meta.Matiere = strings.TrimSpace(matches[3])
				meta.Controle = strings.TrimSpace(matches[4])
				meta.Coefficient = strings.TrimSpace(matches[5])
				fmt.Printf("%d:  ✅ Promotion=%s, Groupe=%s\n", index, meta.Promotion, meta.Groupe)
			} else {
				fmt.Printf("%d: ❌ Erreur d'analyse des métadonnées.\n", index)
			}
			continue
		}

		if ligneCompteur == 2 {
			continue
		}

		matches := eleveRegex.FindStringSubmatch(ligne)
		if len(matches) == 4 {
			numEtudiant, err := strconv.Atoi(matches[1])
			if err != nil {
				fmt.Printf("❌ Erreur de conversion du numéro étudiant %s: %v\n", matches[1], err)
				continue
			}
			meta.Eleves = append(meta.Eleves, EleveGroupe{
				NumEtudiant: numEtudiant,
				Nom:         matches[2],
				Prenom:      matches[3],
				Promotion:   meta.Promotion,
				Groupe:      meta.Groupe,
			})
		}
	}

	return meta, nil
}
