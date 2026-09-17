package legacy

// L'orchestration : résoudre, comparer, écrire (ou simuler), rapporter.
//
// Continuer et rapporter : chaque fiche, chaque description d'UE et chaque
// matrice est une écriture indépendante — un upsert, un UPDATE, ou la
// transaction de RemplacerMatrice — et un échec n'arrête pas les suivantes.
// Refus d'écraser : une fiche déjà écrite (version > 0), une description
// déjà remplie ou une matrice déjà cochée qui diffèrent de l'entrée sont des
// conflits, rapportés sans écriture ; --force assume le remplacement. Ce qui
// est déjà à l'état cible est « inchangé » : relancer est sûr, et une seconde
// passe ne rapporte que des inchangés.

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"cyb-react/pkg/services"
	uegen "cyb-react/pkg/structure/unite_enseignement/gen"
	"cyb-react/pkg/syllabus"
	"cyb-react/pkg/syllabus/gen"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Options de la passe. Sans Apply, rien n'est écrit ; Force ne vaut qu'avec
// Apply pour écrire, mais se simule aussi (le rapport montre ce qu'un --force
// remplacerait).
type Options struct {
	Apply   bool
	Force   bool
	Dossier string
}

type cleUE struct{ Annee, Code string }

func (c cleUE) String() string { return c.Annee + " " + c.Code }

// groupeUE rassemble les lignes de fiches.csv d'une même UE tiers et le
// résultat de sa résolution.
type groupeUE struct {
	cle         cleUE
	lignes      []LigneFiche
	description *string
	cause       Cause // vide si résolue
	detail      string
	cible       *cible
	ue          *uegen.UniteEnseignement
	liaisons    bool
}

func (g *groupeUE) resolue() bool { return g.ue != nil }

type corrPeriode struct {
	corr  CorrespondancePeriode
	cible *cible
	err   error
}

type corrBloc struct {
	corr  CorrespondanceBloc
	cible *blocCible
	err   error
}

// corrBlocs indexe les correspondances de blocs par bloc tiers, puis par
// promotion scolarite (nom normalisé) : une liaison se résout par le bloc
// tiers ET la promotion de l'UE. `lignes` garde toutes les lignes lues, pour
// dire, quand celle de la promotion manque, pour quelles promotions le bloc
// est mappé.
type corrBlocs struct {
	parPromotion map[string]map[string]*corrBloc
	lignes       map[string][]*corrBloc
}

// pour rend la correspondance remplie d'un bloc tiers pour une promotion ;
// `mappe` dit si le bloc a au moins une ligne remplie (sinon, hors périmètre).
func (cb *corrBlocs) pour(blocID string, promotionName string) (entree *corrBloc, mappe bool) {
	if e, ok := cb.parPromotion[blocID][Normaliser(promotionName)]; ok {
		return e, true
	}
	return nil, len(cb.parPromotion[blocID]) > 0
}

// promotionsMappees liste, pour le rapport, les promotions pour lesquelles un
// bloc tiers est mappé.
func (cb *corrBlocs) promotionsMappees(blocID string) []string {
	var noms []string
	for _, e := range cb.lignes[blocID] {
		if e.corr.Remplie {
			noms = append(noms, e.corr.Promotion)
		}
	}
	sort.Strings(noms)
	return noms
}

