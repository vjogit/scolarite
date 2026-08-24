package note

import (
	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/render"
	"github.com/xuri/excelize/v2"
)

// La fiche de notes ne porte qu'une chose : des notes.
//
// Deux personnes s'en servent, à deux moments, et rien dans le fichier ne dit
// laquelle l'a rempli — l'import n'a pas à le savoir, une seule règle sert les
// deux passes :
//
//   - l'enseignant écrit des nombres, ou laisse vide ce qu'il n'a pas corrigé ;
//   - la gestionnaire, elle, sait *pourquoi* une note manque — élève hors du
//     groupe, ou absence justifiée — et le dit dans l'application, là où elle
//     peut aussi en consigner le motif.
//
// D'où la règle unique : **une cellule remplie affirme une note, une cellule
// vide n'affirme rien.** Une cellule vide ne crée pas, ne modifie pas, ne
// supprime pas. C'est ce qui rend l'import idempotent et une fiche partielle
// inoffensive.
//
// Auparavant une cellule vide valait `not_evaluated = true`. Une fiche à demi
// corrigée déclarait donc non évalués tous les élèves qu'elle listait, y
// compris ceux qui ne suivaient pas la matière — ce qui annulait leur moyenne
// de matière, propageait « N.E. » à l'UE entière et bloquait la délibération.
//
// Corollaire : `not_evaluated` est en lecture seule pour l'import. Il ne le
// pose plus, et il ne le lève pas non plus — voir `refuserFiche`.
type ImportFicheResult struct {
	ControleID int32 `json:"controle_id"`
	Created    int   `json:"created"`
	Updated    int   `json:"updated"`
	// Lignes sans note, laissées telles quelles. Ignorer est ici le cas
	// courant et non l'exception : le compte doit remonter à l'écran, sinon
	// une fiche de trente élèves dont trois sont notés s'annonce « 3 créées »
	// sans que rien ne dise ce qu'il est advenu des vingt-sept autres.
	Ignorees int `json:"ignorees"`
}

// Ce que porte la colonne D d'une ligne. Trois contenus, pas deux : le vide
// n'est pas une valeur particulière, c'est l'absence de valeur.
type contenuCellule int

const (
	celluleVide contenuCellule = iota
	celluleNote
	celluleIllisible
)

// Une ligne refusée, et pourquoi.
type anomalieFiche struct {
	message string
	// Contredit une décision déjà prise dans l'application, par opposition à
	// un défaut du fichier lui-même. Détermine le statut et le code du refus.
	conflit bool
}

// Une ligne validée, en attente d'écriture.
type ligneImportee struct {
	userID int32
	note   float32
}

