package legacy

// Résolution par nom, dans le périmètre d'une correspondance de période :
// le chemin formation → promotion → option → période se lit dans les vues
// actives (invariant 9), par les requêtes des repositories de structure ; l'UE
// et la matière se cherchent parmi les enfants de ce chemin. La règle est
// l'égalité après normalisation — espaces réduits, casse ignorée — et rien
// d'autre : jamais de distance d'édition ni d'appariement flou. Ce qui ne
// s'apparie pas se rejette, le fichier d'exceptions tranche à la main.

import (
	"context"
	"fmt"
	"strings"

	formationgen "cyb-react/pkg/structure/formation/gen"
	matieregen "cyb-react/pkg/structure/matiere/gen"
	optiongen "cyb-react/pkg/structure/option/gen"
	periodegen "cyb-react/pkg/structure/periode/gen"
	promotiongen "cyb-react/pkg/structure/promotion/gen"
	uegen "cyb-react/pkg/structure/unite_enseignement/gen"
	"cyb-react/pkg/syllabus/gen"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Normaliser est la seule transformation appliquée avant comparaison :
// espaces (y compris insécables) réduits à un seul, casse ignorée.
func Normaliser(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

// resultat d'une recherche par nom.
type appariement int

const (
	absent appariement = iota
	trouve
	ambigu
)

// chercher rend l'index de l'unique élément dont le nom normalisé égale la
// cible, ou l'état absent/ambigu.
func chercher(noms []string, cible string) (int, appariement) {
	c := Normaliser(cible)
	if c == "" {
		return -1, absent
	}
	idx, n := -1, 0
	for i, nom := range noms {
		if Normaliser(nom) == c {
			idx = i
			n++
		}
	}
	switch n {
	case 0:
		return -1, absent
	case 1:
		return idx, trouve
	}
	return -1, ambigu
}

// cible est une période scolarite résolue, avec ses UE et leurs matières,
// chargées une fois pour toute la correspondance.
type cible struct {
	FormationID   int32
	FormationName string
	PeriodeID     int32
	Chemin        string // « Formation › Promotion › Option › Période », pour le rapport
	UEs           []uegen.UniteEnseignement
	Matieres      map[int32][]matieregen.Matiere // par UE
}

// blocCible est un bloc scolarite résolu depuis une correspondance : ses
// compétences par position.
type blocCible struct {
	FormationID   int32
	FormationName string
	Bloc          gen.BlocCompetence
	Competences   map[int32]gen.Competence // par ordre
}

// resolveur tient les lectures de structure et de référentiel, sans écriture.
type resolveur struct {
	ctx        context.Context
	pool       *pgxpool.Pool
	formations []formationgen.FormationActive
}

func nouveauResolveur(ctx context.Context, pool *pgxpool.Pool) (*resolveur, error) {
	formations, err := formationgen.New(pool).FetchAllFormation(ctx)
	if err != nil {
		return nil, fmt.Errorf("lecture des formations : %w", err)
	}
	return &resolveur{ctx: ctx, pool: pool, formations: formations}, nil
}

// erreurCorrespondance : un des quatre noms du chemin n'existe pas, ou existe
// plusieurs fois. Le message nomme le niveau, pour le rapport.
type erreurCorrespondance struct{ detail string }

func (e *erreurCorrespondance) Error() string { return e.detail }

func niveau(nom string, valeur string, etat appariement) error {
	if etat == ambigu {
		return &erreurCorrespondance{fmt.Sprintf("%s « %s » : plusieurs entités actives portent ce nom", nom, valeur)}
	}
	return &erreurCorrespondance{fmt.Sprintf("%s « %s » introuvable parmi les entités actives", nom, valeur)}
}

func (r *resolveur) formation(nom string) (formationgen.FormationActive, error) {
	noms := make([]string, len(r.formations))
	for i, f := range r.formations {
		noms[i] = f.Name
	}
	i, etat := chercher(noms, nom)
	if etat != trouve {
		return formationgen.FormationActive{}, niveau("formation", nom, etat)
	}
	return r.formations[i], nil
}

// periode résout le chemin complet d'une correspondance et charge UE et
// matières de la période trouvée.
func (r *resolveur) periode(c CorrespondancePeriode) (*cible, error) {
	f, err := r.formation(c.Formation)
	if err != nil {
		return nil, err
	}
	promotions, err := promotiongen.New(r.pool).FetchPromotionsByFormationID(r.ctx, f.ID)
	if err != nil {
		return nil, err
	}
	nomsP := make([]string, len(promotions))
	for i, p := range promotions {
		nomsP[i] = p.Name
	}
	ip, etat := chercher(nomsP, c.Promotion)
	if etat != trouve {
		return nil, niveau("promotion", c.Promotion, etat)
	}
	options, err := optiongen.New(r.pool).FetchOptionsByPromotionID(r.ctx, promotions[ip].ID)
	if err != nil {
		return nil, err
	}
	nomsO := make([]string, len(options))
	for i, o := range options {
		nomsO[i] = o.Name
	}
	io, etat := chercher(nomsO, c.Option)
	if etat != trouve {
		return nil, niveau("option", c.Option, etat)
	}
	periodes, err := periodegen.New(r.pool).FetchPeriodesByOptionID(r.ctx, options[io].ID)
	if err != nil {
		return nil, err
	}
	nomsPe := make([]string, len(periodes))
	for i, p := range periodes {
		nomsPe[i] = p.Name
	}
	ipe, etat := chercher(nomsPe, c.Cible)
	if etat != trouve {
		return nil, niveau("période", c.Cible, etat)
	}
	t := &cible{
		FormationID:   f.ID,
		FormationName: f.Name,
		PeriodeID:     periodes[ipe].ID,
		Chemin:        fmt.Sprintf("%s › %s › %s › %s", f.Name, promotions[ip].Name, options[io].Name, periodes[ipe].Name),
		Matieres:      map[int32][]matieregen.Matiere{},
	}
	if t.UEs, err = uegen.New(r.pool).FetchUniteEnseignementsByPeriodeID(r.ctx, t.PeriodeID); err != nil {
		return nil, err
	}
	for _, ue := range t.UEs {
		if t.Matieres[ue.ID], err = matieregen.New(r.pool).FetchMatieresByUniteEnseignementID(r.ctx, ue.ID); err != nil {
			return nil, err
		}
	}
	return t, nil
}

// bloc résout une correspondance de bloc : la formation par nom, le bloc par
// ordre dans son référentiel, ses compétences par ordre.
func (r *resolveur) bloc(c CorrespondanceBloc) (*blocCible, error) {
	f, err := r.formation(c.Formation)
	if err != nil {
		return nil, err
	}
	queries := gen.New(r.pool)
	blocs, err := queries.FetchBlocsByFormationID(r.ctx, f.ID)
	if err != nil {
		return nil, err
	}
	for _, b := range blocs {
		if b.Ordre != c.Ordre {
			continue
		}
		competences, err := queries.FetchCompetencesByBlocID(r.ctx, b.ID)
		if err != nil {
			return nil, err
		}
		t := &blocCible{FormationID: f.ID, FormationName: f.Name, Bloc: b, Competences: map[int32]gen.Competence{}}
		for _, cp := range competences {
			t.Competences[cp.Ordre] = cp
		}
		return t, nil
	}
	return nil, &erreurCorrespondance{fmt.Sprintf("formation « %s » : aucun bloc en position %d dans son référentiel", f.Name, c.Ordre)}
}

// ue cherche l'UE d'un groupe tiers dans la période cible : exception, puis
// le code, puis le libellé (unique). Le nom retenu pour le rapport suit.
func (t *cible) ue(exception string, code string, libelle string) (*uegen.UniteEnseignement, appariement) {
	noms := make([]string, len(t.UEs))
	for i, ue := range t.UEs {
		noms[i] = ue.Name
	}
	if exception != "" {
		i, etat := chercher(noms, exception)
		if etat == trouve {
			return &t.UEs[i], trouve
		}
		return nil, etat
	}
	if i, etat := chercher(noms, code); etat == trouve {
		return &t.UEs[i], trouve
	}
	i, etat := chercher(noms, libelle)
	if etat == trouve {
		return &t.UEs[i], trouve
	}
	return nil, etat
}

func (t *cible) matiere(ue *uegen.UniteEnseignement, exception string, libelle string) (*matieregen.Matiere, appariement) {
	matieres := t.Matieres[ue.ID]
	noms := make([]string, len(matieres))
	for i, m := range matieres {
		noms[i] = m.Name
	}
	recherche := libelle
	if exception != "" {
		recherche = exception
	}
	i, etat := chercher(noms, recherche)
	if etat == trouve {
		return &matieres[i], trouve
	}
	return nil, etat
}
