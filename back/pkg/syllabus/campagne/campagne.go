// Package campagne traduit par lot le contenu syllabus d'une promotion (lot 6)
// — le moteur du CLI syllabus-translate, calqué sur l'import du legacy :
// simulation par défaut, continuer-et-rapporter, rapport identique dans les
// deux modes, idempotence.
//
// Idempotence par empreinte : une traduction dont l'empreinte_source est celle
// de la source courante est à jour et n'est pas retraduite — relancer la
// campagne ne coûte que ce qui a changé. Une traduction automatique périmée
// est retraduite. Une traduction RELUE périmée ne l'est pas sans
// --retraduire-relues : retraduire fait perdre « relue », et le travail d'un
// rédacteur ne s'écrase pas par défaut — elle est rapportée, à reprendre à
// l'écran.
//
// La simulation APPELLE le traducteur (c'est elle qui produit le comparatif
// de qualité) et n'écrit rien en base. Chaque fiche et chaque description est
// une écriture indépendante ; une fiche se traduit en entier ou pas du tout
// (une rubrique en échec = la fiche en échec, rien d'écrit pour elle). Après
// trois échecs consécutifs du fournisseur, le disjoncteur s'ouvre : le reste
// est rapporté « non tenté », la campagne ne s'entête pas contre un rack
// éteint — et la sortie n'est jamais tronquée, le rapport dit tout.
//
// Les lectures de structure passent par les repositories de structure (vues
// actives) ; la campagne n'écrit que par les requêtes du domaine syllabus.
package campagne

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"cyb-react/pkg/ia"
	formationgen "cyb-react/pkg/structure/formation/gen"
	matieregen "cyb-react/pkg/structure/matiere/gen"
	optiongen "cyb-react/pkg/structure/option/gen"
	periodegen "cyb-react/pkg/structure/periode/gen"
	promotiongen "cyb-react/pkg/structure/promotion/gen"
	uegen "cyb-react/pkg/structure/unite_enseignement/gen"
	"cyb-react/pkg/syllabus"
	"cyb-react/pkg/syllabus/gen"
	"cyb-react/pkg/syllabus/traduction"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Options d'une campagne.
type Options struct {
	PromotionID int32
	Langue      string
	// Apply : écrire en base. Faux : simulation complète, traducteur appelé,
	// aucune écriture.
	Apply bool
	// RetraduireRelues : assumer la perte du statut « relue » des traductions
	// relues devenues périmées.
	RetraduireRelues bool
	// Limite : nombre maximal d'objets envoyés au traducteur (0 : sans limite).
	Limite int
}

// seuilDisjoncteur : échecs consécutifs du fournisseur avant d'arrêter de
// l'appeler.
const seuilDisjoncteur = 3

type objet struct {
	nature  Nature
	chemin  string
	id      int32
	version int32 // de la source
	empr    string
	champs  []syllabus.ChampSource
}

// Traduire déroule la campagne sur la promotion. L'erreur rendue est celle
// d'une campagne impossible (promotion inconnue, base injoignable) ; tout le
// reste est dans le rapport.
func Traduire(ctx context.Context, pool *pgxpool.Pool, tr *traduction.Traducteur, o Options) (*Rapport, error) {
	if !traduction.LangueAdmise(o.Langue) {
		return nil, fmt.Errorf("langue non prise en charge : %q", o.Langue)
	}
	promotion, err := promotiongen.New(pool).FetchPromotionById(ctx, o.PromotionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("promotion %d introuvable (inconnue ou en corbeille)", o.PromotionID)
		}
		return nil, err
	}
	formation, err := formationgen.New(pool).FetchFormationById(ctx, promotion.FormationID)
	if err != nil {
		return nil, err
	}

	r := &Rapport{Date: time.Now(), Apply: o.Apply, RetraduireRelues: o.RetraduireRelues, Limite: o.Limite,
		Langue: o.Langue, Modele: tr.Nom(), Promotion: formation.Name + " › " + promotion.Name}
	c := &campagne{ctx: ctx, q: gen.New(pool), tr: tr, o: o, r: r}

	objets, err := c.inventorier(pool, promotion.ID)
	if err != nil {
		return nil, err
	}
	for _, ob := range objets {
		c.traiter(ob)
	}
	return r, nil
}

