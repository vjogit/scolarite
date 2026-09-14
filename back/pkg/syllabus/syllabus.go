// Package syllabus porte le contenu pédagogique attaché aux entités de
// structure : la fiche de la matière (syllabus_matiere, 1-1) et les deux
// champs syllabus de l'UE (description, responsable). Il ne recopie aucune
// donnée de structure — noms, matiere.heure, coeff, ects font référence — et
// n'en vérifie aucune cohérence : un écart entre matiere.heure et la
// ventilation horaire se signale à l'affichage, jamais ici. Ni registre, ni
// corbeille (périmètre négatif du chantier syllabus).
package syllabus

import (
	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus/gen"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/render"
	"github.com/jackc/pgx/v5"
)

// Contraintes SQL du domaine, mappées champ par champ. Le motif est un code :
// errorMessages.ts possède les mots.
var syllabusConstraints = map[string]services.ConstraintRule{
	"fk_syllabus_matiere_matiere":     {Field: "matiere_id", Motif: services.MotifReferenceInconnue},
	"fk_syllabus_matiere_responsable": {Field: "responsable_id", Motif: services.MotifReferenceInconnue},
	"fk_ue_responsable":               {Field: "responsable_id", Motif: services.MotifReferenceInconnue},

	"chk_syllabus_matiere_heures_cours_positive":     {Field: "heures_cours", Motif: services.MotifValeurNegative},
	"chk_syllabus_matiere_heures_cours_td_positive":  {Field: "heures_cours_td", Motif: services.MotifValeurNegative},
	"chk_syllabus_matiere_heures_td_positive":        {Field: "heures_td", Motif: services.MotifValeurNegative},
	"chk_syllabus_matiere_heures_tp_positive":        {Field: "heures_tp", Motif: services.MotifValeurNegative},
	"chk_syllabus_matiere_heures_projet_positive":    {Field: "heures_projet", Motif: services.MotifValeurNegative},
	"chk_syllabus_matiere_heures_autonomie_positive": {Field: "heures_autonomie", Motif: services.MotifValeurNegative},
	"chk_syllabus_matiere_heures_controle_positive":  {Field: "heures_controle", Motif: services.MotifValeurNegative},
	"chk_syllabus_matiere_heures_perso_positive":     {Field: "heures_perso", Motif: services.MotifValeurNegative},
}

// Borne haute d'une colonne NUMERIC(5,2). PostgreSQL refuse au-delà par un
// 22003 sans nom de colonne : impossible à mapper sur un champ après coup, la
// vérification se fait donc avant l'écriture, pour que la saisie reçoive un
// 400 ciblé et non un 500.
const heuresMax = 999.99

// heuresVentilation nomme chaque colonne horaire avec sa valeur : la même
// liste sert au contrôle de plage et documente l'ordre de la maquette.
func heuresVentilation(f *gen.SyllabusMatiere) map[string]*float64 {
	return map[string]*float64{
		"heures_cours":     f.HeuresCours,
		"heures_cours_td":  f.HeuresCoursTd,
		"heures_td":        f.HeuresTd,
		"heures_tp":        f.HeuresTp,
		"heures_projet":    f.HeuresProjet,
		"heures_autonomie": f.HeuresAutonomie,
		"heures_controle":  f.HeuresControle,
		"heures_perso":     f.HeuresPerso,
	}
}

func erreursPlage(f *gen.SyllabusMatiere) map[string]services.ConstraintError {
	errorsMap := map[string]services.ConstraintError{}
	for champ, v := range heuresVentilation(f) {
		if v != nil && *v > heuresMax {
			errorsMap[champ] = services.ConstraintError{Motif: services.MotifValeurHorsPlage}
		}
	}
	return errorsMap
}