func ImportFiche(w http.ResponseWriter, r *http.Request) {
	controleIDStr := r.URL.Query().Get("controle_id")
	if controleIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: controle_id", services.MISSING_PARAM, nil)
		return
	}
	expectedControleID, err := strconv.Atoi(controleIDStr)
	if err != nil || expectedControleID <= 0 {
		services.InvalidRequestError(w, r, "controle_id invalide", services.INVALID_PARAM, nil)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		services.InvalidRequestError(w, r, "fichier trop volumineux", services.FILE_TOO_LARGE, nil)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		services.InvalidRequestError(w, r, "fichier manquant (champ 'file')", services.FILE_MISSING, nil)
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".xlsx") {
		services.InvalidRequestError(w, r, "le fichier doit avoir l'extension .xlsx", services.INVALID_FILE_EXTENSION, nil)
		return
	}

	f, err := excelize.OpenReader(file)
	if err != nil {
		services.InvalidRequestError(w, r, "erreur de lecture du fichier Excel", services.INVALID_FILE, nil)
		return
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		services.InvalidRequestError(w, r, "le fichier ne contient aucune feuille", services.INVALID_FILE, nil)
		return
	}

	rows, err := f.GetRows(sheets[0])
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	// Ligne 6 (index 5) : "Controle id:  3"
	controleID, err := parseControleID(rows)
	if err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if controleID != int32(expectedControleID) {
		services.InvalidRequestError(w, r,
			fmt.Sprintf("le fichier correspond au contrôle %d, attendu %d", controleID, expectedControleID),
			services.INVALID_FILE, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Barème lu une seule fois pour tout le fichier : la borne est ensuite
	// comparée en mémoire, ligne par ligne, sans jointure supplémentaire.
	bareme, err := fetchBareme(r.Context(), queries, controleID)
	if err != nil {
		services.InternalServerError(w, r, "barème du contrôle introuvable", services.NO_INFORMATION, nil)
		return
	}

	// L'état actuel des notes du contrôle : il sert à distinguer création et
	// mise à jour, et à repérer les élèves déclarés non évalués.
	existingNotes, err := queries.FetchNotesByControleID(r.Context(), controleID)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	noteByUserID := make(map[int32]gen.FetchNotesByControleIDRow, len(existingNotes))
	for _, n := range existingNotes {
		noteByUserID[n.UserID] = n
	}

	aEcrire, anomalies, ignorees := lireFiche(rows, bareme, noteByUserID)

	// Passe 1 close : rien n'a encore été écrit, et « aucune note n'a été
	// importée » est vrai par construction plutôt que par le jeu d'un rollback.
	// C'est aussi ce qui permet de signaler *toutes* les lignes fautives d'un
	// coup : les conflits d'absence arrivent par paquets — une gestionnaire
	// marque cinq absents, l'enseignant note ses trente élèves — et refuser un
	// à un coûterait cinq allers-retours de fichier.
	if len(anomalies) > 0 {
		refuserFiche(w, r, anomalies)
		return
	}

	// Passe 2 : l'écriture, et elle seule, sous transaction.
	pgCtx := services.GetPgCtx(r.Context())
	tx, err := pgCtx.Db.Begin(r.Context())
	if err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("erreur début transaction: %v", err), services.NO_INFORMATION, nil)
		return
	}
	defer tx.Rollback(r.Context())

	qtx := queries.WithTx(tx)
	result := ImportFicheResult{ControleID: controleID, Ignorees: ignorees}

	for _, ligne := range aEcrire {
		note := ligne.note
		if existante, connue := noteByUserID[ligne.userID]; connue {
			// `remarque` et `is_validated` appartiennent à la gestionnaire :
			// l'import les reconduit sans les lire. `not_evaluated` est faux
			// ici, `lireFiche` ayant écarté le cas contraire.
			_, err = qtx.UpdateNote(r.Context(), gen.UpdateNoteParams{
				Note:         &note,
				Remarque:     existante.Remarque,
				UserID:       existante.UserID,
				IsValidated:  existante.IsValidated,
				NotEvaluated: existante.NotEvaluated,
				ID:           existante.ID,
				Version:      existante.Version,
			})
			if err != nil {
				slog.Error("import fiche : mise à jour impossible", "controle_id", controleID, "user_id", ligne.userID, "error", err)
				services.InternalServerError(w, r,
					fmt.Sprintf("échec de la mise à jour de la note de l'élève %d. Aucune note n'a été importée.", ligne.userID),
					services.NO_INFORMATION, nil)
				return
			}
			result.Updated++
			continue
		}

		_, err = qtx.CreateNote(r.Context(), gen.CreateNoteParams{
			Note:         &note,
			Remarque:     nil,
			UserID:       ligne.userID,
			ControleID:   controleID,
			IsValidated:  false,
			NotEvaluated: false,
		})
		if err != nil {
			slog.Error("import fiche : création impossible", "controle_id", controleID, "user_id", ligne.userID, "error", err)
			services.InternalServerError(w, r,
				fmt.Sprintf("échec de la création de la note de l'élève %d. Aucune note n'a été importée.", ligne.userID),
				services.NO_INFORMATION, nil)
			return
		}
		result.Created++
	}

	if err := tx.Commit(r.Context()); err != nil {
		services.InternalServerError(w, r, fmt.Sprintf("erreur commit transaction: %v", err), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Import fiche notes", "controle_id", controleID,
		"created", result.Created, "updated", result.Updated, "ignorees", result.Ignorees)
	render.JSON(w, r, result)
}

// lireFiche parcourt les lignes de données et les répartit en trois : ce qui
// s'écrira, ce qui refuse le fichier, et ce qu'on laisse tel quel. Fonction
// pure — c'est elle qui porte la règle, et elle se teste sans base.
func lireFiche(
	rows [][]string,
	bareme float32,
	noteByUserID map[int32]gen.FetchNotesByControleIDRow,
) (aEcrire []ligneImportee, anomalies []anomalieFiche, ignorees int) {
	// Les données commencent à la ligne 14 (index 13), après l'en-tête ligne 13
	const firstDataRow = 13
	if len(rows) <= firstDataRow {
		return nil, nil, 0
	}

	for offset, row := range rows[firstDataRow:] {
		if len(row) == 0 {
			continue
		}
		userID, err := strconv.Atoi(strings.TrimSpace(row[0]))
		if err != nil || userID <= 0 {
			continue // ligne non-données (stats, etc.)
		}
		// Numéro tel qu'il s'affiche dans le tableur, pour que le fichier soit
		// corrigeable sans relecture intégrale.
		ligne := firstDataRow + offset + 1

		contenu, valeur := lireCelluleNote(row)

		switch contenu {
		case celluleVide:
			// Le cœur de la règle : on ne touche à rien. Ni création, ni mise
			// à jour, ni suppression — et surtout pas de non-évaluation posée
			// au nom de quelqu'un qui n'a rien déclaré.
			ignorees++
			continue

		case celluleIllisible:
			// Le repli qui vivait ici — illisible vaut « non évalué » — était
			// une décision prise au nom de l'utilisateur à partir d'une faute
			// de frappe. Une note mal tapée doit se voir, pas se convertir.
			anomalies = append(anomalies, anomalieFiche{message: fmt.Sprintf(
				"Ligne %d : « %s » n'est pas une note. Laissez la cellule vide s'il n'y a pas de note.",
				ligne, strings.TrimSpace(row[3]))})
			continue
		}

		if message := validateNote(&valeur, bareme); message != "" {
			anomalies = append(anomalies, anomalieFiche{message: fmt.Sprintf(
				"Ligne %d : la note %s est refusée. %s.", ligne, formatDecimal(valeur), message)})
			continue
		}

		// Une note et une non-évaluation s'excluent : les trois requêtes de
		// calcul écartent les notes marquées non évaluées, si bien qu'écrire
		// l'une par-dessus l'autre produirait une ligne qui porte une note que
		// personne ne compte — une contradiction invisible.
		//
		// L'import ne tranche pas : la gestionnaire a déclaré cet élève non
		// évalué et elle sait pourquoi. Le fichier est refusé, et le motif
		// qu'elle a consigné accompagne le signalement — c'est l'information
		// qui permet d'arbitrer.
		if existante, connue := noteByUserID[int32(userID)]; connue && existante.NotEvaluated {
			// Forme inclusive courte : le genre n'est pas en base, et le
			// deviner sur un prénom serait se tromper un jour.
			anomalies = append(anomalies, anomalieFiche{conflit: true, message: fmt.Sprintf(
				"Ligne %d : %s est déclaré·e non évalué·e%s, mais la fiche porte la note %s.",
				ligne, nomEleve(existante), motifNonEvaluation(existante), formatDecimal(valeur))})
			continue
		}

		aEcrire = append(aEcrire, ligneImportee{userID: int32(userID), note: valeur})
	}

	return aEcrire, anomalies, ignorees
}

