package registre

import (
	"cyb-react/pkg/registre/gen"
	"cyb-react/pkg/services"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/render"
)

func RouteRegistre(r chi.Router, cfg services.RegistreConfig) {
	lecture := services.RequireRole(services.RoleConsultation)
	// L'ancrage manuel et le dépôt de témoin sont réservés au composite ADMIN,
	// exprimé sans tester son nom : tous les rôles fonctionnels exigés.
	admin := services.RequireAllRoles(services.RolesFonctionnels...)

	// Vérification d'intégrité : recalcul de toute la chaîne. Une chaîne
	// brisée est un résultat, pas une erreur HTTP — l'écran doit l'afficher.
	r.With(lecture).Get("/verification", verifierChaine)

	// Droit d'accès (art. 15 RGPD) : tous les maillons portant un élève.
	r.With(lecture).Get("/eleve", extraireMaillonsEleve)

	// Ancrage RFC 3161 et témoins (portage rex-imt). Les dates des ancres
	// listées viennent de la base et ne sont pas une preuve — la preuve reste
	// les témoins externes.
	r.With(lecture).Get("/ancres", listerAncres)
	r.With(admin).Post("/ancrage", ancrerMaintenant(cfg))
	r.With(admin).Post("/verification-temoin", verifierTemoin(cfg))
	r.With(admin).Post("/temoin/renvoi/{ancreID}", renvoyerTemoin(cfg))
}

func verifierChaine(w http.ResponseWriter, r *http.Request) {
	pgCtx := services.GetPgCtx(r.Context())
	res, err := VerifierChaine(r.Context(), pgCtx.Db)
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	render.JSON(w, r, res)
}

func extraireMaillonsEleve(w http.ResponseWriter, r *http.Request) {
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

	pgCtx := services.GetPgCtx(r.Context())
	maillons, err := gen.New(pgCtx.Db).ListMaillonsByUser(r.Context(), int32(uID))
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	if maillons == nil {
		maillons = []gen.Registre{}
	}
	render.JSON(w, r, maillons)
}

// ancreItem est la vue d'une ancre pour l'écran d'administration : des
// repères (seq, date, TSA), jamais le jeton lui-même.
type ancreItem struct {
	ID          int64  `json:"id"`
	RegistreSeq int64  `json:"registre_seq"`
	CreatedAt   string `json:"created_at"`
	TsaUrl      string `json:"tsa_url"`
}

// listerAncres liste les ancres présentes en base. Pour la page de
// vérification d'un témoin, ce sont de simples repères temporels (intervalle
// entre témoins pour la dichotomie) : ces dates viennent de la base et ne
// constituent pas une preuve — la preuve reste les témoins externes.
// GET /registre/ancres
func listerAncres(w http.ResponseWriter, r *http.Request) {
	rows, err := gen.New(services.GetPgCtx(r.Context()).Db).ListAncres(r.Context())
	if err != nil {
		services.ServerError(w, r, err)
		return
	}
	items := make([]ancreItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, ancreItem{
			ID:          row.ID,
			RegistreSeq: row.RegistreSeq,
			CreatedAt:   row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z07:00"),
			TsaUrl:      row.TsaUrl,
		})
	}
	render.JSON(w, r, items)
}

type anchorResponse struct {
	Results []AnchorResult `json:"results"`
}

// ancrerMaintenant déclenche un ancrage TSA manuel sur le dernier maillon,
// puis l'envoi du témoin externe pour chaque nouvelle ancre. Un échec d'envoi
// ne fait pas échouer l'ancrage (l'ancre en base reste valide).
// POST /registre/ancrage
func ancrerMaintenant(cfg services.RegistreConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db := services.GetPgCtx(r.Context()).Db

		results, err := AnchorLast(r.Context(), db, cfg.Timestamp)
		if err != nil {
			services.ServerError(w, r, err)
			return
		}

		SendWitnesses(r.Context(), db, cfg.Witness, results)

		if results == nil {
			results = []AnchorResult{}
		}
		render.JSON(w, r, anchorResponse{Results: results})
	}
}

type verifyWitnessRequest struct {
	Token   string `json:"token"`
	TsaCert string `json:"tsa_cert"`
}

// verifierTemoin confronte un témoin RFC 3161 fourni par l'auditeur (jeton
// reçu par e-mail depuis la boîte externe) à l'état actuel du registre.
// Décodage tolérant du jeton (base64 avec sauts de ligne, PEM) ; le certificat
// TSA est optionnel, à défaut le CA racine caCertPath sert de confiance.
// Lecture seule : rien n'est écrit ni conservé.
// POST /registre/verification-temoin
func verifierTemoin(cfg services.RegistreConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req verifyWitnessRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			services.InvalidRequestError(w, r, "corps invalide", services.INVALID_BODY, nil)
			return
		}

		tokenDER, err := decodeWitnessToken([]byte(req.Token))
		if err != nil {
			services.InvalidRequestError(w, r, err.Error(), services.INVALID_FILE, nil)
			return
		}
		tsaCertPEM, err := decodeWitnessCert(req.TsaCert)
		if err != nil {
			services.InvalidRequestError(w, r, err.Error(), services.INVALID_FILE, nil)
			return
		}

		db := services.GetPgCtx(r.Context()).Db
		result, err := VerifyWitness(r.Context(), db, tokenDER, tsaCertPEM, cfg.Timestamp.CaCertPath)
		if err != nil {
			services.ServerError(w, r, err)
			return
		}
		render.JSON(w, r, result)
	}
}

// renvoyerTemoin retente l'envoi du témoin externe d'une ancre donnée
// (utile si le SMTP était indisponible). Idempotent : les destinataires déjà
// SENT sont ignorés.
// POST /registre/temoin/renvoi/{ancreID}
func renvoyerTemoin(cfg services.RegistreConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := chi.URLParam(r, "ancreID")
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil || id <= 0 {
			services.InvalidRequestError(w, r, "ancreID invalide", services.INVALID_PARAM, nil)
			return
		}

		db := services.GetPgCtx(r.Context()).Db
		report, err := SendWitnessForAnchor(r.Context(), db, cfg.Witness, id)
		if err != nil {
			services.ServerError(w, r, err)
			return
		}
		render.JSON(w, r, report)
	}
}