type campagne struct {
	ctx context.Context
	q   *gen.Queries
	tr  *traduction.Traducteur
	o   Options
	r   *Rapport

	envoyes        int
	echecsDeSuite  int
	disjoncteurOuv bool
}

// inventorier parcourt la structure active de la promotion, dans l'ordre du
// livret, et rend les descriptions d'UE et les fiches qui ont une source.
func (c *campagne) inventorier(pool *pgxpool.Pool, promotionID int32) ([]objet, error) {
	var objets []objet
	options, err := optiongen.New(pool).FetchOptionsByPromotionID(c.ctx, promotionID)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(options, func(i, j int) bool { return strings.ToLower(options[i].Name) < strings.ToLower(options[j].Name) })
	for _, op := range options {
		periodes, err := periodegen.New(pool).FetchPeriodesByOptionID(c.ctx, op.ID)
		if err != nil {
			return nil, err
		}
		sort.SliceStable(periodes, func(i, j int) bool { return periodes[i].Debut.Time.Before(periodes[j].Debut.Time) })
		for _, pe := range periodes {
			ues, err := uegen.New(pool).FetchUniteEnseignementsByPeriodeID(c.ctx, pe.ID)
			if err != nil {
				return nil, err
			}
			sort.SliceStable(ues, func(i, j int) bool { return ues[i].ID < ues[j].ID })
			for _, ue := range ues {
				cheminUe := op.Name + " › " + pe.Name + " › " + ue.Name
				src, err := c.q.FetchSourceUe(c.ctx, ue.ID)
				if err != nil {
					return nil, err
				}
				objets = append(objets, objet{NatureDescription, cheminUe, ue.ID, src.Version, src.Empreinte,
					[]syllabus.ChampSource{{Nom: "description", Texte: src.Description}}})

				matieres, err := matieregen.New(pool).FetchMatieresByUniteEnseignementID(c.ctx, ue.ID)
				if err != nil {
					return nil, err
				}
				sort.SliceStable(matieres, func(i, j int) bool { return matieres[i].ID < matieres[j].ID })
				for _, m := range matieres {
					src, err := c.q.FetchSourceMatiere(c.ctx, m.ID)
					if errors.Is(err, pgx.ErrNoRows) {
						continue // fiche jamais écrite : pas de source
					}
					if err != nil {
						return nil, err
					}
					objets = append(objets, objet{NatureFiche, cheminUe + " › " + m.Name, m.ID, src.Version, src.Empreinte, syllabus.RubriquesSource(&src)})
				}
			}
		}
	}
	return objets, nil
}

// existante : ce que la campagne a besoin de savoir de la traduction en base.
type existante struct {
	version   int32
	empreinte string
	statut    string
}

func (c *campagne) existante(ob objet) (*existante, error) {
	if ob.nature == NatureFiche {
		t, err := c.q.FetchTraductionMatiere(c.ctx, gen.FetchTraductionMatiereParams{MatiereID: ob.id, Langue: c.o.Langue})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return &existante{t.Version, t.EmpreinteSource, t.Statut}, err
	}
	t, err := c.q.FetchTraductionUe(c.ctx, gen.FetchTraductionUeParams{UeID: ob.id, Langue: c.o.Langue})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &existante{t.Version, t.EmpreinteSource, t.Statut}, err
}