// Importer joue une passe complète sur l'entrée et rend son rapport. Une
// erreur n'est rendue que pour ce qui empêche la passe elle-même (base
// injoignable) ; tout le reste est dans le rapport.
func Importer(ctx context.Context, pool *pgxpool.Pool, e *Entree, opts Options) (*Rapport, error) {
	r := &Rapport{
		Simulation:         !opts.Apply,
		Force:              opts.Force,
		Dossier:            opts.Dossier,
		Date:               time.Now(),
		FichesLues:         len(e.Fiches),
		LiaisonsLues:       len(e.Liaisons),
		CompetencesTiers:   len(e.Referentiel),
		Exceptions:         len(e.Exceptions),
		PeriodesNonMappees: map[ClePeriode]int{},
	}

	res, err := nouveauResolveur(ctx, pool)
	if err != nil {
		return nil, err
	}

	// Correspondances de périodes et de blocs, résolues une fois.
	periodes := map[ClePeriode]*corrPeriode{}
	for _, c := range e.Periodes {
		cp := &corrPeriode{corr: c}
		if c.Remplie {
			r.PeriodesRemplies++
			cp.cible, cp.err = res.periode(c)
			var ec *erreurCorrespondance
			if cp.err != nil && !errors.As(cp.err, &ec) {
				return nil, fmt.Errorf("correspondance ligne %d : %w", c.Ligne, cp.err)
			}
		} else {
			r.PeriodesVides++
		}
		periodes[c.Cle()] = cp
	}
	blocs := &corrBlocs{parPromotion: map[string]map[string]*corrBloc{}, lignes: map[string][]*corrBloc{}}
	for _, c := range e.Blocs {
		cb := &corrBloc{corr: c}
		if c.Remplie {
			r.BlocsRemplis++
			cb.cible, cb.err = res.bloc(c)
			var ec *erreurCorrespondance
			if cb.err != nil && !errors.As(cb.err, &ec) {
				return nil, fmt.Errorf("correspondance de bloc ligne %d : %w", c.Ligne, cb.err)
			}
			if blocs.parPromotion[c.BlocID] == nil {
				blocs.parPromotion[c.BlocID] = map[string]*corrBloc{}
			}
			blocs.parPromotion[c.BlocID][Normaliser(c.Promotion)] = cb
		} else {
			r.BlocsVides++
		}
		blocs.lignes[c.BlocID] = append(blocs.lignes[c.BlocID], cb)
	}
	excUE := map[string]string{}
	excMatiere := map[string]string{}
	for _, x := range e.Exceptions {
		if strings.TrimSpace(x.MatiereLibelle) == "" {
			excUE[x.UeCode] = x.Name
		} else {
			excMatiere[x.UeCode+"\x00"+Normaliser(x.MatiereLibelle)] = x.Name
		}
	}

	// Les UE tiers, dans l'ordre du fichier.
	groupes := map[cleUE]*groupeUE{}
	var ordre []cleUE
	for _, f := range e.Fiches {
		k := cleUE{f.Annee, f.UeCode}
		g, ok := groupes[k]
		if !ok {
			g = &groupeUE{cle: k}
			groupes[k] = g
			ordre = append(ordre, k)
		}
		g.lignes = append(g.lignes, f)
	}
	for _, k := range ordre {
		g := groupes[k]
		premiere := g.lignes[0]
		cp, ok := periodes[ClePeriode{premiere.Annee, premiere.Periode, premiere.Prefixe()}]
		switch {
		case !ok || !cp.corr.Remplie:
			g.cause = CausePeriodeNonMappee
		case cp.err != nil:
			g.cause, g.detail = CauseCorrespondanceIntrouvable, cp.err.Error()
		default:
			g.cible = cp.cible
			ue, etat := cp.cible.ue(excUE[k.Code], k.Code, premiere.UeLibelle)
			switch etat {
			case trouve:
				g.ue = ue
			case ambigu:
				g.cause, g.detail = CauseUeAmbigue, fmt.Sprintf("plusieurs UE de « %s » portent ce nom", cp.cible.Chemin)
			default:
				g.cause, g.detail = CauseUeInconnue, fmt.Sprintf("code « %s », libellé « %s » — aucune UE de « %s »", k.Code, strings.TrimSpace(premiere.UeLibelle), cp.cible.Chemin)
			}
		}
		// La description : la première non vide ; une divergence se signale.
		for _, l := range g.lignes {
			d := texte(l.UeDescription)
			if d == nil {
				continue
			}
			if g.description == nil {
				g.description = d
			} else if *g.description != *d {
				r.signaler("description d'UE non uniforme dans fiches.csv", l.Ligne, k.String(), "première description retenue")
			}
		}
	}

	queries := gen.New(pool)
	r.fiches(ctx, queries, groupes, ordre, excMatiere, opts)
	r.descriptions(ctx, queries, groupes, ordre, opts)
	r.matrices(ctx, pool, queries, e, groupes, blocs, opts)

	for _, k := range ordre {
		g := groupes[k]
		if g.resolue() && !g.liaisons {
			r.signaler("UE sans aucune liaison de compétence dans le tiers", g.lignes[0].Ligne, k.String(), "matrice non importée, rien à importer")
		}
	}
	return r, nil
}

// ── Fiches ─────────────────────────────────────────────────────────────────

