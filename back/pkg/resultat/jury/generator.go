package jury

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"os"
	"strings"
)

// ─────────────────────────────────────────────────────────────────────────────
// Modèles de données
// ─────────────────────────────────────────────────────────────────────────────

// Matiere représente une matière dans un module.
type Matiere struct {
	Nom        string // ex : "Algorithmique avancée"
	Evaluation string // A, B, C, D, E ou F
	Credits    string // ex : "3"
}

// Module représente un module pédagogique contenant plusieurs matières.
type Module struct {
	Nom      string    // ex : "Informatique fondamentale"
	Matieres []Matiere // matières du module
}

// Bulletin contient toutes les données nécessaires à la génération du bulletin.
type Bulletin struct {
	Nom    string
	Prenom string

	Modules              []Module
	NombreCreditsValides *float64
	NombreCreditsTotal   *float64
	GPA                  string

	ModulesNonValides          []string
	ModulesNonValidesPrecedent []string
	DecisionJury               string

	CumuleCredit     *float64
	CumulCreditTotal *float64
	GPACumule        string
	TOEIC            string

	// Champs fournis par la secrétaire
	EnteteLigne1   string
	EnteteLigne2   string
	EnteteLigne3   string
	EnteteLigne4   string
	EnteteLigne5   string
	Periode        string
	EnteteUE       string
	DateJury       string
	NomResponsable string
}

// ─────────────────────────────────────────────────────────────────────────────
// Générateur
// ─────────────────────────────────────────────────────────────────────────────

// Generator génère des bulletins à partir d'un template DOCX.
type Generator struct {
	templateBytes []byte // template lu une seule fois en mémoire
}

// NewGenerator crée un nouveau générateur et lit le template en mémoire.
func NewGenerator(templatePath string) (*Generator, error) {
	b, err := os.ReadFile(templatePath)
	if err != nil {
		return nil, fmt.Errorf("lecture du template : %w", err)
	}
	return &Generator{templateBytes: b}, nil
}

// NewGeneratorFromBytes crée un générateur à partir de bytes déjà chargés (ex: embed).
func NewGeneratorFromBytes(data []byte) *Generator {
	return &Generator{templateBytes: data}
}

// Generate produit un bulletin rempli et l'écrit dans outputPath.
func (g *Generator) Generate(b Bulletin, outputPath string) error {
	data, err := g.GenerateBytes(b)
	if err != nil {
		return err
	}
	return os.WriteFile(outputPath, data, 0644)
}

// GenerateBytes produit un bulletin rempli et le retourne en mémoire.
// C'est le point d'entrée central — Generate et GenerateJuryBulletinsZip l'utilisent tous les deux.
func (g *Generator) GenerateBytes(b Bulletin) ([]byte, error) {
	zipReader, err := zip.NewReader(
		bytes.NewReader(g.templateBytes),
		int64(len(g.templateBytes)),
	)
	if err != nil {
		return nil, fmt.Errorf("ouverture du ZIP : %w", err)
	}

	var buf bytes.Buffer
	zipWriter := zip.NewWriter(&buf)

	for _, f := range zipReader.File {
		rc, err := f.Open()
		if err != nil {
			return nil, fmt.Errorf("ouverture de %s : %w", f.Name, err)
		}
		content, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, fmt.Errorf("lecture de %s : %w", f.Name, err)
		}

		if f.Name == "word/document.xml" {
			content = []byte(g.processDocument(string(content), b))
		}

		w, err := zipWriter.Create(f.Name)
		if err != nil {
			return nil, fmt.Errorf("écriture de %s : %w", f.Name, err)
		}
		if _, err := w.Write(content); err != nil {
			return nil, fmt.Errorf("écriture du contenu de %s : %w", f.Name, err)
		}
	}

	if err := zipWriter.Close(); err != nil {
		return nil, fmt.Errorf("fermeture du ZIP : %w", err)
	}

	return buf.Bytes(), nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Traitement du XML
// ─────────────────────────────────────────────────────────────────────────────