func (c *campagne) traiter(ob objet) {
	compteur := c.r.compteur(ob.nature)
	aDuTexte := false
	for _, ch := range ob.champs {
		if ch.Texte != nil && strings.TrimSpace(*ch.Texte) != "" {
			aDuTexte = true
		}
	}
	if !aDuTexte {
		compteur.SansTexte++
		return
	}

	ex, err := c.existante(ob)
	if err != nil {
		c.echec(ob, CauseLecture, err.Error())
		return
	}
	retraduction := false
	switch {
	case ex == nil:
	case ex.empreinte == ob.empr:
		compteur.AJour++
		return
	case ex.statut == traduction.StatutRelue && !c.o.RetraduireRelues:
		compteur.ReluesPerimees++
		c.r.ReluesPerimees = append(c.r.ReluesPerimees, Ligne{ob.nature, ob.chemin, ""})
		return
	default:
		retraduction = true
	}

	if c.disjoncteurOuv {
		c.nonTente(ob, "fournisseur indisponible (disjoncteur ouvert)")
		return
	}
	if c.o.Limite > 0 && c.envoyes >= c.o.Limite {
		c.nonTente(ob, "au-delà de --limite")
		return
	}
	c.envoyes++

	sorties := map[string]*string{}
	var paires []Paire
	for _, ch := range ob.champs {
		if ch.Texte == nil || strings.TrimSpace(*ch.Texte) == "" {
			continue
		}
		sortie, err := c.tr.Traduire(c.ctx, *ch.Texte)
		if err != nil {
			if ia.EstIndisponible(err) {
				c.echecsDeSuite++
				if c.echecsDeSuite >= seuilDisjoncteur {
					c.disjoncteurOuv = true
				}
				c.echec(ob, CauseFournisseur, ch.Nom+" : "+err.Error())
			} else {
				c.echecsDeSuite = 0
				c.echec(ob, CauseSortieRefusee, ch.Nom+" : "+err.Error())
			}
			return
		}
		c.echecsDeSuite = 0
		sorties[ch.Nom] = &sortie
		paires = append(paires, Paire{ch.Nom, *ch.Texte, sortie})
	}

	if c.o.Apply {
		version := int32(0)
		if ex != nil {
			version = ex.version
		}
		if err := c.ecrire(ob, sorties, version); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				c.echec(ob, CauseEcriture, "traduction modifiée pendant la campagne (verrou optimiste)")
			} else {
				c.echec(ob, CauseEcriture, err.Error())
			}
			return
		}
	}
	if retraduction {
		compteur.Retraduites++
	} else {
		compteur.Traduites++
	}
	c.r.Comparatif = append(c.r.Comparatif, Comparaison{ob.nature, ob.chemin, retraduction, paires})
}

func (c *campagne) ecrire(ob objet, s map[string]*string, version int32) error {
	modele := c.tr.Nom()
	if ob.nature == NatureDescription {
		_, err := c.q.UpsertTraductionUe(c.ctx, gen.UpsertTraductionUeParams{
			UeID: ob.id, Langue: c.o.Langue, Description: s["description"],
			VersionSource: ob.version, EmpreinteSource: ob.empr, Statut: traduction.StatutAutomatique, Modele: &modele, Version: version,
		})
		return err
	}
	_, err := c.q.UpsertTraductionMatiere(c.ctx, gen.UpsertTraductionMatiereParams{
		MatiereID: ob.id, Langue: c.o.Langue,
		Contexte: s["contexte"], Objectifs: s["objectifs"], Prerequis: s["prerequis"], Activites: s["activites"],
		Evaluation: s["evaluation"], PlanCours: s["plan_cours"], Ressources: s["ressources"], DimensionSocioEnv: s["dimension_socio_env"],
		VersionSource: ob.version, EmpreinteSource: ob.empr, Statut: traduction.StatutAutomatique, Modele: &modele, Version: version,
	})
	return err
}

func (c *campagne) echec(ob objet, cause Cause, detail string) {
	c.r.compteur(ob.nature).Echecs++
	c.r.Echecs = append(c.r.Echecs, Echec{Ligne{ob.nature, ob.chemin, detail}, cause})
}

func (c *campagne) nonTente(ob objet, motif string) {
	c.r.compteur(ob.nature).NonTentes++
	c.r.NonTentes = append(c.r.NonTentes, Ligne{ob.nature, ob.chemin, motif})
}