func (r *Rapport) fiches(ctx context.Context, queries *gen.Queries, groupes map[cleUE]*groupeUE, ordre []cleUE, excMatiere map[string]string, opts Options) {
	apparies := map[int32]int{} // matière scolarite → ligne qui l'a prise
	for _, k := range ordre {
		g := groupes[k]
		doublons := map[string]int{}
		for _, l := range g.lignes {
			doublons[Normaliser(l.MatiereLibelle)]++
		}
		for _, l := range g.lignes {
			cle := fmt.Sprintf("%s › %s", k, strings.TrimSpace(l.MatiereLibelle))
			if !g.resolue() {
				if g.cause == CausePeriodeNonMappee {
					r.PeriodesNonMappees[ClePeriode{l.Annee, l.Periode, l.Prefixe()}]++
					r.Fiches.Rejetes++
				} else {
					r.rejeter(ObjetFiche, g.cause, l.Ligne, cle, g.detail)
				}
				continue
			}
			if doublons[Normaliser(l.MatiereLibelle)] > 1 {
				r.rejeter(ObjetFiche, CauseDoublonTiers, l.Ligne, cle, "plusieurs lignes de fiches.csv pour cette matière de cette UE")
				continue
			}
			m, etat := g.cible.matiere(g.ue, excMatiere[k.Code+"\x00"+Normaliser(l.MatiereLibelle)], l.MatiereLibelle)
			switch etat {
			case ambigu:
				r.rejeter(ObjetFiche, CauseMatiereAmbigue, l.Ligne, cle, fmt.Sprintf("plusieurs matières de l'UE « %s » portent ce nom", g.ue.Name))
				continue
			case absent:
				r.rejeter(ObjetFiche, CauseMatiereInconnue, l.Ligne, cle, fmt.Sprintf("aucune matière de l'UE « %s »", g.ue.Name))
				continue
			}
			if precedente, deja := apparies[m.ID]; deja {
				r.rejeter(ObjetFiche, CauseDoublonTiers, l.Ligne, cle, fmt.Sprintf("la matière « %s » est déjà appariée par la ligne %d", m.Name, precedente))
				continue
			}
			apparies[m.ID] = l.Ligne

			fiche := ficheDepuis(l, m.ID)
			if plage := syllabus.ErreursPlage(&fiche); len(plage) > 0 {
				champs := make([]string, 0, len(plage))
				for champ := range plage {
					champs = append(champs, champ)
				}
				sort.Strings(champs)
				r.rejeter(ObjetFiche, CauseValeurHorsPlage, l.Ligne, cle, strings.Join(champs, ", "))
				continue
			}

			existante, err := queries.FetchSyllabusMatiereByMatiereID(ctx, m.ID)
			if errors.Is(err, pgx.ErrNoRows) {
				existante, err = gen.SyllabusMatiere{MatiereID: m.ID}, nil
			}
			if err != nil {
				r.rejeter(ObjetFiche, CauseErreurEcriture, l.Ligne, cle, "lecture de la fiche : "+err.Error())
				continue
			}
			switch {
			case fichesEgales(existante, fiche):
				r.Fiches.Inchanges++
			case existante.Version > 0 && !opts.Force:
				r.rejeter(ObjetFiche, CauseConflitNonForce, l.Ligne, cle, fmt.Sprintf("fiche déjà écrite (version %d) et différente — --force pour remplacer", existante.Version))
				continue
			default:
				if opts.Apply {
					// Le responsable n'est pas importé : celui en place reste.
					if _, err := queries.UpsertSyllabusMatiere(ctx, paramsUpsert(fiche, existante.Version, existante.ResponsableID)); err != nil {
						r.rejeter(ObjetFiche, CauseErreurEcriture, l.Ligne, cle, decrireErreur(err))
						continue
					}
				}
				r.Fiches.Importes++
			}

			// Signalements, sur ce qui est importé ou déjà en place.
			if encadre := totalEncadre(l); math.Abs(encadre-float64(m.Heure)) > 0.005 {
				r.signaler("écart entre la ventilation encadrée et matiere.heure", l.Ligne, cle,
					fmt.Sprintf("ventilation encadrée %s h, la structure prévoit %s h", heures(encadre), heures(float64(m.Heure))))
			}
			if a := l.Heures[HAutre]; a != nil && *a != 0 {
				r.signaler("heures « autre » du tiers, sans colonne — non importées", l.Ligne, cle, heures(*a)+" h")
			}
		}
	}
}