func (g *Generator) processDocument(xml string, b Bulletin) string {
	xml = replaceVar(xml, "ENTETE_LIGNE_1", escapeXML(b.EnteteLigne1))
	xml = replaceVar(xml, "ENTETE_LIGNE_2", escapeXML(b.EnteteLigne2))
	xml = replaceVar(xml, "ENTETE_LIGNE_3", escapeXML(b.EnteteLigne3))
	xml = replaceVar(xml, "ENTETE_LIGNE_4", escapeXML(b.EnteteLigne4))
	xml = replaceVar(xml, "ENTETE_LIGNE_5", escapeXML(b.EnteteLigne5))
	xml = replaceVar(xml, "PERIODE", escapeXML(b.Periode))
	xml = replaceVar(xml, "ENTETE_UE", escapeXML(b.EnteteUE))
	xml = replaceVar(xml, "DATE_JURY", escapeXML(b.DateJury))
	xml = replaceVar(xml, "NOM_RESPONSABLE", escapeXML(b.NomResponsable))
	xml = replaceVar(xml, "NOM", escapeXML(b.Nom))
	xml = replaceVar(xml, "PRENOM", escapeXML(b.Prenom))
	xml = replaceVar(xml, "NOMBRE_CREDIT_VALIDE", float64OrDash(b.NombreCreditsValides))
	xml = replaceVar(xml, "NOMBRE_CREDIT_TOTAL", float64OrDash(b.NombreCreditsTotal))
	xml = replaceVar(xml, "GPA", escapeXML(b.GPA))
	xml = replaceVar(xml, "MODULE_NON_VALIDE", escapeXML(strings.Join(b.ModulesNonValides, "\n")))
	xml = replaceVar(xml, "MODULE_NON_VALIDE_PRECEDENT", escapeXML(strings.Join(b.ModulesNonValidesPrecedent, "\n")))
	xml = replaceVar(xml, "DECISION_JURY", escapeXML(b.DecisionJury))
	xml = replaceVar(xml, "CUMULE_CREDIT", float64OrDash(b.CumuleCredit))
	xml = replaceVar(xml, "CUMUL_CREDIT_TOTAL", float64OrDash(b.CumulCreditTotal))
	xml = replaceVar(xml, "GPA_CUMULE", escapeXML(b.GPACumule))
	xml = replaceVar(xml, "TOEIC", escapeXML(b.TOEIC))
	xml = g.replaceModulesRow(xml, b.Modules)
	return xml
}

func float64OrDash(v *float64) string {
	if v == nil {
		return "-"
	}
	return fmt.Sprintf("%0.2f", *v)
}

func replaceVar(xml, key, value string) string {
	return strings.ReplaceAll(xml, "${"+key+"}", value)
}

func (g *Generator) replaceModulesRow(xml string, modules []Module) string {
	const anchor = "NOM_MODULES"
	idx := strings.Index(xml, anchor)
	if idx == -1 {
		return xml
	}

	trStart := strings.LastIndex(xml[:idx], "<w:tr>")
	if trStart == -1 {
		return xml
	}
	trEnd := strings.Index(xml[trStart:], "</w:tr>") + trStart + len("</w:tr>")
	templateRow := xml[trStart:trEnd]

	// Filtrer les modules dont toutes les matières ont une évaluation "-" (pas de note)
	var filledModules []Module
	for _, mod := range modules {
		hasNote := false
		for _, mat := range mod.Matieres {
			if mat.Evaluation != "-" {
				hasNote = true
				break
			}
		}
		if hasNote {
			filledModules = append(filledModules, mod)
		}
	}

	const totalRows = 9

	// Construire les lignes remplies
	var rows strings.Builder
	for _, mod := range filledModules {
		rows.WriteString(buildModuleRow(mod, templateRow))
	}

	// Compléter avec des lignes vides jusqu'à atteindre totalRows
	emptyRow := buildEmptyRow(templateRow)
	for i := len(filledModules); i < totalRows; i++ {
		rows.WriteString(emptyRow)
	}

	// Supprimer toutes les lignes vides du template (on les a regénérées proprement)
	result := xml[:trStart] + rows.String() + xml[trEnd:]
	return removeEmptyRows(result, totalRows)
}

