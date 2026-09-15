package syllabus

import (
	"context"
	"cyb-react/pkg/services"
	"cyb-react/pkg/syllabus/gen"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// RouteSyllabus monte le domaine sous /api/v0/syllabus : lecture sous
// CONSULTATION, écritures sous SYLLABUS_ECRITURE. La fiche se désigne par
// l'identifiant de la matière (relation 1-1), le syllabus de l'UE par celui
// de l'UE — le GET de l'UE (domaine structure) porte déjà ses deux champs.
// Le référentiel de compétences (lot 3) et la matrice de l'UE s'écrivent sous
// le même rôle de domaine : catalogue et matrices, une seule population.
func RouteSyllabus(r chi.Router) {
	lecture := services.RequireRole(services.RoleConsultation)
	ecriture := services.RequireRole(services.RoleSyllabusEcriture)

	r.Route("/matiere/{matiereID}", func(r chi.Router) {
		r.With(lecture, MatiereExiste).Get("/", FetchSyllabusMatiere)
		r.With(ecriture, MatiereExiste).Put("/", UpsertSyllabusMatiere)
	})

	r.Route("/ue/{ueID}", func(r chi.Router) {
		r.With(ecriture, UniteEnseignementUse).Put("/", UpdateUniteEnseignementSyllabus)
		// La matrice de compétences de l'UE (lot 3) : lecture symétrique du
		// remplacement intégral, sans verrou.
		r.With(lecture, UniteEnseignementUse).Get("/competences", FetchUeCompetences)
		r.With(ecriture, UniteEnseignementUse).Put("/competences", ReplaceUeCompetences)
	})

	// Le référentiel de compétences d'une formation (lot 3) : deux cycles CRUD
	// sur le modèle des entités de structure. `delete-impact` est déclaré
	// avant la route paramétrée pour ne pas être capté par l'identifiant ;
	// `DELETE /{id}` lit ses identifiants dans le corps (suppression groupée,
	// le front appelle `…/bulk`), comme partout ailleurs.
	r.Route("/bloc", func(r chi.Router) {
		r.With(lecture).Get("/", FetchBlocsByFormationID)
		r.With(ecriture).Post("/", CreateBloc)
		r.With(lecture).Post("/delete-impact", BlocDeleteImpact)
		r.Route("/{blocID}", func(r chi.Router) {
			r.With(lecture, BlocUse).Get("/", FetchBloc)
			r.With(ecriture, BlocUse).Put("/", UpdateBloc)
			r.With(ecriture).Delete("/", DeleteBlocs)
		})
	})

	r.Route("/competence", func(r chi.Router) {
		// `?bloc_id=` liste les compétences d'un bloc ; `?formation_id=` rend
		// le référentiel à plat de la formation, pour la matrice de l'UE.
		r.With(lecture).Get("/", FetchCompetences)
		r.With(ecriture).Post("/", CreateCompetence)
		r.With(lecture).Post("/delete-impact", CompetenceDeleteImpact)
		r.Route("/{competenceID}", func(r chi.Router) {
			r.With(lecture, CompetenceUse).Get("/", FetchCompetence)
			r.With(ecriture, CompetenceUse).Put("/", UpdateCompetence)
			r.With(ecriture).Delete("/", DeleteCompetences)
		})
	})
}

// FetchCompetences aiguille la liste selon son filtre : par bloc (le cycle
// CRUD) ou par formation (le référentiel à plat de la matrice).
func FetchCompetences(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Has("formation_id") {
		FetchReferentielByFormationID(w, r)
		return
	}
	FetchCompetencesByBlocID(w, r)
}

// MatiereExiste vérifie l'identifiant de matière de l'URL et le pose dans le
// contexte ; 404 si la matière n'existe pas.
func MatiereExiste(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(chi.URLParam(r, "matiereID"))
		if err != nil {
			services.InvalidRequestError(w, r, "identifiant de matière invalide", services.INVALID_PARAM, nil)
			return
		}

		queries := getQueriesFromCtx(r)
		if _, err := queries.CheckMatiereExists(r.Context(), int32(id)); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				services.InvalidRequestError(w, r, "Matiere introuvable", services.NOT_FOUND, nil)
				return
			}
			services.ServerError(w, r, err)
			return
		}

		ctx := context.WithValue(r.Context(), matiereIDContextKey, int32(id))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UniteEnseignementUse charge l'UE de l'URL dans le contexte ; 404 sinon.
func UniteEnseignementUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(chi.URLParam(r, "ueID"))
		if err != nil {
			services.InvalidRequestError(w, r, "identifiant d'UE invalide", services.INVALID_PARAM, nil)
			return
		}

		queries := getQueriesFromCtx(r)
		ue, err := queries.FetchUniteEnseignementById(r.Context(), int32(id))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				services.InvalidRequestError(w, r, "UniteEnseignement introuvable", services.NOT_FOUND, nil)
				return
			}
			services.ServerError(w, r, err)
			return
		}

		ctx := context.WithValue(r.Context(), ueContextKey, &ue)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var (
	matiereIDContextKey = &services.ContextKey{Name: "syllabus matiere id"}
	ueContextKey        = &services.ContextKey{Name: "syllabus ue"}
)

func getMatiereIDFromCtx(r *http.Request) int32 {
	id, ok := r.Context().Value(matiereIDContextKey).(int32)
	if !ok {
		slog.Warn("contexte matière absent")
	}
	return id
}

func getUniteEnseignementFromCtx(r *http.Request) *gen.UniteEnseignement {
	ue, ok := r.Context().Value(ueContextKey).(*gen.UniteEnseignement)
	if ok {
		return ue
	}
	slog.Warn("contexte ue absent")
	return &gen.UniteEnseignement{}
}