// ficheDepuis construit la fiche cible : sept volumes nommés, huit rubriques,
// ni heures_perso (le tiers n'en a pas), ni responsable (pas importé).
func ficheDepuis(l LigneFiche, matiereID int32) gen.SyllabusMatiere {
	return gen.SyllabusMatiere{
		MatiereID:         matiereID,
		Contexte:          l.Contexte,
		Objectifs:         l.Objectifs,
		Prerequis:         l.Prerequis,
		Activites:         l.Activites,
		Evaluation:        l.Evaluation,
		PlanCours:         l.PlanCours,
		Ressources:        l.Ressources,
		DimensionSocioEnv: l.SocioEnv,
		HeuresCours:       l.Heures[HCours],
		HeuresCoursTd:     l.Heures[HCoursTd],
		HeuresTd:          l.Heures[HTd],
		HeuresTp:          l.Heures[HTp],
		HeuresProjet:      l.Heures[HProjet],
		HeuresAutonomie:   l.Heures[HAutonomie],
		HeuresControle:    l.Heures[HControle],
	}
}

func paramsUpsert(f gen.SyllabusMatiere, version int32, responsable *int32) gen.UpsertSyllabusMatiereParams {
	return gen.UpsertSyllabusMatiereParams{
		MatiereID:         f.MatiereID,
		Version:           version,
		Contexte:          f.Contexte,
		Objectifs:         f.Objectifs,
		Prerequis:         f.Prerequis,
		Activites:         f.Activites,
		Evaluation:        f.Evaluation,
		PlanCours:         f.PlanCours,
		Ressources:        f.Ressources,
		DimensionSocioEnv: f.DimensionSocioEnv,
		HeuresCours:       f.HeuresCours,
		HeuresCoursTd:     f.HeuresCoursTd,
		HeuresTd:          f.HeuresTd,
		HeuresTp:          f.HeuresTp,
		HeuresProjet:      f.HeuresProjet,
		HeuresAutonomie:   f.HeuresAutonomie,
		HeuresControle:    f.HeuresControle,
		HeuresPerso:       f.HeuresPerso,
		ResponsableID:     responsable,
	}
}

// fichesEgales compare le contenu importable : rubriques et ventilation,
// hors version, identifiant et responsable.
func fichesEgales(a, b gen.SyllabusMatiere) bool {
	textes := [][2]*string{
		{a.Contexte, b.Contexte}, {a.Objectifs, b.Objectifs}, {a.Prerequis, b.Prerequis}, {a.Activites, b.Activites},
		{a.Evaluation, b.Evaluation}, {a.PlanCours, b.PlanCours}, {a.Ressources, b.Ressources}, {a.DimensionSocioEnv, b.DimensionSocioEnv},
	}
	for _, t := range textes {
		if !textesEgaux(t[0], t[1]) {
			return false
		}
	}
	nombres := [][2]*float64{
		{a.HeuresCours, b.HeuresCours}, {a.HeuresCoursTd, b.HeuresCoursTd}, {a.HeuresTd, b.HeuresTd}, {a.HeuresTp, b.HeuresTp},
		{a.HeuresProjet, b.HeuresProjet}, {a.HeuresAutonomie, b.HeuresAutonomie}, {a.HeuresControle, b.HeuresControle}, {a.HeuresPerso, b.HeuresPerso},
	}
	for _, n := range nombres {
		if !nombresEgaux(n[0], n[1]) {
			return false
		}
	}
	return true
}