// refuserFiche compose un signalement unique et refuse l'import entier.
func refuserFiche(w http.ResponseWriter, r *http.Request, anomalies []anomalieFiche) {
	lignes := make([]string, 0, len(anomalies)+1)
	lignes = append(lignes, "Aucune note n'a été importée.")
	for _, a := range anomalies {
		lignes = append(lignes, "• "+a.message)
	}
	message := strings.Join(lignes, "\n")

	for _, a := range anomalies {
		if !a.conflit {
			continue
		}
		// Un conflit d'état n'est pas un défaut de fichier : la feuille est
		// bien formée, c'est ce qu'elle décrit qui contredit une décision déjà
		// prise. Le repli d'INVALID_FILE — « le fichier fourni est illisible »
		// — serait faux, et c'est précisément celui qu'on lirait si le message
		// rédigé ici n'arrivait pas jusqu'à l'écran.
		services.ConflictError(w, r, message, services.BUSINESS_CONFLICT,
			map[string]any{"reason": "note_sur_eleve_non_evalue"})
		return
	}

	services.InvalidRequestError(w, r, message, services.INVALID_FILE, nil)
}

// parseControleID extrait l'ID du contrôle depuis la ligne "Controle id:  3" (index 5).
func parseControleID(rows [][]string) (int32, error) {
	const controleIDRow = 5
	if len(rows) <= controleIDRow || len(rows[controleIDRow]) < 2 {
		return 0, fmt.Errorf("ligne 'Controle id' introuvable (ligne %d)", controleIDRow+1)
	}

	idStr := strings.TrimSpace(rows[controleIDRow][1])
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("controle_id invalide: %q", idStr)
	}
	return int32(id), nil
}

// lireCelluleNote lit la colonne D (index 3).
//
// La virgule est acceptée comme séparateur décimal : la fiche circule auprès
// d'enseignants francophones, et `12,5` tapé dans une cellule au format texte
// est la saisie normale, pas une faute. `strconv.ParseFloat` ne la connaît pas.
func lireCelluleNote(row []string) (contenuCellule, float32) {
	if len(row) < 4 {
		return celluleVide, 0
	}
	brut := strings.TrimSpace(row[3])
	if brut == "" {
		return celluleVide, 0
	}

	val, err := strconv.ParseFloat(strings.ReplaceAll(brut, ",", "."), 32)
	if err != nil {
		return celluleIllisible, 0
	}
	// Arrondi à 2 décimales
	return celluleNote, float32(math.Round(val*100) / 100)
}

// nomEleve : « Nguyen Chloé », ou l'identifiant à défaut de nom en base.
func nomEleve(n gen.FetchNotesByControleIDRow) string {
	parties := make([]string, 0, 2)
	if n.LastName != nil && strings.TrimSpace(*n.LastName) != "" {
		parties = append(parties, strings.TrimSpace(*n.LastName))
	}
	if n.FirstName != nil && strings.TrimSpace(*n.FirstName) != "" {
		parties = append(parties, strings.TrimSpace(*n.FirstName))
	}
	if len(parties) == 0 {
		return fmt.Sprintf("l'élève %d", n.UserID)
	}
	return strings.Join(parties, " ")
}

// motifNonEvaluation reprend la remarque saisie dans la grille : c'est là que
// la gestionnaire a consigné le pourquoi, et c'est ce qui rend le signalement
// arbitrable sans aller rouvrir l'écran.
func motifNonEvaluation(n gen.FetchNotesByControleIDRow) string {
	if n.Remarque == nil || strings.TrimSpace(*n.Remarque) == "" {
		return ""
	}
	return fmt.Sprintf(" (%s)", strings.TrimSpace(*n.Remarque))
}