func buildModuleRow(mod Module, templateRow string) string {
	var cell1, cell2, cell3 strings.Builder

	cell1.WriteString(`<w:p><w:pPr><w:pStyle w:val="Contenudecadre"/>`)
	cell1.WriteString(`<w:spacing w:lineRule="auto" w:line="240" w:before="0" w:after="0"/>`)
	cell1.WriteString(`</w:pPr><w:r><w:rPr>`)
	cell1.WriteString(`<w:rFonts w:cs="Arial" w:ascii="Arial" w:hAnsi="Arial"/>`)
	cell1.WriteString(`<w:i/><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/>`)
	cell1.WriteString(`</w:rPr><w:t>` + escapeXML(mod.Nom) + `</w:t></w:r></w:p>`)

	for _, mat := range mod.Matieres {
		cell1.WriteString(`<w:p><w:pPr><w:pStyle w:val="Normal"/>`)
		cell1.WriteString(`<w:spacing w:lineRule="auto" w:line="240" w:before="0" w:after="0"/>`)
		cell1.WriteString(`<w:ind w:left="200"/></w:pPr><w:r><w:rPr>`)
		cell1.WriteString(`<w:rFonts w:cs="Arial" w:ascii="Arial" w:hAnsi="Arial"/>`)
		cell1.WriteString(`<w:sz w:val="18"/><w:szCs w:val="20"/>`)
		cell1.WriteString(`</w:rPr><w:t>` + escapeXML(mat.Nom) + `</w:t></w:r></w:p>`)

		for _, builder := range []*strings.Builder{&cell2, &cell3} {
			val := mat.Evaluation
			if builder == &cell3 {
				val = mat.Credits
				if mat.Evaluation == "F" {
					val = "-"
				}
			}
			builder.WriteString(`<w:p><w:pPr><w:pStyle w:val="Normal"/>`)
			builder.WriteString(`<w:spacing w:lineRule="auto" w:line="240" w:before="0" w:after="0"/>`)
			builder.WriteString(`<w:jc w:val="center"/></w:pPr><w:r><w:rPr>`)
			builder.WriteString(`<w:rFonts w:cs="Arial" w:ascii="Arial" w:hAnsi="Arial"/>`)
			builder.WriteString(`<w:sz w:val="18"/><w:szCs w:val="20"/>`)
			builder.WriteString(`</w:rPr><w:t>` + escapeXML(val) + `</w:t></w:r></w:p>`)
		}
	}

	row := replaceCellContent(templateRow, 0, cell1.String())
	row = replaceCellContent(row, 1, cell2.String())
	row = replaceCellContent(row, 2, cell3.String())
	return row
}

// buildEmptyRow génère une ligne de tableau vide en conservant la mise en forme du template.
func buildEmptyRow(templateRow string) string {
	emptyCell := `<w:p><w:pPr><w:pStyle w:val="Normal"/>` +
		`<w:spacing w:lineRule="auto" w:line="240" w:before="0" w:after="0"/>` +
		`</w:pPr></w:p>`

	row := replaceCellContent(templateRow, 0, emptyCell)
	row = replaceCellContent(row, 1, emptyCell)
	row = replaceCellContent(row, 2, emptyCell)
	return row
}

func replaceCellContent(rowXML string, cellIndex int, newContent string) string {
	pos := 0
	for i := 0; i <= cellIndex; i++ {
		next := strings.Index(rowXML[pos:], "<w:tc>")
		if next == -1 {
			return rowXML
		}
		if i < cellIndex {
			pos += next + len("<w:tc>")
		} else {
			pos += next
		}
	}

	tcStart := pos
	tcEnd := strings.Index(rowXML[tcStart:], "</w:tc>") + tcStart + len("</w:tc>")
	tcXML := rowXML[tcStart:tcEnd]

	tcPrEnd := strings.Index(tcXML, "</w:tcPr>")
	var header string
	if tcPrEnd != -1 {
		header = tcXML[:tcPrEnd+len("</w:tcPr>")]
	} else {
		header = "<w:tc>"
	}

	return rowXML[:tcStart] + header + newContent + "</w:tc>" + rowXML[tcEnd:]
}

func removeEmptyRows(xml string, maxToRemove int) string {
	removed := 0
	for removed < maxToRemove {
		idx := strings.Index(xml, "<w:tr>")
		if idx == -1 {
			break
		}
		end := strings.Index(xml[idx:], "</w:tr>") + idx + len("</w:tr>")
		if strings.TrimSpace(extractText(xml[idx:end])) == "" {
			xml = xml[:idx] + xml[end:]
			removed++
		} else {
			break
		}
	}
	return xml
}

func extractText(xml string) string {
	var sb strings.Builder
	for {
		start := strings.Index(xml, "<w:t")
		if start == -1 {
			break
		}
		gt := strings.Index(xml[start:], ">") + start
		end := strings.Index(xml[gt:], "</w:t>")
		if end == -1 {
			break
		}
		sb.WriteString(xml[gt+1 : gt+end])
		xml = xml[gt+end+len("</w:t>"):]
	}
	return sb.String()
}

func escapeXML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}