// FetchSyllabusMatiere renvoie la fiche de la matière du contexte, ou une
// fiche vide (version 0, tous les champs nuls) si elle n'a jamais été écrite :
// la fiche « existe » toujours logiquement, il n'y a pas d'acte de création.
func FetchSyllabusMatiere(w http.ResponseWriter, r *http.Request) {
	matiereID := getMatiereIDFromCtx(r)
	queries := getQueriesFromCtx(r)

	fiche, err := queries.FetchSyllabusMatiereByMatiereID(r.Context(), matiereID)
	if errors.Is(err, pgx.ErrNoRows) {
		fiche = gen.SyllabusMatiere{MatiereID: matiereID, Version: 0}
		err = nil
	}
	if err != nil {
		services.ServerError(w, r, err)
		return
	}

	render.JSON(w, r, fiche)
}

// UpsertSyllabusMatiere écrit la fiche de la matière de l'URL — l'identifiant
// du chemin fait foi, celui du corps est ignoré. Insertion en version 1 si la
// fiche n'existe pas ; sinon mise à jour sous verrou optimiste (409 si la
// version reçue n'est plus celle en base).
func UpsertSyllabusMatiere(w http.ResponseWriter, r *http.Request) {
	var input gen.SyllabusMatiere
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	input.MatiereID = getMatiereIDFromCtx(r)

	if errorsMap := erreursPlage(&input); len(errorsMap) > 0 {
		services.InvalidRequestError(w, r, "erreur de validation de la fiche syllabus", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
		return
	}

	queries := getQueriesFromCtx(r)

	fiche, err := queries.UpsertSyllabusMatiere(r.Context(), gen.UpsertSyllabusMatiereParams{
		MatiereID:         input.MatiereID,
		Version:           input.Version,
		Contexte:          input.Contexte,
		Objectifs:         input.Objectifs,
		Prerequis:         input.Prerequis,
		Activites:         input.Activites,
		Evaluation:        input.Evaluation,
		PlanCours:         input.PlanCours,
		Ressources:        input.Ressources,
		DimensionSocioEnv: input.DimensionSocioEnv,
		HeuresCours:       input.HeuresCours,
		HeuresCoursTd:     input.HeuresCoursTd,
		HeuresTd:          input.HeuresTd,
		HeuresTp:          input.HeuresTp,
		HeuresProjet:      input.HeuresProjet,
		HeuresAutonomie:   input.HeuresAutonomie,
		HeuresControle:    input.HeuresControle,
		HeuresPerso:       input.HeuresPerso,
		ResponsableID:     input.ResponsableID,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, syllabusConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation de la fiche syllabus", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Fiche syllabus écrite", "matiere_id", fiche.MatiereID, "version", fiche.Version)
	render.JSON(w, r, fiche)
}

// UpdateUniteEnseignementSyllabus écrit description et responsable_id de l'UE
// du contexte, sous verrou optimiste, et renvoie l'UE complète. name, ects et
// academique restent au domaine STRUCTURE.
func UpdateUniteEnseignementSyllabus(w http.ResponseWriter, r *http.Request) {
	var input gen.UniteEnseignement
	if err := render.DecodeJSON(r.Body, &input); err != nil {
		services.InvalidRequestError(w, r, "corps de requête illisible", services.INVALID_BODY, nil)
		return
	}
	ue := getUniteEnseignementFromCtx(r)
	queries := getQueriesFromCtx(r)

	maj, err := queries.UpdateUniteEnseignementSyllabus(r.Context(), gen.UpdateUniteEnseignementSyllabusParams{
		ID:            ue.ID,
		Version:       input.Version,
		Description:   input.Description,
		ResponsableID: input.ResponsableID,
	})
	if err != nil {
		errorsMap := services.MapPgErrorToValidationErrors(err, syllabusConstraints)
		if len(errorsMap) > 0 {
			services.InvalidRequestError(w, r, "erreur de validation du syllabus de l'UE", services.VALIDATION_ERROR, map[string]interface{}{"errors": errorsMap})
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			services.ConflictError(w, r, "Conflit de modification", services.OPTIMISTIC_LOCKING_FAILURE, nil)
			return
		}
		services.ServerError(w, r, err)
		return
	}

	slog.Debug("Syllabus de l'UE mis à jour", "id", maj.ID, "version", maj.Version)
	render.JSON(w, r, maj)
}