func textesEgaux(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// nombresEgaux tolère l'arrondi NUMERIC(5,2) : 14.65 relu vaut 14.65.
func nombresEgaux(a, b *float64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return math.Abs(*a-*b) < 0.005
}

func totalEncadre(l LigneFiche) float64 {
	total := 0.0
	for i := HCours; i <= HAutonomie; i++ {
		if v := l.Heures[i]; v != nil {
			total += *v
		}
	}
	return total
}

// decrireErreur rend une erreur d'écriture lisible sans texte libre de la
// base : contrainte nommée → champ et motif ; sinon le message d'origine
// (le rapport est un fichier d'exploitation, pas une réponse HTTP).
func decrireErreur(err error) string {
	if errors.Is(err, pgx.ErrNoRows) {
		return "version périmée : la cible a été modifiée pendant l'import — relancer"
	}
	if m := services.MapPgErrorToValidationErrors(err, nil); len(m) > 0 {
		parts := make([]string, 0, len(m))
		for champ, e := range m {
			parts = append(parts, champ+" : "+e.Motif)
		}
		sort.Strings(parts)
		return strings.Join(parts, ", ")
	}
	return err.Error()
}

// ── Descriptions d'UE ──────────────────────────────────────────────────────

func (r *Rapport) descriptions(ctx context.Context, queries *gen.Queries, groupes map[cleUE]*groupeUE, ordre []cleUE, opts Options) {
	apparies := map[int32]cleUE{}
	for _, k := range ordre {
		g := groupes[k]
		if !g.resolue() {
			continue
		}
		cle := fmt.Sprintf("%s › UE « %s »", k, g.ue.Name)
		ligne := g.lignes[0].Ligne
		if precedent, deja := apparies[g.ue.ID]; deja {
			r.rejeter(ObjetDescription, CauseDoublonTiers, ligne, cle, fmt.Sprintf("UE déjà appariée par « %s »", precedent))
			continue
		}
		apparies[g.ue.ID] = k
		if g.description == nil {
			r.SansContenu++
			continue
		}
		existante := g.ue.Description
		switch {
		case existante != nil && *existante == *g.description:
			r.Descriptions.Inchanges++
		case existante != nil && strings.TrimSpace(*existante) != "" && !opts.Force:
			r.rejeter(ObjetDescription, CauseConflitNonForce, ligne, cle, "description déjà remplie et différente — --force pour remplacer")
		default:
			if opts.Apply {
				maj, err := queries.UpdateUniteEnseignementSyllabus(ctx, gen.UpdateUniteEnseignementSyllabusParams{
					ID:            g.ue.ID,
					Version:       g.ue.Version,
					Description:   g.description,
					ResponsableID: g.ue.ResponsableID, // pas importé : celui en place reste
				})
				if err != nil {
					r.rejeter(ObjetDescription, CauseErreurEcriture, ligne, cle, decrireErreur(err))
					continue
				}
				g.ue.Version = maj.Version
			}
			r.Descriptions.Importes++
		}
	}
}

// ── Matrices ───────────────────────────────────────────────────────────────

type ligneMatrice struct {
	competence gen.Competence
	flags      [3]bool
}

func (r *Rapport) matrices(ctx context.Context, pool *pgxpool.Pool, queries *gen.Queries, e *Entree, groupes map[cleUE]*groupeUE, blocs *corrBlocs, opts Options) {
	parUE := map[cleUE][]LigneLiaison{}
	var ordre []cleUE
	for _, l := range e.Liaisons {
		k := cleUE{l.Annee, l.UeCode}
		if _, ok := parUE[k]; !ok {
			ordre = append(ordre, k)
		}
		parUE[k] = append(parUE[k], l)
	}
	apparies := map[int32]cleUE{}
	for _, k := range ordre {
		liaisons := parUE[k]
		premiere := liaisons[0].Ligne
		g, ok := groupes[k]
		if !ok {
			r.rejeter(ObjetMatrice, CauseUeAbsenteDesFiches, premiere, k.String(), fmt.Sprintf("%d liaison(s)", len(liaisons)))
			continue
		}
		g.liaisons = true
		if !g.resolue() {
			if g.cause == CausePeriodeNonMappee {
				r.Matrices.Rejetes++
				r.MatricesHorsPeriode++
			} else {
				r.rejeter(ObjetMatrice, g.cause, premiere, k.String(), g.detail)
			}
			continue
		}
		cle := fmt.Sprintf("%s › UE « %s »", k, g.ue.Name)
		if precedent, deja := apparies[g.ue.ID]; deja {
			r.rejeter(ObjetMatrice, CauseDoublonTiers, premiere, cle, fmt.Sprintf("UE déjà appariée par « %s »", precedent))
			continue
		}
		apparies[g.ue.ID] = k

		cibleMatrice := map[int32]*ligneMatrice{}
		rejets := 0
		for _, l := range liaisons {
			// La correspondance se cherche par le bloc tiers et la promotion
			// de l'UE : sans aucune ligne remplie, le bloc est hors périmètre ;
			// mappé pour d'autres promotions seulement, c'est une ligne qui
			// manque — rejet, avec les promotions mappées pour le dire.
			cb, mappe := blocs.pour(l.BlocID, g.cible.PromotionName)
			if !mappe {
				r.HorsPerimetre++
				continue
			}
			if cb == nil {
				r.lister(ObjetMatrice, CauseBlocHorsPromotion, l.Ligne, cle,
					fmt.Sprintf("bloc tiers %s mappé pour « %s », l'UE est dans « %s »", l.BlocID, strings.Join(blocs.promotionsMappees(l.BlocID), " », « "), g.cible.PromotionName))
				rejets++
				continue
			}
			detailBloc := fmt.Sprintf("bloc tiers %s (« %s »)", l.BlocID, cb.corr.Libelle)
			if cb.err != nil {
				r.lister(ObjetMatrice, CauseCorrespondanceBlocInvalide, l.Ligne, cle, detailBloc+" : "+cb.err.Error())
				rejets++
				continue
			}
			comp, ok := e.Referentiel[l.CompetenceID]
			if !ok || comp.Position == 0 {
				r.lister(ObjetMatrice, CauseCompetenceHorsPosition, l.Ligne, cle, fmt.Sprintf("compétence tiers %s : aucun code « Cn » dans referentiel_tiers.csv", l.CompetenceID))
				rejets++
				continue
			}
			cp, ok := cb.cible.Competences[comp.Position]
			if !ok {
				r.lister(ObjetMatrice, CauseCompetenceHorsPosition, l.Ligne, cle,
					fmt.Sprintf("%s → bloc %d de « %s » : aucune compétence en position %d (code tiers %s)", detailBloc, cb.cible.Bloc.Ordre, cb.cible.PromotionName, comp.Position, comp.Code))
				rejets++
				continue
			}
			if cb.cible.PromotionID != g.cible.PromotionID {
				// Par construction la promotion est celle de l'UE ; la garde
				// reste, comme celle du serveur (hors_promotion) derrière elle.
				r.lister(ObjetMatrice, CauseBlocHorsPromotion, l.Ligne, cle,
					fmt.Sprintf("%s → « %s », l'UE est dans « %s »", detailBloc, cb.cible.PromotionName, g.cible.PromotionName))
				rejets++
				continue
			}
			flags := [3]bool{l.Enseignee, l.MiseEnOeuvre, l.Evaluee}
			if lm, deja := cibleMatrice[cp.ID]; deja {
				if lm.flags != flags {
					r.signaler("liaisons du tiers contradictoires sur une même compétence", l.Ligne, cle,
						fmt.Sprintf("C%d du bloc %d : axes fusionnés (union)", cp.Ordre, cb.cible.Bloc.Ordre))
				}
				for i := range flags {
					lm.flags[i] = lm.flags[i] || flags[i]
				}
				continue
			}
			cibleMatrice[cp.ID] = &ligneMatrice{competence: cp, flags: flags}
		}
		if rejets > 0 {
			r.Matrices.Rejetes++
			continue
		}
		if len(cibleMatrice) == 0 {
			r.SansLigne++
			continue
		}
		lignes := make([]gen.UeCompetence, 0, len(cibleMatrice))
		for id, lm := range cibleMatrice {
			lignes = append(lignes, gen.UeCompetence{UeID: g.ue.ID, CompetenceID: id, Enseignee: lm.flags[0], MiseEnOeuvre: lm.flags[1], Evaluee: lm.flags[2]})
		}
		sort.Slice(lignes, func(i, j int) bool { return lignes[i].CompetenceID < lignes[j].CompetenceID })

		existante, err := queries.FetchUeCompetences(ctx, g.ue.ID)
		if err != nil {
			r.rejeter(ObjetMatrice, CauseErreurEcriture, premiere, cle, "lecture de la matrice : "+err.Error())
			continue
		}
		switch {
		case matricesEgales(existante, lignes):
			r.Matrices.Inchanges++
		case len(existante) > 0 && !opts.Force:
			r.rejeter(ObjetMatrice, CauseConflitNonForce, premiere, cle, fmt.Sprintf("matrice déjà cochée (%d ligne(s)) et différente — --force pour remplacer", len(existante)))
		default:
			if opts.Apply {
				if _, err := syllabus.RemplacerMatrice(ctx, pool, g.ue.ID, lignes); err != nil {
					var ecartee *syllabus.ErreurCompetence
					cause := CauseErreurEcriture
					if errors.As(err, &ecartee) && ecartee.Motif == services.MotifHorsPromotion {
						cause = CauseBlocHorsPromotion
					}
					r.rejeter(ObjetMatrice, cause, premiere, cle, decrireErreur(err))
					continue
				}
			}
			r.Matrices.Importes++
		}
	}
}

func matricesEgales(a, b []gen.UeCompetence) bool {
	if len(a) != len(b) {
		return false
	}
	index := map[int32][3]bool{}
	for _, l := range a {
		index[l.CompetenceID] = [3]bool{l.Enseignee, l.MiseEnOeuvre, l.Evaluee}
	}
	for _, l := range b {
		if index[l.CompetenceID] != [3]bool{l.Enseignee, l.MiseEnOeuvre, l.Evaluee} {
			return false
		}
	}
	return true
}
