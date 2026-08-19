package note

import (
	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Définition des contraintes spécifiques au domaine "Note"
var noteConstraints = map[string]services.ConstraintRule{
	"chk_note_positive":  {Field: "note", Message: "La note doit être positive"},
	"fk_notes_controles": {Field: "controle_id", Message: "Le contrôle n'existe pas"},
	// Filet de sécurité en base : la borne réelle est le barème de la
	// promotion, appliquée par validateNote avant l'écriture.
	"chk_note_max_absolu": {Field: "note", Message: "La note dépasse la valeur maximale autorisée"},
}

func CreateNote(w http.ResponseWriter, r *http.Request) {
	var input gen.Note
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	bareme, err := fetchBareme(r.Context(), queries, input.ControleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Contrôle introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if message := validateNote(input.Note, bareme); message != "" {
		services.InvalidRequestError(w, r, "erreur de validation des données de la note", services.VALIDATION_ERROR, noteFieldError(message))
		return
	}

	id, err := queries.CreateNote(r.Context(), gen.CreateNoteParams{
		Note:         input.Note,
		Remarque:     input.Remarque,
		UserID:       input.UserID,
		ControleID:   input.ControleID,
		IsValidated:  input.IsValidated,
		NotEvaluated: input.NotEvaluated,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, noteConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation des données de la note", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Note créée", "id", id)

	input.ID = id
	input.Version = 1
	render.Status(r, http.StatusCreated)
	render.JSON(w, r, input)
}

func FetchNote(w http.ResponseWriter, r *http.Request) {
	user := getNoteFromCtx(r)
	render.JSON(w, r, user)
}

func fetchGpaByUser(w http.ResponseWriter, r *http.Request) {
	uIDStr := r.URL.Query().Get("user_id")
	if uIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: user_id", services.MISSING_PARAM, nil)
		return
	}
	uID, err := strconv.Atoi(uIDStr)
	if err != nil || uID <= 0 {
		services.InvalidRequestError(w, r, "user_id invalide", services.INVALID_PARAM, nil)
		return
	}

	queries := getQueriesFromCtx(r)
	gpa, err := queries.FetchGpaByUserID(r.Context(), int32(uID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if gpa == nil {
		gpa = []gen.FetchGpaByUserIDRow{}
	}
	render.JSON(w, r, gpa)
}

func fetchNotesByUser(w http.ResponseWriter, r *http.Request) {
	uIDStr := r.URL.Query().Get("user_id")
	if uIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: user_id", services.MISSING_PARAM, nil)
		return
	}
	uID, err := strconv.Atoi(uIDStr)
	if err != nil || uID <= 0 {
		services.InvalidRequestError(w, r, "user_id invalide", services.INVALID_PARAM, nil)
		return
	}

	queries := getQueriesFromCtx(r)
	notes, err := queries.FetchNotesByUserID(r.Context(), int32(uID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if notes == nil {
		notes = []gen.FetchNotesByUserIDRow{}
	}
	render.JSON(w, r, notes)
}

func fetchControle(w http.ResponseWriter, r *http.Request) {

	cIDStr := r.URL.Query().Get("controle_id")
	if cIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: controle_id", services.MISSING_PARAM, nil)
		return
	}

	cID, errConv := strconv.Atoi(cIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "controle_id invalide", services.INVALID_PARAM, nil)
		return
	}

	queries := getQueriesFromCtx(r)
	// Vérification de l'existence du contrôle
	_, err := queries.CheckControleExists(r.Context(), int32(cID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Contrôle introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	notes, err := queries.FetchNotesByControleID(r.Context(), int32(cID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if notes == nil {
		notes = []gen.FetchNotesByControleIDRow{}
	}

	render.JSON(w, r, notes)
}

func fetchMatiere(w http.ResponseWriter, r *http.Request) {

	mIDStr := r.URL.Query().Get("matiere_id")
	if mIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: matiere_id", services.MISSING_PARAM, nil)
		return
	}

	mID, errConv := strconv.Atoi(mIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "matiere_id invalide", services.INVALID_PARAM, nil)
		return
	}

	queries := getQueriesFromCtx(r)
	// Vérification de l'existence de la matière
	_, err := queries.CheckMatiereExists(r.Context(), int32(mID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Matière introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	notes, err := queries.FetchNotesByMatiereID(r.Context(), int32(mID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if notes == nil {
		notes = []gen.FetchNotesByMatiereIDRow{}
	}

	render.JSON(w, r, notes)
}

func fetchUE(w http.ResponseWriter, r *http.Request) {

	ueIDStr := r.URL.Query().Get("unite_enseignement_id")
	if ueIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: unite_enseignement_id", services.MISSING_PARAM, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	ueID, errConv := strconv.Atoi(ueIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "unite_enseignement_id invalide", services.INVALID_PARAM, nil)
		return
	}

	// Vérification de l'existence de l'UE
	_, err := queries.CheckUniteEnseignementExists(r.Context(), int32(ueID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "UE introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	notes, err := queries.GetUeStats(r.Context(), int32(ueID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if notes == nil {
		notes = []gen.GetUeStatsRow{}
	}

	render.JSON(w, r, notes)
}

func fetchPeriode(w http.ResponseWriter, r *http.Request) {
	pIDStr := r.URL.Query().Get("periode_id")
	if pIDStr == "" {
		services.InvalidRequestError(w, r, "Paramètre manquant: periode_id", services.MISSING_PARAM, nil)
		return
	}
	queries := getQueriesFromCtx(r)

	pID, errConv := strconv.Atoi(pIDStr)
	if errConv != nil {
		services.InvalidRequestError(w, r, "periode_id invalide", services.INVALID_PARAM, nil)
		return
	}

	// Vérification de l'existence de la période
	_, err := queries.CheckPeriodeExists(r.Context(), int32(pID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Période introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	notes, err := queries.FetchNotesByPeriodeID(r.Context(), int32(pID))
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if notes == nil {
		notes = []gen.FetchNotesByPeriodeIDRow{}
	}

	render.JSON(w, r, notes)
}

func Update(w http.ResponseWriter, r *http.Request) {
	var input gen.Note
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	// Le contrôle est lu depuis la note en base (middleware NoteUse) et non
	// depuis le corps de la requête : le rattachement d'une note ne se modifie
	// pas, et le barème doit être celui de la note réellement visée.
	controleID := input.ControleID
	if existing := getNoteFromCtx(r); existing != nil {
		controleID = existing.ControleID
	}

	bareme, err := fetchBareme(r.Context(), queries, controleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			services.InvalidRequestError(w, r, "Contrôle introuvable", services.NOT_FOUND, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}
	if message := validateNote(input.Note, bareme); message != "" {
		services.InvalidRequestError(w, r, "erreur de validation", services.VALIDATION_ERROR, noteFieldError(message))
		return
	}

	version, err := queries.UpdateNote(r.Context(), gen.UpdateNoteParams{
		ID:           input.ID,
		Version:      input.Version,
		Note:         input.Note,
		Remarque:     input.Remarque,
		UserID:       input.UserID,
		IsValidated:  input.IsValidated,
		NotEvaluated: input.NotEvaluated,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, noteConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Note mise à jour", "id", input.ID)
	input.Version = version
	render.JSON(w, r, input)
}

type BulkDeleteRequest struct {
	IDs []int32 `json:"ids"`
}

func Delete(w http.ResponseWriter, r *http.Request) {
	var input BulkDeleteRequest
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	queries := getQueriesFromCtx(r)

	err := queries.DeleteNote(r.Context(), input.IDs)
	if err != nil {
		services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
		return
	}

	slog.Debug("Suppression des notes", "ids", input.IDs)
	w.WriteHeader(http.StatusNoContent)
}
