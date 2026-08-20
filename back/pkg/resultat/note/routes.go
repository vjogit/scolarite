package note

import (
	"context"
	"cyb-react/pkg/resultat/note/gen"
	"cyb-react/pkg/services"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

func RouteNote(r chi.Router) {

	r.Post("/controle", func(w http.ResponseWriter, r *http.Request) {
		CreateNote(w, r)
	})

	r.Route("/controle/{noteID}", func(r chi.Router) {
		r.With(NoteUse).Get("/", FetchNote)
		r.With(NoteUse).Put("/", Update)
		r.Delete("/", Delete)
	})

	r.Get("/eleve", fetchNotesByUser)
	r.Get("/eleve/gpa", fetchGpaByUser)
	r.Get("/fiche/export", fetchFicheExport)
	r.Post("/fiche/import", ImportFiche)
	r.Get("/controle", fetchControle)
	r.Get("/grille", fetchGrille)
	r.Get("/matiere", fetchMatiere)
	r.Get("/periode", fetchPeriode)
	r.Get("/ue", fetchUE)
}

func NoteUse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		if noteID := chi.URLParam(r, "noteID"); noteID != "" {

			id, err := strconv.Atoi(noteID)
			if err != nil {
				services.InvalidRequestError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			queries := getQueriesFromCtx(r)
			note, err := queries.FetchNoteById(context.Background(), int32(id))
			if err == pgx.ErrNoRows {
				services.InvalidRequestError(w, r, "Note introuvable", services.NOT_FOUND, nil)
				return
			}
			if err != nil {
				services.InternalServerError(w, r, err.Error(), services.NO_INFORMATION, nil)
				return
			}

			ctx := setNoteFromCtx(r, &note)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		services.InvalidRequestError(w, r, "pas d'id utilisateur", services.MISSING_PARAM, nil)
	})
}

var getQueriesFromCtx = func(r *http.Request) *gen.Queries {
	pgCtx := services.GetPgCtx(r.Context())
	return gen.New(pgCtx.Db)
}

var NoteContextKey = &services.ContextKey{Name: "note key"}

func getNoteFromCtx(r *http.Request) *gen.FetchNoteByIdRow {
	note, ok := r.Context().Value(NoteContextKey).(*gen.FetchNoteByIdRow)
	if ok {
		return note
	}
	slog.Warn("contexte note inconnue")
	return nil
}

func setNoteFromCtx(r *http.Request, note *gen.FetchNoteByIdRow) context.Context {
	return context.WithValue(r.Context(), NoteContextKey, note)
}
